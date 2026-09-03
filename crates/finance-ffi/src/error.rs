//! FFI-safe error surface. Payloads and secrets must never be logged here.

use finance_core::dto::v1::BoundaryError;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum FinanceFfiError {
    #[error("request JSON could not be parsed")]
    ParseFailed { code: String },
    #[error("finance-core evaluation failed")]
    EvaluationFailed { code: String },
    #[error("response JSON could not be serialized")]
    SerializeFailed { code: String },
    #[error("internal FFI boundary failure")]
    Internal { code: String },
}

impl FinanceFfiError {
    #[must_use]
    pub fn code(&self) -> &str {
        match self {
            Self::ParseFailed { code }
            | Self::EvaluationFailed { code }
            | Self::SerializeFailed { code }
            | Self::Internal { code } => code,
        }
    }
}

impl From<BoundaryError> for FinanceFfiError {
    fn from(error: BoundaryError) -> Self {
        let code = match error {
            BoundaryError::UnsupportedSchemaVersion(version) => {
                format!("UNSUPPORTED_SCHEMA_VERSION_{version}")
            }
            BoundaryError::InvalidDate { .. } => "INVALID_DATE".to_owned(),
            BoundaryError::CompoundEvaluation { .. } => "COMPOUND_EVALUATION_FAILED".to_owned(),
            BoundaryError::MoneyEvaluation { .. } => "MONEY_EVALUATION_FAILED".to_owned(),
        };
        Self::EvaluationFailed { code }
    }
}
