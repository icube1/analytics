mod client;
mod reconcile;
mod webhook;

use async_trait::async_trait;
use chrono::{Duration, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::billing::http::{BillingHttpClient, HttpClientConfig};
use crate::billing::types::{CheckoutRequest, CheckoutSession, ReconcileReport};
use crate::billing::validation::{redact_secrets, validate_amount, validate_return_url};
use crate::billing::{BillingProvider, WebhookEnvelope};
use crate::repositories::BillingRepository;

pub use client::YooKassaConfig;
pub use reconcile::reconcile_yookassa;

pub const PROVIDER_NAME: &str = "yookassa";

#[derive(Clone)]
pub struct YooKassaBillingProvider {
    config: YooKassaConfig,
    http: BillingHttpClient,
}

impl YooKassaBillingProvider {
    pub fn new(config: YooKassaConfig) -> Result<Self, String> {
        if !config.enabled {
            return Err("yookassa provider is disabled".to_owned());
        }
        if config
            .shop_id
            .as_deref()
            .filter(|v| !v.is_empty())
            .is_none()
        {
            return Err("FINANCE_API_YOOKASSA_SHOP_ID is required".to_owned());
        }
        if config
            .secret_key
            .as_deref()
            .filter(|v| !v.is_empty())
            .is_none()
        {
            return Err("FINANCE_API_YOOKASSA_SECRET_KEY is required".to_owned());
        }
        let http = BillingHttpClient::new(HttpClientConfig {
            timeout: config.request_timeout,
            max_retries: config.max_retries,
            retry_backoff: config.retry_backoff,
        })?;
        Ok(Self { config, http })
    }

    pub fn config(&self) -> &YooKassaConfig {
        &self.config
    }

    pub fn http(&self) -> &BillingHttpClient {
        &self.http
    }

    pub async fn create_checkout_payment(
        &self,
        scope: TenantScope,
        request: &CheckoutRequest,
        idempotence_key: &str,
    ) -> Result<CheckoutSession, String> {
        validate_return_url(&request.return_url)?;
        validate_amount(&request.amount_value, &request.currency)?;

        let shop_id = self.require_shop_id()?;
        let secret_key = self.require_secret_key()?;
        let body = serde_json::json!({
            "amount": {
                "value": request.amount_value,
                "currency": request.currency.to_ascii_uppercase(),
            },
            "capture": true,
            "confirmation": {
                "type": "redirect",
                "return_url": request.return_url,
            },
            "description": request.description.as_deref().unwrap_or("subscription"),
            "metadata": {
                "household_id": scope.household_id().to_string(),
                "subscription_id": request.subscription_id.to_string(),
                "plan_id": request.plan_id,
                "feature_key": request.feature_key,
                "grant_days": request.grant_days,
            }
        });

        let payment: client::PaymentResponse = self
            .http
            .post_json(
                &format!(
                    "{}/payments",
                    self.config.api_base_url.trim_end_matches('/')
                ),
                shop_id,
                secret_key,
                idempotence_key,
                &body,
            )
            .await
            .map_err(|e| redact_secrets(&e, &[secret_key]))?;

        let confirmation_url = payment
            .confirmation
            .and_then(|c| c.confirmation_url)
            .ok_or_else(|| "yookassa payment missing confirmation_url".to_owned())?;

        Ok(CheckoutSession {
            payment_id: payment.id,
            confirmation_url,
            provider: PROVIDER_NAME.to_owned(),
        })
    }

    fn require_shop_id(&self) -> Result<&str, String> {
        self.config
            .shop_id
            .as_deref()
            .filter(|v| !v.is_empty())
            .ok_or_else(|| "yookassa shop id is not configured".to_owned())
    }

    fn require_secret_key(&self) -> Result<&str, String> {
        self.config
            .secret_key
            .as_deref()
            .filter(|v| !v.is_empty())
            .ok_or_else(|| "yookassa secret key is not configured".to_owned())
    }
}

#[async_trait]
impl BillingProvider for YooKassaBillingProvider {
    async fn verify_webhook(
        &self,
        raw_body: &[u8],
        _signature: Option<&str>,
    ) -> Result<WebhookEnvelope, String> {
        let notification: webhook::Notification = serde_json::from_slice(raw_body)
            .map_err(|e| format!("invalid yookassa webhook json: {e}"))?;
        let object_id = notification
            .object
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "yookassa webhook missing object.id".to_owned())?;

        let shop_id = self.require_shop_id()?;
        let secret_key = self.require_secret_key()?;
        let base = self.config.api_base_url.trim_end_matches('/');

        let envelope = match notification.event.as_str() {
            "payment.succeeded" | "payment.canceled" | "payment.waiting_for_capture" => {
                let payment: client::PaymentResponse = self
                    .http
                    .get_json(&format!("{base}/payments/{object_id}"), shop_id, secret_key)
                    .await
                    .map_err(|e| redact_secrets(&e, &[secret_key]))?;
                webhook::payment_to_envelope(&notification.event, &payment)?
            }
            "refund.succeeded" => {
                let refund: client::RefundResponse = self
                    .http
                    .get_json(&format!("{base}/refunds/{object_id}"), shop_id, secret_key)
                    .await
                    .map_err(|e| redact_secrets(&e, &[secret_key]))?;
                let payment: client::PaymentResponse = self
                    .http
                    .get_json(
                        &format!("{base}/payments/{}", refund.payment_id),
                        shop_id,
                        secret_key,
                    )
                    .await
                    .map_err(|e| redact_secrets(&e, &[secret_key]))?;
                webhook::refund_to_envelope(&refund, &payment)?
            }
            other => return Err(format!("unsupported yookassa event: {other}")),
        };

        if envelope.provider != PROVIDER_NAME {
            return Err("provider mismatch".to_owned());
        }
        Ok(envelope)
    }

    async fn create_checkout(
        &self,
        scope: TenantScope,
        request: &CheckoutRequest,
        idempotence_key: &str,
    ) -> Result<CheckoutSession, String> {
        self.create_checkout_payment(scope, request, idempotence_key)
            .await
    }

    async fn reconcile(&self, repo: &BillingRepository) -> Result<ReconcileReport, String> {
        reconcile_yookassa(self, repo).await
    }

    fn provider_name(&self) -> &'static str {
        PROVIDER_NAME
    }
}

pub fn grant_until_from_metadata(metadata: &serde_json::Value) -> Option<chrono::DateTime<Utc>> {
    let days = metadata.get("grant_days").and_then(|v| v.as_u64())?;
    if days == 0 {
        return None;
    }
    Some(Utc::now() + Duration::days(days as i64))
}

#[derive(Debug, Deserialize)]
struct MetadataIds {
    household_id: Uuid,
    subscription_id: Uuid,
    plan_id: String,
    feature_key: Option<String>,
}

impl MetadataIds {
    fn from_metadata(metadata: &serde_json::Value) -> Result<Self, String> {
        Ok(Self {
            household_id: parse_metadata_uuid(metadata.get("household_id"), "household_id")?,
            subscription_id: parse_metadata_uuid(
                metadata.get("subscription_id"),
                "subscription_id",
            )?,
            plan_id: metadata
                .get("plan_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "metadata.plan_id is required".to_owned())?
                .to_owned(),
            feature_key: metadata
                .get("feature_key")
                .and_then(|v| v.as_str())
                .map(str::to_owned),
        })
    }
}

fn parse_metadata_uuid(value: Option<&serde_json::Value>, field: &str) -> Result<Uuid, String> {
    let raw = value
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("metadata.{field} is required"))?;
    Uuid::parse_str(raw).map_err(|_| format!("metadata.{field} must be a uuid"))
}
