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
//! Snapshot builder mirroring `lib/compound-interest/snapshot.ts`.

use super::{
    types::{AssetBreakdownEntry, CompoundPoint, CustomAssets},
    wealth::{
        get_total_debt_from_state, WealthSimulationState, LIQUID_ASSET_ID, LIQUID_ASSET_LABEL,
    },
};

pub struct SnapshotInput<'a> {
    pub month: u32,
    pub balance: f64,
    pub contributed: f64,
    pub real_contributed: f64,
    pub inflation_hurdle: f64,
    pub total_withdrawn: f64,
    pub monthly_inflation: f64,
    pub month_payout_nominal: f64,
    pub month_payout_real: f64,
    pub month_payout_target_real: f64,
    pub in_withdrawal_phase: bool,
    pub month_payout_capped: bool,
    pub monthly_broker_invest: f64,
    pub monthly_debt_payment: f64,
    pub monthly_debt_principal: f64,
    pub monthly_debt_interest: f64,
    pub monthly_wealth_building: f64,
    pub monthly_cash_outflow: f64,
    pub monthly_total_contribution: f64,
    pub investable_balance: f64,
    pub wealth_state: Option<&'a WealthSimulationState>,
    pub custom_assets: Option<&'a CustomAssets>,
}

pub fn build_snapshot(input: SnapshotInput<'_>) -> CompoundPoint {
    let inflation_factor =
        (1.0 + input.monthly_inflation).powi(i32::try_from(input.month).unwrap_or(i32::MAX));
    let net_wealth = input.balance + input.total_withdrawn;
    let profit = net_wealth - input.contributed;
    let total_debt = input
        .wealth_state
        .map(get_total_debt_from_state)
        .unwrap_or(0.0);
    let liquidity_balance = input.investable_balance;
    let mut asset_breakdown = Vec::new();

    if let (Some(state), Some(assets)) = (input.wealth_state, input.custom_assets) {
        asset_breakdown.push(AssetBreakdownEntry {
            id: LIQUID_ASSET_ID.to_owned(),
            label: LIQUID_ASSET_LABEL.to_owned(),
            net_equity: state.investment_balance,
        });
        for sim in &state.asset_items {
            let label = assets
                .items
                .iter()
                .find(|item| item.id == sim.id)
                .map(|item| item.label.clone())
                .unwrap_or_else(|| sim.id.clone());
            asset_breakdown.push(AssetBreakdownEntry {
                id: sim.id.clone(),
                label,
                net_equity: sim.gross_value - sim.debt_balance,
            });
        }
    }

    CompoundPoint {
        month: input.month,
        year: input.month / 12,
        label: if input.month == 0 {
            "Старт".to_owned()
        } else {
            format!("{}г {}м", input.month / 12, input.month % 12)
        },
        balance: input.balance,
        real_balance: input.balance / inflation_factor,
        contributed: input.contributed,
        real_contributed: input.real_contributed,
        inflation_hurdle: input.inflation_hurdle,
        withdrawn: input.total_withdrawn,
        monthly_payout_nominal: input.month_payout_nominal,
        monthly_payout_real: input.month_payout_real,
        monthly_payout_target_real: input.month_payout_target_real,
        liquidity_balance,
        in_withdrawal_phase: input.in_withdrawal_phase,
        monthly_payout_capped: input.month_payout_capped,
        asset_breakdown,
        total_debt,
        monthly_broker_invest: input.monthly_broker_invest,
        monthly_debt_payment: input.monthly_debt_payment,
        monthly_debt_principal: input.monthly_debt_principal,
        monthly_debt_interest: input.monthly_debt_interest,
        monthly_wealth_building: input.monthly_wealth_building,
        monthly_cash_outflow: input.monthly_cash_outflow,
        monthly_total_contribution: input.monthly_total_contribution,
        profit,
        profit_after_tax: profit,
    }
}
