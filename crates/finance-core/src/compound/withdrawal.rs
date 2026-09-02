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
//! Withdrawal phase logic mirroring `lib/compound-interest/withdrawal.ts`.

use super::{
    taxes::withdrawal_gain_tax,
    types::{CompoundParams, WithdrawalMode},
};

pub const LIQUIDITY_EPS: f64 = 0.01;

pub fn format_month_label(month: u32) -> String {
    format!("{}г {}м", month / 12, month % 12)
}

#[derive(Clone, Debug, Default)]
pub struct WithdrawalState {
    pub withdrawal_start_liquidity: Option<f64>,
    pub withdrawal_start_payout_nominal: f64,
    pub withdrawal_start_payout_real: f64,
    pub withdrawal_start_label: Option<String>,
    pub withdrawal_liquidity_depleted_from_month: Option<u32>,
    pub withdrawal_liquidity_depleted_from_label: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct WithdrawalMonthResult {
    pub month_payout_nominal: f64,
    pub month_payout_real: f64,
    pub month_payout_target_real: f64,
    pub month_payout_capped: bool,
    pub withdrawal_months_without_payout_delta: u32,
    pub withdrawal_months_liquidity_empty_delta: u32,
    pub withdrawal_liquidity_depleted_from_label: Option<String>,
    pub last_withdrawal_payout_nominal: Option<f64>,
    pub last_withdrawal_payout_real: Option<f64>,
    pub withdrawal_last_payout_month: Option<u32>,
    pub withdrawal_last_payout_label: Option<String>,
    pub withdrawal_start_liquidity: Option<f64>,
    pub withdrawal_start_payout_nominal: Option<f64>,
    pub withdrawal_start_payout_real: Option<f64>,
    pub withdrawal_start_label: Option<String>,
    pub investable_after: f64,
    pub net_payout: f64,
    pub tax: f64,
    pub cost_basis_reduced: f64,
}

pub fn process_withdrawal(
    month: u32,
    params: &CompoundParams,
    monthly_inflation: f64,
    withdrawal_mode: WithdrawalMode,
    monthly_withdrawal_real: f64,
    monthly_withdrawal_from_annual: f64,
    investable_before: f64,
    cost_basis: f64,
    state: &WithdrawalState,
) -> WithdrawalMonthResult {
    let inflation_factor = (1.0 + monthly_inflation).powi(i32::try_from(month).unwrap_or(i32::MAX));
    let mut month_payout_nominal = 0.0;
    let mut month_payout_real = 0.0;
    let month_payout_target_real;
    let month_payout_capped;
    let mut withdrawal_months_without_payout_delta = 0;
    let mut withdrawal_months_liquidity_empty_delta = 0;
    let mut withdrawal_liquidity_depleted_from_label = None;
    let mut last_withdrawal_payout_nominal = None;
    let mut last_withdrawal_payout_real = None;
    let mut withdrawal_last_payout_month = None;
    let mut withdrawal_last_payout_label = None;
    let mut withdrawal_start_liquidity = state.withdrawal_start_liquidity;
    let mut withdrawal_start_payout_nominal = None;
    let mut withdrawal_start_payout_real = None;
    let mut withdrawal_start_label = None;
    let mut investable_after = investable_before;
    let mut net_payout = 0.0;
    let mut tax = 0.0;
    let mut cost_basis_reduced = 0.0;

    if withdrawal_start_liquidity.is_none() {
        withdrawal_start_liquidity = Some(investable_before);
    }

    let target_payout = match withdrawal_mode {
        WithdrawalMode::Percent => investable_before * (monthly_withdrawal_from_annual / 100.0),
        WithdrawalMode::Fixed => monthly_withdrawal_real * inflation_factor,
    };
    month_payout_target_real = match withdrawal_mode {
        WithdrawalMode::Percent => target_payout / inflation_factor,
        WithdrawalMode::Fixed => monthly_withdrawal_real,
    };
    let payout = target_payout.min(investable_before);
    month_payout_capped = match withdrawal_mode {
        WithdrawalMode::Percent => target_payout > investable_before + LIQUIDITY_EPS,
        WithdrawalMode::Fixed => target_payout > LIQUIDITY_EPS && payout <= LIQUIDITY_EPS,
    };

    if investable_before <= LIQUIDITY_EPS {
        withdrawal_months_liquidity_empty_delta = 1;
        if state.withdrawal_liquidity_depleted_from_month.is_none() {
            withdrawal_liquidity_depleted_from_label = Some(format_month_label(month));
        }
    }

    let withdrawal_failed = match withdrawal_mode {
        WithdrawalMode::Fixed => target_payout > LIQUIDITY_EPS && payout <= LIQUIDITY_EPS,
        WithdrawalMode::Percent => investable_before <= LIQUIDITY_EPS,
    };

    if payout > LIQUIDITY_EPS {
        let tax_result = withdrawal_gain_tax(
            investable_before,
            cost_basis,
            payout,
            params.tax_on_profit_percent,
        );
        investable_after = investable_before - payout;
        if tax_result.tax > 0.0 {
            investable_after -= tax_result.tax;
            tax = tax_result.tax;
        }
        net_payout = payout - tax_result.tax;
        cost_basis_reduced = tax_result.principal_returned;
        month_payout_nominal = net_payout;
        month_payout_real = net_payout / inflation_factor;
        last_withdrawal_payout_nominal = Some(month_payout_nominal);
        last_withdrawal_payout_real = Some(month_payout_real);
        withdrawal_last_payout_month = Some(month);
        withdrawal_last_payout_label = Some(format_month_label(month));
    } else if withdrawal_failed {
        withdrawal_months_without_payout_delta = 1;
    }

    if state.withdrawal_start_label.is_none() {
        withdrawal_start_label = Some(format_month_label(month));
        withdrawal_start_payout_nominal = Some(month_payout_nominal);
        withdrawal_start_payout_real = Some(month_payout_real);
    }

    WithdrawalMonthResult {
        month_payout_nominal,
        month_payout_real,
        month_payout_target_real,
        month_payout_capped,
        withdrawal_months_without_payout_delta,
        withdrawal_months_liquidity_empty_delta,
        withdrawal_liquidity_depleted_from_label,
        last_withdrawal_payout_nominal,
        last_withdrawal_payout_real,
        withdrawal_last_payout_month,
        withdrawal_last_payout_label,
        withdrawal_start_liquidity,
        withdrawal_start_payout_nominal,
        withdrawal_start_payout_real,
        withdrawal_start_label,
        investable_after,
        net_payout,
        tax,
        cost_basis_reduced,
    }
}

pub fn mark_withdrawal_start_without_payout(
    investable_balance: f64,
    month: u32,
    state: &WithdrawalState,
) -> Option<WithdrawalState> {
    if state.withdrawal_start_liquidity.is_some() {
        return None;
    }
    Some(WithdrawalState {
        withdrawal_start_liquidity: Some(investable_balance),
        withdrawal_start_label: Some(format_month_label(month)),
        ..WithdrawalState::default()
    })
}
