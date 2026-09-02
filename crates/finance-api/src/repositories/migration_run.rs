use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::parse_optional_timestamp;
use crate::db::parse_timestamp;
use crate::error::{ApiError, ApiResult};

pub const MIGRATION_VERSION: i64 = 1;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MigrationRunStatus {
    Pending,
    Completed,
    RolledBack,
    Failed,
}

impl MigrationRunStatus {
    fn parse(value: &str) -> ApiResult<Self> {
        match value {
            "pending" => Ok(Self::Pending),
            "completed" => Ok(Self::Completed),
            "rolled_back" => Ok(Self::RolledBack),
            "failed" => Ok(Self::Failed),
            _ => Err(ApiError::Internal),
        }
    }
}

#[derive(Clone, Debug)]
pub struct MigrationRunRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub migration_version: i64,
    pub source_fingerprint: String,
    pub status: MigrationRunStatus,
    pub rollback_db_path: Option<String>,
    pub summary_json: String,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Clone)]
pub struct MigrationRunRepository {
    pool: SqlitePool,
}

impl MigrationRunRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn find_completed(
        &self,
        scope: TenantScope,
        migration_version: i64,
        source_fingerprint: &str,
    ) -> ApiResult<Option<MigrationRunRecord>> {
        let record = self
            .fetch_optional(scope, migration_version, source_fingerprint)
            .await?;
        Ok(record.filter(|value| value.status == MigrationRunStatus::Completed))
    }

    pub async fn create_pending(
        &self,
        scope: TenantScope,
        migration_version: i64,
        source_fingerprint: &str,
        rollback_db_path: Option<&str>,
        summary_json: &str,
    ) -> ApiResult<MigrationRunRecord> {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO data_migration_runs
             (id, household_id, migration_version, source_fingerprint, rollback_db_path, summary_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(id.to_string())
        .bind(scope.household_id().to_string())
        .bind(migration_version)
        .bind(source_fingerprint)
        .bind(rollback_db_path)
        .bind(summary_json)
        .execute(&self.pool)
        .await?;

        self.get(scope, id).await
    }

    pub async fn mark_completed(&self, scope: TenantScope, run_id: Uuid) -> ApiResult<()> {
        sqlx::query(
            "UPDATE data_migration_runs
             SET status = 'completed',
                 completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(run_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn mark_failed(&self, scope: TenantScope, run_id: Uuid) -> ApiResult<()> {
        sqlx::query(
            "UPDATE data_migration_runs
             SET status = 'failed',
                 completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(run_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn mark_rolled_back(&self, scope: TenantScope, run_id: Uuid) -> ApiResult<()> {
        sqlx::query(
            "UPDATE data_migration_runs
             SET status = 'rolled_back',
                 completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(run_id.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get(&self, scope: TenantScope, run_id: Uuid) -> ApiResult<MigrationRunRecord> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                i64,
                String,
                String,
                Option<String>,
                String,
                String,
                Option<String>,
            ),
        >(
            "SELECT id, household_id, migration_version, source_fingerprint, status,
                    rollback_db_path, summary_json, created_at, completed_at
             FROM data_migration_runs
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(run_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        map_row(row)
    }

    async fn fetch_optional(
        &self,
        scope: TenantScope,
        migration_version: i64,
        source_fingerprint: &str,
    ) -> ApiResult<Option<MigrationRunRecord>> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                i64,
                String,
                String,
                Option<String>,
                String,
                String,
                Option<String>,
            ),
        >(
            "SELECT id, household_id, migration_version, source_fingerprint, status,
                    rollback_db_path, summary_json, created_at, completed_at
             FROM data_migration_runs
             WHERE household_id = ?1 AND migration_version = ?2 AND source_fingerprint = ?3",
        )
        .bind(scope.household_id().to_string())
        .bind(migration_version)
        .bind(source_fingerprint)
        .fetch_optional(&self.pool)
        .await?;

        row.map(map_row).transpose()
    }
}

fn map_row(
    row: (
        String,
        String,
        i64,
        String,
        String,
        Option<String>,
        String,
        String,
        Option<String>,
    ),
) -> ApiResult<MigrationRunRecord> {
    Ok(MigrationRunRecord {
        id: row.0.parse().map_err(|_| ApiError::Internal)?,
        household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
        migration_version: row.2,
        source_fingerprint: row.3,
        status: MigrationRunStatus::parse(&row.4)?,
        rollback_db_path: row.5,
        summary_json: row.6,
        created_at: parse_timestamp(&row.7)?,
        completed_at: parse_optional_timestamp(row.8)?,
    })
}
