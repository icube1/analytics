use crate::error::{ApiError, ApiResult};
use axum::http::{HeaderMap, Method};
pub const CSRF_HEADER: &str = "x-csrf-token";
pub fn requires_csrf(method: &Method) -> bool {
    matches!(
        method,
        &Method::POST | &Method::PUT | &Method::PATCH | &Method::DELETE
    )
}
pub fn validate_csrf(headers: &HeaderMap, expected: &str) -> ApiResult<()> {
    let p = headers
        .get(CSRF_HEADER)
        .and_then(|v| v.to_str().ok())
        .ok_or(ApiError::Forbidden)?;
    if p == expected {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}
