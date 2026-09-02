use chrono::Utc;
use serde_json::json;

use super::client::PaymentResponse;
use super::{grant_until_from_metadata, MetadataIds, PROVIDER_NAME};
use crate::billing::WebhookEnvelope;

pub fn payment_to_envelope(
    event: &str,
    payment: &PaymentResponse,
) -> Result<WebhookEnvelope, String> {
    let metadata = &payment.metadata;
    let ids = MetadataIds::from_metadata(metadata)?;
    let event_time = payment
        .captured_at
        .as_deref()
        .or(payment.canceled_at.as_deref())
        .or(payment.created_at.as_deref())
        .map(str::to_owned);

    let (event_type, subscription_status, feature_key, granted_until) =
        match (event, payment.status.as_str()) {
            ("payment.succeeded", "succeeded") | (_, "succeeded") if payment.paid => (
                "subscription.activated",
                Some("active"),
                ids.feature_key.clone(),
                grant_until_from_metadata(metadata),
            ),
            ("payment.canceled", "canceled") | (_, "canceled") => (
                "subscription.cancelled",
                Some("cancelled"),
                ids.feature_key.clone(),
                Some(Utc::now()),
            ),
            ("payment.waiting_for_capture", "waiting_for_capture") => {
                ("subscription.pending", Some("trialing"), None, None)
            }
            _ => {
                return Err(format!(
                    "unexpected payment status {} for event {event}",
                    payment.status
                ));
            }
        };

    Ok(WebhookEnvelope {
        provider: PROVIDER_NAME.to_owned(),
        event_type: event_type.to_owned(),
        household_id: ids.household_id,
        payload: json!({
            "externalId": payment.id,
            "amount": payment.amount.value,
            "currency": payment.amount.currency,
            "status": payment.status,
            "sourceEvent": event,
        }),
        idempotency_key: Some(format!("yookassa:{event}:{}", payment.id)),
        event_time,
        subscription_id: Some(ids.subscription_id),
        plan_id: Some(ids.plan_id),
        subscription_status: subscription_status.map(str::to_owned),
        feature_key,
        granted_until: granted_until.map(|v| v.to_rfc3339()),
    })
}

pub fn refund_to_envelope(
    refund: &super::client::RefundResponse,
    payment: &PaymentResponse,
) -> Result<WebhookEnvelope, String> {
    let metadata = &payment.metadata;
    let ids = MetadataIds::from_metadata(metadata)?;
    Ok(WebhookEnvelope {
        provider: PROVIDER_NAME.to_owned(),
        event_type: "subscription.refunded".to_owned(),
        household_id: ids.household_id,
        payload: json!({
            "externalId": payment.id,
            "refundId": refund.id,
            "status": refund.status,
        }),
        idempotency_key: Some(format!("yookassa:refund.succeeded:{}", refund.id)),
        event_time: refund.created_at.clone(),
        subscription_id: Some(ids.subscription_id),
        plan_id: Some(ids.plan_id),
        subscription_status: Some("cancelled".to_owned()),
        feature_key: ids.feature_key,
        granted_until: Some(Utc::now().to_rfc3339()),
    })
}

#[derive(serde::Deserialize)]
pub struct Notification {
    pub event: String,
    pub object: serde_json::Value,
}
