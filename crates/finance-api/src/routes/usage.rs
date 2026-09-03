use axum::{extract::Extension, extract::State, routing::get, Json, Router};
use serde::Serialize;

use crate::auth::Authenticated;
use crate::error::ApiResult;
use crate::repositories::UsageRepository;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/usage-summary", get(usage_summary))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageCountResponse {
    kind: String,
    count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageSummaryResponse {
    items: Vec<UsageCountResponse>,
}

async fn usage_summary(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
) -> ApiResult<Json<UsageSummaryResponse>> {
    let items = UsageRepository::new(state.pool().clone())
        .summarize(auth.scope())
        .await?
        .into_iter()
        .map(|row| UsageCountResponse {
            kind: row.kind,
            count: row.count,
        })
        .collect();
    Ok(Json(UsageSummaryResponse { items }))
}
