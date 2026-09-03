use super::{FEATURE_HEAVY_COMPUTE, FEATURE_RESILIENCE};

pub const PLAN_FREE: &str = "free";
pub const PLAN_PRO: &str = "pro";
pub const PLAN_HOUSEHOLD: &str = "household";

#[must_use]
pub fn infer_plan(plan_id: Option<&str>, features: &[String]) -> &'static str {
    match plan_id {
        Some(PLAN_HOUSEHOLD) => PLAN_HOUSEHOLD,
        Some(PLAN_PRO) => PLAN_PRO,
        Some(PLAN_FREE) => PLAN_FREE,
        _ if features
            .iter()
            .any(|feature| feature == FEATURE_HEAVY_COMPUTE) =>
        {
            PLAN_PRO
        }
        _ if features.iter().any(|feature| feature == FEATURE_RESILIENCE) => PLAN_PRO,
        _ => PLAN_FREE,
    }
}
