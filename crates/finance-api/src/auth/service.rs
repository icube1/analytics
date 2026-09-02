use crate::auth::password::{hash_password, verify_password};
use crate::auth::{AuthContext, TenantScope};
use crate::config::Config;
use crate::error::{ApiError, ApiResult};
use crate::repositories::{
    ClientKind, CreatedSession, CredentialRepository, HouseholdRepository, MembershipRepository,
    MembershipRole, SessionRecord, SessionRepository, UserRepository,
};
use chrono::Utc;
use uuid::Uuid;

pub fn session_is_active(session: &SessionRecord, now: chrono::DateTime<Utc>) -> bool {
    session.revoked_at.is_none() && session.expires_at > now
}

#[derive(Clone)]
pub struct AuthService {
    sessions: SessionRepository,
    credentials: CredentialRepository,
    users: UserRepository,
    households: HouseholdRepository,
    memberships: MembershipRepository,
    config: Config,
}

impl AuthService {
    pub fn new(pool: sqlx::SqlitePool, config: Config) -> Self {
        Self {
            sessions: SessionRepository::new(pool.clone()),
            credentials: CredentialRepository::new(pool.clone()),
            users: UserRepository::new(pool.clone()),
            households: HouseholdRepository::new(pool.clone()),
            memberships: MembershipRepository::new(pool),
            config,
        }
    }

    pub async fn bootstrap_local_account(&self) -> ApiResult<()> {
        let Some(email) = self.config.bootstrap_email.as_deref() else {
            return Ok(());
        };
        let Some(password) = self.config.bootstrap_password.as_deref() else {
            return Ok(());
        };
        if self
            .credentials
            .find_user_id_by_email(email)
            .await?
            .is_some()
        {
            return Ok(());
        }
        let user = self
            .users
            .create(
                Some(email),
                &self
                    .config
                    .bootstrap_display_name
                    .clone()
                    .unwrap_or_else(|| "Bootstrap User".into()),
            )
            .await?;
        self.credentials
            .upsert(user.id, &hash_password(password)?)
            .await?;
        let household = self
            .households
            .create(
                &self
                    .config
                    .bootstrap_household_name
                    .clone()
                    .unwrap_or_else(|| "Default Household".into()),
            )
            .await?;
        self.memberships
            .add_member(
                TenantScope {
                    household_id: household.id,
                },
                user.id,
                MembershipRole::Owner,
            )
            .await?;
        Ok(())
    }

    pub async fn login(
        &self,
        email: &str,
        password: &str,
        household_id: Option<Uuid>,
        client_kind: ClientKind,
        rotate_session_id: Option<Uuid>,
    ) -> ApiResult<CreatedSession> {
        let user_id = self
            .credentials
            .find_user_id_by_email(email)
            .await?
            .ok_or(ApiError::Unauthorized)?;
        let hash = self
            .credentials
            .get_hash(user_id)
            .await?
            .ok_or(ApiError::Unauthorized)?;
        if !verify_password(password, &hash)? {
            return Err(ApiError::Unauthorized);
        }
        let memberships = self.memberships.list_households_for_user(user_id).await?;
        if memberships.is_empty() {
            return Err(ApiError::Forbidden);
        }
        let household_id = match household_id {
            Some(id) if memberships.iter().any(|m| m.household_id == id) => id,
            Some(_) => return Err(ApiError::Forbidden),
            None => memberships[0].household_id,
        };
        if let Some(sid) = rotate_session_id {
            let _ = self.sessions.revoke(sid).await;
        }
        self.sessions
            .create(
                user_id,
                household_id,
                client_kind,
                self.config.session_ttl,
                rotate_session_id,
            )
            .await
    }

    pub async fn resolve_session(
        &self,
        session_token: Option<&str>,
        bearer_token: Option<&str>,
    ) -> ApiResult<SessionRecord> {
        let session = if let Some(t) = bearer_token {
            self.sessions
                .find_by_bearer_token(t)
                .await?
                .ok_or(ApiError::Unauthorized)?
        } else if let Some(t) = session_token {
            self.sessions
                .find_by_session_token(t)
                .await?
                .ok_or(ApiError::Unauthorized)?
        } else {
            return Err(ApiError::Unauthorized);
        };
        if !session_is_active(&session, Utc::now()) {
            return Err(ApiError::Unauthorized);
        }
        let _ = self.sessions.touch(session.id).await;
        Ok(session)
    }

    pub async fn logout(&self, session_id: Uuid) -> ApiResult<()> {
        self.sessions.revoke(session_id).await
    }

    pub fn auth_context_from_session(session: &SessionRecord) -> AuthContext {
        AuthContext::new(session.user_id, session.household_id)
    }
}
