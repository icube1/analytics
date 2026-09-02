use axum::{routing::get, Json, Router};
use serde::Serialize;

use crate::auth::authenticate_basic;
use crate::observability::HttpMetricsSnapshot;
use crate::repositories::JobRepository;
use crate::state::AppState;

#[derive(Serialize)]
struct MetricsResponse {
    schema_version: u32,
    collected_at: String,
    service: &'static str,
    uptime_secs: f64,
    memory_rss_mb: Option<f64>,
    http: HttpMetricsSnapshot,
    database: DatabaseSnapshot,
    jobs: JobSnapshot,
}

#[derive(Serialize)]
struct DatabaseSnapshot {
    ok: bool,
    pool_size: u32,
    pool_idle: u32,
}

#[derive(Serialize)]
struct JobSnapshot {
    pending: i64,
    running: i64,
    failed: i64,
    completed: i64,
    by_kind: Vec<JobKindCount>,
}

#[derive(Serialize)]
struct JobKindCount {
    kind: String,
    count: i64,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/internal/metrics", get(metrics_snapshot))
}

async fn metrics_snapshot(
    state: axum::extract::State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<MetricsResponse>, crate::error::ApiError> {
    authenticate_internal(&state, &headers)?;
    let database_ok = sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(state.pool())
        .await
        .is_ok();
    let pool = state.pool();
    let http = state.metrics().snapshot();
    let repo = JobRepository::new(pool.clone());
    let counts = repo.count_by_status().await?;
    let by_kind = repo.count_by_kind().await?;

    Ok(Json(MetricsResponse {
        schema_version: 1,
        collected_at: chrono::Utc::now().to_rfc3339(),
        service: "finance-api",
        uptime_secs: http.uptime_secs,
        memory_rss_mb: current_rss_mb(),
        http,
        database: DatabaseSnapshot {
            ok: database_ok,
            pool_size: pool.size(),
            pool_idle: pool.num_idle() as u32,
        },
        jobs: JobSnapshot {
            pending: *counts.get("pending").unwrap_or(&0),
            running: *counts.get("running").unwrap_or(&0),
            failed: *counts.get("failed").unwrap_or(&0),
            completed: *counts.get("completed").unwrap_or(&0),
            by_kind: by_kind
                .into_iter()
                .map(|(kind, count)| JobKindCount { kind, count })
                .collect(),
        },
    }))
}

fn authenticate_internal(
    state: &AppState,
    headers: &axum::http::HeaderMap,
) -> Result<(), crate::error::ApiError> {
    if let Ok(token) = std::env::var("OBSERVABILITY_TOKEN") {
        if !token.is_empty() {
            let bearer = headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.strip_prefix("Bearer "));
            if bearer == Some(token.as_str()) {
                return Ok(());
            }
            return Err(crate::error::ApiError::Unauthorized);
        }
    }
    authenticate_basic(
        state.config(),
        headers
            .get("authorization")
            .and_then(|value| value.to_str().ok()),
    )
}

fn current_rss_mb() -> Option<f64> {
    #[cfg(target_os = "linux")]
    {
        let status = std::fs::read_to_string("/proc/self/status").ok()?;
        for line in status.lines() {
            if let Some(kb) = line.strip_prefix("VmRSS:") {
                let kb = kb.trim().trim_end_matches(" kB").parse::<f64>().ok()?;
                return Some(kb / 1024.0);
            }
        }
    }
    None
}
