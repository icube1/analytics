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
//! Tax helpers mirroring `lib/compound-interest/taxes.ts`.

use super::types::CompoundParams;

pub fn dividend_tax(balance: f64, params: &CompoundParams, months_in_period: u32) -> f64 {
    if !params.tax_dividends
        || params.tax_on_profit_percent <= 0.0
        || params.taxable_asset_share <= 0.0
        || params.dividend_yield_percent <= 0.0
    {
        return 0.0;
    }

    let dividend_income = balance
        * params.taxable_asset_share
        * (params.dividend_yield_percent / 100.0)
        * (f64::from(months_in_period) / 12.0);

    dividend_income * (params.tax_on_profit_percent / 100.0)
}

pub struct WithdrawalGainTax {
    pub tax: f64,
    pub principal_returned: f64,
}

pub fn withdrawal_gain_tax(
    balance: f64,
    cost_basis: f64,
    payout: f64,
    tax_rate_percent: f64,
) -> WithdrawalGainTax {
    let gain = (balance - cost_basis).max(0.0);
    let gain_ratio = if balance > 0.0 { gain / balance } else { 0.0 };
    let taxable_gain = payout * gain_ratio;
    let tax = taxable_gain * (tax_rate_percent / 100.0);
    let principal_returned = payout - taxable_gain;
    WithdrawalGainTax {
        tax,
        principal_returned,
    }
}
