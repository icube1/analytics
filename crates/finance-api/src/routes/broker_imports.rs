use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::routing::get;
use axum::{Extension, Json, Router};

use crate::auth::Authenticated;
use crate::error::{ApiError, ApiResult};
use crate::import::sanitize_broker_file_name;
use crate::models::import::{
    broker_import_metadata, BrokerImportListResponse, BrokerImportMetadataResponse,
    CreateBrokerImportRequest,
};
use crate::repositories::{BrokerImportRepository, ACTION_BROKER_IMPORT_CREATE};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/broker/imports",
            get(list_broker_imports).post(create_broker_import),
        )
        .route(
            "/broker/imports/:import_id",
            get(get_broker_import_metadata),
        )
        .route(
            "/broker/imports/:import_id/content",
            get(get_broker_import_content),
        )
}

async fn list_broker_imports(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
) -> ApiResult<Json<BrokerImportListResponse>> {
    let scope = auth.scope();
    let items = BrokerImportRepository::new(state.pool().clone())
        .list_imports_for_household(scope)
        .await?
        .iter()
        .map(broker_import_metadata)
        .collect();
    Ok(Json(BrokerImportListResponse { items }))
}

async fn create_broker_import(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    Json(body): Json<CreateBrokerImportRequest>,
) -> ApiResult<(StatusCode, Json<BrokerImportMetadataResponse>)> {
    let scope = auth.scope();
    body.validate(state.config().max_request_bytes)
        .map_err(|message| ApiError::BadRequest { message })?;
    let file_name = sanitize_broker_file_name(&body.file_name)
        .map_err(|message| ApiError::BadRequest { message })?;
    let repo = BrokerImportRepository::new(state.pool().clone());
    let account = repo
        .upsert_account(
            scope,
            &body.provider,
            &body.external_account_id,
            body.display_name.as_deref(),
        )
        .await?;
    let source_type = body
        .source_type
        .as_deref()
        .unwrap_or("broker_upload")
        .to_owned();
    let content_type = body
        .content_type
        .clone()
        .or_else(|| guess_broker_content_type(&file_name));
    let metadata_json = body
        .metadata
        .map(|value| value.to_string())
        .unwrap_or_else(|| {
            serde_json::json!({
                "parseDelegated": true,
                "note": "Broker parsing remains delegated to the existing TypeScript pipeline."
            })
            .to_string()
        });
    let record = repo
        .create_import_with_content(
            scope,
            account.id,
            &source_type,
            &file_name,
            content_type.as_deref(),
            body.content.as_bytes(),
            "api",
            true,
            Some(auth.context.user_id),
            &metadata_json,
        )
        .await?;
    state
        .audit()
        .record_best_effort(
            Some(auth.context.household_id),
            Some(auth.context.user_id),
            ACTION_BROKER_IMPORT_CREATE,
            serde_json::json!({
                "provider": body.provider,
                "sourceType": source_type,
                "byteSize": record.byte_size,
            }),
        )
        .await;
    Ok((StatusCode::CREATED, Json(broker_import_metadata(&record))))
}

async fn get_broker_import_metadata(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    Path(import_id): Path<uuid::Uuid>,
) -> ApiResult<Json<BrokerImportMetadataResponse>> {
    let scope = auth.scope();
    let record = BrokerImportRepository::new(state.pool().clone())
        .get_import(scope, import_id)
        .await?;
    Ok(Json(broker_import_metadata(&record)))
}

async fn get_broker_import_content(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
    Path(import_id): Path<uuid::Uuid>,
) -> ApiResult<impl axum::response::IntoResponse> {
    let scope = auth.scope();
    let repo = BrokerImportRepository::new(state.pool().clone());
    let record = repo.get_import(scope, import_id).await?;
    let bytes = repo.read_content(scope, import_id).await?;
    let content_type = record
        .content_type
        .unwrap_or_else(|| "application/octet-stream".to_owned());
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type),
            (
                header::HeaderName::from_static("x-content-sha256"),
                record.checksum_sha256.unwrap_or_default(),
            ),
            (
                header::HeaderName::from_static("x-parse-delegated"),
                if record.parse_delegated {
                    "true"
                } else {
                    "false"
                }
                .to_owned(),
            ),
        ],
        bytes,
    ))
}

fn guess_broker_content_type(file_name: &str) -> Option<String> {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".html") {
        Some("text/html; charset=utf-8".to_owned())
    } else if lower.ends_with(".json") {
        Some("application/json; charset=utf-8".to_owned())
    } else if lower.ends_with(".csv") {
        Some("text/csv; charset=utf-8".to_owned())
    } else {
        None
    }
}
