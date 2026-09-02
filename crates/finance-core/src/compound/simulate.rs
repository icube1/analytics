#![allow(clippy::ref_option, clippy::option_map_or_none, clippy::missing_errors_doc, clippy::assigning_clones, clippy::if_not_else, clippy::map_unwrap_or, clippy::needless_late_init, clippy::needless_pass_by_value, clippy::struct_excessive_bools, clippy::too_many_arguments)]
//! Deterministic compound projection mirroring `lib/compound-interest/simulate.ts`.

use crate::date::CivilDate;

use super::{
    irr::annualized_irr,
    rates::{get_accrual_period, monthly_rate_from_annual},
    snapshot::{build_snapshot, SnapshotInput},
    taxes::dividend_tax,
    types::{
        CompoundContext, CompoundOptions, CompoundParams, CompoundPoint, CompoundResult,
        WithdrawalMode,
    },
    wealth::{
        apply_custom_asset_income, get_monthly_debt_service, get_net_worth,
        get_total_debt_from_state, grow_custom_assets, init_wealth_simulation_state,
        step_debts_month, WealthSimulationState,
    },
    withdrawal::{mark_withdrawal_start_without_payout, process_withdrawal, WithdrawalState},
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CompoundError {
    InvalidAsOf(String),
}

impl std::fmt::Display for CompoundError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidAsOf(value) => write!(formatter, "invalid asOf date {value:?}"),
        }
    }
}

impl std::error::Error for CompoundError {}

pub fn calculate_compound_interest(
    params: &CompoundParams,
    context: Option<&CompoundContext>,
    options: &CompoundOptions,
) -> Result<CompoundResult, CompoundError> {
    let as_of = match options.as_of.as_deref() {
        Some(value) => {
            CivilDate::parse_iso(value).map_err(|_| CompoundError::InvalidAsOf(value.to_owned()))?
        }
        None => CivilDate::parse_iso("2026-01-15").expect("default asOf"),
    };

    let months = (params.years * 12.0).round().max(1.0) as u32;
    let rate_method = params.monthly_rate_method;
    let monthly_inflation = monthly_rate_from_annual(params.inflation_percent, rate_method);
    let accrual = get_accrual_period(params.compound_frequency, rate_method);
    let monthly_return_rate = monthly_rate_from_annual(params.annual_return_percent, rate_method);
    let monthly_return_percent = monthly_return_rate * 100.0;
    let monthly_return_percent_real =
        ((1.0 + monthly_return_rate) / (1.0 + monthly_inflation) - 1.0) * 100.0;

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
    let mut contributed = params.initial_capital;
    let mut real_contributed = params.initial_capital;
    let mut inflation_hurdle = params.initial_capital;
    let mut total_withdrawn = 0.0;
    let mut total_tax_paid = 0.0;
    let mut total_dividend_tax = 0.0;
    let mut total_withdrawal_tax = 0.0;
    let mut total_debt_principal_paid = 0.0;
    let mut monthly_contribution = params.monthly_contribution;
    let monthly_withdrawal_real = params.monthly_withdrawal;
    let withdrawal_mode = params.withdrawal_mode;
    let annual_withdrawal_percent = params.annual_withdrawal_percent;
    let monthly_withdrawal_from_annual = annual_withdrawal_percent / 12.0;

    let mut irr_flows = vec![Some(-params.initial_capital)];
    let mut last_withdrawal_payout_nominal = 0.0;
    let mut last_withdrawal_payout_real = 0.0;
    let mut withdrawal_last_payout_month: Option<u32> = None;
    let mut withdrawal_last_payout_label: Option<String> = None;
    let mut withdrawal_months_without_payout = 0;
    let mut withdrawal_months_liquidity_empty = 0;
    let mut withdrawal_liquidity_depleted_from_month: Option<u32> = None;
    let mut withdrawal_liquidity_depleted_from_label: Option<String> = None;
    let mut withdrawal_start_liquidity: Option<f64> = None;
    let mut withdrawal_start_payout_nominal = 0.0;
    let mut withdrawal_start_payout_real = 0.0;
    let mut withdrawal_start_label: Option<String> = None;
    let mut points = Vec::new();
    let mut accrued_income = 0.0;
    let mut months_in_accrual_period = 0u32;

    let scheduled_debt_service = context
        .map(|ctx| get_monthly_debt_service(&ctx.custom_assets))
        .unwrap_or(0.0);

    let mut withdrawal_state = WithdrawalState::default();

    points.push(make_snapshot(
        0,
        balance,
        contributed,
        real_contributed,
        inflation_hurdle,
        total_withdrawn,
        0.0,
        0.0,
        0.0,
        false,
        false,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        monthly_inflation,
        &wealth_state,
        context.map(|ctx| &ctx.custom_assets),
    ));

    for month in 1..=months {
        let mut month_payout_nominal = 0.0;
        let mut month_payout_real = 0.0;
        let mut month_payout_target_real = 0.0;
        let mut month_payout_capped = false;
        let mut debt_payment = 0.0;
        let mut debt_principal = 0.0;
        let mut debt_interest = 0.0;
        let mut month_broker_invest = 0.0;
        let mut month_debt_payment = 0.0;
        let mut month_debt_principal = 0.0;
        let mut month_debt_interest = 0.0;
        let mut month_wealth_building = 0.0;
        let mut month_cash_outflow = 0.0;
        let mut month_total_contribution = 0.0;

        if let (Some(state), Some(ctx)) = (&mut wealth_state, context) {
            let debt_step = step_debts_month(&ctx.custom_assets, state, as_of, Some(month));
            debt_payment = debt_step.total_payment;
            debt_principal = debt_step.total_principal;
            debt_interest = debt_step.total_interest;
            total_debt_principal_paid += debt_step.total_principal;
            grow_custom_assets(
                &ctx.custom_assets,
                state,
                params.inflation_percent,
                rate_method,
                as_of,
                Some(month),
            );
            let asset_income =
                apply_custom_asset_income(&ctx.custom_assets, state, params.reinvest_returns);
            if !params.reinvest_returns && asset_income > 0.0 {
                total_withdrawn += asset_income;
            }
        }

        let in_withdrawal_phase = withdrawal_start_month.is_some_and(|start| month > start);

        let total_debt = wealth_state
            .as_ref()
            .map(get_total_debt_from_state)
            .unwrap_or(0.0);
        let mut invest_contribution = 0.0;

        if !in_withdrawal_phase {
            if params.debt_payments_separate_from_contribution && wealth_state.is_some() {
                invest_contribution = monthly_contribution;
                if params.reinvest_freed_debt_payments
                    && total_debt <= 0.01
                    && scheduled_debt_service > 0.0
                {
                    invest_contribution = monthly_contribution + scheduled_debt_service;
                }
                let total_outflow = monthly_contribution + debt_payment;
                month_broker_invest = invest_contribution;
                month_debt_payment = debt_payment;
                month_debt_principal = debt_principal;
                month_debt_interest = debt_interest;
                month_wealth_building = invest_contribution + debt_principal;
                month_cash_outflow = total_outflow;
                month_total_contribution = total_outflow;
                contributed += total_outflow;
                cost_basis += invest_contribution;
                real_contributed += total_outflow
                    / (1.0 + monthly_inflation).powi(i32::try_from(month).unwrap_or(i32::MAX));
                push_irr_flow(&mut irr_flows, month, -total_outflow);
                inflation_hurdle = (inflation_hurdle + total_outflow) * (1.0 + monthly_inflation);
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
                month_broker_invest = invest_contribution;
                month_debt_payment = debt_payment;
                month_debt_principal = debt_principal;
                month_debt_interest = debt_interest;
                month_wealth_building = invest_contribution + debt_principal;
                month_cash_outflow = monthly_contribution;
                month_total_contribution = monthly_contribution;
                contributed += monthly_contribution;
                cost_basis += invest_contribution;
                real_contributed += monthly_contribution
                    / (1.0 + monthly_inflation).powi(i32::try_from(month).unwrap_or(i32::MAX));
                push_irr_flow(&mut irr_flows, month, -monthly_contribution);
                inflation_hurdle =
                    (inflation_hurdle + monthly_contribution) * (1.0 + monthly_inflation);
            }
        } else {
            inflation_hurdle *= 1.0 + monthly_inflation;
            if let Some(state) = wealth_state.as_mut() {
                if debt_payment > 0.0 {
                    state.investment_balance = (state.investment_balance - debt_payment).max(0.0);
                }
            }
        }

        let next_investable = get_investable_balance(&wealth_state, balance) + invest_contribution;
        set_investable_balance(&mut wealth_state, &mut balance, next_investable);

        accrued_income += get_investable_balance(&wealth_state, balance) * monthly_return_rate;
        months_in_accrual_period += 1;

        if month % accrual.interval_months == 0 || month == months {
            credit_accrued_income(
                &mut wealth_state,
                &mut balance,
                &mut accrued_income,
                months_in_accrual_period,
                params,
                &mut total_tax_paid,
                &mut total_dividend_tax,
            );
            months_in_accrual_period = 0;
        }

        sync_balance(&wealth_state, &mut balance);

        let withdrawal_configured = match withdrawal_mode {
            WithdrawalMode::Percent => annual_withdrawal_percent > 0.0,
            WithdrawalMode::Fixed => monthly_withdrawal_real > 0.0,
        };

        if in_withdrawal_phase && withdrawal_configured {
            let withdrawal_result = process_withdrawal(
                month,
                params,
                monthly_inflation,
                withdrawal_mode,
                monthly_withdrawal_real,
                monthly_withdrawal_from_annual,
                get_investable_balance(&wealth_state, balance),
                cost_basis,
                &withdrawal_state,
            );
            set_investable_balance(
                &mut wealth_state,
                &mut balance,
                withdrawal_result.investable_after,
            );
            sync_balance(&wealth_state, &mut balance);
            if withdrawal_result.net_payout > 0.0 {
                total_withdrawn += withdrawal_result.net_payout;
                push_irr_flow(&mut irr_flows, month, withdrawal_result.net_payout);
            }
            if withdrawal_result.tax > 0.0 {
                total_tax_paid += withdrawal_result.tax;
                total_withdrawal_tax += withdrawal_result.tax;
            }
            cost_basis -= withdrawal_result.cost_basis_reduced;
            month_payout_nominal = withdrawal_result.month_payout_nominal;
            month_payout_real = withdrawal_result.month_payout_real;
            month_payout_target_real = withdrawal_result.month_payout_target_real;
            month_payout_capped = withdrawal_result.month_payout_capped;
            withdrawal_months_without_payout +=
                withdrawal_result.withdrawal_months_without_payout_delta;
            withdrawal_months_liquidity_empty +=
                withdrawal_result.withdrawal_months_liquidity_empty_delta;
            if withdrawal_result
                .withdrawal_liquidity_depleted_from_label
                .is_some()
            {
                withdrawal_liquidity_depleted_from_month = Some(month);
                withdrawal_liquidity_depleted_from_label =
                    withdrawal_result.withdrawal_liquidity_depleted_from_label;
            }
            if withdrawal_result.last_withdrawal_payout_nominal.is_some() {
                last_withdrawal_payout_nominal = withdrawal_result
                    .last_withdrawal_payout_nominal
                    .unwrap_or(0.0);
                last_withdrawal_payout_real =
                    withdrawal_result.last_withdrawal_payout_real.unwrap_or(0.0);
                withdrawal_last_payout_month = withdrawal_result.withdrawal_last_payout_month;
                withdrawal_last_payout_label = withdrawal_result.withdrawal_last_payout_label;
            }
            if let Some(value) = withdrawal_result.withdrawal_start_liquidity {
                withdrawal_start_liquidity = Some(value);
            }
            if let Some(label) = withdrawal_result.withdrawal_start_label {
                withdrawal_start_label = Some(label);
                withdrawal_start_payout_nominal = withdrawal_result
                    .withdrawal_start_payout_nominal
                    .unwrap_or(0.0);
                withdrawal_start_payout_real = withdrawal_result
                    .withdrawal_start_payout_real
                    .unwrap_or(0.0);
            }
            withdrawal_state.withdrawal_start_liquidity = withdrawal_start_liquidity;
            withdrawal_state.withdrawal_start_payout_nominal = withdrawal_start_payout_nominal;
            withdrawal_state.withdrawal_start_payout_real = withdrawal_start_payout_real;
            withdrawal_state.withdrawal_start_label = withdrawal_start_label.clone();
            if withdrawal_liquidity_depleted_from_month.is_some() {
                withdrawal_state.withdrawal_liquidity_depleted_from_month =
                    withdrawal_liquidity_depleted_from_month;
                withdrawal_state.withdrawal_liquidity_depleted_from_label =
                    withdrawal_liquidity_depleted_from_label.clone();
            }
        } else if in_withdrawal_phase {
            if let Some(update) = mark_withdrawal_start_without_payout(
                get_investable_balance(&wealth_state, balance),
                month,
                &withdrawal_state,
            ) {
                withdrawal_start_liquidity = update.withdrawal_start_liquidity;
                withdrawal_start_label = update.withdrawal_start_label;
                withdrawal_state.withdrawal_start_liquidity = withdrawal_start_liquidity;
                withdrawal_state.withdrawal_start_label = withdrawal_start_label.clone();
            }
            withdrawal_months_without_payout += 1;
        }

        if !in_withdrawal_phase {
            if params.adjust_contributions_for_inflation {
                monthly_contribution *= 1.0 + monthly_inflation;
            } else if month % 12 == 0 {
                monthly_contribution *= 1.0 + params.contribution_growth_percent / 100.0;
            }
        }

        if month == months {
            push_irr_flow(&mut irr_flows, month, balance);
        }

        let step = (months / 48).max(1);
        let first_month_without_payout = withdrawal_last_payout_month.map(|value| value + 1);
        let first_withdrawal_month = withdrawal_start_month.map(|value| value + 1);
        let should_snapshot = options.all_months
            || month % step == 0
            || month == months
            || Some(month) == withdrawal_last_payout_month
            || Some(month) == first_month_without_payout
            || Some(month) == withdrawal_liquidity_depleted_from_month
            || Some(month) == first_withdrawal_month;

        if should_snapshot {
            points.push(make_snapshot(
                month,
                balance,
                contributed,
                real_contributed,
                inflation_hurdle,
                total_withdrawn,
                month_payout_nominal,
                month_payout_real,
                month_payout_target_real,
                in_withdrawal_phase,
                month_payout_capped,
                month_broker_invest,
                month_debt_payment,
                month_debt_principal,
                month_debt_interest,
                month_wealth_building,
                month_cash_outflow,
                month_total_contribution,
                monthly_inflation,
                &wealth_state,
                context.map(|ctx| &ctx.custom_assets),
            ));
        }
    }

    let withdrawal_ended_early = withdrawal_months_liquidity_empty > 0
        || (withdrawal_months_without_payout > 0
            && withdrawal_last_payout_month.is_some_and(|value| value < months));

    let last = points.last().expect("at least one snapshot");
    let final_balance = last.balance;
    let final_real_balance = last.real_balance;
    let total_contributed_last = last.contributed;
    let final_real_contributed = last.real_contributed;
    let total_profit = last.profit;
    let total_profit_after_tax = last.profit_after_tax;
    let final_total_debt = last.total_debt;
    let withdrawal_payout_nominal = last_withdrawal_payout_nominal;
    let withdrawal_payout_real = last_withdrawal_payout_real;

    Ok(CompoundResult {
        points,
        final_balance,
        final_real_balance,
        total_contributed: total_contributed_last,
        final_real_contributed,
        total_withdrawn,
        total_tax_paid,
        total_dividend_tax,
        total_withdrawal_tax,
        total_profit,
        total_profit_after_tax,
        effective_annual_return: annualized_irr(&irr_flows),
        real_annual_return: if final_real_contributed > 0.0 && months > 0 {
            ((final_real_balance / final_real_contributed).powf(12.0 / f64::from(months)) - 1.0)
                * 100.0
        } else {
            0.0
        },
        monthly_return_percent,
        monthly_return_percent_real,
        monthly_income_at_end: {
            let end_investable = wealth_state
                .as_ref()
                .map(|state| state.investment_balance)
                .unwrap_or(final_balance);
            end_investable * monthly_return_rate
        },
        monthly_income_real_at_end: {
            let end_inflation_factor =
                (1.0 + monthly_inflation).powi(i32::try_from(months).unwrap_or(i32::MAX));
            let end_investable = wealth_state
                .as_ref()
                .map(|state| state.investment_balance)
                .unwrap_or(final_balance);
            (end_investable * monthly_return_rate) / end_inflation_factor
        },
        final_total_debt,
        total_debt_principal_paid,
        withdrawal_payout_nominal,
        withdrawal_payout_real,
        withdrawal_last_payout_month,
        withdrawal_last_payout_label,
        withdrawal_ended_early,
        withdrawal_months_without_payout,
        withdrawal_months_liquidity_empty,
        withdrawal_liquidity_depleted_from_label,
        withdrawal_start_liquidity,
        withdrawal_start_payout_nominal,
        withdrawal_start_payout_real,
        withdrawal_start_label,
    })
}

#[allow(clippy::too_many_arguments)]
fn make_snapshot(
    month: u32,
    balance: f64,
    contributed: f64,
    real_contributed: f64,
    inflation_hurdle: f64,
    total_withdrawn: f64,
    month_payout_nominal: f64,
    month_payout_real: f64,
    month_payout_target_real: f64,
    in_withdrawal_phase: bool,
    month_payout_capped: bool,
    monthly_broker_invest: f64,
    monthly_debt_payment: f64,
    monthly_debt_principal: f64,
    monthly_debt_interest: f64,
    monthly_wealth_building: f64,
    monthly_cash_outflow: f64,
    monthly_total_contribution: f64,
    monthly_inflation: f64,
    wealth_state: &Option<WealthSimulationState>,
    custom_assets: Option<&super::types::CustomAssets>,
) -> CompoundPoint {
    build_snapshot(SnapshotInput {
        month,
        balance,
        contributed,
        real_contributed,
        inflation_hurdle,
        total_withdrawn,
        monthly_inflation,
        month_payout_nominal,
        month_payout_real,
        month_payout_target_real,
        in_withdrawal_phase,
        month_payout_capped,
        monthly_broker_invest,
        monthly_debt_payment,
        monthly_debt_principal,
        monthly_debt_interest,
        monthly_wealth_building,
        monthly_cash_outflow,
        monthly_total_contribution,
        investable_balance: get_investable_balance(wealth_state, balance),
        wealth_state: wealth_state.as_ref(),
        custom_assets,
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

fn credit_accrued_income(
    state: &mut Option<WealthSimulationState>,
    balance: &mut f64,
    accrued_income: &mut f64,
    months_in_period: u32,
    params: &CompoundParams,
    total_tax_paid: &mut f64,
    total_dividend_tax: &mut f64,
) {
    if *accrued_income <= 0.0 {
        return;
    }

    let income = *accrued_income;
    *accrued_income = 0.0;

    if params.reinvest_returns {
        let next_balance = get_investable_balance(state, *balance) + income;
        set_investable_balance(state, balance, next_balance);
        let div_tax = dividend_tax(next_balance, params, months_in_period);
        if div_tax > 0.0 {
            set_investable_balance(state, balance, next_balance - div_tax);
            *total_tax_paid += div_tax;
            *total_dividend_tax += div_tax;
        }
    } else {
        let investable = get_investable_balance(state, *balance);
        let div_tax = dividend_tax(investable, params, months_in_period);
        *total_tax_paid += div_tax;
        *total_dividend_tax += div_tax;
    }
}

fn push_irr_flow(flows: &mut Vec<Option<f64>>, month: u32, amount: f64) {
    let index = usize::try_from(month).unwrap_or(usize::MAX);
    if flows.len() <= index {
        flows.resize(index + 1, None);
    }
    let slot = flows.get_mut(index).expect("resized");
    *slot = Some(slot.unwrap_or(0.0) + amount);
}
