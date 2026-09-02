use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::parse_timestamp;
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Debug)]
pub struct BrokerAccountRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub provider: String,
    pub external_account_id: String,
    pub display_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct BrokerImportRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub broker_account_id: Uuid,
    pub source_type: String,
    pub file_name: String,
    pub content_type: Option<String>,
    pub byte_size: i64,
    pub checksum_sha256: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub imported_by_user_id: Option<Uuid>,
    pub imported_at: DateTime<Utc>,
    pub metadata_json: String,
}

#[derive(Clone)]
pub struct BrokerImportRepository {
    pool: SqlitePool,
}

impl BrokerImportRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert_account(
        &self,
        scope: TenantScope,
        provider: &str,
        external_account_id: &str,
        display_name: Option<&str>,
    ) -> ApiResult<BrokerAccountRecord> {
        let existing = sqlx::query_as::<_, (String,)>(
            "SELECT id FROM broker_accounts
             WHERE household_id = ?1 AND provider = ?2 AND external_account_id = ?3",
        )
        .bind(scope.household_id().to_string())
        .bind(provider)
        .bind(external_account_id)
        .fetch_optional(&self.pool)
        .await?;

        let id = if let Some((id,)) = existing {
            Uuid::parse_str(&id).map_err(|_| ApiError::Internal)?
        } else {
            Uuid::new_v4()
        };

        sqlx::query(
            "INSERT INTO broker_accounts
             (id, household_id, provider, external_account_id, display_name)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(household_id, provider, external_account_id) DO UPDATE SET
               display_name = excluded.display_name,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        )
        .bind(id.to_string())
        .bind(scope.household_id().to_string())
        .bind(provider)
        .bind(external_account_id)
        .bind(display_name)
        .execute(&self.pool)
        .await?;

        self.get_account(scope, id).await
    }

    pub async fn get_account(
        &self,
        scope: TenantScope,
        account_id: Uuid,
    ) -> ApiResult<BrokerAccountRecord> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Option<String>,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, provider, external_account_id, display_name,
                    created_at, updated_at
             FROM broker_accounts
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(account_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        Ok(BrokerAccountRecord {
            id: row.0.parse().map_err(|_| ApiError::Internal)?,
            household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
            provider: row.2,
            external_account_id: row.3,
            display_name: row.4,
            created_at: parse_timestamp(&row.5)?,
            updated_at: parse_timestamp(&row.6)?,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_import(
        &self,
        scope: TenantScope,
        broker_account_id: Uuid,
        source_type: &str,
        file_name: &str,
        content_type: Option<&str>,
        byte_size: i64,
        checksum_sha256: Option<&str>,
        imported_by_user_id: Option<Uuid>,
        metadata_json: &str,
    ) -> ApiResult<BrokerImportRecord> {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO broker_imports
             (id, household_id, broker_account_id, source_type, file_name, content_type,
              byte_size, checksum_sha256, imported_by_user_id, metadata_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )
        .bind(id.to_string())
        .bind(scope.household_id().to_string())
        .bind(broker_account_id.to_string())
        .bind(source_type)
        .bind(file_name)
        .bind(content_type)
        .bind(byte_size)
        .bind(checksum_sha256)
        .bind(imported_by_user_id.map(|value| value.to_string()))
        .bind(metadata_json)
        .execute(&self.pool)
        .await?;

        self.get_import(scope, id).await
    }

    pub async fn get_import(
        &self,
        scope: TenantScope,
        import_id: Uuid,
    ) -> ApiResult<BrokerImportRecord> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                String,
                Option<String>,
                i64,
                Option<String>,
                String,
                Option<String>,
                Option<String>,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, broker_account_id, source_type, file_name, content_type,
                    byte_size, checksum_sha256, status, error_message, imported_by_user_id,
                    imported_at, metadata_json
             FROM broker_imports
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(import_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        map_import_row(row)
    }

    pub async fn list_imports_for_household(
        &self,
        scope: TenantScope,
    ) -> ApiResult<Vec<BrokerImportRecord>> {
        let rows = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                String,
                Option<String>,
                i64,
                Option<String>,
                String,
                Option<String>,
                Option<String>,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, broker_account_id, source_type, file_name, content_type,
                    byte_size, checksum_sha256, status, error_message, imported_by_user_id,
                    imported_at, metadata_json
             FROM broker_imports
             WHERE household_id = ?1
             ORDER BY imported_at DESC",
        )
        .bind(scope.household_id().to_string())
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(map_import_row).collect()
    }
}

fn map_import_row(
    row: (
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        i64,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        String,
        String,
    ),
) -> ApiResult<BrokerImportRecord> {
    Ok(BrokerImportRecord {
        id: row.0.parse().map_err(|_| ApiError::Internal)?,
        household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
        broker_account_id: row.2.parse().map_err(|_| ApiError::Internal)?,
        source_type: row.3,
        file_name: row.4,
        content_type: row.5,
        byte_size: row.6,
        checksum_sha256: row.7,
        status: row.8,
        error_message: row.9,
        imported_by_user_id: row
            .10
            .map(|value| value.parse().map_err(|_| ApiError::Internal))
            .transpose()?,
        imported_at: parse_timestamp(&row.11)?,
        metadata_json: row.12,
    })
}
