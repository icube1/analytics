use axum::{
    extract::{Extension, Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::auth::Authenticated;
use crate::error::ApiResult;
use crate::repositories::AuditRepository;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/audit-events", get(list_audit_events))
}

#[derive(Deserialize)]
struct ListQuery {
    limit: Option<i64>,
    action: Option<String>,
    before: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditEventResponse {
    id: String,
    action: String,
    actor_user_id: Option<String>,
    metadata: serde_json::Value,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditListResponse {
    items: Vec<AuditEventResponse>,
    next_cursor: Option<String>,
}

async fn list_audit_events(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    Query(query): Query<ListQuery>,
) -> ApiResult<Json<AuditListResponse>> {
    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    let before = query
        .before
        .as_deref()
        .and_then(|value| value.parse::<uuid::Uuid>().ok());
    let records = AuditRepository::new(state.pool().clone())
        .list_for_household(auth.scope(), limit, query.action.as_deref(), before)
        .await?;
    let next_cursor = (records.len() as i64 >= limit)
        .then(|| records.last().map(|record| record.id.to_string()))
        .flatten();
    let items = records
        .into_iter()
        .map(|record| AuditEventResponse {
            id: record.id.to_string(),
            action: record.action,
            actor_user_id: record.actor_user_id.map(|id| id.to_string()),
            metadata: record.metadata,
            created_at: record.created_at.to_rfc3339(),
        })
        .collect();
    Ok(Json(AuditListResponse { items, next_cursor }))
}
