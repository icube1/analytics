use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::{parse_optional_timestamp, parse_timestamp};
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Debug)]
pub struct PortfolioDocumentHead {
    pub household_id: Uuid,
    pub revision: i64,
    pub schema_version: i64,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct PortfolioRevisionRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub revision: i64,
    pub payload_json: String,
    pub idempotency_key: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct PortfolioRepository {
    pool: SqlitePool,
}

impl PortfolioRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn ensure_document(&self, scope: TenantScope) -> ApiResult<PortfolioDocumentHead> {
        let household_id = scope.household_id();
        sqlx::query("INSERT OR IGNORE INTO portfolio_documents (household_id) VALUES (?1)")
            .bind(household_id.to_string())
            .execute(&self.pool)
            .await?;

        self.get_head(scope).await
    }

    pub async fn get_head(&self, scope: TenantScope) -> ApiResult<PortfolioDocumentHead> {
        let row = sqlx::query_as::<_, (String, i64, i64, Option<String>, String, String)>(
            "SELECT household_id, revision, schema_version, deleted_at, created_at, updated_at
             FROM portfolio_documents
             WHERE household_id = ?1",
        )
        .bind(scope.household_id().to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        Ok(PortfolioDocumentHead {
            household_id: row.0.parse().map_err(|_| ApiError::Internal)?,
            revision: row.1,
            schema_version: row.2,
            deleted_at: parse_optional_timestamp(row.3)?,
            created_at: parse_timestamp(&row.4)?,
            updated_at: parse_timestamp(&row.5)?,
        })
    }

    pub async fn get_latest_revision(
        &self,
        scope: TenantScope,
    ) -> ApiResult<Option<PortfolioRevisionRecord>> {
        let row = sqlx::query_as::<_, (String, String, i64, String, Option<String>, String)>(
            "SELECT id, household_id, revision, payload_json, idempotency_key, created_at
             FROM portfolio_revisions
             WHERE household_id = ?1
             ORDER BY revision DESC
             LIMIT 1",
        )
        .bind(scope.household_id().to_string())
        .fetch_optional(&self.pool)
        .await?;

        row.map(|value| {
            Ok(PortfolioRevisionRecord {
                id: value.0.parse().map_err(|_| ApiError::Internal)?,
                household_id: value.1.parse().map_err(|_| ApiError::Internal)?,
                revision: value.2,
                payload_json: value.3,
                idempotency_key: value.4,
                created_at: parse_timestamp(&value.5)?,
            })
        })
        .transpose()
    }

    pub async fn get_revision_by_idempotency(
        &self,
        scope: TenantScope,
        idempotency_key: &str,
    ) -> ApiResult<Option<PortfolioRevisionRecord>> {
        let row = sqlx::query_as::<_, (String, String, i64, String, Option<String>, String)>(
            "SELECT id, household_id, revision, payload_json, idempotency_key, created_at
             FROM portfolio_revisions
             WHERE household_id = ?1 AND idempotency_key = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(idempotency_key)
        .fetch_optional(&self.pool)
        .await?;

        row.map(|value| {
            Ok(PortfolioRevisionRecord {
                id: value.0.parse().map_err(|_| ApiError::Internal)?,
                household_id: value.1.parse().map_err(|_| ApiError::Internal)?,
                revision: value.2,
                payload_json: value.3,
                idempotency_key: value.4,
                created_at: parse_timestamp(&value.5)?,
            })
        })
        .transpose()
    }

    pub async fn upsert_revision(
        &self,
        scope: TenantScope,
        base_revision: i64,
        payload_json: &str,
        idempotency_key: Option<&str>,
    ) -> ApiResult<PortfolioRevisionRecord> {
        let household_id = scope.household_id();

        if let Some(key) = idempotency_key {
            if let Some(existing) = self.get_revision_by_idempotency(scope, key).await? {
                return Ok(existing);
            }
        }

        let mut tx = self.pool.begin().await?;

        let head_row = sqlx::query_as::<_, (String, i64, i64, Option<String>, String, String)>(
            "SELECT household_id, revision, schema_version, deleted_at, created_at, updated_at
             FROM portfolio_documents
             WHERE household_id = ?1",
        )
        .bind(household_id.to_string())
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(ApiError::NotFound)?;

        if head_row.1 != base_revision {
            return Err(ApiError::RevisionConflict {
                expected: base_revision,
                actual: head_row.1,
            });
        }

        let next_revision = head_row.1 + 1;
        let revision_id = Uuid::new_v4();

        sqlx::query(
            "UPDATE portfolio_documents
             SET revision = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE household_id = ?1",
        )
        .bind(household_id.to_string())
        .bind(next_revision)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO portfolio_revisions
             (id, household_id, revision, payload_json, idempotency_key)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(revision_id.to_string())
        .bind(household_id.to_string())
        .bind(next_revision)
        .bind(payload_json)
        .bind(idempotency_key)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(PortfolioRevisionRecord {
            id: revision_id,
            household_id,
            revision: next_revision,
            payload_json: payload_json.to_owned(),
            idempotency_key: idempotency_key.map(str::to_owned),
            created_at: Utc::now(),
        })
    }
}
