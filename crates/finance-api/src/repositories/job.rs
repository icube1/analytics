use crate::auth::TenantScope;
use crate::db::{parse_optional_timestamp, parse_timestamp};
use crate::error::{ApiError, ApiResult};
use chrono::{DateTime, Utc};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

pub const JOB_KIND_RESILIENCE: &str = "resilience.evaluate";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}
impl JobStatus {
    pub fn as_str(self) -> &'static str {
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
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub timeout_at: Option<DateTime<Utc>>,
    pub cancelled_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
type JobRow = (
    String,
    String,
    String,
    String,
    Option<String>,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    String,
);
const SEL: &str = "SELECT id,household_id,kind,status,idempotency_key,payload_json,result_json,error_message,started_at,finished_at,timeout_at,cancelled_at,created_at,updated_at";

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
        if let Some(k) = idempotency_key {
            if let Some(e) = self.get_by_idempotency(scope, k).await? {
                return Ok(e);
            }
        }
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO jobs (id,household_id,kind,status,idempotency_key,payload_json) VALUES (?1,?2,?3,?4,?5,?6)")
            .bind(id.to_string()).bind(scope.household_id().to_string()).bind(kind).bind(JobStatus::Pending.as_str()).bind(idempotency_key).bind(payload_json).execute(&self.pool).await?;
        self.get(scope, id).await
    }
    pub async fn get(&self, scope: TenantScope, job_id: Uuid) -> ApiResult<JobRecord> {
        let q = format!("{SEL} FROM jobs WHERE household_id=?1 AND id=?2");
        let row = sqlx::query_as::<_, JobRow>(&q)
            .bind(scope.household_id().to_string())
            .bind(job_id.to_string())
            .fetch_optional(&self.pool)
            .await?
            .ok_or(ApiError::NotFound)?;
        map(row)
    }
    pub async fn get_by_idempotency(
        &self,
        scope: TenantScope,
        key: &str,
    ) -> ApiResult<Option<JobRecord>> {
        let q = format!("{SEL} FROM jobs WHERE household_id=?1 AND idempotency_key=?2");
        let row = sqlx::query_as::<_, JobRow>(&q)
            .bind(scope.household_id().to_string())
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        row.map(map).transpose()
    }
    pub async fn count_active_for_household(&self, household_id: Uuid) -> ApiResult<i64> {
        Ok(sqlx::query_scalar(
            "SELECT COUNT(1) FROM jobs WHERE household_id=?1 AND status IN ('pending','running')",
        )
        .bind(household_id.to_string())
        .fetch_one(&self.pool)
        .await?)
    }
    pub async fn claim_next(&self, timeout_at: DateTime<Utc>) -> ApiResult<Option<JobRecord>> {
        let mut tx = self.pool.begin().await?;
        let q = format!("{SEL} FROM jobs WHERE status='pending' ORDER BY created_at ASC LIMIT 1");
        let row = sqlx::query_as::<_, JobRow>(&q)
            .fetch_optional(&mut *tx)
            .await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };
        let job_id = row.0.clone();
        let hh: Uuid = row.1.parse().map_err(|_| ApiError::Internal)?;
        let now = Utc::now().to_rfc3339();
        let u = sqlx::query("UPDATE jobs SET status='running',started_at=?1,timeout_at=?2,updated_at=?1 WHERE id=?3 AND status='pending'").bind(&now).bind(timeout_at.to_rfc3339()).bind(&job_id).execute(&mut *tx).await?;
        if u.rows_affected() == 0 {
            tx.commit().await?;
            return Ok(None);
        }
        tx.commit().await?;
        self.get(
            TenantScope { household_id: hh },
            job_id.parse().map_err(|_| ApiError::Internal)?,
        )
        .await
        .map(Some)
    }
    pub async fn mark_completed(&self, job_id: Uuid, result_json: &str) -> ApiResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE jobs SET status='completed',result_json=?1,finished_at=?2,updated_at=?2 WHERE id=?3 AND status='running'").bind(result_json).bind(&now).bind(job_id.to_string()).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn mark_failed(&self, job_id: Uuid, msg: &str) -> ApiResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE jobs SET status='failed',error_message=?1,finished_at=?2,updated_at=?2 WHERE id=?3 AND status IN ('pending','running')").bind(msg).bind(&now).bind(job_id.to_string()).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn request_cancel(&self, scope: TenantScope, job_id: Uuid) -> ApiResult<JobRecord> {
        let now = Utc::now().to_rfc3339();
        let u = sqlx::query("UPDATE jobs SET status='cancelled',cancelled_at=?1,finished_at=?1,updated_at=?1 WHERE household_id=?2 AND id=?3 AND status IN ('pending','running')").bind(&now).bind(scope.household_id().to_string()).bind(job_id.to_string()).execute(&self.pool).await?;
        if u.rows_affected() == 0 {
            let j = self.get(scope, job_id).await?;
            if matches!(j.status.as_str(), "cancelled" | "completed" | "failed") {
                return Ok(j);
            }
            return Err(ApiError::BadRequest {
                message: "job cannot be cancelled".into(),
            });
        }
        self.get(scope, job_id).await
    }
    pub async fn is_cancel_requested(&self, job_id: Uuid) -> ApiResult<bool> {
        Ok(matches!(
            sqlx::query_scalar::<_, String>("SELECT status FROM jobs WHERE id=?1")
                .bind(job_id.to_string())
                .fetch_optional(&self.pool)
                .await?
                .as_deref(),
            Some("cancelled")
        ))
    }
    pub async fn reap_timed_out(&self) -> ApiResult<u64> {
        let now = Utc::now().to_rfc3339();
        Ok(sqlx::query("UPDATE jobs SET status='failed',error_message='execution timed out',finished_at=?1,updated_at=?1 WHERE status='running' AND timeout_at IS NOT NULL AND timeout_at<?1").bind(&now).execute(&self.pool).await?.rows_affected())
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
fn map(row: JobRow) -> ApiResult<JobRecord> {
    Ok(JobRecord {
        id: row.0.parse().map_err(|_| ApiError::Internal)?,
        household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
        kind: row.2,
        status: row.3,
        idempotency_key: row.4,
        payload_json: row.5,
        result_json: row.6,
        error_message: row.7,
        started_at: parse_optional_timestamp(row.8)?,
        finished_at: parse_optional_timestamp(row.9)?,
        timeout_at: parse_optional_timestamp(row.10)?,
        cancelled_at: parse_optional_timestamp(row.11)?,
        created_at: parse_timestamp(&row.12)?,
        updated_at: parse_timestamp(&row.13)?,
    })
}
