use crate::auth::TenantScope;
use crate::error::ApiResult;
use crate::repositories::BillingRepository;

pub const FEATURE_RESILIENCE: &str = "resilience.compute";

#[derive(Clone)]
pub struct EntitlementService {
    billing: BillingRepository,
}

impl EntitlementService {
    pub fn new(billing: BillingRepository) -> Self {
        Self { billing }
    }
    pub async fn ensure_feature(&self, scope: TenantScope, feature_key: &str) -> ApiResult<()> {
        let now = chrono::Utc::now();
        let ok = self
            .billing
            .list_entitlements(scope)
            .await?
            .iter()
            .any(|e| {
                e.feature_key == feature_key && e.granted_until.map(|u| u > now).unwrap_or(true)
            });
        if ok {
            Ok(())
        } else {
            Err(crate::error::ApiError::Forbidden)
        }
    }
}
