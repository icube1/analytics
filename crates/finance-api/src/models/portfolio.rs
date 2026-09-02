use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PORTFOLIO_SCHEMA_VERSION: i64 = 1;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioSyncResponse {
    pub schema_version: i64,
    pub revision: i64,
    pub household_id: String,
    pub document: Value,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioSyncRequest {
    pub schema_version: i64,
    pub base_revision: i64,
    pub document: Value,
    #[serde(default)]
    pub idempotency_key: Option<String>,
}

impl PortfolioSyncRequest {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != PORTFOLIO_SCHEMA_VERSION {
            return Err(format!(
                "unsupported schema version {}",
                self.schema_version
            ));
        }
        if self.base_revision < 0 {
            return Err("base_revision must be non-negative".to_owned());
        }
        if !self.document.is_object() {
            return Err("document must be a JSON object".to_owned());
        }
        Ok(())
    }
}
