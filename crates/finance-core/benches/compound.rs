//! Compound projection and Monte Carlo benchmarks.

use std::time::Instant;

use finance_core::{
    compound::types::{CompoundFrequency, MonthlyRateMethod, WithdrawalMode},
    compound::{
        calculate_compound_interest, run_monte_carlo_simulation, CompoundOptions, CompoundParams,
        MonteCarloOptions,
    },
};

fn base_params() -> CompoundParams {
    CompoundParams {
        initial_capital: 1_000_000.0,
        monthly_contribution: 60_000.0,
        annual_return_percent: 10.0,
        inflation_percent: 5.0,
        years: 30.0,
        tax_on_profit_percent: 13.0,
        contribution_growth_percent: 3.0,
        compound_frequency: CompoundFrequency::Monthly,
        monthly_rate_method: MonthlyRateMethod::Effective,
        adjust_contributions_for_inflation: false,
        reinvest_returns: true,
        withdraw_after_years: None,
        withdrawal_mode: WithdrawalMode::Fixed,
        monthly_withdrawal: 0.0,
        annual_withdrawal_percent: 4.0,
        tax_dividends: false,
        taxable_asset_share: 0.5,
        dividend_yield_percent: 9.5,
        reinvest_freed_debt_payments: false,
        debt_payments_separate_from_contribution: false,
    }
}

fn main() {
    let iterations = 500;
    let params = base_params();
    let options = CompoundOptions {
        all_months: true,
        as_of: Some("2026-01-15".to_owned()),
    };
    let _ = calculate_compound_interest(&params, None, &options).expect("compound");

    let started = Instant::now();
    for _ in 0..iterations {
        std::hint::black_box(
            calculate_compound_interest(&params, None, &options).expect("compound"),
        );
    }
    let compound_ms = started.elapsed().as_secs_f64() * 1000.0;

    let mc_options = MonteCarloOptions {
        simulations: Some(300),
        volatility_percent: Some(18.0),
        seed: Some(42),
        as_of: Some("2026-01-15".to_owned()),
    };
    let mc_iterations = 20;
    let _ = run_monte_carlo_simulation(&params, None, &mc_options).expect("monte carlo");

    let started = Instant::now();
    for _ in 0..mc_iterations {
        std::hint::black_box(
            run_monte_carlo_simulation(&params, None, &mc_options).expect("monte carlo"),
        );
    }
    let monte_carlo_ms = started.elapsed().as_secs_f64() * 1000.0;

    println!(
        "{}",
        serde_json::json!({
            "name": "finance-core-compound-benchmarks",
            "iterations": {
                "compound30y": iterations,
                "monteCarlo300x30y": mc_iterations,
            },
            "totalMs": {
                "compound30y": compound_ms,
                "monteCarlo300x30y": monte_carlo_ms,
            },
            "perIterationUs": {
                "compound30y": (compound_ms * 1000.0) / f64::from(iterations),
                "monteCarlo300x30y": (monte_carlo_ms * 1000.0) / f64::from(mc_iterations),
            }
        })
    );
}
