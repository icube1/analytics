use crate::auth::TenantScope;
use crate::error::ApiResult;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Clone)]
pub struct CalculationRepository {
    pool: SqlitePool,
}

impl CalculationRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(
        &self,
        scope: TenantScope,
        engine_version: &str,
        kind: &str,
        payload_hash: &str,
    ) -> ApiResult<Option<String>> {
        Ok(sqlx::query_scalar::<_, String>(
            "SELECT result_json FROM calculation_results
             WHERE household_id=?1 AND engine_version=?2 AND kind=?3 AND payload_hash=?4",
        )
        .bind(scope.household_id().to_string())
        .bind(engine_version)
        .bind(kind)
        .bind(payload_hash)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn upsert(
        &self,
        scope: TenantScope,
        engine_version: &str,
        kind: &str,
        payload_hash: &str,
        result_json: &str,
    ) -> ApiResult<()> {
        sqlx::query(
            "INSERT INTO calculation_results
                (id, household_id, engine_version, kind, payload_hash, result_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(household_id, engine_version, kind, payload_hash)
             DO UPDATE SET result_json=excluded.result_json",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(scope.household_id().to_string())
        .bind(engine_version)
        .bind(kind)
        .bind(payload_hash)
        .bind(result_json)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[must_use]
pub fn payload_sha256(payload: &str) -> String {
    Sha256::digest(payload.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
