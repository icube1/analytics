use std::time::Duration;

use axum::body::Body;
use axum::extract::State;
use axum::http::Request;
use axum::middleware::{from_fn_with_state, Next};
use axum::response::Response;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;
use tracing::Level;

use crate::config::Config;
use crate::error::ApiError;
use crate::routes;
use crate::state::AppState;

pub fn build_app(state: AppState) -> axum::Router {
    let max_bytes = state.config().max_request_bytes;
    routes::router()
        .layer(RequestBodyLimitLayer::new(max_bytes))
        .layer(TraceLayer::new_for_http())
        .layer(from_fn_with_state(
            state.clone(),
            reject_oversized_content_length,
        ))
        .with_state(state)
}

async fn reject_oversized_content_length(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, ApiError> {
    if let Some(length) = request
        .headers()
        .get("content-length")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok())
    {
        if length > state.config().max_request_bytes {
            return Err(ApiError::PayloadTooLarge);
        }
    }

    Ok(next.run(request).await)
}

pub fn init_tracing() {
    tracing_subscriber::fmt()
        .json()
        .with_max_level(Level::INFO)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "finance_api=info,tower_http=info,sqlx=warn".into()),
        )
        .init();
}

pub fn startup_banner(config: &Config) {
    tracing::info!(
        bind = %config.bind_addr,
        db_max_connections = config.db_max_connections,
        worker_concurrency = config.worker_concurrency,
        max_request_bytes = config.max_request_bytes,
        auth_configured = config.auth_configured(),
        "finance-api starting"
    );
}

pub const DEFAULT_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
