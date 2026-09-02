#![allow(clippy::ref_option, clippy::option_map_or_none, clippy::missing_errors_doc, clippy::assigning_clones, clippy::if_not_else, clippy::map_unwrap_or, clippy::needless_late_init, clippy::needless_pass_by_value, clippy::struct_excessive_bools, clippy::too_many_arguments)]
//! Seeded Monte Carlo simulation mirroring `lib/compound-interest/monte-carlo.ts`.

use crate::date::CivilDate;

use super::{
    rates::{get_accrual_period, monthly_rate_from_annual},
    simulate::CompoundError,
    types::{
        CompoundContext, CompoundParams, MonteCarloFinalBalance, MonteCarloOptions,
        MonteCarloPercentilePoint, MonteCarloResult, WithdrawalMode,
    },
    wealth::{
        apply_custom_asset_income, get_monthly_debt_service, get_net_worth,
        get_total_debt_from_state, grow_custom_assets, init_wealth_simulation_state,
        step_debts_month, WealthSimulationState,
    },
    withdrawal::{process_withdrawal, WithdrawalState},
};

fn mulberry32(seed: u32) -> impl FnMut() -> f64 {
    let mut state = seed;
    move || {
        state = state.wrapping_add(0x6D2B_79F5);
        let mut t = state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
}

fn random_normal(rng: &mut impl FnMut() -> f64) -> f64 {
    let mut u = 0.0;
    let mut v = 0.0;
    while u == 0.0 {
        u = rng();
    }
    while v == 0.0 {
        v = rng();
    }
    (-2.0 * u.ln()).sqrt() * (2.0 * std::f64::consts::PI * v).cos()
}

fn sample_monthly_return_rate(
    expected_monthly_rate: f64,
    volatility_percent: f64,
    rng: &mut impl FnMut() -> f64,
) -> f64 {
    let sigma = volatility_percent / 100.0 / 12.0_f64.sqrt();
    let mu = if expected_monthly_rate > -0.999 {
        (1.0 + expected_monthly_rate).ln() - 0.5 * sigma.powi(2)
    } else {
        -10.0
    };
    let monthly = (mu + sigma * random_normal(rng)).exp() - 1.0;
    monthly.max(-0.99)
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    if sorted.len() == 1 {
        return sorted[0];
    }
    let index = (sorted.len() - 1) as f64 * p;
    let lower = index.floor() as usize;
    let upper = index.ceil() as usize;
    if lower == upper {
        return sorted[lower];
    }
    let weight = index - lower as f64;
    sorted[lower].mul_add(1.0 - weight, sorted[upper] * weight)
}

fn simulate_random_path(
    params: &CompoundParams,
    context: Option<&CompoundContext>,
    rng: &mut impl FnMut() -> f64,
    volatility_percent: f64,
    months: u32,
    as_of: CivilDate,
) -> Vec<f64> {
    let rate_method = params.monthly_rate_method;
    let monthly_inflation = monthly_rate_from_annual(params.inflation_percent, rate_method);
    let accrual = get_accrual_period(params.compound_frequency, rate_method);
    let expected_monthly_return =
        monthly_rate_from_annual(params.annual_return_percent, rate_method);

    let withdrawal_start_month = params
        .withdraw_after_years
        .filter(|years| *years > 0.0)
        .map(|years| (years * 12.0).round() as u32);

    let mut wealth_state = context
        .map(|ctx| init_wealth_simulation_state(&ctx.custom_assets, ctx.broker_total, as_of));

    let mut balance = params.initial_capital;
    if let (Some(state), Some(_ctx)) = (&mut wealth_state, context) {
        let net_worth = get_net_worth(state);
        let diff = params.initial_capital - net_worth;
        if diff.abs() > 1.0 {
            state.investment_balance += diff;
        }
        balance = get_net_worth(state);
    }

    let mut cost_basis = params.initial_capital;
    let mut monthly_contribution = params.monthly_contribution;
    let monthly_withdrawal_real = params.monthly_withdrawal;
    let withdrawal_mode = params.withdrawal_mode;
    let annual_withdrawal_percent = params.annual_withdrawal_percent;
    let monthly_withdrawal_from_annual = annual_withdrawal_percent / 12.0;

    let mut balances = vec![balance];
    let mut accrued_income = 0.0;
    let scheduled_debt_service = context
        .map(|ctx| get_monthly_debt_service(&ctx.custom_assets))
        .unwrap_or(0.0);
    let mut withdrawal_state = WithdrawalState::default();

    for month in 1..=months {
        let mut debt_payment = 0.0;

        if let (Some(state), Some(ctx)) = (&mut wealth_state, context) {
            let debt_step = step_debts_month(&ctx.custom_assets, state, as_of, Some(month));
            debt_payment = debt_step.total_payment;
            grow_custom_assets(
                &ctx.custom_assets,
                state,
                params.inflation_percent,
                rate_method,
                as_of,
                Some(month),
            );
            apply_custom_asset_income(&ctx.custom_assets, state, params.reinvest_returns);
        }

        let in_withdrawal_phase = withdrawal_start_month.is_some_and(|start| month > start);
        let total_debt = wealth_state
            .as_ref()
            .map(get_total_debt_from_state)
            .unwrap_or(0.0);
        let mut invest_contribution = 0.0;

        if !in_withdrawal_phase {
            let debt_separate = params.debt_payments_separate_from_contribution;
            if debt_separate && wealth_state.is_some() {
                invest_contribution = monthly_contribution;
                if params.reinvest_freed_debt_payments
                    && total_debt <= 0.01
                    && scheduled_debt_service > 0.0
                {
                    invest_contribution = monthly_contribution + scheduled_debt_service;
                }
            } else {
                invest_contribution = if wealth_state.is_some() {
                    (monthly_contribution - debt_payment).max(0.0)
                } else {
                    monthly_contribution
                };
                if params.reinvest_freed_debt_payments
                    && wealth_state.is_some()
                    && total_debt <= 0.01
                    && scheduled_debt_service > 0.0
                {
                    invest_contribution = monthly_contribution + scheduled_debt_service;
                }
            }
        } else if let Some(state) = wealth_state.as_mut() {
            if debt_payment > 0.0 {
                state.investment_balance = (state.investment_balance - debt_payment).max(0.0);
            }
        }

        let next_investable = get_investable_balance(&wealth_state, balance) + invest_contribution;
        set_investable_balance(&mut wealth_state, &mut balance, next_investable);

        let monthly_return_rate =
            sample_monthly_return_rate(expected_monthly_return, volatility_percent, rng);
        accrued_income += get_investable_balance(&wealth_state, balance) * monthly_return_rate;

        let accrual_period_end = month % accrual.interval_months == 0 || month == months;
        if accrual_period_end && accrued_income != 0.0 {
            let next_balance = get_investable_balance(&wealth_state, balance) + accrued_income;
            set_investable_balance(&mut wealth_state, &mut balance, next_balance);
            accrued_income = 0.0;
        }

        sync_balance(&wealth_state, &mut balance);

        let withdrawal_configured = match withdrawal_mode {
            WithdrawalMode::Percent => annual_withdrawal_percent > 0.0,
            WithdrawalMode::Fixed => monthly_withdrawal_real > 0.0,
        };

        if in_withdrawal_phase && withdrawal_configured {
            let investable_before = get_investable_balance(&wealth_state, balance);
            let withdrawal_result = process_withdrawal(
                month,
                params,
                monthly_inflation,
                withdrawal_mode,
                monthly_withdrawal_real,
                monthly_withdrawal_from_annual,
                investable_before,
                cost_basis,
                &withdrawal_state,
            );
            set_investable_balance(
                &mut wealth_state,
                &mut balance,
                withdrawal_result.investable_after,
            );
            cost_basis -= withdrawal_result.cost_basis_reduced;
            if let Some(label) = withdrawal_result.withdrawal_start_label {
                withdrawal_state.withdrawal_start_label = Some(label);
            }
            if let Some(value) = withdrawal_result.withdrawal_start_liquidity {
                withdrawal_state.withdrawal_start_liquidity = Some(value);
            }
            sync_balance(&wealth_state, &mut balance);
        }

        if !in_withdrawal_phase {
            if params.adjust_contributions_for_inflation {
                monthly_contribution *= 1.0 + monthly_inflation;
            } else if month % 12 == 0 {
                monthly_contribution *= 1.0 + params.contribution_growth_percent / 100.0;
            }
        }

        balances.push(balance);
    }

    balances
}

pub fn run_monte_carlo_simulation(
    params: &CompoundParams,
    context: Option<&CompoundContext>,
    options: &MonteCarloOptions,
) -> Result<MonteCarloResult, CompoundError> {
    let simulations = options.simulations.unwrap_or(400).clamp(50, 2000);
    let volatility_percent = options.volatility_percent.unwrap_or(18.0).max(1.0);
    let seed = options.seed.unwrap_or(42);
    let as_of = match options.as_of.as_deref() {
        Some(value) => {
            CivilDate::parse_iso(value).map_err(|_| CompoundError::InvalidAsOf(value.to_owned()))?
        }
        None => CivilDate::parse_iso("2026-01-15").expect("default asOf"),
    };
    let months = (params.years * 12.0).round().max(1.0) as u32;

    let mut paths = Vec::with_capacity(simulations as usize);
    for sim in 0..simulations {
        let mut rng = mulberry32(seed.wrapping_add(sim.wrapping_mul(9973)));
        paths.push(simulate_random_path(
            params,
            context,
            &mut rng,
            volatility_percent,
            months,
            as_of,
        ));
    }

    let mut points = Vec::with_capacity(months as usize + 1);
    for month in 0..=months {
        let mut values: Vec<f64> = paths
            .iter()
            .map(|path| {
                *path
                    .get(month as usize)
                    .unwrap_or_else(|| path.last().unwrap_or(&0.0))
            })
            .collect();
        values.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
        points.push(MonteCarloPercentilePoint {
            month,
            p10: percentile(&values, 0.1),
            p25: percentile(&values, 0.25),
            p50: percentile(&values, 0.5),
            p75: percentile(&values, 0.75),
            p90: percentile(&values, 0.9),
        });
    }

    let mut final_values: Vec<f64> = paths
        .iter()
        .map(|path| *path.last().unwrap_or(&0.0))
        .collect();
    final_values
        .sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));

    Ok(MonteCarloResult {
        simulations,
        volatility_percent,
        points,
        final_balance: MonteCarloFinalBalance {
            p10: percentile(&final_values, 0.1),
            p25: percentile(&final_values, 0.25),
            p50: percentile(&final_values, 0.5),
            p75: percentile(&final_values, 0.75),
            p90: percentile(&final_values, 0.9),
        },
    })
}

fn get_investable_balance(state: &Option<WealthSimulationState>, balance: f64) -> f64 {
    state
        .as_ref()
        .map(|value| value.investment_balance)
        .unwrap_or(balance)
}

fn set_investable_balance(
    state: &mut Option<WealthSimulationState>,
    balance: &mut f64,
    value: f64,
) {
    if let Some(wealth) = state {
        wealth.investment_balance = value;
        *balance = get_net_worth(wealth);
    } else {
        *balance = value;
    }
}

fn sync_balance(state: &Option<WealthSimulationState>, balance: &mut f64) {
    if let Some(wealth) = state {
        *balance = get_net_worth(wealth);
    }
}
