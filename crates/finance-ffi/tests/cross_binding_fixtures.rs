//! Deterministic cross-binding fixture tests for the native FFI boundary.
//!
//! These tests exercise the same JSON batch contract used by `finance-wasm`
//! without per-month FFI calls. Host-language bindings should mirror these
//! fixtures via `scripts/test-finance-ffi-bindings.sh`.

use std::{fs, path::PathBuf};

use finance_core::dto::v1::{evaluate, RequestBatch};
use finance_ffi::{
    evaluate_finance_core, evaluate_finance_core_monte_carlo_percentiles, FinanceFfiError,
};

fn fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/finance-core")
}

fn load_fixture(name: &str) -> String {
    fs::read_to_string(fixture_root().join(name)).unwrap_or_else(|error| {
        panic!("failed to read fixture {name}: {error}");
    })
}

fn direct_evaluate_json(request_json: &str) -> String {
    let batch: RequestBatch = serde_json::from_str(request_json).expect("fixture JSON");
    let response = evaluate(batch).expect("fixture evaluation");
    serde_json::to_string(&response).expect("fixture serialization")
}

fn assert_close(actual: f64, expected: f64) {
    let scale = expected.abs().max(1.0);
    assert!(
        (actual - expected).abs() <= scale * 1e-10,
        "expected {expected}, got {actual}"
    );
}

#[test]
fn debt_fixture_matches_direct_core_evaluation() {
    let request = load_fixture("v1.json");
    let direct = direct_evaluate_json(&request);
    let via_ffi = evaluate_finance_core(request).expect("ffi evaluation");
    assert_eq!(direct, via_ffi);
}

#[test]
fn resilience_fixture_matches_direct_core_evaluation() {
    let request = load_fixture("resilience-v1.json");
    let direct = direct_evaluate_json(&request);
    let via_ffi = evaluate_finance_core(request).expect("ffi evaluation");
    assert_eq!(direct, via_ffi);
}

#[test]
fn compound_fixture_matches_direct_core_evaluation() {
    let request = load_fixture("compound-v1.json");
    let direct = direct_evaluate_json(&request);
    let via_ffi = evaluate_finance_core(request).expect("ffi evaluation");
    assert_eq!(direct, via_ffi);
}

#[test]
fn monte_carlo_percentiles_match_batch_response() {
    let request = load_fixture("compound-v1.json");
    let batch: RequestBatch = serde_json::from_str(&request).expect("fixture JSON");
    let direct = evaluate(batch).expect("fixture evaluation");

    let monte_carlo_case = batch_from_fixture_case("compound-v1.json", "seeded-baseline");
    let percentiles =
        evaluate_finance_core_monte_carlo_percentiles(monte_carlo_case).expect("ffi percentiles");

    let direct_json = serde_json::to_string(&direct).expect("serialization");
    let parsed: serde_json::Value = serde_json::from_str(&direct_json).expect("parse direct");
    let cases = parsed["cases"]
        .as_array()
        .expect("cases array")
        .iter()
        .find(|case| case["id"] == "seeded-baseline")
        .expect("monte carlo case");
    let final_balance = &cases["result"]["finalBalance"];

    assert_close(percentiles.p10, final_balance["p10"].as_f64().unwrap());
    assert_close(percentiles.p25, final_balance["p25"].as_f64().unwrap());
    assert_close(percentiles.p50, final_balance["p50"].as_f64().unwrap());
    assert_close(percentiles.p75, final_balance["p75"].as_f64().unwrap());
    assert_close(percentiles.p90, final_balance["p90"].as_f64().unwrap());
}

#[test]
fn panic_boundary_maps_invalid_dates_to_evaluation_error() {
    let request = r#"{"schemaVersion":1,"cases":[{"operation":"dayCount","id":"bad","asOf":"not-a-date","paymentDay":1,"simulationMonths":[]}]}"#;
    let error = evaluate_finance_core(request.to_owned()).unwrap_err();
    assert!(matches!(error, FinanceFfiError::EvaluationFailed { .. }));
}

fn batch_from_fixture_case(fixture_name: &str, case_id: &str) -> String {
    let request = load_fixture(fixture_name);
    let mut batch: serde_json::Value = serde_json::from_str(&request).expect("fixture JSON");
    let cases = batch["cases"]
        .as_array()
        .expect("cases")
        .iter()
        .filter(|case| case["id"] == case_id)
        .cloned()
        .collect::<Vec<_>>();
    assert_eq!(cases.len(), 1, "expected one matching case");
    batch["cases"] = serde_json::Value::Array(cases);
    batch.to_string()
}
