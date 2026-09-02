use chrono::{DateTime, Utc};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::parse_timestamp;
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl JobStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Clone, Debug)]
pub struct JobRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub kind: String,
    pub status: String,
    pub idempotency_key: Option<String>,
    pub payload_json: String,
    pub result_json: Option<String>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct JobRepository {
    pool: SqlitePool,
}

impl JobRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn enqueue(
        &self,
        scope: TenantScope,
        kind: &str,
        payload_json: &str,
        idempotency_key: Option<&str>,
    ) -> ApiResult<JobRecord> {
        if let Some(key) = idempotency_key {
            if let Some(existing) = self.get_by_idempotency(scope, key).await? {
                return Ok(existing);
            }
        }

        let id = Uuid::new_v4();
        let household_id = scope.household_id();
        sqlx::query(
            "INSERT INTO jobs (id, household_id, kind, status, idempotency_key, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(id.to_string())
        .bind(household_id.to_string())
        .bind(kind)
        .bind(JobStatus::Pending.as_str())
        .bind(idempotency_key)
        .bind(payload_json)
        .execute(&self.pool)
        .await?;

        self.get(scope, id).await
    }

    pub async fn get(&self, scope: TenantScope, job_id: Uuid) -> ApiResult<JobRecord> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Option<String>,
                String,
                Option<String>,
                Option<String>,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, kind, status, idempotency_key, payload_json,
                    result_json, error_message, created_at, updated_at
             FROM jobs
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(job_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        map_job_row(row)
    }

    pub async fn get_by_idempotency(
        &self,
        scope: TenantScope,
        idempotency_key: &str,
    ) -> ApiResult<Option<JobRecord>> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Option<String>,
                String,
                Option<String>,
                Option<String>,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, kind, status, idempotency_key, payload_json,
                    result_json, error_message, created_at, updated_at
             FROM jobs
             WHERE household_id = ?1 AND idempotency_key = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(idempotency_key)
        .fetch_optional(&self.pool)
        .await?;

        row.map(map_job_row).transpose()
    }

    pub async fn count_by_status(&self) -> ApiResult<std::collections::HashMap<String, i64>> {
        let rows = sqlx::query("SELECT status, COUNT(*) AS count FROM jobs GROUP BY status")
            .fetch_all(&self.pool)
            .await?;
        let mut counts = std::collections::HashMap::new();
        for row in rows {
            counts.insert(row.get("status"), row.get("count"));
        }
        Ok(counts)
    }

    pub async fn count_by_kind(&self) -> ApiResult<Vec<(String, i64)>> {
        let rows = sqlx::query(
            "SELECT kind, COUNT(*) AS count FROM jobs WHERE status IN ('pending', 'running') GROUP BY kind",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| (row.get("kind"), row.get("count")))
            .collect())
    }
}

fn map_job_row(
    row: (
        String,
        String,
        String,
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        String,
        String,
    ),
) -> ApiResult<JobRecord> {
    Ok(JobRecord {
        id: row.0.parse().map_err(|_| ApiError::Internal)?,
        household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
        kind: row.2,
        status: row.3,
        idempotency_key: row.4,
        payload_json: row.5,
        result_json: row.6,
        error_message: row.7,
        created_at: parse_timestamp(&row.8)?,
        updated_at: parse_timestamp(&row.9)?,
    })
}
