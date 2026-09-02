//! Descriptive explanations and debt-aware context notes.

use super::{
    layers::{LayerTargets, ReserveTotals, ResilienceInput},
    risk::{DebtRiskInput, HouseholdRiskInput, RiskAssessment, RiskTolerance},
};

/// Factor that influenced a reserve range.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Explanation {
    pub factor: String,
    pub effect: String,
    pub direction: ExplanationDirection,
}

/// Whether a factor widens or narrows reserve targets.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExplanationDirection {
    Widen,
    Narrow,
    Neutral,
}

/// Non-prescriptive note about reserve/debt trade-offs.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DescriptiveNote {
    pub topic: String,
    pub text: String,
}

#[must_use]
pub fn build_explanations(
    household: HouseholdRiskInput,
    debt: &DebtRiskInput,
    risk: &RiskAssessment,
    layers: &LayerTargets,
    totals: &ReserveTotals,
) -> (Vec<Explanation>, Vec<DescriptiveNote>) {
    let mut explanations = Vec::new();

    if risk.income_stability_points > 0 {
        explanations.push(Explanation {
            factor: "incomeStability".to_owned(),
            effect: "Variable or seasonal income widens core and extended reserve ranges."
                .to_owned(),
            direction: ExplanationDirection::Widen,
        });
    }

    if risk.household_income_points > 0 {
        explanations.push(Explanation {
            factor: "singleHouseholdIncome".to_owned(),
            effect: "A single household income source increases starter and core reserve targets."
                .to_owned(),
            direction: ExplanationDirection::Widen,
        });
    }

    if risk.dependent_points > 0 {
        explanations.push(Explanation {
            factor: "dependents".to_owned(),
            effect: format!(
                "{} dependent(s) add about {:.1} month(s) to the recommended core reserve.",
                household.dependent_count,
                (f64::from(risk.dependent_points) * 0.25 * 10.0).round() / 10.0
            ),
            direction: ExplanationDirection::Widen,
        });
    }

    if risk.debt_service_points > 0 {
        explanations.push(Explanation {
            factor: "debtServiceRatio".to_owned(),
            effect: "Higher fixed debt payments increase the operational buffer and core reserve."
                .to_owned(),
            direction: ExplanationDirection::Widen,
        });
    }

    if layers.extended_reserve.recommended <= 0.0 {
        explanations.push(Explanation {
            factor: "extendedReserve".to_owned(),
            effect: "Current risk profile does not require an extended reserve layer.".to_owned(),
            direction: ExplanationDirection::Neutral,
        });
    } else {
        explanations.push(Explanation {
            factor: "extendedReserve".to_owned(),
            effect: "Elevated household risk suggests an additional extended reserve beyond the core layer.".to_owned(),
            direction: ExplanationDirection::Widen,
        });
    }

    if totals.current_gap_to_recommended <= 0.0 {
        explanations.push(Explanation {
            factor: "coverage".to_owned(),
            effect: "Liquid assets meet or exceed the recommended all-layer target.".to_owned(),
            direction: ExplanationDirection::Neutral,
        });
    }

    let mut notes = vec![
        DescriptiveNote {
            topic: "disclaimer".to_owned(),
            text: "These figures describe liquidity ranges and scenario math. They are not personalized investment or credit advice.".to_owned(),
        },
        DescriptiveNote {
            topic: "experiencesFund".to_owned(),
            text: "The experiences fund is planned separately from emergency reserves so quality-of-life goals do not compete with shock coverage.".to_owned(),
        },
    ];

    if debt.high_interest_balance > 0.0
        && layers.starter_emergency_fund.recommended > debt.high_interest_balance * 0.1
    {
        notes.push(DescriptiveNote {
            topic: "debtTradeoff".to_owned(),
            text: "Households with high-interest debt often compare accelerated payoff savings with the liquidity risk of a thinner starter fund; both paths have trade-offs worth modelling.".to_owned(),
        });
    }

    if debt.monthly_payments > 0.0 && totals.months_of_mandatory_expenses_covered < 3.0 {
        notes.push(DescriptiveNote {
            topic: "debtLiquidity".to_owned(),
            text: "Mandatory expenses and debt payments together reduce how many disruption months current liquidity can absorb.".to_owned(),
        });
    }

    if household.risk_tolerance == RiskTolerance::Aggressive
        && layers.core_reserve.recommended < layers.core_reserve.max
    {
        notes.push(DescriptiveNote {
            topic: "riskTolerance".to_owned(),
            text: "A higher risk tolerance narrows the recommended core reserve; stress scenarios still show downside coverage.".to_owned(),
        });
    }

    (explanations, notes)
}

#[must_use]
pub fn build_explanations_for_input(
    input: &ResilienceInput,
    risk: &RiskAssessment,
    layers: &LayerTargets,
    totals: &ReserveTotals,
) -> (Vec<Explanation>, Vec<DescriptiveNote>) {
    build_explanations(input.household, &input.debt, risk, layers, totals)
}
