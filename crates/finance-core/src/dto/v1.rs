//! Version 1 finance-core request and response DTOs.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::{
    date::CivilDate,
    debt::{
        amortize_debt_month, current_payment_period_days, estimate_payoff_months,
        simulation_payment_period_days, surrounding_payment_dates,
    },
    resilience::{evaluate_resilience, ResilienceInput, ResiliencePlan},
};

pub const SCHEMA_VERSION: u16 = 1;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestBatch {
    pub schema_version: u16,
    pub cases: Vec<FinanceRequest>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "operation", rename_all = "camelCase")]
pub enum FinanceRequest {
    #[serde(rename_all = "camelCase")]
    DayCount {
        id: String,
        as_of: String,
        payment_day: f64,
        simulation_months: Vec<i32>,
    },
    #[serde(rename_all = "camelCase")]
    Amortize {
        id: String,
        balance: f64,
        payment: f64,
        annual_interest_rate: f64,
        #[serde(default)]
        period_days: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    EstimatePayoff {
        id: String,
        balance: f64,
        payment: f64,
        annual_interest_rate: f64,
        payment_day: f64,
        as_of: String,
    },
    #[serde(rename_all = "camelCase")]
    ResiliencePlan { id: String, input: ResilienceInput },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseBatch {
    pub schema_version: u16,
    pub cases: Vec<FinanceResponse>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "operation", rename_all = "camelCase")]
pub enum FinanceResponse {
    #[serde(rename_all = "camelCase")]
    DayCount {
        id: String,
        previous: String,
        next: String,
        current_period_days: i64,
        simulation_period_days: Vec<i64>,
    },
    #[serde(rename_all = "camelCase")]
    Amortize {
        id: String,
        balance: f64,
        interest: f64,
        principal: f64,
    },
    #[serde(rename_all = "camelCase")]
    EstimatePayoff { id: String, months: Option<u32> },
    #[serde(rename_all = "camelCase")]
    ResiliencePlan {
        id: String,
        plan: Box<ResiliencePlan>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BoundaryError {
    UnsupportedSchemaVersion(u16),
    InvalidDate { id: String, value: String },
}

impl fmt::Display for BoundaryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedSchemaVersion(version) => {
                write!(formatter, "unsupported schema version {version}")
            }
            Self::InvalidDate { id, value } => {
                write!(formatter, "case {id} has invalid civil date {value:?}")
            }
        }
    }
}

impl std::error::Error for BoundaryError {}

/// Evaluates one versioned batch without depending on a transport.
///
/// # Errors
///
/// Returns [`BoundaryError`] for an unsupported schema or invalid civil date.
pub fn evaluate(batch: RequestBatch) -> Result<ResponseBatch, BoundaryError> {
    if batch.schema_version != SCHEMA_VERSION {
        return Err(BoundaryError::UnsupportedSchemaVersion(
            batch.schema_version,
        ));
    }

    let cases = batch
        .cases
        .into_iter()
        .map(evaluate_case)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ResponseBatch {
        schema_version: SCHEMA_VERSION,
        cases,
    })
}

fn evaluate_case(request: FinanceRequest) -> Result<FinanceResponse, BoundaryError> {
    match request {
        FinanceRequest::DayCount {
            id,
            as_of,
            payment_day,
            simulation_months,
        } => {
            let date = parse_date(&id, &as_of)?;
            let surrounding = surrounding_payment_dates(date, payment_day);
            Ok(FinanceResponse::DayCount {
                id,
                previous: surrounding.previous.to_iso(),
                next: surrounding.next.to_iso(),
                current_period_days: current_payment_period_days(payment_day, date),
                simulation_period_days: simulation_months
                    .into_iter()
                    .map(|month| simulation_payment_period_days(date, month, payment_day))
                    .collect(),
            })
        }
        FinanceRequest::Amortize {
            id,
            balance,
            payment,
            annual_interest_rate,
            period_days,
        } => {
            let result = amortize_debt_month(balance, payment, annual_interest_rate, period_days);
            Ok(FinanceResponse::Amortize {
                id,
                balance: result.balance,
                interest: result.interest,
                principal: result.principal,
            })
        }
        FinanceRequest::EstimatePayoff {
            id,
            balance,
            payment,
            annual_interest_rate,
            payment_day,
            as_of,
        } => {
            let date = parse_date(&id, &as_of)?;
            Ok(FinanceResponse::EstimatePayoff {
                id,
                months: estimate_payoff_months(
                    balance,
                    payment,
                    annual_interest_rate,
                    payment_day,
                    date,
                ),
            })
        }
        FinanceRequest::ResiliencePlan { id, input } => {
            let plan = evaluate_resilience(&input);
            Ok(FinanceResponse::ResiliencePlan {
                id,
                plan: Box::new(plan),
            })
        }
    }
}

fn parse_date(id: &str, value: &str) -> Result<CivilDate, BoundaryError> {
    CivilDate::parse_iso(value).map_err(|_| BoundaryError::InvalidDate {
        id: id.to_owned(),
        value: value.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_future_schema_versions() {
        let error = evaluate(RequestBatch {
            schema_version: 2,
            cases: vec![],
        })
        .unwrap_err();
        assert_eq!(error, BoundaryError::UnsupportedSchemaVersion(2));
    }
}
