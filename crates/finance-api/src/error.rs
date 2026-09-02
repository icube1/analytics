use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("configuration error: {message}")]
    Config { message: String },
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("authentication required")]
    Unauthorized,
    #[error("authentication is not configured")]
    AuthNotConfigured,
    #[error("forbidden")]
    Forbidden,
    #[error("not found")]
    NotFound,
    #[error("revision conflict: expected {expected}, found {actual}")]
    RevisionConflict { expected: i64, actual: i64 },
    #[error("request body is too large")]
    PayloadTooLarge,
    #[error("invalid request: {message}")]
    BadRequest { message: String },
    #[error("internal error")]
    Internal,
}

#[derive(Serialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Serialize)]
struct ErrorDetail {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<serde_json::Value>,
}

impl ApiError {
    fn status(&self) -> StatusCode {
        match self {
            Self::Config { .. } | Self::Internal | Self::Database(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::AuthNotConfigured => StatusCode::SERVICE_UNAVAILABLE,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::RevisionConflict { .. } => StatusCode::CONFLICT,
            Self::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            Self::BadRequest { .. } => StatusCode::BAD_REQUEST,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            Self::Config { .. } => "config_error",
            Self::Database(_) => "database_error",
            Self::Unauthorized => "unauthorized",
            Self::AuthNotConfigured => "auth_not_configured",
            Self::Forbidden => "forbidden",
            Self::NotFound => "not_found",
            Self::RevisionConflict { .. } => "revision_conflict",
            Self::PayloadTooLarge => "payload_too_large",
            Self::BadRequest { .. } => "bad_request",
            Self::Internal => "internal_error",
        }
    }

    fn public_message(&self) -> String {
        match self {
            Self::Config { message } => message.clone(),
            Self::Database(_) => "database operation failed".to_owned(),
            Self::Unauthorized => "authentication required".to_owned(),
            Self::AuthNotConfigured => "authentication is not configured".to_owned(),
            Self::Forbidden => "forbidden".to_owned(),
            Self::NotFound => "not found".to_owned(),
            Self::RevisionConflict { expected, actual } => {
                format!("revision conflict: expected {expected}, found {actual}")
            }
            Self::PayloadTooLarge => "request body is too large".to_owned(),
            Self::BadRequest { message } => message.clone(),
            Self::Internal => "internal error".to_owned(),
        }
    }

    fn details(&self) -> Option<serde_json::Value> {
        match self {
            Self::RevisionConflict { expected, actual } => Some(serde_json::json!({
                "expectedRevision": expected,
                "actualRevision": actual,
            })),
            _ => None,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        if matches!(
            self,
            Self::Database(_) | Self::Internal | Self::Config { .. }
        ) {
            tracing::error!(error = %self, "request failed");
        }

        let status = self.status();
        let body = ErrorBody {
            error: ErrorDetail {
                code: self.code(),
                message: self.public_message(),
                details: self.details(),
            },
        };

        (status, Json(body)).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
