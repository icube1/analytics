use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::repositories::{BrokerImportRecord, StatementRecord};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementMetadataResponse {
    pub id: String,
    pub source_type: String,
    pub file_name: String,
    pub content_type: Option<String>,
    pub byte_size: i64,
    pub checksum_sha256: Option<String>,
    pub provenance_source: String,
    pub imported_at: String,
    pub metadata: serde_json::Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementListResponse {
    pub items: Vec<StatementMetadataResponse>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementContentResponse {
    pub id: String,
    pub file_name: String,
    pub content_type: Option<String>,
    pub checksum_sha256: Option<String>,
    pub content: String,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStatementRequest {
    pub file_name: String,
    pub content: String,
    #[serde(default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

impl CreateStatementRequest {
    pub fn validate(&self, max_bytes: usize) -> Result<(), String> {
        if self.file_name.trim().is_empty() {
            return Err("file_name is required".to_owned());
        }
        if self.content.is_empty() {
            return Err("content is required".to_owned());
        }
        if self.content.len() > max_bytes {
            return Err("statement content exceeds request limit".to_owned());
        }
        Ok(())
    }
}

pub fn statement_metadata(record: &StatementRecord) -> StatementMetadataResponse {
    StatementMetadataResponse {
        id: record.id.to_string(),
        source_type: record.source_type.clone(),
        file_name: record.file_name.clone(),
        content_type: record.content_type.clone(),
        byte_size: record.byte_size,
        checksum_sha256: record.checksum_sha256.clone(),
        provenance_source: record.provenance_source.clone(),
        imported_at: record.imported_at.to_rfc3339(),
        metadata: serde_json::from_str(&record.metadata_json).unwrap_or(serde_json::json!({})),
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerImportMetadataResponse {
    pub id: String,
    pub broker_account_id: String,
    pub source_type: String,
    pub file_name: String,
    pub content_type: Option<String>,
    pub byte_size: i64,
    pub checksum_sha256: Option<String>,
    pub provenance_source: String,
    pub parse_delegated: bool,
    pub status: String,
    pub imported_at: String,
    pub metadata: serde_json::Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerImportListResponse {
    pub items: Vec<BrokerImportMetadataResponse>,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBrokerImportRequest {
    pub provider: String,
    pub external_account_id: String,
    pub file_name: String,
    pub content: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub source_type: Option<String>,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

impl CreateBrokerImportRequest {
    pub fn validate(&self, max_bytes: usize) -> Result<(), String> {
        if self.provider.trim().is_empty() {
            return Err("provider is required".to_owned());
        }
        if self.external_account_id.trim().is_empty() {
            return Err("external_account_id is required".to_owned());
        }
        if self.file_name.trim().is_empty() {
            return Err("file_name is required".to_owned());
        }
        if self.content.is_empty() {
            return Err("content is required".to_owned());
        }
        if self.content.len() > max_bytes {
            return Err("broker import content exceeds request limit".to_owned());
        }
        Ok(())
    }
}

pub fn broker_import_metadata(record: &BrokerImportRecord) -> BrokerImportMetadataResponse {
    BrokerImportMetadataResponse {
        id: record.id.to_string(),
        broker_account_id: record.broker_account_id.to_string(),
        source_type: record.source_type.clone(),
        file_name: record.file_name.clone(),
        content_type: record.content_type.clone(),
        byte_size: record.byte_size,
        checksum_sha256: record.checksum_sha256.clone(),
        provenance_source: record.provenance_source.clone(),
        parse_delegated: record.parse_delegated,
        status: record.status.clone(),
        imported_at: record.imported_at.to_rfc3339(),
        metadata: serde_json::from_str(&record.metadata_json).unwrap_or(serde_json::json!({})),
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResponse {
    pub format_version: i64,
    pub exported_at: String,
    pub portfolio: serde_json::Value,
    pub statements: Vec<BackupStatementExport>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatementExport {
    pub file_name: String,
    pub content: String,
}

pub fn backup_export(
    exported_at: DateTime<Utc>,
    portfolio: serde_json::Value,
    statements: Vec<(String, String)>,
) -> BackupExportResponse {
    BackupExportResponse {
        format_version: crate::import::BACKUP_FORMAT_VERSION,
        exported_at: exported_at.to_rfc3339(),
        portfolio,
        statements: statements
            .into_iter()
            .map(|(file_name, content)| BackupStatementExport { file_name, content })
            .collect(),
    }
}
