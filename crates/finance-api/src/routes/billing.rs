use crate::error::ApiResult;
use crate::state::AppState;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
    Json, Router,
};
use serde::Serialize;
pub fn router() -> Router<AppState> {
    Router::new().route("/billing/webhook", post(ingest))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Resp {
    event_id: String,
}
async fn ingest(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<Resp>)> {
    let sig = headers
        .get("x-billing-signature")
        .or_else(|| headers.get("x-test-signature"))
        .and_then(|v| v.to_str().ok());
    let id = state.billing().ingest_webhook(&body, sig).await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(Resp {
            event_id: id.to_string(),
        }),
    ))
}
