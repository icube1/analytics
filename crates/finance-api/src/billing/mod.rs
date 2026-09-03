mod http;
mod signature;
mod transitions;
mod types;
mod validation;
pub mod yookassa;

use async_trait::async_trait;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::billing::signature::HmacSha256Verifier;
use crate::billing::transitions::apply_subscription_event;
use crate::billing::yookassa::YooKassaBillingProvider;
use crate::error::{ApiError, ApiResult};
use crate::repositories::{AuditRepository, BillingRepository, ACTION_BILLING_WEBHOOK};
use serde::{Deserialize, Serialize};

pub use signature::SignatureVerifier;
pub use transitions::transition_subscription_status;
pub use types::{CheckoutRequest, CheckoutSession, ReconcileReport};
pub use validation::{redact_secrets, validate_amount, validate_currency, validate_return_url};
pub use yookassa::PROVIDER_NAME as YOOKASSA_PROVIDER_NAME;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebhookEnvelope {
    pub provider: String,
    pub event_type: String,
    pub household_id: Uuid,
    pub payload: serde_json::Value,
    pub idempotency_key: Option<String>,
    pub event_time: Option<String>,
    pub subscription_id: Option<Uuid>,
    pub plan_id: Option<String>,
    pub subscription_status: Option<String>,
    pub feature_key: Option<String>,
    pub granted_until: Option<String>,
}

#[async_trait]
pub trait BillingProvider: Send + Sync {
    async fn verify_webhook(
        &self,
        raw_body: &[u8],
        signature: Option<&str>,
    ) -> Result<WebhookEnvelope, String>;

    async fn create_checkout(
        &self,
        _scope: TenantScope,
        _request: &CheckoutRequest,
        _idempotence_key: &str,
    ) -> Result<CheckoutSession, String> {
        Err("checkout is not supported by this billing provider".to_owned())
    }

    async fn reconcile(&self, _repo: &BillingRepository) -> Result<ReconcileReport, String> {
        Err("reconciliation is not supported by this billing provider".to_owned())
    }

    fn provider_name(&self) -> &'static str {
        "unknown"
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct NullBillingProvider;

#[async_trait]
impl BillingProvider for NullBillingProvider {
    async fn verify_webhook(&self, _: &[u8], _: Option<&str>) -> Result<WebhookEnvelope, String> {
        Err("billing provider is not configured".to_owned())
    }

    fn provider_name(&self) -> &'static str {
        "null"
    }
}

pub struct TestBillingProvider {
    verifier: HmacSha256Verifier,
}

impl TestBillingProvider {
    pub fn new(secret: impl Into<Vec<u8>>) -> Self {
        Self {
            verifier: HmacSha256Verifier::new(secret),
        }
    }
}

#[async_trait]
impl BillingProvider for TestBillingProvider {
    async fn verify_webhook(
        &self,
        raw_body: &[u8],
        signature: Option<&str>,
    ) -> Result<WebhookEnvelope, String> {
        self.verifier.verify(raw_body, signature)?;
        serde_json::from_slice(raw_body).map_err(|e| e.to_string())
    }

    fn provider_name(&self) -> &'static str {
        "test"
    }
}

pub struct BillingService {
    repo: BillingRepository,
    provider: Box<dyn BillingProvider>,
}

impl BillingService {
    pub fn new(pool: sqlx::SqlitePool, provider: Box<dyn BillingProvider>) -> Self {
        Self {
            repo: BillingRepository::new(pool),
            provider,
        }
    }

    pub fn null(pool: sqlx::SqlitePool) -> Self {
        Self::new(pool, Box::new(NullBillingProvider))
    }

    pub fn test(pool: sqlx::SqlitePool, secret: impl Into<Vec<u8>>) -> Self {
        Self::new(pool, Box::new(TestBillingProvider::new(secret)))
    }

    pub fn provider_name(&self) -> &'static str {
        self.provider.provider_name()
    }

    pub async fn create_checkout(
        &self,
        scope: TenantScope,
        request: &CheckoutRequest,
        idempotence_key: &str,
    ) -> ApiResult<CheckoutSession> {
        self.provider
            .create_checkout(scope, request, idempotence_key)
            .await
            .map_err(|message| ApiError::BadRequest { message })
    }

    pub async fn reconcile(&self) -> ApiResult<ReconcileReport> {
        self.provider
            .reconcile(&self.repo)
            .await
            .map_err(|message| ApiError::BadRequest { message })
    }

    pub async fn ingest_webhook(
        &self,
        raw_body: &[u8],
        signature: Option<&str>,
    ) -> ApiResult<Uuid> {
        let env = self
            .provider
            .verify_webhook(raw_body, signature)
            .await
            .map_err(|m| ApiError::BadRequest { message: m })?;
        self.apply_envelope(env).await
    }

    pub async fn apply_envelope(&self, env: WebhookEnvelope) -> ApiResult<Uuid> {
        let scope = TenantScope {
            household_id: env.household_id,
        };
        let id = self
            .repo
            .record_event(
                scope,
                &env.event_type,
                Some(&env.provider),
                &serde_json::to_string(&env.payload).unwrap_or_else(|_| "{}".into()),
                env.idempotency_key.as_deref(),
            )
            .await?;
        if let (Some(sid), Some(st)) = (env.subscription_id, env.subscription_status.as_deref()) {
            let t = env
                .event_time
                .as_deref()
                .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
                .map(|v| v.with_timezone(&chrono::Utc))
                .unwrap_or_else(chrono::Utc::now);
            apply_subscription_event(
                &self.repo,
                scope,
                sid,
                st,
                t,
                env.plan_id.as_deref(),
                Some(&env.provider),
                env.payload.get("externalId").and_then(|v| v.as_str()),
            )
            .await?;
        }
        if let Some(fk) = env.feature_key.as_deref() {
            let gu = env
                .granted_until
                .as_deref()
                .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok())
                .map(|v| v.with_timezone(&chrono::Utc));
            self.repo
                .upsert_entitlement(scope, fk, gu, env.subscription_id)
                .await?;
        }
        AuditRepository::new(self.repo.pool())
            .record_best_effort(
                Some(env.household_id),
                None,
                ACTION_BILLING_WEBHOOK,
                serde_json::json!({
                    "provider": env.provider,
                    "eventType": env.event_type,
                    "subscriptionStatus": env.subscription_status,
                }),
            )
            .await;
        Ok(id)
    }
}

pub fn build_billing_provider(
    config: &crate::config::Config,
) -> Result<Box<dyn BillingProvider>, String> {
    if config.yookassa.enabled {
        return Ok(Box::new(YooKassaBillingProvider::new(
            config.yookassa.clone(),
        )?));
    }
    if let Some(secret) = config.billing_webhook_secret.as_deref() {
        return Ok(Box::new(TestBillingProvider::new(secret.as_bytes())));
    }
    Ok(Box::new(NullBillingProvider))
}

pub fn build_billing_service(
    pool: sqlx::SqlitePool,
    config: &crate::config::Config,
) -> Result<BillingService, String> {
    Ok(BillingService::new(pool, build_billing_provider(config)?))
}
