use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::parse_timestamp;
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MembershipRole {
    Owner,
    Member,
    Viewer,
}

impl MembershipRole {
    fn as_str(self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Member => "member",
            Self::Viewer => "viewer",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "owner" => Some(Self::Owner),
            "member" => Some(Self::Member),
            "viewer" => Some(Self::Viewer),
            _ => None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct MembershipRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub user_id: Uuid,
    pub role: MembershipRole,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct MembershipRepository {
    pool: SqlitePool,
}

impl MembershipRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn add_member(
        &self,
        scope: TenantScope,
        user_id: Uuid,
        role: MembershipRole,
    ) -> ApiResult<MembershipRecord> {
        let id = Uuid::new_v4();
        let household_id = scope.household_id();
        sqlx::query(
            "INSERT INTO household_members (id, household_id, user_id, role) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(id.to_string())
        .bind(household_id.to_string())
        .bind(user_id.to_string())
        .bind(role.as_str())
        .execute(&self.pool)
        .await?;

        self.get_member(scope, user_id).await
    }

    pub async fn get_member(
        &self,
        scope: TenantScope,
        user_id: Uuid,
    ) -> ApiResult<MembershipRecord> {
        let row = sqlx::query_as::<_, (String, String, String, String, String)>(
            "SELECT id, household_id, user_id, role, created_at
             FROM household_members
             WHERE household_id = ?1 AND user_id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(user_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        Ok(MembershipRecord {
            id: row.0.parse().map_err(|_| ApiError::Internal)?,
            household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
            user_id: row.2.parse().map_err(|_| ApiError::Internal)?,
            role: MembershipRole::parse(&row.3).ok_or(ApiError::Internal)?,
            created_at: parse_timestamp(&row.4)?,
        })
    }

    pub async fn ensure_membership(&self, scope: TenantScope, user_id: Uuid) -> ApiResult<()> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(1) FROM household_members
             WHERE household_id = ?1 AND user_id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(user_id.to_string())
        .fetch_one(&self.pool)
        .await?;

        if count == 0 {
            return Err(ApiError::Forbidden);
        }

        Ok(())
    }
}
