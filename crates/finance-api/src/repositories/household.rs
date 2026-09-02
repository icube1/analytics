use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::parse_timestamp;
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Debug)]
pub struct HouseholdRecord {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct HouseholdRepository {
    pool: SqlitePool,
}

impl HouseholdRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, name: &str) -> ApiResult<HouseholdRecord> {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO households (id, name) VALUES (?1, ?2)")
            .bind(id.to_string())
            .bind(name)
            .execute(&self.pool)
            .await?;

        self.get_by_id(id).await
    }

    pub async fn get_by_id(&self, household_id: Uuid) -> ApiResult<HouseholdRecord> {
        let row = sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT id, name, created_at, updated_at FROM households WHERE id = ?1",
        )
        .bind(household_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        Ok(HouseholdRecord {
            id: row.0.parse().map_err(|_| ApiError::Internal)?,
            name: row.1,
            created_at: parse_timestamp(&row.2)?,
            updated_at: parse_timestamp(&row.3)?,
        })
    }

    pub async fn get_scoped(
        &self,
        scope: TenantScope,
        household_id: Uuid,
    ) -> ApiResult<HouseholdRecord> {
        if scope.household_id() != household_id {
            return Err(ApiError::Forbidden);
        }
        self.get_by_id(household_id).await
    }
}
