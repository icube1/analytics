use std::sync::Arc;
use std::time::Instant;

use axum::body::Body;
use axum::extract::State;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;

use super::metrics::{sanitize_route, HttpMetrics};

pub async fn record_http_metrics(
    State(metrics): State<Arc<HttpMetrics>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let started = Instant::now();
    let route = sanitize_route(request.uri().path());
    let response = next.run(request).await;
    metrics.record(
        response.status().as_u16(),
        started.elapsed().as_secs_f64() * 1000.0,
    );
    tracing::debug!(route = %route, status = response.status().as_u16(), "http_request");
    response
}
