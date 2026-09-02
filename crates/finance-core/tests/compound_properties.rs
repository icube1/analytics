use finance_core::{
    compound::types::{
        AssetReturnMode, CompoundFrequency, CustomAssetItem, CustomAssets, MonthlyRateMethod,
        WithdrawalMode,
    },
    compound::{
        calculate_compound_interest, run_monte_carlo_simulation, CompoundContext, CompoundOptions,
        CompoundParams, MonteCarloOptions,
    },
};
use proptest::prelude::*;

fn base_params() -> CompoundParams {
    CompoundParams {
        initial_capital: 100_000.0,
        monthly_contribution: 10_000.0,
        annual_return_percent: 8.0,
        inflation_percent: 4.0,
        years: 5.0,
        tax_on_profit_percent: 0.0,
        contribution_growth_percent: 0.0,
        compound_frequency: CompoundFrequency::Monthly,
        monthly_rate_method: MonthlyRateMethod::Effective,
        adjust_contributions_for_inflation: false,
        reinvest_returns: true,
        withdraw_after_years: None,
        withdrawal_mode: WithdrawalMode::Fixed,
        monthly_withdrawal: 0.0,
        annual_withdrawal_percent: 0.0,
        tax_dividends: false,
        taxable_asset_share: 0.5,
        dividend_yield_percent: 0.0,
        reinvest_freed_debt_payments: false,
        debt_payments_separate_from_contribution: false,
    }
}

proptest! {
    #[test]
    fn compound_final_balance_is_non_negative(
        years in 1.0f64..15.0,
        contribution in 0.0f64..50_000.0,
        annual_return in 0.0f64..20.0,
    ) {
        let mut params = base_params();
        params.years = years;
        params.monthly_contribution = contribution;
        params.annual_return_percent = annual_return;
        let options = CompoundOptions {
            all_months: false,
            as_of: Some("2026-01-15".to_owned()),
        };
        let result = calculate_compound_interest(&params, None, &options).expect("compound");
        prop_assert!(result.final_balance >= 0.0);
        prop_assert!(!result.points.is_empty());
    }

    #[test]
    fn monte_carlo_percentiles_are_ordered(
        simulations in 60u32..120,
        volatility in 5.0f64..25.0,
    ) {
        let params = base_params();
        let options = MonteCarloOptions {
            simulations: Some(simulations),
            volatility_percent: Some(volatility),
            seed: Some(42),
            as_of: Some("2026-01-15".to_owned()),
        };
        let result = run_monte_carlo_simulation(&params, None, &options).expect("monte carlo");
        for point in &result.points {
            prop_assert!(point.p10 <= point.p25);
            prop_assert!(point.p25 <= point.p50);
            prop_assert!(point.p50 <= point.p75);
            prop_assert!(point.p75 <= point.p90);
        }
    }

    #[test]
    fn household_context_preserves_asset_breakdown(
        debt in 100_000.0f64..2_000_000.0,
    ) {
        let mut params = base_params();
        params.initial_capital = debt + 500_000.0;
        let context = CompoundContext {
            broker_total: 200_000.0,
            custom_assets: CustomAssets {
                items: vec![CustomAssetItem {
                    id: "home".to_owned(),
                    enabled: true,
                    label: "Home".to_owned(),
                    asset_kind: finance_core::compound::types::AssetKind::Standard,
                    value: debt + 300_000.0,
                    debt,
                    monthly_debt_payment: 20_000.0,
                    debt_annual_rate: 10.0,
                    debt_payment_day: Some(6.0),
                    grows_with_inflation: false,
                    return_mode: AssetReturnMode::None,
                    annual_return_percent: 0.0,
                    income_amount: 0.0,
                    income_period: finance_core::compound::types::AssetIncomePeriod::Monthly,
                    generates_dividend_tax: false,
                    deposit_term_months: None,
                    deposit_opened_at: None,
                    deposit_interest_mode: finance_core::compound::types::DepositInterestMode::AtMaturity,
                    notes: String::new(),
                }],
                other_debts: vec![],
            },
        };
        let options = CompoundOptions {
            all_months: true,
            as_of: Some("2026-01-15".to_owned()),
        };
        let result = calculate_compound_interest(&params, Some(&context), &options).expect("compound");
        let last = result.points.last().expect("points");
        prop_assert!(last.asset_breakdown.len() >= 2);
        prop_assert!(last.total_debt <= debt + 1.0);
    }
}
