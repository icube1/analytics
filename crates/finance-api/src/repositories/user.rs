use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::db::parse_timestamp;
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Debug)]
pub struct UserRecord {
    pub id: Uuid,
    pub email: Option<String>,
    pub display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct UserRepository {
    pool: SqlitePool,
}

impl UserRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, email: Option<&str>, display_name: &str) -> ApiResult<UserRecord> {
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO users (id, email, display_name) VALUES (?1, ?2, ?3)")
            .bind(id.to_string())
            .bind(email)
            .bind(display_name)
            .execute(&self.pool)
            .await?;

        self.get_by_id(id).await
    }

    pub async fn get_by_id(&self, user_id: Uuid) -> ApiResult<UserRecord> {
        let row = sqlx::query_as::<_, (String, Option<String>, String, String, String)>(
            "SELECT id, email, display_name, created_at, updated_at FROM users WHERE id = ?1",
        )
        .bind(user_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        Ok(UserRecord {
            id: row.0.parse().map_err(|_| ApiError::Internal)?,
            email: row.1,
            display_name: row.2,
            created_at: parse_timestamp(&row.3)?,
            updated_at: parse_timestamp(&row.4)?,
        })
    }
}
