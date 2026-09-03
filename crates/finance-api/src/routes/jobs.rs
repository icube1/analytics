use crate::auth::Authenticated;
use crate::entitlements::{EntitlementService, FEATURE_HEAVY_COMPUTE, FEATURE_RESILIENCE};
use crate::error::{ApiError, ApiResult};
use crate::repositories::{
    is_supported_job_kind, payload_sha256, CalculationRepository, JobRecord, JobRepository,
    UsageRepository, ACTION_JOBS_ENQUEUE, JOB_KIND_FINANCE_EVALUATE, JOB_KIND_RESILIENCE,
};
use crate::state::AppState;
use axum::{
    extract::{Extension, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use finance_core::dto::v1::RequestBatch;
use finance_core::ENGINE_ID;
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
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_hit: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    engine_version: Option<String>,
}

async fn create_job(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    headers: HeaderMap,
    Json(body): Json<CreateJobRequest>,
) -> ApiResult<(StatusCode, Json<JobResponse>)> {
    if !is_supported_job_kind(&body.kind) {
        return Err(ApiError::BadRequest {
            message: "unsupported job kind".into(),
        });
    }

    let entitlements = EntitlementService::new(state.billing_repo());
    if body.kind == JOB_KIND_RESILIENCE {
        entitlements
            .ensure_feature(auth.scope(), FEATURE_RESILIENCE)
            .await?;
    }
    if body.kind == JOB_KIND_FINANCE_EVALUATE {
        let batch: RequestBatch =
            serde_json::from_value(body.payload.clone()).map_err(|_| ApiError::BadRequest {
                message: "finance.evaluate payload must be a finance-core RequestBatch".into(),
            })?;
        if batch.contains_monte_carlo() {
            entitlements
                .ensure_feature(auth.scope(), FEATURE_HEAVY_COMPUTE)
                .await?;
        }
    }

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
    let jobs = JobRepository::new(state.pool().clone());

    if body.kind == JOB_KIND_FINANCE_EVALUATE {
        let hash = payload_sha256(&payload);
        if let Some(cached) = CalculationRepository::new(state.pool().clone())
            .get(auth.scope(), ENGINE_ID, &body.kind, &hash)
            .await?
        {
            let job = jobs
                .enqueue_completed(auth.scope(), &body.kind, &payload, &cached, key.as_deref())
                .await?;
            state
                .audit()
                .record_best_effort(
                    Some(auth.context.household_id),
                    Some(auth.context.user_id),
                    ACTION_JOBS_ENQUEUE,
                    serde_json::json!({ "kind": body.kind, "cacheHit": true }),
                )
                .await;
            UsageRepository::new(state.pool().clone())
                .record_best_effort(auth.scope(), &body.kind, None)
                .await;
            return Ok((
                StatusCode::ACCEPTED,
                Json(to_resp(job, Some(true), Some(ENGINE_ID))?),
            ));
        }
    }

    let job = jobs
        .enqueue(auth.scope(), &body.kind, &payload, key.as_deref())
        .await?;
    state
        .audit()
        .record_best_effort(
            Some(auth.context.household_id),
            Some(auth.context.user_id),
            ACTION_JOBS_ENQUEUE,
            serde_json::json!({ "kind": body.kind, "cacheHit": false }),
        )
        .await;
    UsageRepository::new(state.pool().clone())
        .record_best_effort(auth.scope(), &body.kind, None)
        .await;
    let engine = (body.kind == JOB_KIND_FINANCE_EVALUATE).then_some(ENGINE_ID);
    Ok((
        StatusCode::ACCEPTED,
        Json(to_resp(job, Some(false), engine)?),
    ))
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
        None,
        None,
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
        None,
        None,
    )?))
}

fn to_resp(
    job: JobRecord,
    cache_hit: Option<bool>,
    engine_version: Option<&'static str>,
) -> ApiResult<JobResponse> {
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
        cache_hit,
        engine_version: engine_version.map(str::to_owned),
    })
}
