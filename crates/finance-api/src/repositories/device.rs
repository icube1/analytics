use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::{parse_optional_timestamp, parse_timestamp};
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Debug)]
pub struct DeviceRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub user_id: Uuid,
    pub label: String,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct DeviceRepository {
    pool: SqlitePool,
}

impl DeviceRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn register(
        &self,
        scope: TenantScope,
        user_id: Uuid,
        label: &str,
    ) -> ApiResult<DeviceRecord> {
        let id = Uuid::new_v4();
        let household_id = scope.household_id();
        sqlx::query(
            "INSERT INTO devices (id, household_id, user_id, label, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(id.to_string())
        .bind(household_id.to_string())
        .bind(user_id.to_string())
        .bind(label)
        .execute(&self.pool)
        .await?;

        self.get(scope, id).await
    }

    pub async fn get(&self, scope: TenantScope, device_id: Uuid) -> ApiResult<DeviceRecord> {
        let row = sqlx::query_as::<_, (String, String, String, String, Option<String>, String)>(
            "SELECT id, household_id, user_id, label, last_seen_at, created_at
             FROM devices
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(device_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        Ok(DeviceRecord {
            id: row.0.parse().map_err(|_| ApiError::Internal)?,
            household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
            user_id: row.2.parse().map_err(|_| ApiError::Internal)?,
            label: row.3,
            last_seen_at: parse_optional_timestamp(row.4)?,
            created_at: parse_timestamp(&row.5)?,
        })
    }

    pub async fn list(&self, scope: TenantScope) -> ApiResult<Vec<DeviceRecord>> {
        let rows = sqlx::query_as::<_, (String, String, String, String, Option<String>, String)>(
            "SELECT id, household_id, user_id, label, last_seen_at, created_at
             FROM devices
             WHERE household_id = ?1
             ORDER BY created_at ASC",
        )
        .bind(scope.household_id().to_string())
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(DeviceRecord {
                    id: row.0.parse().map_err(|_| ApiError::Internal)?,
                    household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
                    user_id: row.2.parse().map_err(|_| ApiError::Internal)?,
                    label: row.3,
                    last_seen_at: parse_optional_timestamp(row.4)?,
                    created_at: parse_timestamp(&row.5)?,
                })
            })
            .collect()
    }
}
