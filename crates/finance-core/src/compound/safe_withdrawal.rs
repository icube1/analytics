//! Safe-withdrawal search mirroring `lib/safe-withdrawal.ts`.
#![allow(clippy::manual_midpoint)]

use serde::Serialize;

use super::{
    rates::monthly_rate_from_annual,
    simulate::{calculate_compound_interest, CompoundError},
    types::{CompoundContext, CompoundOptions, CompoundParams, CompoundResult, WithdrawalMode},
};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeWithdrawalAdvice {
    pub max_annual_percent: f64,
    pub max_monthly_real: f64,
    pub liquidity_at_withdrawal_start: f64,
    pub liquidity_at_withdrawal_start_real: f64,
    pub current_is_safe: bool,
    pub max_monthly_as_nominal_percent: f64,
    pub max_percent_as_monthly_real: f64,
    pub max_percent_as_monthly_real_end: f64,
    pub current_start_payout_real: f64,
    pub current_fixed_as_nominal_percent: Option<f64>,
    pub current_percent_as_monthly_real: Option<f64>,
}

fn monthly_inflation_rate(params: &CompoundParams) -> f64 {
    monthly_rate_from_annual(params.inflation_percent, params.monthly_rate_method)
}

fn first_withdrawal_month(params: &CompoundParams) -> u32 {
    let years = params.withdraw_after_years.unwrap_or(0.0);
    u32::try_from((years * 12.0).round() as i64 + 1).unwrap_or(u32::MAX)
}

fn inflation_factor_at_withdrawal_start(params: &CompoundParams) -> f64 {
    (1.0 + monthly_inflation_rate(params))
        .powi(i32::try_from(first_withdrawal_month(params)).unwrap_or(i32::MAX))
}

pub fn fixed_real_to_nominal_percent(
    monthly_real: f64,
    nominal_liquidity: f64,
    params: &CompoundParams,
) -> f64 {
    if nominal_liquidity <= 0.0 || monthly_real <= 0.0 {
        return 0.0;
    }
    let nominal_monthly_target = monthly_real * inflation_factor_at_withdrawal_start(params);
    (nominal_monthly_target * 12.0 * 100.0) / nominal_liquidity
}

fn real_liquidity_at_point(month: u32, liquidity_balance: f64, params: &CompoundParams) -> f64 {
    let factor =
        (1.0 + monthly_inflation_rate(params)).powi(i32::try_from(month).unwrap_or(i32::MAX));
    liquidity_balance / factor
}

pub fn is_withdrawal_sustainable(result: &CompoundResult, params: &CompoundParams) -> bool {
    if result.withdrawal_ended_early || result.withdrawal_months_liquidity_empty > 0 {
        return false;
    }

    let withdrawal_points: Vec<_> = result
        .points
        .iter()
        .filter(|point| point.in_withdrawal_phase)
        .collect();
    if withdrawal_points.len() < 2 {
        return true;
    }

    let first = withdrawal_points[0];
    let last = withdrawal_points[withdrawal_points.len() - 1];
    let first_real = real_liquidity_at_point(first.month, first.liquidity_balance, params);
    let last_real = real_liquidity_at_point(last.month, last.liquidity_balance, params);
    last_real >= first_real * 0.995
}

fn simulate_percent(
    params: &CompoundParams,
    annual_percent: f64,
    context: Option<&CompoundContext>,
    options: &CompoundOptions,
) -> Result<CompoundResult, CompoundError> {
    let mut next = params.clone();
    next.withdrawal_mode = WithdrawalMode::Percent;
    next.annual_withdrawal_percent = annual_percent;
    next.monthly_withdrawal = 0.0;
    calculate_compound_interest(&next, context, options)
}

fn simulate_fixed(
    params: &CompoundParams,
    monthly_real: f64,
    context: Option<&CompoundContext>,
    options: &CompoundOptions,
) -> Result<CompoundResult, CompoundError> {
    let mut next = params.clone();
    next.withdrawal_mode = WithdrawalMode::Fixed;
    next.monthly_withdrawal = monthly_real;
    next.annual_withdrawal_percent = 0.0;
    calculate_compound_interest(&next, context, options)
}

fn get_liquidity_at_withdrawal_start(
    params: &CompoundParams,
    context: Option<&CompoundContext>,
    options: &CompoundOptions,
) -> Result<f64, CompoundError> {
    Ok(simulate_percent(params, 0.0, context, options)?
        .withdrawal_start_liquidity
        .unwrap_or(0.0))
}

fn find_max_annual_percent(
    params: &CompoundParams,
    context: Option<&CompoundContext>,
    options: &CompoundOptions,
) -> Result<f64, CompoundError> {
    let mut lo = 0.0;
    let mut hi = params.annual_return_percent.max(1.0);

    while hi < 100.0
        && is_withdrawal_sustainable(&simulate_percent(params, hi, context, options)?, params)
    {
        lo = hi;
        hi = (hi * 2.0).min(100.0);
    }

    for _ in 0..40 {
        let mid = (lo + hi) / 2.0;
        if is_withdrawal_sustainable(&simulate_percent(params, mid, context, options)?, params) {
            lo = mid;
        } else {
            hi = mid;
        }
        if hi - lo < 0.01 {
            break;
        }
    }

    Ok((lo * 100.0).round() / 100.0)
}

fn find_max_monthly_real(
    params: &CompoundParams,
    context: Option<&CompoundContext>,
    options: &CompoundOptions,
    liquidity_at_start: f64,
) -> Result<f64, CompoundError> {
    let yield_based = (liquidity_at_start * (params.annual_return_percent / 100.0)) / 12.0;
    let mut lo = 0.0;
    let mut hi = yield_based * 2.0;
    if params.monthly_withdrawal > hi {
        hi = params.monthly_withdrawal;
    }
    if hi < 10_000.0 {
        hi = 10_000.0;
    }

    while hi < 50_000_000.0
        && is_withdrawal_sustainable(&simulate_fixed(params, hi, context, options)?, params)
    {
        lo = hi;
        hi *= 2.0;
    }

    for _ in 0..40 {
        let mid = (lo + hi) / 2.0;
        if is_withdrawal_sustainable(&simulate_fixed(params, mid, context, options)?, params) {
            lo = mid;
        } else {
            hi = mid;
        }
        if hi - lo < 1.0 {
            break;
        }
    }

    Ok(lo.floor())
}

fn current_scenario_is_safe(
    params: &CompoundParams,
    context: Option<&CompoundContext>,
    options: &CompoundOptions,
    max_annual_percent: f64,
    max_monthly_real: f64,
) -> Result<bool, CompoundError> {
    match params.withdrawal_mode {
        WithdrawalMode::Percent => {
            let pct = params.annual_withdrawal_percent;
            if pct <= 0.0 {
                return Ok(true);
            }
            Ok(pct <= max_annual_percent + 0.01
                && is_withdrawal_sustainable(
                    &simulate_percent(params, pct, context, options)?,
                    params,
                ))
        }
        WithdrawalMode::Fixed => {
            let monthly = params.monthly_withdrawal;
            if monthly <= 0.0 {
                return Ok(true);
            }
            Ok(monthly <= max_monthly_real + 1.0
                && is_withdrawal_sustainable(
                    &simulate_fixed(params, monthly, context, options)?,
                    params,
                ))
        }
    }
}

pub fn compute_safe_withdrawal_advice(
    params: &CompoundParams,
    context: Option<&CompoundContext>,
    options: &CompoundOptions,
) -> Result<Option<SafeWithdrawalAdvice>, CompoundError> {
    let Some(years) = params.withdraw_after_years else {
        return Ok(None);
    };
    if years <= 0.0 {
        return Ok(None);
    }

    let inflation_at_start = inflation_factor_at_withdrawal_start(params);
    let liquidity_at_withdrawal_start =
        get_liquidity_at_withdrawal_start(params, context, options)?;
    let liquidity_at_withdrawal_start_real = liquidity_at_withdrawal_start / inflation_at_start;
    let max_annual_percent = find_max_annual_percent(params, context, options)?;
    let max_monthly_real =
        find_max_monthly_real(params, context, options, liquidity_at_withdrawal_start)?;
    let max_monthly_as_nominal_percent =
        fixed_real_to_nominal_percent(max_monthly_real, liquidity_at_withdrawal_start, params);
    let max_percent_sim = simulate_percent(params, max_annual_percent, context, options)?;
    let current_sim = match params.withdrawal_mode {
        WithdrawalMode::Percent => {
            simulate_percent(params, params.annual_withdrawal_percent, context, options)?
        }
        WithdrawalMode::Fixed => {
            simulate_fixed(params, params.monthly_withdrawal, context, options)?
        }
    };
    let current_start_payout_real = current_sim.withdrawal_start_payout_real;
    let current_fixed_as_nominal_percent =
        if params.withdrawal_mode == WithdrawalMode::Fixed && params.monthly_withdrawal > 0.0 {
            Some(
                (fixed_real_to_nominal_percent(
                    params.monthly_withdrawal,
                    liquidity_at_withdrawal_start,
                    params,
                ) * 100.0)
                    .round()
                    / 100.0,
            )
        } else {
            None
        };
    let current_percent_as_monthly_real = if params.withdrawal_mode == WithdrawalMode::Percent {
        Some(current_start_payout_real)
    } else {
        None
    };

    Ok(Some(SafeWithdrawalAdvice {
        max_annual_percent,
        max_monthly_real,
        liquidity_at_withdrawal_start,
        liquidity_at_withdrawal_start_real,
        current_is_safe: current_scenario_is_safe(
            params,
            context,
            options,
            max_annual_percent,
            max_monthly_real,
        )?,
        max_monthly_as_nominal_percent: (max_monthly_as_nominal_percent * 100.0).round() / 100.0,
        max_percent_as_monthly_real: max_percent_sim.withdrawal_start_payout_real,
        max_percent_as_monthly_real_end: max_percent_sim.withdrawal_payout_real,
        current_start_payout_real,
        current_fixed_as_nominal_percent,
        current_percent_as_monthly_real,
    }))
}
