use crate::auth::Authenticated;
use crate::billing::CheckoutRequest;
use crate::error::ApiResult;
use crate::state::AppState;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
    Extension, Json, Router,
};
use serde::Serialize;

pub fn webhook_router() -> Router<AppState> {
    Router::new().route("/billing/webhook", post(ingest))
}

pub fn checkout_router() -> Router<AppState> {
    Router::new().route("/billing/checkout", post(create_checkout))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WebhookResp {
    event_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckoutResp {
    payment_id: String,
    confirmation_url: String,
    provider: String,
}

async fn ingest(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<WebhookResp>)> {
    let sig = headers
        .get("x-billing-signature")
        .or_else(|| headers.get("x-test-signature"))
        .and_then(|v| v.to_str().ok());
    let id = state.billing().ingest_webhook(&body, sig).await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(WebhookResp {
            event_id: id.to_string(),
        }),
    ))
}

async fn create_checkout(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    headers: HeaderMap,
    Json(body): Json<CheckoutRequest>,
) -> ApiResult<(StatusCode, Json<CheckoutResp>)> {
    let idempotence_key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| crate::error::ApiError::BadRequest {
            message: "idempotency-key header is required".into(),
        })?;
    let session = state
        .billing()
        .create_checkout(auth.scope(), &body, idempotence_key)
        .await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(CheckoutResp {
            payment_id: session.payment_id,
            confirmation_url: session.confirmation_url,
            provider: session.provider,
        }),
    ))
}
