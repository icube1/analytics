use chrono::{DateTime, Utc};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::parse_timestamp;
use crate::error::{ApiError, ApiResult};

pub const ACTION_AUTH_LOGIN: &str = "auth.login";
pub const ACTION_AUTH_LOGOUT: &str = "auth.logout";
pub const ACTION_AUTH_LOGIN_FAILED: &str = "auth.login_failed";
pub const ACTION_JOBS_ENQUEUE: &str = "jobs.enqueue";
pub const ACTION_PORTFOLIO_PUSH: &str = "portfolio.push";
pub const ACTION_STATEMENTS_CREATE: &str = "statements.create";
pub const ACTION_BROKER_IMPORT_CREATE: &str = "broker.import.create";
pub const ACTION_BACKUP_EXPORT: &str = "backup.export";
pub const ACTION_BILLING_WEBHOOK: &str = "billing.webhook";

const REDACT_KEYS: &[&str] = &[
    "password",
    "passphrase",
    "token",
    "bearerToken",
    "csrfToken",
    "amount",
    "document",
    "payload",
    "content",
    "ciphertext",
];

#[derive(Clone, Debug)]
pub struct AuditRecord {
    pub id: Uuid,
    pub household_id: Option<Uuid>,
    pub actor_user_id: Option<Uuid>,
    pub action: String,
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct AuditRepository {
    pool: SqlitePool,
}

impl AuditRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn record(
        &self,
        household_id: Option<Uuid>,
        actor_user_id: Option<Uuid>,
        action: &str,
        metadata: Value,
    ) -> ApiResult<AuditRecord> {
        let id = Uuid::new_v4();
        let metadata = sanitize_metadata(metadata);
        let metadata_json = serde_json::to_string(&metadata).map_err(|_| ApiError::Internal)?;
        sqlx::query(
            "INSERT INTO audit_events
                (id, household_id, actor_user_id, action, metadata_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(id.to_string())
        .bind(household_id.map(|value| value.to_string()))
        .bind(actor_user_id.map(|value| value.to_string()))
        .bind(action)
        .bind(metadata_json)
        .execute(&self.pool)
        .await?;
        self.get(id).await
    }

    pub async fn record_best_effort(
        &self,
        household_id: Option<Uuid>,
        actor_user_id: Option<Uuid>,
        action: &str,
        metadata: Value,
    ) {
        if let Err(error) = self
            .record(household_id, actor_user_id, action, metadata)
            .await
        {
            tracing::warn!(error = %error, action, "failed to write audit event");
        }
    }

    pub async fn list_for_household(
        &self,
        scope: TenantScope,
        limit: i64,
        action: Option<&str>,
        before_id: Option<Uuid>,
    ) -> ApiResult<Vec<AuditRecord>> {
        let cursor = if let Some(id) = before_id {
            match self.get(id).await {
                Ok(record) if record.household_id == Some(scope.household_id()) => Some(record),
                Ok(_) | Err(ApiError::NotFound) => None,
                Err(error) => return Err(error),
            }
        } else {
            None
        };
        let rows = sqlx::query_as::<
            _,
            (
                String,
                Option<String>,
                Option<String>,
                String,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, actor_user_id, action, metadata_json, created_at
             FROM audit_events
             WHERE household_id = ?1
               AND (?2 IS NULL OR action = ?2)
               AND (
                    ?3 IS NULL
                    OR created_at < ?4
                    OR (created_at = ?4 AND id < ?5)
               )
             ORDER BY created_at DESC, id DESC
             LIMIT ?6",
        )
        .bind(scope.household_id().to_string())
        .bind(action)
        .bind(cursor.as_ref().map(|record| record.id.to_string()))
        .bind(cursor.as_ref().map(|record| record.created_at.to_rfc3339()))
        .bind(cursor.as_ref().map(|record| record.id.to_string()))
        .bind(limit.clamp(1, 100))
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(row_to_record).collect()
    }

    async fn get(&self, id: Uuid) -> ApiResult<AuditRecord> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                Option<String>,
                Option<String>,
                String,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, actor_user_id, action, metadata_json, created_at
             FROM audit_events
             WHERE id = ?1",
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
        row_to_record(row)
    }
}

fn row_to_record(
    row: (
        String,
        Option<String>,
        Option<String>,
        String,
        String,
        String,
    ),
) -> ApiResult<AuditRecord> {
    Ok(AuditRecord {
        id: row.0.parse().map_err(|_| ApiError::Internal)?,
        household_id: row
            .1
            .map(|value| value.parse().map_err(|_| ApiError::Internal))
            .transpose()?,
        actor_user_id: row
            .2
            .map(|value| value.parse().map_err(|_| ApiError::Internal))
            .transpose()?,
        action: row.3,
        metadata: serde_json::from_str(&row.4).unwrap_or_else(|_| serde_json::json!({})),
        created_at: parse_timestamp(&row.5)?,
    })
}

fn sanitize_metadata(metadata: Value) -> Value {
    let Value::Object(mut map) = metadata else {
        return serde_json::json!({});
    };
    for key in REDACT_KEYS {
        if map.contains_key(*key) {
            map.insert((*key).to_owned(), Value::String("[REDACTED]".to_owned()));
        }
    }
    Value::Object(map)
}

#[must_use]
pub fn hash_audit_identifier(value: &str) -> String {
    Sha256::digest(value.trim().to_ascii_lowercase().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
