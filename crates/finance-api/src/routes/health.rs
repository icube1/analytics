use axum::{routing::get, Json, Router};
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    database: &'static str,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health))
}

async fn health(state: axum::extract::State<AppState>) -> Json<HealthResponse> {
    let database = match sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(state.pool())
        .await
    {
        Ok(_) => "ok",
        Err(_) => "error",
    };

    Json(HealthResponse {
        status: "ok",
        database,
    })
}
