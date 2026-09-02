//! Provider-neutral billing boundary without external credentials.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::error::ApiResult;
use crate::repositories::{BillingRepository, EntitlementRecord};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutRequest {
    pub plan_id: String,
    pub success_url: String,
    pub cancel_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutResponse {
    pub checkout_url: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookEnvelope {
    pub provider: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub idempotency_key: Option<String>,
}

pub trait BillingProvider: Send + Sync {
    fn create_checkout(&self, request: &CheckoutRequest) -> Result<CheckoutResponse, String>;
    fn verify_webhook(
        &self,
        raw_body: &[u8],
        signature: Option<&str>,
    ) -> Result<WebhookEnvelope, String>;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct NullBillingProvider;

impl BillingProvider for NullBillingProvider {
    fn create_checkout(&self, _request: &CheckoutRequest) -> Result<CheckoutResponse, String> {
        Ok(CheckoutResponse {
            checkout_url: None,
            status: "provider_not_configured".to_owned(),
        })
    }

    fn verify_webhook(
        &self,
        _raw_body: &[u8],
        _signature: Option<&str>,
    ) -> Result<WebhookEnvelope, String> {
        Err("billing provider is not configured".to_owned())
    }
}

pub struct BillingService {
    repo: BillingRepository,
    provider: Box<dyn BillingProvider>,
}

impl BillingService {
    pub fn new(repo: BillingRepository, provider: Box<dyn BillingProvider>) -> Self {
        Self { repo, provider }
    }

    pub async fn list_entitlements(&self, scope: TenantScope) -> ApiResult<Vec<EntitlementRecord>> {
        self.repo.list_entitlements(scope).await
    }

    pub async fn record_provider_event(
        &self,
        scope: TenantScope,
        envelope: &WebhookEnvelope,
    ) -> ApiResult<Uuid> {
        self.repo
            .record_event(
                scope,
                &envelope.event_type,
                Some(&envelope.provider),
                &serde_json::to_string(&envelope.payload).unwrap_or_else(|_| "{}".to_owned()),
                envelope.idempotency_key.as_deref(),
            )
            .await
    }

    pub fn create_checkout(&self, request: &CheckoutRequest) -> Result<CheckoutResponse, String> {
        self.provider.create_checkout(request)
    }
}
