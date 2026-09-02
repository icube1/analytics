use chrono::{DateTime, Utc};

use crate::error::{ApiError, ApiResult};

pub fn parse_timestamp(value: &str) -> ApiResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .or_else(|_| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%fZ")
                .map(|timestamp| timestamp.and_utc())
        })
        .map_err(|_| ApiError::Internal)
}

pub fn parse_optional_timestamp(value: Option<String>) -> ApiResult<Option<DateTime<Utc>>> {
    value.map(|text| parse_timestamp(&text)).transpose()
}
