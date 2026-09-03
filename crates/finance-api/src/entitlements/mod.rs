mod plans;

use crate::auth::TenantScope;
use crate::error::ApiResult;
use crate::repositories::BillingRepository;

pub const FEATURE_RESILIENCE: &str = "resilience.compute";
/// Heavy server-side simulations (Monte Carlo). Free local Workers stay available.
pub const FEATURE_HEAVY_COMPUTE: &str = "finance.heavy";
pub use plans::{infer_plan, PLAN_FREE, PLAN_HOUSEHOLD, PLAN_PRO};

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

    pub async fn list_active_features(&self, scope: TenantScope) -> ApiResult<Vec<String>> {
        let now = chrono::Utc::now();
        Ok(self
            .billing
            .list_entitlements(scope)
            .await?
            .into_iter()
            .filter(|entitlement| {
                entitlement
                    .granted_until
                    .map(|until| until > now)
                    .unwrap_or(true)
            })
            .map(|entitlement| entitlement.feature_key)
            .collect())
    }
}
