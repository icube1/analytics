//! Panic-safe evaluation helpers. Never log request or response payloads.

use std::panic::{catch_unwind, AssertUnwindSafe};

use finance_core::{
    compound::run_monte_carlo_simulation,
    dto::v1::{evaluate, FinanceRequest, RequestBatch, SCHEMA_VERSION},
};

use crate::error::FinanceFfiError;

/// Runs `operation` and converts panics into [`FinanceFfiError::Internal`].
///
/// # Errors
///
/// Returns [`FinanceFfiError::Internal`] when the closure panics.
pub fn with_panic_boundary<T>(
    operation: impl FnOnce() -> Result<T, FinanceFfiError>,
) -> Result<T, FinanceFfiError> {
    match catch_unwind(AssertUnwindSafe(operation)) {
        Ok(result) => result,
        Err(_) => Err(FinanceFfiError::Internal {
            code: "PANIC_AT_FFI_BOUNDARY".to_owned(),
        }),
    }
}

/// Evaluates a versioned JSON batch in one coarse FFI call.
///
/// # Errors
///
/// Returns [`FinanceFfiError`] for parse, evaluation, or serialization failures.
pub fn evaluate_batch_json(request_json: &str) -> Result<String, FinanceFfiError> {
    let parsed: RequestBatch =
        serde_json::from_str(request_json).map_err(|_| FinanceFfiError::ParseFailed {
            code: "PARSE_FAILED".to_owned(),
        })?;

    let response = evaluate(parsed)?;
    serde_json::to_string(&response).map_err(|_| FinanceFfiError::SerializeFailed {
        code: "SERIALIZE_FAILED".to_owned(),
    })
}

/// Evaluates a single Monte Carlo case and returns percentile balances.
///
/// # Errors
///
/// Returns [`FinanceFfiError`] when the batch is invalid or evaluation fails.
pub fn evaluate_monte_carlo_percentiles_json(
    request_json: &str,
) -> Result<MonteCarloPercentiles, FinanceFfiError> {
    let parsed: RequestBatch =
        serde_json::from_str(request_json).map_err(|_| FinanceFfiError::ParseFailed {
            code: "PARSE_FAILED".to_owned(),
        })?;

    if parsed.schema_version != SCHEMA_VERSION {
        return Err(FinanceFfiError::EvaluationFailed {
            code: format!("UNSUPPORTED_SCHEMA_VERSION_{}", parsed.schema_version),
        });
    }

    if parsed.cases.len() != 1 {
        return Err(FinanceFfiError::EvaluationFailed {
            code: "MONTE_CARLO_BATCH_REQUIRES_SINGLE_CASE".to_owned(),
        });
    }

    let case = parsed
        .cases
        .into_iter()
        .next()
        .ok_or(FinanceFfiError::EvaluationFailed {
            code: "EMPTY_BATCH".to_owned(),
        })?;

    let FinanceRequest::MonteCarlo {
        params,
        context,
        options,
        ..
    } = case
    else {
        return Err(FinanceFfiError::EvaluationFailed {
            code: "EXPECTED_MONTE_CARLO_OPERATION".to_owned(),
        });
    };

    let result = run_monte_carlo_simulation(&params, context.as_ref(), &options).map_err(|_| {
        FinanceFfiError::EvaluationFailed {
            code: "MONTE_CARLO_EVALUATION_FAILED".to_owned(),
        }
    })?;

    Ok(MonteCarloPercentiles {
        p10: result.final_balance.p10,
        p25: result.final_balance.p25,
        p50: result.final_balance.p50,
        p75: result.final_balance.p75,
        p90: result.final_balance.p90,
    })
}

#[derive(Clone, Debug, PartialEq, uniffi::Record)]
pub struct MonteCarloPercentiles {
    pub p10: f64,
    pub p25: f64,
    pub p50: f64,
    pub p75: f64,
    pub p90: f64,
}
