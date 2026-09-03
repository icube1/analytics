use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::parse_timestamp;
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Debug)]
pub struct UsageEventRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub kind: String,
    pub feature_key: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct UsageCount {
    pub kind: String,
    pub count: i64,
}

#[derive(Clone)]
pub struct UsageRepository {
    pool: SqlitePool,
}

impl UsageRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn record(
        &self,
        scope: TenantScope,
        kind: &str,
        feature_key: Option<&str>,
    ) -> ApiResult<UsageEventRecord> {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO usage_events (id, household_id, kind, feature_key)
             VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(id.to_string())
        .bind(scope.household_id().to_string())
        .bind(kind)
        .bind(feature_key)
        .execute(&self.pool)
        .await?;
        self.get(id).await
    }

    pub async fn record_best_effort(
        &self,
        scope: TenantScope,
        kind: &str,
        feature_key: Option<&str>,
    ) {
        if let Err(error) = self.record(scope, kind, feature_key).await {
            tracing::warn!(error = %error, kind, "failed to write usage event");
        }
    }

    pub async fn summarize(&self, scope: TenantScope) -> ApiResult<Vec<UsageCount>> {
        let rows = sqlx::query_as::<_, (String, i64)>(
            "SELECT kind, COUNT(*) as count
             FROM usage_events
             WHERE household_id = ?1
             GROUP BY kind
             ORDER BY kind ASC",
        )
        .bind(scope.household_id().to_string())
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(kind, count)| UsageCount { kind, count })
            .collect())
    }

    async fn get(&self, id: Uuid) -> ApiResult<UsageEventRecord> {
        let row = sqlx::query_as::<_, (String, String, String, Option<String>, String)>(
            "SELECT id, household_id, kind, feature_key, created_at
             FROM usage_events
             WHERE id = ?1",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
        Ok(UsageEventRecord {
            id: row.0.parse().map_err(|_| ApiError::Internal)?,
            household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
            kind: row.2,
            feature_key: row.3,
            created_at: parse_timestamp(&row.4)?,
        })
    }
}
