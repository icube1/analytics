use crate::auth::Authenticated;
use crate::entitlements::{EntitlementService, FEATURE_RESILIENCE};
use crate::error::{ApiError, ApiResult};
use crate::repositories::{JobRecord, JobRepository, JOB_KIND_RESILIENCE};
use crate::state::AppState;
use axum::{
    extract::{Extension, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/jobs", post(create_job))
        .route("/jobs/:job_id", get(get_job))
        .route("/jobs/:job_id/cancel", post(cancel_job))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateJobRequest {
    kind: String,
    payload: serde_json::Value,
    idempotency_key: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JobResponse {
    id: String,
    kind: String,
    status: String,
    result: Option<serde_json::Value>,
    error_message: Option<String>,
    created_at: String,
    started_at: Option<String>,
    finished_at: Option<String>,
}
async fn create_job(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    headers: HeaderMap,
    Json(body): Json<CreateJobRequest>,
) -> ApiResult<(StatusCode, Json<JobResponse>)> {
    if body.kind != JOB_KIND_RESILIENCE {
        return Err(ApiError::BadRequest {
            message: "unsupported job kind".into(),
        });
    }
    EntitlementService::new(state.billing_repo())
        .ensure_feature(auth.scope(), FEATURE_RESILIENCE)
        .await?;
    if JobRepository::new(state.pool().clone())
        .count_active_for_household(auth.context.household_id)
        .await?
        >= state.config().max_pending_jobs_per_household as i64
    {
        return Err(ApiError::BadRequest {
            message: "too many pending jobs".into(),
        });
    }
    let key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
        .or(body.idempotency_key);
    let payload = serde_json::to_string(&body.payload).map_err(|_| ApiError::Internal)?;
    let job = JobRepository::new(state.pool().clone())
        .enqueue(auth.scope(), &body.kind, &payload, key.as_deref())
        .await?;
    Ok((StatusCode::ACCEPTED, Json(to_resp(job)?)))
}
async fn get_job(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<JobResponse>> {
    Ok(Json(to_resp(
        JobRepository::new(state.pool().clone())
            .get(auth.scope(), id)
            .await?,
    )?))
}
async fn cancel_job(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<JobResponse>> {
    Ok(Json(to_resp(
        JobRepository::new(state.pool().clone())
            .request_cancel(auth.scope(), id)
            .await?,
    )?))
}
fn to_resp(job: JobRecord) -> ApiResult<JobResponse> {
    Ok(JobResponse {
        id: job.id.to_string(),
        kind: job.kind,
        status: job.status,
        result: job
            .result_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(|_| ApiError::Internal)?,
        error_message: job.error_message,
        created_at: job.created_at.to_rfc3339(),
        started_at: job.started_at.map(|v| v.to_rfc3339()),
        finished_at: job.finished_at.map(|v| v.to_rfc3339()),
    })
}
