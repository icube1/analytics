use chrono::{DateTime, Duration, Utc};
use sqlx::SqlitePool;

use crate::auth::TenantScope;
use crate::error::ApiResult;

#[derive(Clone, Debug)]
pub struct CachedResponse {
    pub status_code: i64,
    pub response_json: String,
}

#[derive(Clone)]
pub struct IdempotencyRepository {
    pool: SqlitePool,
}

impl IdempotencyRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(
        &self,
        scope: TenantScope,
        endpoint: &str,
        idempotency_key: &str,
    ) -> ApiResult<Option<CachedResponse>> {
        let now = Utc::now();
        let row = sqlx::query_as::<_, (i64, String)>(
            "SELECT status_code, response_json
             FROM idempotency_responses
             WHERE household_id = ?1 AND endpoint = ?2 AND idempotency_key = ?3
               AND expires_at > ?4",
        )
        .bind(scope.household_id().to_string())
        .bind(endpoint)
        .bind(idempotency_key)
        .bind(now.to_rfc3339())
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|(status_code, response_json)| CachedResponse {
            status_code,
            response_json,
        }))
    }

    pub async fn store(
        &self,
        scope: TenantScope,
        endpoint: &str,
        idempotency_key: &str,
        status_code: i64,
        response_json: &str,
        ttl: std::time::Duration,
    ) -> ApiResult<()> {
        let expires_at: DateTime<Utc> =
            Utc::now() + Duration::from_std(ttl).unwrap_or_else(|_| Duration::seconds(86_400));
        sqlx::query(
            "INSERT INTO idempotency_responses
             (household_id, endpoint, idempotency_key, status_code, response_json, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(household_id, endpoint, idempotency_key) DO UPDATE SET
               status_code = excluded.status_code,
               response_json = excluded.response_json,
               expires_at = excluded.expires_at",
        )
        .bind(scope.household_id().to_string())
        .bind(endpoint)
        .bind(idempotency_key)
        .bind(status_code)
        .bind(response_json)
        .bind(expires_at.to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
