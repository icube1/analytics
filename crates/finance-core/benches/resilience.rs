//! Resilience planning benchmarks.

use std::time::Instant;

use finance_core::resilience::{
    evaluate_resilience, DebtRiskInput, ExperiencesFundInput, HouseholdRiskInput, IncomeStability,
    InsuranceCoverage, ResilienceInput, RiskTolerance, SinkingFundGoal,
};

fn sample_input() -> ResilienceInput {
    ResilienceInput {
        mandatory_monthly_expenses: 120_000.0,
        discretionary_monthly_expenses: 30_000.0,
        liquid_assets: 400_000.0,
        monthly_surplus: 25_000.0,
        pay_cycle_days: 30.0,
        household: HouseholdRiskInput {
            income_stability: IncomeStability::Variable,
            income_source_count: 1,
            has_secondary_household_income: false,
            dependent_count: 2,
            job_search_months: 4,
            insurance_coverage: InsuranceCoverage::Medium,
            risk_tolerance: RiskTolerance::Moderate,
        },
        debt: DebtRiskInput {
            total_balance: 900_000.0,
            monthly_payments: 45_000.0,
            weighted_annual_rate: 14.0,
            high_interest_balance: 200_000.0,
        },
        sinking_funds: vec![
            SinkingFundGoal {
                id: "car".to_owned(),
                label: "Car".to_owned(),
                target_amount: 60_000.0,
                current_amount: 10_000.0,
                months_until_due: 6,
                priority: 1,
            },
            SinkingFundGoal {
                id: "tax".to_owned(),
                label: "Tax".to_owned(),
                target_amount: 80_000.0,
                current_amount: 0.0,
                months_until_due: 8,
                priority: 2,
            },
        ],
        experiences: ExperiencesFundInput {
            annual_target: 120_000.0,
            current_amount: 20_000.0,
        },
    }
}

fn main() {
    let input = sample_input();
    let iterations = 5_000;
    let _ = evaluate_resilience(&input);

    let started = Instant::now();
    for _ in 0..iterations {
        std::hint::black_box(evaluate_resilience(&input));
    }
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    let plan = evaluate_resilience(&input);

    println!(
        "{}",
        serde_json::json!({
            "name": "resilience-plan-evaluate",
            "iterations": iterations,
            "totalMs": elapsed_ms,
            "perIterationUs": (elapsed_ms * 1000.0) / f64::from(iterations),
            "output": {
                "riskScore": plan.risk.score,
                "allLayersRecommended": plan.totals.all_layers_recommended,
                "stressScenarios": plan.stress.len(),
            }
        })
    );
}
