use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Extension, Json, Router};

use crate::auth::Authenticated;
use crate::error::{ApiError, ApiResult};
use crate::import::sanitize_statement_file_name;
use crate::models::import::{
    statement_metadata, CreateStatementRequest, StatementContentResponse, StatementListResponse,
    StatementMetadataResponse,
};
use crate::repositories::{StatementRepository, ACTION_STATEMENTS_CREATE};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/statements", get(list_statements).post(create_statement))
        .route("/statements/:statement_id", get(get_statement_metadata))
        .route(
            "/statements/:statement_id/content",
            get(get_statement_content),
        )
}

async fn list_statements(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
) -> ApiResult<Json<StatementListResponse>> {
    let scope = auth.scope();
    let repo = StatementRepository::new(state.pool().clone());
    let items = repo
        .list_for_household(scope)
        .await?
        .iter()
        .map(statement_metadata)
        .collect();
    Ok(Json(StatementListResponse { items }))
}

async fn create_statement(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    Json(body): Json<CreateStatementRequest>,
) -> ApiResult<(StatusCode, Json<StatementMetadataResponse>)> {
    let scope = auth.scope();
    body.validate(state.config().max_request_bytes)
        .map_err(|message| ApiError::BadRequest { message })?;
    let file_name = sanitize_statement_file_name(&body.file_name)
        .map_err(|message| ApiError::BadRequest { message })?;
    let content_type = body
        .content_type
        .as_deref()
        .unwrap_or("text/csv")
        .to_owned();
    let metadata_json = body
        .metadata
        .map(|value| value.to_string())
        .unwrap_or_else(|| "{}".to_owned());
    let record = StatementRepository::new(state.pool().clone())
        .create_with_content(
            scope,
            "csv",
            &file_name,
            Some(&content_type),
            body.content.as_bytes(),
            "api",
            Some(auth.context.user_id),
            &metadata_json,
        )
        .await?;
    state
        .audit()
        .record_best_effort(
            Some(auth.context.household_id),
            Some(auth.context.user_id),
            ACTION_STATEMENTS_CREATE,
            serde_json::json!({
                "sourceType": "csv",
                "byteSize": record.byte_size,
            }),
        )
        .await;
    Ok((StatusCode::CREATED, Json(statement_metadata(&record))))
}

async fn get_statement_metadata(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    Path(statement_id): Path<uuid::Uuid>,
) -> ApiResult<Json<StatementMetadataResponse>> {
    let scope = auth.scope();
    let record = StatementRepository::new(state.pool().clone())
        .get(scope, statement_id)
        .await?;
    Ok(Json(statement_metadata(&record)))
}

async fn get_statement_content(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    Path(statement_id): Path<uuid::Uuid>,
    headers: HeaderMap,
) -> ApiResult<impl axum::response::IntoResponse> {
    let scope = auth.scope();
    let repo = StatementRepository::new(state.pool().clone());
    let record = repo.get(scope, statement_id).await?;
    let bytes = repo.read_content(scope, statement_id).await?;
    let content = String::from_utf8(bytes).map_err(|_| ApiError::Internal)?;

    if wants_metadata_only(&headers) {
        return Ok((
            StatusCode::OK,
            Json(StatementContentResponse {
                id: record.id.to_string(),
                file_name: record.file_name,
                content_type: record.content_type,
                checksum_sha256: record.checksum_sha256,
                content,
            }),
        )
            .into_response());
    }

    let content_type = record
        .content_type
        .unwrap_or_else(|| "text/plain; charset=utf-8".to_owned());
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type),
            (
                header::HeaderName::from_static("x-content-sha256"),
                record.checksum_sha256.unwrap_or_default(),
            ),
        ],
        content,
    )
        .into_response())
}

fn wants_metadata_only(headers: &HeaderMap) -> bool {
    headers
        .get(header::ACCEPT)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.contains("application/json"))
}
