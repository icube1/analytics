use axum::extract::State;
use axum::routing::get;
use axum::{Extension, Json, Router};
use chrono::Utc;

use crate::auth::Authenticated;
use crate::error::{ApiError, ApiResult};
use crate::models::import::backup_export;
use crate::repositories::{PortfolioRepository, StatementRepository};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/backup/export", get(export_backup))
}

async fn export_backup(
    State(state): State<AppState>,
    Extension(auth): Extension<Authenticated>,
) -> ApiResult<Json<crate::models::import::BackupExportResponse>> {
    let scope = auth.scope();
    let portfolio_repo = PortfolioRepository::new(state.pool().clone());
    portfolio_repo.ensure_document(scope).await?;
    let latest = portfolio_repo
        .get_latest_revision(scope)
        .await?
        .ok_or(ApiError::NotFound)?;
    let portfolio = serde_json::from_str(&latest.payload_json).map_err(|_| ApiError::Internal)?;

    let statement_repo = StatementRepository::new(state.pool().clone());
    let records = statement_repo.list_for_household(scope).await?;
    let mut statements = Vec::with_capacity(records.len());
    for record in records {
        let bytes = statement_repo.read_content(scope, record.id).await?;
        let content = String::from_utf8(bytes).map_err(|_| ApiError::Internal)?;
        statements.push((record.file_name, content));
    }

    Ok(Json(backup_export(Utc::now(), portfolio, statements)))
}
