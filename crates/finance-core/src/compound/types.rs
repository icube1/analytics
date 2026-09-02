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
//! Compound projection input and output types mirroring the TypeScript engine.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MonthlyRateMethod {
    #[default]
    Effective,
    Simple,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CompoundFrequency {
    #[default]
    Monthly,
    Quarterly,
    Semiannual,
    Yearly,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WithdrawalMode {
    #[default]
    Fixed,
    Percent,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AssetReturnMode {
    #[default]
    None,
    Percent,
    Income,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AssetKind {
    #[default]
    Standard,
    Deposit,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DepositInterestMode {
    #[default]
    AtMaturity,
    MonthlyCapitalized,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AssetIncomePeriod {
    #[default]
    Monthly,
    Yearly,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompoundParams {
    pub initial_capital: f64,
    pub monthly_contribution: f64,
    pub annual_return_percent: f64,
    pub inflation_percent: f64,
    pub years: f64,
    pub tax_on_profit_percent: f64,
    pub contribution_growth_percent: f64,
    pub compound_frequency: CompoundFrequency,
    #[serde(default)]
    pub monthly_rate_method: MonthlyRateMethod,
    pub adjust_contributions_for_inflation: bool,
    pub reinvest_returns: bool,
    pub withdraw_after_years: Option<f64>,
    #[serde(default)]
    pub withdrawal_mode: WithdrawalMode,
    pub monthly_withdrawal: f64,
    #[serde(default)]
    pub annual_withdrawal_percent: f64,
    pub tax_dividends: bool,
    pub taxable_asset_share: f64,
    pub dividend_yield_percent: f64,
    pub reinvest_freed_debt_payments: bool,
    pub debt_payments_separate_from_contribution: bool,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAssetItem {
    pub id: String,
    pub enabled: bool,
    pub label: String,
    #[serde(default)]
    pub asset_kind: AssetKind,
    pub value: f64,
    pub debt: f64,
    pub monthly_debt_payment: f64,
    pub debt_annual_rate: f64,
    #[serde(default)]
    pub debt_payment_day: Option<f64>,
    pub grows_with_inflation: bool,
    pub return_mode: AssetReturnMode,
    pub annual_return_percent: f64,
    pub income_amount: f64,
    #[serde(default)]
    pub income_period: AssetIncomePeriod,
    pub generates_dividend_tax: bool,
    #[serde(default)]
    pub deposit_term_months: Option<u32>,
    #[serde(default)]
    pub deposit_opened_at: Option<String>,
    #[serde(default)]
    pub deposit_interest_mode: DepositInterestMode,
    #[serde(default)]
    pub notes: String,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebtObligation {
    pub id: String,
    pub enabled: bool,
    pub label: String,
    pub balance: f64,
    pub monthly_payment: f64,
    pub annual_interest_rate: f64,
    #[serde(default)]
    pub payment_day: Option<f64>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAssets {
    #[serde(default)]
    pub items: Vec<CustomAssetItem>,
    #[serde(default)]
    pub other_debts: Vec<DebtObligation>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompoundContext {
    pub broker_total: f64,
    pub custom_assets: CustomAssets,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompoundOptions {
    #[serde(default)]
    pub all_months: bool,
    #[serde(default)]
    pub as_of: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetBreakdownEntry {
    pub id: String,
    pub label: String,
    pub net_equity: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompoundPoint {
    pub month: u32,
    pub year: u32,
    pub label: String,
    pub balance: f64,
    pub real_balance: f64,
    pub contributed: f64,
    pub real_contributed: f64,
    pub inflation_hurdle: f64,
    pub withdrawn: f64,
    pub monthly_payout_nominal: f64,
    pub monthly_payout_real: f64,
    pub monthly_payout_target_real: f64,
    pub liquidity_balance: f64,
    pub in_withdrawal_phase: bool,
    pub monthly_payout_capped: bool,
    pub asset_breakdown: Vec<AssetBreakdownEntry>,
    pub total_debt: f64,
    pub monthly_broker_invest: f64,
    pub monthly_debt_payment: f64,
    pub monthly_debt_principal: f64,
    pub monthly_debt_interest: f64,
    pub monthly_wealth_building: f64,
    pub monthly_cash_outflow: f64,
    pub monthly_total_contribution: f64,
    pub profit: f64,
    pub profit_after_tax: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompoundResult {
    pub points: Vec<CompoundPoint>,
    pub final_balance: f64,
    pub final_real_balance: f64,
    pub total_contributed: f64,
    pub final_real_contributed: f64,
    pub total_withdrawn: f64,
    pub total_tax_paid: f64,
    pub total_dividend_tax: f64,
    pub total_withdrawal_tax: f64,
    pub total_profit: f64,
    pub total_profit_after_tax: f64,
    pub effective_annual_return: f64,
    pub real_annual_return: f64,
    pub monthly_return_percent: f64,
    pub monthly_return_percent_real: f64,
    pub monthly_income_at_end: f64,
    pub monthly_income_real_at_end: f64,
    pub final_total_debt: f64,
    pub total_debt_principal_paid: f64,
    pub withdrawal_payout_nominal: f64,
    pub withdrawal_payout_real: f64,
    pub withdrawal_last_payout_month: Option<u32>,
    pub withdrawal_last_payout_label: Option<String>,
    pub withdrawal_ended_early: bool,
    pub withdrawal_months_without_payout: u32,
    pub withdrawal_months_liquidity_empty: u32,
    pub withdrawal_liquidity_depleted_from_label: Option<String>,
    pub withdrawal_start_liquidity: Option<f64>,
    pub withdrawal_start_payout_nominal: f64,
    pub withdrawal_start_payout_real: f64,
    pub withdrawal_start_label: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonteCarloOptions {
    #[serde(default)]
    pub simulations: Option<u32>,
    #[serde(default)]
    pub volatility_percent: Option<f64>,
    #[serde(default)]
    pub seed: Option<u32>,
    #[serde(default)]
    pub as_of: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonteCarloPercentilePoint {
    pub month: u32,
    pub p10: f64,
    pub p25: f64,
    pub p50: f64,
    pub p75: f64,
    pub p90: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonteCarloFinalBalance {
    pub p10: f64,
    pub p25: f64,
    pub p50: f64,
    pub p75: f64,
    pub p90: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonteCarloResult {
    pub simulations: u32,
    pub volatility_percent: f64,
    pub points: Vec<MonteCarloPercentilePoint>,
    pub final_balance: MonteCarloFinalBalance,
}

pub const UNSUPPORTED_COMPOUND_FIELDS: &[&str] = &[
    "brokerReport",
    "forecastPlans",
    "brokerSnapshots",
    "debtBalanceHistory",
];
