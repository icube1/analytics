use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Debug)]
pub struct StatementRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub source_type: String,
    pub file_name: String,
    pub content_type: Option<String>,
    pub byte_size: i64,
    pub checksum_sha256: Option<String>,
    pub imported_by_user_id: Option<Uuid>,
    pub imported_at: DateTime<Utc>,
    pub metadata_json: String,
}

#[derive(Clone)]
pub struct StatementRepository {
    pool: SqlitePool,
}

impl StatementRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create(
        &self,
        scope: TenantScope,
        source_type: &str,
        file_name: &str,
        content_type: Option<&str>,
        byte_size: i64,
        checksum_sha256: Option<&str>,
        imported_by_user_id: Option<Uuid>,
        metadata_json: &str,
    ) -> ApiResult<StatementRecord> {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO statements
             (id, household_id, source_type, file_name, content_type, byte_size,
              checksum_sha256, imported_by_user_id, metadata_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .bind(id.to_string())
        .bind(scope.household_id().to_string())
        .bind(source_type)
        .bind(file_name)
        .bind(content_type)
        .bind(byte_size)
        .bind(checksum_sha256)
        .bind(imported_by_user_id.map(|value| value.to_string()))
        .bind(metadata_json)
        .execute(&self.pool)
        .await?;

        self.get(scope, id).await
    }

    pub async fn get(&self, scope: TenantScope, statement_id: Uuid) -> ApiResult<StatementRecord> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Option<String>,
                i64,
                Option<String>,
                Option<String>,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, source_type, file_name, content_type, byte_size,
                    checksum_sha256, imported_by_user_id, imported_at, metadata_json
             FROM statements
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(statement_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        map_row(row)
    }

    pub async fn list_for_household(&self, scope: TenantScope) -> ApiResult<Vec<StatementRecord>> {
        let rows = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Option<String>,
                i64,
                Option<String>,
                Option<String>,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, source_type, file_name, content_type, byte_size,
                    checksum_sha256, imported_by_user_id, imported_at, metadata_json
             FROM statements
             WHERE household_id = ?1
             ORDER BY imported_at DESC",
        )
        .bind(scope.household_id().to_string())
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(map_row).collect()
    }
}

fn map_row(
    row: (
        String,
        String,
        String,
        String,
        Option<String>,
        i64,
        Option<String>,
        Option<String>,
        String,
        String,
    ),
) -> ApiResult<StatementRecord> {
    Ok(StatementRecord {
        id: row.0.parse().map_err(|_| ApiError::Internal)?,
        household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
        source_type: row.2,
        file_name: row.3,
        content_type: row.4,
        byte_size: row.5,
        checksum_sha256: row.6,
        imported_by_user_id: row
            .7
            .map(|value| value.parse().map_err(|_| ApiError::Internal))
            .transpose()?,
        imported_at: crate::db::parse_timestamp(&row.8)?,
        metadata_json: row.9,
    })
}
