use crate::auth::{generate_opaque_token, hash_token};
use crate::db::{parse_optional_timestamp, parse_timestamp};
use crate::error::{ApiError, ApiResult};
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClientKind {
    Web,
    Mobile,
}
impl ClientKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Web => "web",
            Self::Mobile => "mobile",
        }
    }
    pub fn parse(v: &str) -> Option<Self> {
        match v {
            "web" => Some(Self::Web),
            "mobile" => Some(Self::Mobile),
            _ => None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct SessionRecord {
    pub id: Uuid,
    pub user_id: Uuid,
    pub household_id: Uuid,
    pub csrf_token: String,
    pub client_kind: ClientKind,
    pub expires_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub rotated_from_id: Option<Uuid>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
#[derive(Clone, Debug)]
pub struct CreatedSession {
    pub record: SessionRecord,
    pub session_token: String,
    pub bearer_token: Option<String>,
}

#[derive(Clone)]
pub struct SessionRepository {
    pool: SqlitePool,
}
impl SessionRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
    pub async fn create(
        &self,
        user_id: Uuid,
        household_id: Uuid,
        client_kind: ClientKind,
        ttl: chrono::Duration,
        rotated_from_id: Option<Uuid>,
    ) -> ApiResult<CreatedSession> {
        let id = Uuid::new_v4();
        let session_token = generate_opaque_token();
        let bearer_token = if client_kind == ClientKind::Mobile {
            Some(generate_opaque_token())
        } else {
            None
        };
        let expires_at = Utc::now() + ttl;
        sqlx::query("INSERT INTO sessions (id,user_id,household_id,token_hash,bearer_token_hash,csrf_token,client_kind,expires_at,rotated_from_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)")
            .bind(id.to_string()).bind(user_id.to_string()).bind(household_id.to_string()).bind(hash_token(&session_token))
            .bind(bearer_token.as_deref().map(hash_token)).bind(generate_opaque_token()).bind(client_kind.as_str()).bind(expires_at.to_rfc3339()).bind(rotated_from_id.map(|v| v.to_string()))
            .execute(&self.pool).await?;
        Ok(CreatedSession {
            record: self.get_by_id(id).await?,
            session_token,
            bearer_token,
        })
    }
    pub async fn find_by_session_token(&self, token: &str) -> ApiResult<Option<SessionRecord>> {
        self.find_hash("token_hash", &hash_token(token)).await
    }
    pub async fn find_by_bearer_token(&self, token: &str) -> ApiResult<Option<SessionRecord>> {
        self.find_hash("bearer_token_hash", &hash_token(token))
            .await
    }
    async fn find_hash(&self, col: &str, h: &str) -> ApiResult<Option<SessionRecord>> {
        let q = format!("SELECT id,user_id,household_id,csrf_token,client_kind,expires_at,revoked_at,rotated_from_id,last_seen_at,created_at FROM sessions WHERE {col}=?1");
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                String,
                String,
                Option<String>,
                Option<String>,
                Option<String>,
                String,
            ),
        >(&q)
        .bind(h)
        .fetch_optional(&self.pool)
        .await?;
        row.map(map_row).transpose()
    }
    pub async fn get_by_id(&self, id: Uuid) -> ApiResult<SessionRecord> {
        let row = sqlx::query_as::<_,(String,String,String,String,String,String,Option<String>,Option<String>,Option<String>,String)>("SELECT id,user_id,household_id,csrf_token,client_kind,expires_at,revoked_at,rotated_from_id,last_seen_at,created_at FROM sessions WHERE id=?1").bind(id.to_string()).fetch_optional(&self.pool).await?.ok_or(ApiError::NotFound)?;
        map_row(row)
    }
    pub async fn touch(&self, id: Uuid) -> ApiResult<()> {
        sqlx::query("UPDATE sessions SET last_seen_at=?1 WHERE id=?2")
            .bind(Utc::now().to_rfc3339())
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
    pub async fn revoke(&self, id: Uuid) -> ApiResult<()> {
        sqlx::query("UPDATE sessions SET revoked_at=?1 WHERE id=?2 AND revoked_at IS NULL")
            .bind(Utc::now().to_rfc3339())
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
fn map_row(
    row: (
        String,
        String,
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
    ),
) -> ApiResult<SessionRecord> {
    Ok(SessionRecord {
        id: row.0.parse().map_err(|_| ApiError::Internal)?,
        user_id: row.1.parse().map_err(|_| ApiError::Internal)?,
        household_id: row.2.parse().map_err(|_| ApiError::Internal)?,
        csrf_token: row.3,
        client_kind: ClientKind::parse(&row.4).ok_or(ApiError::Internal)?,
        expires_at: parse_timestamp(&row.5)?,
        revoked_at: parse_optional_timestamp(row.6)?,
        rotated_from_id: row
            .7
            .map(|v| v.parse().map_err(|_| ApiError::Internal))
            .transpose()?,
        last_seen_at: parse_optional_timestamp(row.8)?,
        created_at: parse_timestamp(&row.9)?,
    })
}
