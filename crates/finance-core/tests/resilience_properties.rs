use finance_core::resilience::{
    compute_layers, evaluate_resilience, DebtRiskInput, ExperiencesFundInput, HouseholdRiskInput,
    IncomeStability, InsuranceCoverage, ResilienceInput, RiskTolerance, SinkingFundGoal,
};
use proptest::prelude::*;

fn resilience_input_strategy() -> impl Strategy<Value = ResilienceInput> {
    (
        (
            1_000.0f64..500_000.0,
            0.0f64..200_000.0,
            0.0f64..5_000_000.0,
            0.0f64..100_000.0,
            7.0f64..45.0,
        ),
        (
            prop_oneof![
                Just(IncomeStability::Stable),
                Just(IncomeStability::Variable),
                Just(IncomeStability::Seasonal),
            ],
            1u8..=4,
            any::<bool>(),
            0u8..=5,
            1u8..=12,
            prop_oneof![
                Just(InsuranceCoverage::Low),
                Just(InsuranceCoverage::Medium),
                Just(InsuranceCoverage::High),
            ],
            prop_oneof![
                Just(RiskTolerance::Conservative),
                Just(RiskTolerance::Moderate),
                Just(RiskTolerance::Aggressive),
            ],
        ),
        (0.0f64..5_000_000.0, 0.0f64..200_000.0),
    )
        .prop_map(
            |(
                (mandatory, discretionary, liquid, surplus, pay_cycle),
                (stability, sources, secondary, dependents, job_search, insurance, tolerance),
                (debt_balance, debt_payment),
            )| {
                ResilienceInput {
                    mandatory_monthly_expenses: mandatory,
                    discretionary_monthly_expenses: discretionary,
                    liquid_assets: liquid,
                    monthly_surplus: surplus,
                    pay_cycle_days: pay_cycle,
                    household: HouseholdRiskInput {
                        income_stability: stability,
                        income_source_count: sources,
                        has_secondary_household_income: secondary,
                        dependent_count: dependents,
                        job_search_months: job_search,
                        insurance_coverage: insurance,
                        risk_tolerance: tolerance,
                    },
                    debt: DebtRiskInput {
                        total_balance: debt_balance,
                        monthly_payments: debt_payment,
                        weighted_annual_rate: 12.0,
                        high_interest_balance: debt_balance * 0.2,
                    },
                    sinking_funds: vec![SinkingFundGoal {
                        id: "prop".to_owned(),
                        label: "Prop fund".to_owned(),
                        target_amount: mandatory,
                        current_amount: 0.0,
                        months_until_due: 6,
                        priority: 1,
                    }],
                    experiences: ExperiencesFundInput {
                        annual_target: discretionary * 12.0,
                        current_amount: 0.0,
                    },
                }
            },
        )
}

proptest! {
    #[test]
    fn layer_ranges_are_ordered(input in resilience_input_strategy()) {
        let (layers, totals, coverage, _) = compute_layers(&input);
        for range in [
            layers.operational_buffer,
            layers.starter_emergency_fund,
            layers.core_reserve,
            layers.extended_reserve,
            layers.sinking_funds,
            layers.experiences_fund,
        ] {
            prop_assert!(range.min <= range.recommended);
            prop_assert!(range.recommended <= range.max || range.max == 0.0);
        }
        prop_assert!(totals.all_layers_recommended >= totals.emergency_only_recommended);
        prop_assert!(totals.current_gap_to_recommended >= 0.0);
        prop_assert!(coverage.operational_buffer_percent >= 0.0);
    }

    #[test]
    fn evaluation_is_idempotent(input in resilience_input_strategy()) {
        let first = evaluate_resilience(&input);
        let second = evaluate_resilience(&input);
        prop_assert_eq!(first, second);
    }

    #[test]
    fn stress_shortfall_is_non_negative(input in resilience_input_strategy()) {
        let plan = evaluate_resilience(&input);
        for scenario in plan.stress {
            prop_assert!(scenario.shortfall >= 0.0);
            prop_assert!(scenario.remaining_liquid >= 0.0);
        }
    }
}
