#![allow(
    clippy::ref_option,
    clippy::option_map_or_none,
    clippy::missing_errors_doc,
    clippy::assigning_clones,
    clippy::if_not_else,
    clippy::map_unwrap_or,
    clippy::needless_late_init,
    clippy::needless_pass_by_value,
    clippy::struct_excessive_bools,
    clippy::too_many_arguments
)]
//! Portfolio wealth simulation mirroring `lib/debt-amortization.ts` wealth helpers.

use std::collections::HashMap;

use crate::{
    date::CivilDate,
    debt::{amortize_debt_month, current_payment_period_days, simulation_payment_period_days},
};

use super::{
    deposits::{
        deposit_matures_in_simulation_month, estimate_deposit_maturity_value, is_deposit_active,
        is_deposit_item,
    },
    types::{
        AssetIncomePeriod, AssetReturnMode, CustomAssetItem, CustomAssets, DebtObligation,
        DepositInterestMode, MonthlyRateMethod,
    },
};

pub const LIQUID_ASSET_ID: &str = "__liquid";
pub const LIQUID_ASSET_LABEL: &str = "Брокер / ликвид";

#[derive(Clone, Debug)]
pub struct SimulatedAssetItem {
    pub id: String,
    pub gross_value: f64,
    pub debt_balance: f64,
    pub deposit_principal: Option<f64>,
    pub deposit_matured: Option<bool>,
}

#[derive(Clone, Debug)]
pub struct WealthSimulationState {
    pub investment_balance: f64,
    pub asset_items: Vec<SimulatedAssetItem>,
    pub other_debts: Vec<f64>,
}

#[derive(Clone, Debug, Default)]
pub struct DebtMonthResult {
    pub total_payment: f64,
    pub total_principal: f64,
    pub total_interest: f64,
}

fn resolve_payment_day(payment_day: Option<f64>) -> f64 {
    payment_day.unwrap_or(6.0)
}

pub fn get_enabled_items(assets: &CustomAssets) -> Vec<&CustomAssetItem> {
    assets.items.iter().filter(|item| item.enabled).collect()
}

pub fn get_enabled_debts(assets: &CustomAssets) -> Vec<&DebtObligation> {
    assets
        .other_debts
        .iter()
        .filter(|debt| debt.enabled && (debt.balance > 0.0 || debt.monthly_payment > 0.0))
        .collect()
}

fn get_asset_debt_items(assets: &CustomAssets) -> Vec<&CustomAssetItem> {
    get_enabled_items(assets)
        .into_iter()
        .filter(|item| item.debt > 0.0 || item.monthly_debt_payment > 0.0)
        .collect()
}

pub fn get_monthly_debt_service(assets: &CustomAssets) -> f64 {
    let mut total = 0.0;
    for item in get_asset_debt_items(assets) {
        if item.monthly_debt_payment > 0.0 {
            total += item.monthly_debt_payment;
        }
    }
    for debt in get_enabled_debts(assets) {
        total += debt.monthly_payment;
    }
    total
}

pub fn init_wealth_simulation_state(
    assets: &CustomAssets,
    broker_total: f64,
    as_of: CivilDate,
) -> WealthSimulationState {
    WealthSimulationState {
        investment_balance: broker_total,
        asset_items: get_enabled_items(assets)
            .into_iter()
            .map(|item| SimulatedAssetItem {
                id: item.id.clone(),
                gross_value: item.value,
                debt_balance: item.debt,
                deposit_principal: if is_deposit_item(item) {
                    Some(item.value)
                } else {
                    None
                },
                deposit_matured: if is_deposit_item(item) {
                    Some(!is_deposit_active(item, as_of))
                } else {
                    None
                },
            })
            .collect(),
        other_debts: get_enabled_debts(assets)
            .into_iter()
            .map(|debt| debt.balance)
            .collect(),
    }
}

pub fn get_total_debt_from_state(state: &WealthSimulationState) -> f64 {
    let asset_debt: f64 = state.asset_items.iter().map(|item| item.debt_balance).sum();
    let other_debt: f64 = state.other_debts.iter().sum();
    asset_debt + other_debt
}

pub fn get_net_worth(state: &WealthSimulationState) -> f64 {
    let tracked_net: f64 = state
        .asset_items
        .iter()
        .map(|item| item.gross_value - item.debt_balance)
        .sum();
    let other_debt: f64 = state.other_debts.iter().sum();
    state.investment_balance + tracked_net - other_debt
}

pub fn step_debts_month(
    assets: &CustomAssets,
    state: &mut WealthSimulationState,
    as_of: CivilDate,
    simulation_month: Option<u32>,
) -> DebtMonthResult {
    let mut total_payment = 0.0;
    let mut total_principal = 0.0;
    let mut total_interest = 0.0;
    let asset_debt_items = get_asset_debt_items(assets);

    for sim in &mut state.asset_items {
        let Some(item) = asset_debt_items
            .iter()
            .find(|candidate| candidate.id == sim.id)
        else {
            continue;
        };
        if sim.debt_balance <= 0.0 || item.monthly_debt_payment <= 0.0 {
            continue;
        }

        let payment_day = resolve_payment_day(item.debt_payment_day);
        let period_days = match simulation_month {
            Some(month) => simulation_payment_period_days(
                as_of,
                i32::try_from(month).unwrap_or(1),
                payment_day,
            ),
            None => current_payment_period_days(payment_day, as_of),
        };

        let step = amortize_debt_month(
            sim.debt_balance,
            item.monthly_debt_payment,
            item.debt_annual_rate,
            Some(period_days as f64),
        );
        sim.debt_balance = step.balance;
        total_payment += item.monthly_debt_payment;
        total_principal += step.principal;
        total_interest += step.interest;
    }

    let enabled_debts = get_enabled_debts(assets);
    for (index, debt) in enabled_debts.iter().enumerate() {
        if state.other_debts[index] <= 0.0 || debt.monthly_payment <= 0.0 {
            continue;
        }

        let payment_day = resolve_payment_day(debt.payment_day);
        let period_days = match simulation_month {
            Some(month) => simulation_payment_period_days(
                as_of,
                i32::try_from(month).unwrap_or(1),
                payment_day,
            ),
            None => current_payment_period_days(payment_day, as_of),
        };

        let step = amortize_debt_month(
            state.other_debts[index],
            debt.monthly_payment,
            debt.annual_interest_rate,
            Some(period_days as f64),
        );
        state.other_debts[index] = step.balance;
        total_payment += debt.monthly_payment;
        total_principal += step.principal;
        total_interest += step.interest;
    }

    DebtMonthResult {
        total_payment,
        total_principal,
        total_interest,
    }
}

fn monthly_rate_from_annual(annual_return_percent: f64, rate_method: MonthlyRateMethod) -> f64 {
    match rate_method {
        MonthlyRateMethod::Simple => annual_return_percent / 100.0 / 12.0,
        MonthlyRateMethod::Effective => {
            (1.0 + annual_return_percent / 100.0).powf(1.0 / 12.0) - 1.0
        }
    }
}

fn get_asset_capital_growth_percent_active(
    item: &CustomAssetItem,
    inflation_percent: f64,
    as_of: CivilDate,
) -> f64 {
    if is_deposit_item(item) {
        if !is_deposit_active(item, as_of) {
            return 0.0;
        }
        if matches!(item.deposit_interest_mode, DepositInterestMode::AtMaturity) {
            return 0.0;
        }
        return item.annual_return_percent;
    }
    if item.grows_with_inflation {
        return inflation_percent;
    }
    if matches!(item.return_mode, AssetReturnMode::Percent) {
        return item.annual_return_percent;
    }
    0.0
}

fn get_asset_annual_income(item: &CustomAssetItem) -> f64 {
    if !item.enabled
        || !matches!(item.return_mode, AssetReturnMode::Income)
        || item.income_amount <= 0.0
    {
        return 0.0;
    }
    match item.income_period {
        AssetIncomePeriod::Monthly => item.income_amount * 12.0,
        AssetIncomePeriod::Yearly => item.income_amount,
    }
}

pub fn get_asset_monthly_income(item: &CustomAssetItem) -> f64 {
    get_asset_annual_income(item) / 12.0
}

pub fn grow_custom_assets(
    assets: &CustomAssets,
    state: &mut WealthSimulationState,
    inflation_percent: f64,
    rate_method: MonthlyRateMethod,
    as_of: CivilDate,
    simulation_month: Option<u32>,
) {
    let item_by_id: HashMap<&str, &CustomAssetItem> = assets
        .items
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect();

    for sim in &mut state.asset_items {
        if sim.deposit_matured == Some(true) {
            continue;
        }

        let Some(item) = item_by_id.get(sim.id.as_str()) else {
            continue;
        };

        if is_deposit_item(item) {
            if !is_deposit_active(item, as_of) && simulation_month.is_none() {
                sim.deposit_matured = Some(true);
                sim.gross_value = 0.0;
                continue;
            }

            if let Some(month) = simulation_month {
                if deposit_matures_in_simulation_month(item, as_of, month) {
                    let principal = sim.deposit_principal.unwrap_or(sim.gross_value);
                    let term_months = item.deposit_term_months.unwrap_or(0);
                    let payout = estimate_deposit_maturity_value(
                        principal,
                        item.annual_return_percent,
                        term_months,
                        item.deposit_interest_mode,
                        rate_method,
                    );
                    state.investment_balance += payout;
                    sim.gross_value = 0.0;
                    sim.deposit_matured = Some(true);
                    continue;
                }
            }

            if sim.gross_value <= 0.0 {
                continue;
            }

            let annual_growth =
                get_asset_capital_growth_percent_active(item, inflation_percent, as_of);
            if annual_growth <= 0.0 {
                continue;
            }
            let monthly_rate = monthly_rate_from_annual(annual_growth, rate_method);
            sim.gross_value *= 1.0 + monthly_rate;
            continue;
        }

        if sim.gross_value <= 0.0 {
            continue;
        }

        let annual_growth = get_asset_capital_growth_percent_active(item, inflation_percent, as_of);
        if annual_growth <= 0.0 {
            continue;
        }
        let monthly_rate = monthly_rate_from_annual(annual_growth, rate_method);
        sim.gross_value *= 1.0 + monthly_rate;
    }
}

pub fn apply_custom_asset_income(
    assets: &CustomAssets,
    state: &mut WealthSimulationState,
    reinvest_returns: bool,
) -> f64 {
    let mut total_income = 0.0;
    for item in get_enabled_items(assets) {
        if !matches!(item.return_mode, AssetReturnMode::Income) {
            continue;
        }
        let monthly = get_asset_monthly_income(item);
        if monthly <= 0.0 {
            continue;
        }
        total_income += monthly;
        if reinvest_returns {
            state.investment_balance += monthly;
        }
    }
    total_income
}
