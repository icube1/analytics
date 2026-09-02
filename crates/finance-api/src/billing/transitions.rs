use crate::auth::TenantScope;
use crate::error::ApiResult;
use crate::repositories::{BillingRepository, SubscriptionRecord};
use chrono::{DateTime, Utc};
use uuid::Uuid;

const RANK: &[&str] = &["trialing", "active", "past_due", "paused", "cancelled"];

pub fn transition_subscription_status(
    current: Option<&str>,
    incoming: &str,
    event_time: DateTime<Utc>,
    last: Option<DateTime<Utc>>,
) -> Option<String> {
    if let Some(l) = last {
        if event_time < l {
            return current.map(str::to_owned);
        }
    }
    let ir = RANK.iter().position(|s| *s == incoming);
    let cr = current.and_then(|s| RANK.iter().position(|c| *c == s));
    match (cr, ir) {
        (_, None) => current.map(str::to_owned),
        (None, Some(_)) => Some(incoming.to_owned()),
        (Some(c), Some(i)) if incoming == "cancelled" || i >= c => Some(incoming.to_owned()),
        (Some(_), Some(_)) => current.map(str::to_owned),
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn apply_subscription_event(
    repo: &BillingRepository,
    scope: TenantScope,
    sid: Uuid,
    status: &str,
    event_time: DateTime<Utc>,
    plan_id: Option<&str>,
    provider: Option<&str>,
    external_id: Option<&str>,
) -> ApiResult<SubscriptionRecord> {
    let current = repo.get_subscription(scope, sid).await.ok();
    let next = transition_subscription_status(
        current.as_ref().map(|r| r.status.as_str()),
        status,
        event_time,
        current.as_ref().map(|r| r.updated_at),
    )
    .unwrap_or_else(|| status.to_owned());
    repo.upsert_subscription(
        scope,
        sid,
        plan_id.unwrap_or("default"),
        &next,
        provider,
        external_id,
        event_time,
    )
    .await
}
