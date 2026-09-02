//! Coarse wasm-bindgen entry points for browser Worker hosts.

use finance_core::dto::v1::{evaluate, RequestBatch, SCHEMA_VERSION};
use wasm_bindgen::prelude::*;

/// Evaluates a versioned finance-core JSON request batch and returns JSON.
#[must_use]
#[wasm_bindgen]
pub fn evaluate_finance_core(request_json: &str) -> String {
    let parsed: RequestBatch = match serde_json::from_str(request_json) {
        Ok(batch) => batch,
        Err(error) => return error_payload("PARSE_FAILED", &error.to_string()),
    };

    match evaluate(parsed) {
        Ok(response) => serde_json::to_string(&response)
            .unwrap_or_else(|error| error_payload("SERIALIZE_FAILED", &error.to_string())),
        Err(error) => error_payload("EVALUATION_FAILED", &error.to_string()),
    }
}

/// Returns the active finance-core schema version.
#[must_use]
#[wasm_bindgen]
pub fn finance_core_schema_version() -> u16 {
    SCHEMA_VERSION
}

fn error_payload(code: &str, message: &str) -> String {
    serde_json::json!({
        "schemaVersion": SCHEMA_VERSION,
        "error": {
            "code": code,
            "message": message,
        }
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_fixture_batch() {
        let request = r#"{"schemaVersion":1,"cases":[{"operation":"amortize","id":"x","balance":1000,"payment":100,"annualInterestRate":10}]}"#;
        let response = evaluate_finance_core(request);
        assert!(response.contains("\"operation\":\"amortize\""));
    }
}
