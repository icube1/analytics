//! Version 1 finance-core request and response DTOs.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::{
    compound::{
        calculate_compound_interest, compute_safe_withdrawal_advice, run_monte_carlo_simulation,
        CompoundContext, CompoundError, CompoundOptions, CompoundParams, CompoundResult,
        MonteCarloOptions, MonteCarloResult, SafeWithdrawalAdvice,
    },
    date::CivilDate,
    debt::{
        amortize_debt_month, current_payment_period_days, estimate_payoff_months,
        simulation_payment_period_days, surrounding_payment_dates,
    },
    money::{
        add_money, amortize_money, interest_money, money_from_major, money_major, RoundingMode,
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
    #[serde(rename_all = "camelCase")]
    CompoundProjection {
        id: String,
        params: CompoundParams,
        #[serde(default)]
        context: Option<CompoundContext>,
        #[serde(default)]
        options: CompoundOptions,
    },
    #[serde(rename_all = "camelCase")]
    MonteCarlo {
        id: String,
        params: CompoundParams,
        #[serde(default)]
        context: Option<CompoundContext>,
        #[serde(default)]
        options: MonteCarloOptions,
    },
    #[serde(rename_all = "camelCase")]
    SafeWithdrawal {
        id: String,
        params: CompoundParams,
        #[serde(default)]
        context: Option<CompoundContext>,
        #[serde(default)]
        options: CompoundOptions,
    },
    #[serde(rename_all = "camelCase")]
    MoneyRound {
        id: String,
        major: f64,
        currency: String,
        #[serde(default)]
        mode: RoundingMode,
    },
    #[serde(rename_all = "camelCase")]
    MoneyAdd {
        id: String,
        left_minor: i64,
        right_minor: i64,
        currency: String,
    },
    #[serde(rename_all = "camelCase")]
    MoneyInterest {
        id: String,
        principal_minor: i64,
        annual_rate_percent: f64,
        period_days: i64,
        #[serde(default = "default_year_days")]
        year_days: i64,
        currency: String,
        #[serde(default)]
        mode: RoundingMode,
    },
    #[serde(rename_all = "camelCase")]
    MoneyAmortize {
        id: String,
        balance_minor: i64,
        payment_minor: i64,
        annual_rate_percent: f64,
        period_days: i64,
        #[serde(default = "default_year_days")]
        year_days: i64,
        currency: String,
        #[serde(default)]
        mode: RoundingMode,
    },
}

fn default_year_days() -> i64 {
    365
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
    #[serde(rename_all = "camelCase")]
    CompoundProjection {
        id: String,
        result: Box<CompoundResult>,
    },
    #[serde(rename_all = "camelCase")]
    MonteCarlo {
        id: String,
        result: Box<MonteCarloResult>,
    },
    #[serde(rename_all = "camelCase")]
    SafeWithdrawal {
        id: String,
        advice: Option<Box<SafeWithdrawalAdvice>>,
    },
    #[serde(rename_all = "camelCase")]
    MoneyRound {
        id: String,
        currency: String,
        minor: i64,
        major: f64,
        exponent: u8,
        mode: RoundingMode,
    },
    #[serde(rename_all = "camelCase")]
    MoneyAdd {
        id: String,
        currency: String,
        minor: i64,
        major: f64,
        exponent: u8,
    },
    #[serde(rename_all = "camelCase")]
    MoneyInterest {
        id: String,
        currency: String,
        minor: i64,
        major: f64,
        exponent: u8,
        mode: RoundingMode,
    },
    #[serde(rename_all = "camelCase")]
    MoneyAmortize {
        id: String,
        currency: String,
        exponent: u8,
        mode: RoundingMode,
        balance_minor: i64,
        interest_minor: i64,
        principal_minor: i64,
        balance_major: f64,
        interest_major: f64,
        principal_major: f64,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BoundaryError {
    UnsupportedSchemaVersion(u16),
    InvalidDate { id: String, value: String },
    CompoundEvaluation { id: String, message: String },
    MoneyEvaluation { id: String, message: String },
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
            Self::CompoundEvaluation { id, message } => {
                write!(formatter, "case {id} compound evaluation failed: {message}")
            }
            Self::MoneyEvaluation { id, message } => {
                write!(formatter, "case {id} money evaluation failed: {message}")
            }
        }
    }
}

impl std::error::Error for BoundaryError {}

/// Evaluates one versioned batch without depending on a transport.
///
/// # Errors
///
/// Returns [`BoundaryError`] for an unsupported schema, invalid civil date, compound failure, or money rounding failure.
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
        FinanceRequest::CompoundProjection {
            id,
            params,
            context,
            options,
        } => {
            let result = calculate_compound_interest(&params, context.as_ref(), &options)
                .map_err(|error| map_compound_error(&id, &error))?;
            Ok(FinanceResponse::CompoundProjection {
                id,
                result: Box::new(result),
            })
        }
        FinanceRequest::MonteCarlo {
            id,
            params,
            context,
            options,
        } => {
            let result = run_monte_carlo_simulation(&params, context.as_ref(), &options)
                .map_err(|error| map_compound_error(&id, &error))?;
            Ok(FinanceResponse::MonteCarlo {
                id,
                result: Box::new(result),
            })
        }
        FinanceRequest::SafeWithdrawal {
            id,
            params,
            context,
            options,
        } => {
            let advice = compute_safe_withdrawal_advice(&params, context.as_ref(), &options)
                .map_err(|error| map_compound_error(&id, &error))?;
            Ok(FinanceResponse::SafeWithdrawal {
                id,
                advice: advice.map(Box::new),
            })
        }
        FinanceRequest::MoneyRound {
            id,
            major,
            currency,
            mode,
        } => {
            let amount = money_from_major(major, &currency, mode)
                .map_err(|error| map_money_error(&id, &error))?;
            Ok(FinanceResponse::MoneyRound {
                id,
                currency: amount.currency.to_string(),
                minor: amount.minor,
                major: money_major(amount),
                exponent: amount.currency.exponent(),
                mode,
            })
        }
        FinanceRequest::MoneyAdd {
            id,
            left_minor,
            right_minor,
            currency,
        } => {
            let amount = add_money(left_minor, right_minor, &currency)
                .map_err(|error| map_money_error(&id, &error))?;
            Ok(FinanceResponse::MoneyAdd {
                id,
                currency: amount.currency.to_string(),
                minor: amount.minor,
                major: money_major(amount),
                exponent: amount.currency.exponent(),
            })
        }
        FinanceRequest::MoneyInterest {
            id,
            principal_minor,
            annual_rate_percent,
            period_days,
            year_days,
            currency,
            mode,
        } => {
            let amount = interest_money(
                principal_minor,
                annual_rate_percent,
                period_days,
                year_days,
                &currency,
                mode,
            )
            .map_err(|error| map_money_error(&id, &error))?;
            Ok(FinanceResponse::MoneyInterest {
                id,
                currency: amount.currency.to_string(),
                minor: amount.minor,
                major: money_major(amount),
                exponent: amount.currency.exponent(),
                mode,
            })
        }
        FinanceRequest::MoneyAmortize {
            id,
            balance_minor,
            payment_minor,
            annual_rate_percent,
            period_days,
            year_days,
            currency,
            mode,
        } => {
            let amount = amortize_money(
                balance_minor,
                payment_minor,
                annual_rate_percent,
                period_days,
                year_days,
                &currency,
                mode,
            )
            .map_err(|error| map_money_error(&id, &error))?;
            Ok(FinanceResponse::MoneyAmortize {
                id,
                currency: amount.balance.currency.to_string(),
                exponent: amount.balance.currency.exponent(),
                mode,
                balance_minor: amount.balance.minor,
                interest_minor: amount.interest.minor,
                principal_minor: amount.principal.minor,
                balance_major: money_major(amount.balance),
                interest_major: money_major(amount.interest),
                principal_major: money_major(amount.principal),
            })
        }
    }
}

fn map_compound_error(id: &str, error: &CompoundError) -> BoundaryError {
    BoundaryError::CompoundEvaluation {
        id: id.to_owned(),
        message: error.to_string(),
    }
}

fn map_money_error(id: &str, error: &crate::MoneyError) -> BoundaryError {
    BoundaryError::MoneyEvaluation {
        id: id.to_owned(),
        message: error.to_string(),
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
