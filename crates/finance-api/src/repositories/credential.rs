use crate::error::{ApiError, ApiResult};
use sqlx::SqlitePool;
use uuid::Uuid;
#[derive(Clone)]
pub struct CredentialRepository {
    pool: SqlitePool,
}
impl CredentialRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
    pub async fn upsert(&self, user_id: Uuid, password_hash: &str) -> ApiResult<()> {
        sqlx::query("INSERT INTO local_credentials (user_id,password_hash) VALUES (?1,?2) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash").bind(user_id.to_string()).bind(password_hash).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn get_hash(&self, user_id: Uuid) -> ApiResult<Option<String>> {
        Ok(
            sqlx::query_scalar("SELECT password_hash FROM local_credentials WHERE user_id=?1")
                .bind(user_id.to_string())
                .fetch_optional(&self.pool)
                .await?,
        )
    }
    pub async fn find_user_id_by_email(&self, email: &str) -> ApiResult<Option<Uuid>> {
        let row = sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE email=?1")
            .bind(email)
            .fetch_optional(&self.pool)
            .await?;
        row.map(|v| v.parse().map_err(|_| ApiError::Internal))
            .transpose()
    }
}
