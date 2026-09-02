//! Mobile-native `UniFFI` bindings for [`finance_core`].
//!
//! All finance operations are exposed as coarse, versioned JSON batch calls so
//! mobile hosts never pay per-month FFI overhead. Request and response payloads
//! are never logged at this boundary.

#![allow(
    clippy::must_use_candidate,
    clippy::missing_errors_doc,
    clippy::needless_pass_by_value
)]

mod boundary;
mod error;

pub use boundary::MonteCarloPercentiles;
pub use error::FinanceFfiError;

use boundary::{evaluate_batch_json, evaluate_monte_carlo_percentiles_json, with_panic_boundary};
use finance_core::dto::v1::SCHEMA_VERSION;

uniffi::setup_scaffolding!();

/// Returns the active finance-core DTO schema version.
#[must_use]
#[uniffi::export]
pub fn finance_core_schema_version() -> u16 {
    SCHEMA_VERSION
}

/// Evaluates a versioned finance-core JSON request batch and returns JSON.
///
/// Supported operations: debt day-count/amortize/payoff, resilience plan,
/// compound projection, and Monte Carlo (full result in the batch response).
///
/// # Errors
///
/// Returns [`FinanceFfiError`] for parse, evaluation, or serialization failures.
#[uniffi::export]
pub fn evaluate_finance_core(request_json: String) -> Result<String, FinanceFfiError> {
    with_panic_boundary(|| evaluate_batch_json(&request_json))
}

/// Evaluates a single Monte Carlo case and returns final-path percentile balances.
///
/// The request must contain exactly one `monteCarlo` operation. This avoids
/// shipping large path arrays across the FFI boundary while still supporting
/// chart overlays that only need percentile bands.
///
/// # Errors
///
/// Returns [`FinanceFfiError`] when the batch is invalid or evaluation fails.
#[uniffi::export]
pub fn evaluate_finance_core_monte_carlo_percentiles(
    request_json: String,
) -> Result<MonteCarloPercentiles, FinanceFfiError> {
    with_panic_boundary(|| evaluate_monte_carlo_percentiles_json(&request_json))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_version_matches_core() {
        assert_eq!(finance_core_schema_version(), SCHEMA_VERSION);
    }

    #[test]
    fn rejects_invalid_json_without_panicking() {
        let error = evaluate_finance_core("not-json".to_owned()).unwrap_err();
        assert_eq!(error.code(), "PARSE_FAILED");
    }
}
