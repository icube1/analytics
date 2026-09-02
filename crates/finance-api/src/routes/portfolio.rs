use crate::auth::Authenticated;
use crate::error::ApiResult;
use crate::models::portfolio::{
    PortfolioSyncRequest, PortfolioSyncResponse, PORTFOLIO_SCHEMA_VERSION,
};
use crate::repositories::{IdempotencyRepository, PortfolioRepository};
use crate::state::AppState;
use axum::{
    extract::{Extension, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
const ENDPOINT: &str = "PUT /api/v1/portfolio";
pub fn router() -> Router<AppState> {
    Router::new().route("/portfolio", get(get_portfolio).put(put_portfolio))
}
async fn get_portfolio(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
) -> ApiResult<Json<PortfolioSyncResponse>> {
    let scope = auth.scope();
    let p = PortfolioRepository::new(state.pool().clone());
    let head = p.ensure_document(scope).await?;
    let latest = p.get_latest_revision(scope).await?;
    let document = latest
        .as_ref()
        .and_then(|r| serde_json::from_str(&r.payload_json).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    Ok(Json(PortfolioSyncResponse {
        schema_version: PORTFOLIO_SCHEMA_VERSION,
        revision: head.revision,
        household_id: auth.context.household_id.to_string(),
        document,
        updated_at: head.updated_at.to_rfc3339(),
    }))
}
async fn put_portfolio(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    headers: HeaderMap,
    Json(body): Json<PortfolioSyncRequest>,
) -> ApiResult<(StatusCode, Json<PortfolioSyncResponse>)> {
    let scope = auth.scope();
    body.validate()
        .map_err(|m| crate::error::ApiError::BadRequest { message: m })?;
    let key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
        .or(body.idempotency_key.clone());
    if let Some(k) = key.as_deref() {
        let cache = IdempotencyRepository::new(state.pool().clone());
        if let Some(c) = cache.get(scope, ENDPOINT, k).await? {
            let r: PortfolioSyncResponse = serde_json::from_str(&c.response_json)
                .map_err(|_| crate::error::ApiError::Internal)?;
            return Ok((
                StatusCode::from_u16(c.status_code as u16).unwrap_or(StatusCode::OK),
                Json(r),
            ));
        }
    }
    let p = PortfolioRepository::new(state.pool().clone());
    p.ensure_document(scope).await?;
    let payload =
        serde_json::to_string(&body.document).map_err(|_| crate::error::ApiError::Internal)?;
    let rev = p
        .upsert_revision(scope, body.base_revision, &payload, key.as_deref())
        .await?;
    let head = p.get_head(scope).await?;
    let response = PortfolioSyncResponse {
        schema_version: PORTFOLIO_SCHEMA_VERSION,
        revision: rev.revision,
        household_id: auth.context.household_id.to_string(),
        document: body.document,
        updated_at: head.updated_at.to_rfc3339(),
    };
    if let Some(k) = key.as_deref() {
        let cache = IdempotencyRepository::new(state.pool().clone());
        let json =
            serde_json::to_string(&response).map_err(|_| crate::error::ApiError::Internal)?;
        cache
            .store(
                scope,
                ENDPOINT,
                k,
                i64::from(StatusCode::OK.as_u16()),
                &json,
                state.config().idempotency_ttl,
            )
            .await?;
    }
    Ok((StatusCode::OK, Json(response)))
}
