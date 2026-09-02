//! Coarse wasm-bindgen entry points for browser Worker hosts.

use finance_core::{
    compound::run_monte_carlo_simulation,
    dto::v1::{evaluate, FinanceRequest, RequestBatch, SCHEMA_VERSION},
};
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

/// Evaluates a single Monte Carlo batch and returns final-path balances as `Float64Array`.
#[must_use]
#[wasm_bindgen]
pub fn evaluate_finance_core_monte_carlo_paths(request_json: &str) -> js_sys::Float64Array {
    let parsed: RequestBatch = match serde_json::from_str(request_json) {
        Ok(batch) => batch,
        Err(_) => return js_sys::Float64Array::new_with_length(0),
    };

    if parsed.cases.len() != 1 {
        return js_sys::Float64Array::new_with_length(0);
    }

    let case = &parsed.cases[0];
    let (params, context, options) = match case {
        FinanceRequest::MonteCarlo {
            params,
            context,
            options,
            ..
        } => (params, context.as_ref(), options),
        _ => return js_sys::Float64Array::new_with_length(0),
    };

    let Ok(result) = run_monte_carlo_simulation(params, context, options) else {
        return js_sys::Float64Array::new_with_length(0);
    };

    let values = [
        result.final_balance.p10,
        result.final_balance.p25,
        result.final_balance.p50,
        result.final_balance.p75,
        result.final_balance.p90,
    ];

    js_sys::Float64Array::from(values.as_slice())
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
