use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::TenantScope;
use crate::db::{parse_optional_timestamp, parse_timestamp};
use crate::error::{ApiError, ApiResult};

#[derive(Clone, Debug)]
pub struct SubscriptionRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub plan_id: String,
    pub status: String,
    pub provider: Option<String>,
    pub external_id: Option<String>,
    pub current_period_start: Option<DateTime<Utc>>,
    pub current_period_end: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct EntitlementRecord {
    pub id: Uuid,
    pub household_id: Uuid,
    pub feature_key: String,
    pub granted_until: Option<DateTime<Utc>>,
    pub source_subscription_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct BillingRepository {
    pool: SqlitePool,
}

impl BillingRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub(crate) fn pool(&self) -> SqlitePool {
        self.pool.clone()
    }

    pub async fn record_event(
        &self,
        scope: TenantScope,
        event_type: &str,
        provider: Option<&str>,
        payload_json: &str,
        idempotency_key: Option<&str>,
    ) -> ApiResult<Uuid> {
        if let Some(key) = idempotency_key {
            let existing = sqlx::query_scalar::<_, String>(
                "SELECT id FROM billing_events
                 WHERE household_id = ?1 AND idempotency_key = ?2",
            )
            .bind(scope.household_id().to_string())
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;

            if let Some(id) = existing {
                return id.parse().map_err(|_| ApiError::Internal);
            }
        }

        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO billing_events
             (id, household_id, event_type, provider, payload_json, idempotency_key)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(id.to_string())
        .bind(scope.household_id().to_string())
        .bind(event_type)
        .bind(provider)
        .bind(payload_json)
        .bind(idempotency_key)
        .execute(&self.pool)
        .await?;

        Ok(id)
    }

    pub async fn list_entitlements(&self, scope: TenantScope) -> ApiResult<Vec<EntitlementRecord>> {
        let rows = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                Option<String>,
                Option<String>,
                String,
            ),
        >(
            "SELECT id, household_id, feature_key, granted_until,
                    source_subscription_id, created_at
             FROM entitlements
             WHERE household_id = ?1
             ORDER BY feature_key ASC",
        )
        .bind(scope.household_id().to_string())
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(EntitlementRecord {
                    id: row.0.parse().map_err(|_| ApiError::Internal)?,
                    household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
                    feature_key: row.2,
                    granted_until: parse_optional_timestamp(row.3)?,
                    source_subscription_id: row
                        .4
                        .map(|value| value.parse().map_err(|_| ApiError::Internal))
                        .transpose()?,
                    created_at: parse_timestamp(&row.5)?,
                })
            })
            .collect()
    }

    pub async fn upsert_entitlement(
        &self,
        scope: TenantScope,
        feature_key: &str,
        granted_until: Option<DateTime<Utc>>,
        source_subscription_id: Option<Uuid>,
    ) -> ApiResult<EntitlementRecord> {
        let id = Uuid::new_v4();
        let household_id = scope.household_id();
        sqlx::query(
            "INSERT INTO entitlements
             (id, household_id, feature_key, granted_until, source_subscription_id)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(household_id, feature_key) DO UPDATE SET
               granted_until = excluded.granted_until,
               source_subscription_id = excluded.source_subscription_id",
        )
        .bind(id.to_string())
        .bind(household_id.to_string())
        .bind(feature_key)
        .bind(granted_until.map(|value| value.to_rfc3339()))
        .bind(source_subscription_id.map(|value| value.to_string()))
        .execute(&self.pool)
        .await?;

        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                Option<String>,
                Option<String>,
                String,
            ),
        >(
            "SELECT id, household_id, feature_key, granted_until,
                    source_subscription_id, created_at
             FROM entitlements
             WHERE household_id = ?1 AND feature_key = ?2",
        )
        .bind(household_id.to_string())
        .bind(feature_key)
        .fetch_one(&self.pool)
        .await?;

        Ok(EntitlementRecord {
            id: row.0.parse().map_err(|_| ApiError::Internal)?,
            household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
            feature_key: row.2,
            granted_until: parse_optional_timestamp(row.3)?,
            source_subscription_id: row
                .4
                .map(|value| value.parse().map_err(|_| ApiError::Internal))
                .transpose()?,
            created_at: parse_timestamp(&row.5)?,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn upsert_subscription(
        &self,
        scope: crate::auth::TenantScope,
        subscription_id: uuid::Uuid,
        plan_id: &str,
        status: &str,
        provider: Option<&str>,
        external_id: Option<&str>,
        event_time: chrono::DateTime<chrono::Utc>,
    ) -> crate::error::ApiResult<SubscriptionRecord> {
        sqlx::query("INSERT INTO subscriptions (id,household_id,plan_id,status,provider,external_id,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET plan_id=excluded.plan_id,status=excluded.status,provider=excluded.provider,external_id=excluded.external_id,updated_at=excluded.updated_at").bind(subscription_id.to_string()).bind(scope.household_id().to_string()).bind(plan_id).bind(status).bind(provider).bind(external_id).bind(event_time.to_rfc3339()).execute(&self.pool).await?;
        self.get_subscription(scope, subscription_id).await
    }

    pub async fn get_subscription(
        &self,
        scope: TenantScope,
        subscription_id: Uuid,
    ) -> ApiResult<SubscriptionRecord> {
        let row = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, plan_id, status, provider, external_id,
                    current_period_start, current_period_end, created_at, updated_at
             FROM subscriptions
             WHERE household_id = ?1 AND id = ?2",
        )
        .bind(scope.household_id().to_string())
        .bind(subscription_id.to_string())
        .fetch_optional(&self.pool)
        .await?
        .ok_or(ApiError::NotFound)?;

        Ok(SubscriptionRecord {
            id: row.0.parse().map_err(|_| ApiError::Internal)?,
            household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
            plan_id: row.2,
            status: row.3,
            provider: row.4,
            external_id: row.5,
            current_period_start: parse_optional_timestamp(row.6)?,
            current_period_end: parse_optional_timestamp(row.7)?,
            created_at: parse_timestamp(&row.8)?,
            updated_at: parse_timestamp(&row.9)?,
        })
    }

    pub async fn list_subscriptions_by_provider(
        &self,
        provider: &str,
    ) -> ApiResult<Vec<SubscriptionRecord>> {
        let rows = sqlx::query_as::<
            _,
            (
                String,
                String,
                String,
                String,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                String,
                String,
            ),
        >(
            "SELECT id, household_id, plan_id, status, provider, external_id,
                    current_period_start, current_period_end, created_at, updated_at
             FROM subscriptions
             WHERE provider = ?1
             ORDER BY updated_at ASC",
        )
        .bind(provider)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                Ok(SubscriptionRecord {
                    id: row.0.parse().map_err(|_| ApiError::Internal)?,
                    household_id: row.1.parse().map_err(|_| ApiError::Internal)?,
                    plan_id: row.2,
                    status: row.3,
                    provider: row.4,
                    external_id: row.5,
                    current_period_start: parse_optional_timestamp(row.6)?,
                    current_period_end: parse_optional_timestamp(row.7)?,
                    created_at: parse_timestamp(&row.8)?,
                    updated_at: parse_timestamp(&row.9)?,
                })
            })
            .collect()
    }
}
