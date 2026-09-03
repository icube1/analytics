//! Layered reserve planning with debt-aware and household risk inputs.

mod explain;
mod layers;
mod risk;
mod stress;

pub use explain::{
    build_explanations_for_input, DescriptiveNote, Explanation, ExplanationDirection,
};
pub use layers::{
    compute_layers, CoverageSnapshot, ExperiencesFundInput, LayerTargets, MoneyRange,
    ReserveTotals, ResilienceInput, SinkingFundGoal,
};
pub use risk::{
    assess_risk, tolerance_core_month_adjustment, DebtRiskInput, HouseholdRiskInput,
    IncomeStability, InsuranceCoverage, RiskAssessment, RiskTolerance,
};
pub use stress::{run_stress_scenarios, StressScenarioResult};

/// Full resilience evaluation output.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResiliencePlan {
    pub layers: LayerTargets,
    pub totals: ReserveTotals,
    pub coverage: CoverageSnapshot,
    pub risk: RiskAssessment,
    pub stress: Vec<StressScenarioResult>,
    pub explanations: Vec<Explanation>,
    pub notes: Vec<DescriptiveNote>,
}

/// Evaluates a layered reserve plan with stress coverage and descriptive notes.
#[must_use]
pub fn evaluate_resilience(input: &ResilienceInput) -> ResiliencePlan {
    let (layers, totals, coverage, risk) = compute_layers(input);
    let stress = run_stress_scenarios(input);
    let (explanations, notes) = build_explanations_for_input(input, &risk, &layers, &totals);
    ResiliencePlan {
        layers,
        totals,
        coverage,
        risk,
        stress,
        explanations,
        notes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resilience::risk::{IncomeStability, InsuranceCoverage, RiskTolerance};

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
            sinking_funds: vec![SinkingFundGoal {
                id: "car-service".to_owned(),
                label: "Car service".to_owned(),
                target_amount: 60_000.0,
                current_amount: 10_000.0,
                months_until_due: 6,
                priority: 1,
            }],
            experiences: ExperiencesFundInput {
                annual_target: 120_000.0,
                current_amount: 20_000.0,
            },
        }
    }

    #[test]
    fn plan_is_deterministic() {
        let input = sample_input();
        assert_eq!(evaluate_resilience(&input), evaluate_resilience(&input));
    }

    #[test]
    fn extended_reserve_appears_for_high_risk() {
        let mut input = sample_input();
        input.household.job_search_months = 9;
        input.household.income_stability = IncomeStability::Seasonal;
        input.debt.monthly_payments = 80_000.0;
        let plan = evaluate_resilience(&input);
        assert!(plan.risk.recommends_extended_reserve);
        assert!(plan.layers.extended_reserve.recommended > 0.0);
        assert_eq!(plan.stress.len(), 6);
        assert!(plan
            .stress
            .iter()
            .any(|scenario| scenario.id == "family-care-shock"));
    }

    #[test]
    fn notes_include_disclaimer() {
        let plan = evaluate_resilience(&sample_input());
        assert!(plan.notes.iter().any(|note| note.topic == "disclaimer"));
    }
}
