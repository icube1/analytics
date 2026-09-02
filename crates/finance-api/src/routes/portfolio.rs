use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use serde_json::json;
use uuid::Uuid;

use crate::auth::{authenticate_basic, AuthContext, TenantScope};
use crate::error::{ApiError, ApiResult};
use crate::models::portfolio::{
    PortfolioSyncRequest, PortfolioSyncResponse, PORTFOLIO_SCHEMA_VERSION,
};
use crate::repositories::{IdempotencyRepository, MembershipRepository, PortfolioRepository};
use crate::state::AppState;

const ENDPOINT: &str = "PUT /api/v1/portfolio";

pub fn router() -> Router<AppState> {
    Router::new().route("/portfolio", get(get_portfolio).put(put_portfolio))
}

async fn get_portfolio(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<PortfolioSyncResponse>> {
    authenticate_basic(
        state.config(),
        headers
            .get("authorization")
            .and_then(|value| value.to_str().ok()),
    )?;
    let context = resolve_context(&state, &headers).await?;
    let scope = TenantScope::from(&context);

    let portfolio = PortfolioRepository::new(state.pool().clone());
    MembershipRepository::new(state.pool().clone())
        .ensure_membership(scope, context.user_id)
        .await?;

    let head = portfolio.ensure_document(scope).await?;
    let latest = portfolio.get_latest_revision(scope).await?;

    let document = latest
        .as_ref()
        .and_then(|revision| serde_json::from_str(&revision.payload_json).ok())
        .unwrap_or_else(|| json!({}));

    Ok(Json(PortfolioSyncResponse {
        schema_version: PORTFOLIO_SCHEMA_VERSION,
        revision: head.revision,
        household_id: context.household_id.to_string(),
        document,
        updated_at: head.updated_at.to_rfc3339(),
    }))
}

async fn put_portfolio(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<PortfolioSyncRequest>,
) -> ApiResult<(StatusCode, Json<PortfolioSyncResponse>)> {
    authenticate_basic(
        state.config(),
        headers
            .get("authorization")
            .and_then(|value| value.to_str().ok()),
    )?;
    let context = resolve_context(&state, &headers).await?;
    let scope = TenantScope::from(&context);

    body.validate()
        .map_err(|message| ApiError::BadRequest { message })?;

    let idempotency_key = headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .or(body.idempotency_key.clone());

    if let Some(key) = idempotency_key.as_deref() {
        let cache = IdempotencyRepository::new(state.pool().clone());
        if let Some(cached) = cache.get(scope, ENDPOINT, key).await? {
            let response: PortfolioSyncResponse =
                serde_json::from_str(&cached.response_json).map_err(|_| ApiError::Internal)?;
            return Ok((
                StatusCode::from_u16(cached.status_code as u16).unwrap_or(StatusCode::OK),
                Json(response),
            ));
        }
    }

    MembershipRepository::new(state.pool().clone())
        .ensure_membership(scope, context.user_id)
        .await?;

    let portfolio = PortfolioRepository::new(state.pool().clone());
    portfolio.ensure_document(scope).await?;

    let payload_json = serde_json::to_string(&body.document).map_err(|_| ApiError::Internal)?;
    let revision = portfolio
        .upsert_revision(
            scope,
            body.base_revision,
            &payload_json,
            idempotency_key.as_deref(),
        )
        .await?;

    let head = portfolio.get_head(scope).await?;
    let response = PortfolioSyncResponse {
        schema_version: PORTFOLIO_SCHEMA_VERSION,
        revision: revision.revision,
        household_id: context.household_id.to_string(),
        document: body.document,
        updated_at: head.updated_at.to_rfc3339(),
    };

    if let Some(key) = idempotency_key.as_deref() {
        let cache = IdempotencyRepository::new(state.pool().clone());
        let response_json = serde_json::to_string(&response).map_err(|_| ApiError::Internal)?;
        cache
            .store(
                scope,
                ENDPOINT,
                key,
                i64::from(StatusCode::OK.as_u16()),
                &response_json,
                state.config().idempotency_ttl,
            )
            .await?;
    }

    Ok((StatusCode::OK, Json(response)))
}

async fn resolve_context(state: &AppState, headers: &HeaderMap) -> ApiResult<AuthContext> {
    let user_id = header_uuid(headers, "x-user-id")?;
    let household_id = header_uuid(headers, "x-household-id")?;
    MembershipRepository::new(state.pool().clone())
        .ensure_membership(TenantScope { household_id }, user_id)
        .await?;
    Ok(AuthContext::new(user_id, household_id))
}

fn header_uuid(headers: &HeaderMap, name: &str) -> ApiResult<Uuid> {
    let value = headers
        .get(name)
        .and_then(|header| header.to_str().ok())
        .ok_or_else(|| ApiError::BadRequest {
            message: format!("missing {name} header"),
        })?;
    Uuid::parse_str(value).map_err(|_| ApiError::BadRequest {
        message: format!("invalid {name} header"),
    })
}
