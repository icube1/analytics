use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::parse_timestamp;
use crate::error::{ApiError, ApiResult};
use crate::import::sha256_hex;

#[derive(Clone, Debug)]
pub struct ImportBlobRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub checksum_sha256: String,
    pub byte_size: i64,
    pub content_type: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct ImportBlobRepository {
    pool: SqlitePool,
}

impl ImportBlobRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn find_by_checksum(
        &self,
        scope: TenantScope,
        checksum_sha256: &str,
    ) -> ApiResult<Option<ImportBlobRecord>> {
        let row = sqlx::query_as::<_, (String, String, String, i64, Option<String>, String)>(
            "SELECT id, household_id, checksum_sha256, byte_size, content_type, created_at
             FROM import_content_blobs
             WHERE household_id = ?1 AND checksum_sha256 = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(checksum_sha256)
        .fetch_optional(&self.pool)
        .await?;

        row.map(map_row).transpose()
    }

    pub async fn insert_if_absent(
        &self,
        scope: TenantScope,
        content_type: Option<&str>,
        bytes: &[u8],
    ) -> ApiResult<ImportBlobRecord> {
        let checksum = sha256_hex(bytes);
        if let Some(existing) = self.find_by_checksum(scope, &checksum).await? {
            return Ok(existing);
        }

        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO import_content_blobs
             (id, household_id, checksum_sha256, byte_size, content_type, content_blob)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(id.to_string())
        .bind(scope.household_id().to_string())
        .bind(&checksum)
        .bind(i64::try_from(bytes.len()).map_err(|_| ApiError::PayloadTooLarge)?)
        .bind(content_type)
        .bind(bytes)
        .execute(&self.pool)
        .await?;

        self.get(scope, id).await
    }

    pub async fn get(&self, scope: TenantScope, blob_id: Uuid) -> ApiResult<ImportBlobRecord> {
        let row = sqlx::query_as::<_, (String, String, String, i64, Option<String>, String)>(
            "SELECT id, household_id, checksum_sha256, byte_size, content_type, created_at
             FROM import_content_blobs
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(blob_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        map_row(row)
    }

    pub async fn read_bytes(&self, scope: TenantScope, blob_id: Uuid) -> ApiResult<Vec<u8>> {
        let row = sqlx::query_as::<_, (Vec<u8>,)>(
            "SELECT content_blob FROM import_content_blobs
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(blob_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        Ok(row.0)
    }
}

fn map_row(
    row: (String, String, String, i64, Option<String>, String),
) -> ApiResult<ImportBlobRecord> {
    Ok(ImportBlobRecord {
        id: row.0.parse().map_err(|_| ApiError::Internal)?,
        household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
        checksum_sha256: row.2,
        byte_size: row.3,
        content_type: row.4,
        created_at: parse_timestamp(&row.5)?,
    })
}
