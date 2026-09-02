use chrono::Utc;

use super::webhook::payment_to_envelope;
use super::{YooKassaBillingProvider, PROVIDER_NAME};
use crate::billing::transitions::apply_subscription_event;
use crate::billing::types::ReconcileReport;
use crate::billing::validation::redact_secrets;
use crate::repositories::BillingRepository;

pub async fn reconcile_yookassa(
    provider: &YooKassaBillingProvider,
    repo: &BillingRepository,
) -> Result<ReconcileReport, String> {
    let shop_id = provider.config().shop_id.as_deref().unwrap_or_default();
    let secret_key = provider.config().secret_key.as_deref().unwrap_or_default();
    let subscriptions = repo
        .list_subscriptions_by_provider(PROVIDER_NAME)
        .await
        .map_err(|e| e.to_string())?;

    let mut report = ReconcileReport {
        provider: PROVIDER_NAME.to_owned(),
        checked: 0,
        updated: 0,
        skipped: 0,
        errors: Vec::new(),
    };

    for subscription in subscriptions {
        let Some(external_id) = subscription.external_id.as_deref() else {
            report.skipped += 1;
            continue;
        };
        report.checked += 1;
        let url = format!(
            "{}/payments/{}",
            provider.config().api_base_url.trim_end_matches('/'),
            external_id
        );
        let payment = match provider
            .http()
            .get_json::<super::client::PaymentResponse>(url.as_str(), shop_id, secret_key)
            .await
        {
            Ok(payment) => payment,
            Err(error) => {
                report.errors.push(redact_secrets(
                    &format!("subscription {}: {error}", subscription.id),
                    &[secret_key],
                ));
                continue;
            }
        };

        let envelope = match payment_to_envelope("reconcile", &payment) {
            Ok(envelope) => envelope,
            Err(error) => {
                report
                    .errors
                    .push(format!("subscription {}: {error}", subscription.id));
                continue;
            }
        };

        if subscription.status == envelope.subscription_status.as_deref().unwrap_or_default() {
            report.skipped += 1;
            continue;
        }

        let scope = crate::auth::TenantScope {
            household_id: subscription.household_id,
        };
        let event_time = envelope
            .event_time
            .as_deref()
            .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
            .map(|v| v.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        if let (Some(sid), Some(st)) = (
            envelope.subscription_id,
            envelope.subscription_status.as_deref(),
        ) {
            if apply_subscription_event(
                repo,
                scope,
                sid,
                st,
                event_time,
                envelope.plan_id.as_deref(),
                Some(PROVIDER_NAME),
                envelope.payload.get("externalId").and_then(|v| v.as_str()),
            )
            .await
            .is_err()
            {
                report.errors.push(format!(
                    "subscription {}: failed to apply status {}",
                    subscription.id, st
                ));
                continue;
            }
        }

        if let Some(fk) = envelope.feature_key.as_deref() {
            let gu = envelope
                .granted_until
                .as_deref()
                .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
                .map(|v| v.with_timezone(&Utc));
            if repo
                .upsert_entitlement(scope, fk, gu, envelope.subscription_id)
                .await
                .is_err()
            {
                report.errors.push(format!(
                    "subscription {}: failed to update entitlement {}",
                    subscription.id, fk
                ));
                continue;
            }
        }

        report.updated += 1;
    }

    Ok(report)
}
