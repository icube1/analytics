//! Layered reserve target calculations.

use super::risk::{
    assess_risk, tolerance_core_month_adjustment, DebtRiskInput, HouseholdRiskInput, RiskAssessment,
};

/// A monetary range for one reserve layer.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoneyRange {
    pub min: f64,
    pub recommended: f64,
    pub max: f64,
}

/// Planned sinking-fund contribution.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SinkingFundGoal {
    pub id: String,
    pub label: String,
    pub target_amount: f64,
    pub current_amount: f64,
    pub months_until_due: u16,
    pub priority: u8,
}

/// Discretionary experiences-fund planning input.
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperiencesFundInput {
    pub annual_target: f64,
    pub current_amount: f64,
}

/// Inputs required to size each reserve layer.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResilienceInput {
    pub mandatory_monthly_expenses: f64,
    pub discretionary_monthly_expenses: f64,
    pub liquid_assets: f64,
    pub monthly_surplus: f64,
    pub pay_cycle_days: f64,
    pub household: HouseholdRiskInput,
    pub debt: DebtRiskInput,
    pub sinking_funds: Vec<SinkingFundGoal>,
    pub experiences: ExperiencesFundInput,
}

/// Targets for each liquidity layer.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerTargets {
    pub operational_buffer: MoneyRange,
    pub starter_emergency_fund: MoneyRange,
    pub core_reserve: MoneyRange,
    pub extended_reserve: MoneyRange,
    pub sinking_funds: MoneyRange,
    pub experiences_fund: MoneyRange,
}

/// Aggregate reserve totals derived from layers.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReserveTotals {
    pub emergency_only_recommended: f64,
    pub all_layers_recommended: f64,
    pub all_layers_max: f64,
    pub current_gap_to_recommended: f64,
    pub months_of_mandatory_expenses_covered: f64,
}

/// How current liquid assets map to each layer.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageSnapshot {
    pub operational_buffer_percent: f64,
    pub starter_emergency_percent: f64,
    pub core_reserve_percent: f64,
    pub extended_reserve_percent: f64,
    pub sinking_funds_percent: f64,
    pub experiences_fund_percent: f64,
    pub debt_payment_months_covered: f64,
}

#[must_use]
pub fn compute_layers(
    input: &ResilienceInput,
) -> (
    LayerTargets,
    ReserveTotals,
    CoverageSnapshot,
    RiskAssessment,
) {
    let mandatory = input.mandatory_monthly_expenses.max(0.0);
    let risk = assess_risk(&input.household, &input.debt, mandatory);

    let operational_buffer = operational_buffer_range(input, mandatory);
    let starter_emergency_fund = starter_emergency_range(input, mandatory);
    let core_reserve = core_reserve_range(input, mandatory, &risk);
    let extended_reserve = extended_reserve_range(mandatory, &risk);
    let sinking_funds = sinking_funds_range(input);
    let experiences_fund = experiences_fund_range(input);

    let layers = LayerTargets {
        operational_buffer,
        starter_emergency_fund,
        core_reserve,
        extended_reserve,
        sinking_funds,
        experiences_fund,
    };

    let emergency_only_recommended = operational_buffer.recommended
        + starter_emergency_fund.recommended
        + core_reserve.recommended
        + extended_reserve.recommended;
    let all_layers_recommended =
        emergency_only_recommended + sinking_funds.recommended + experiences_fund.recommended;
    let all_layers_max = operational_buffer.max
        + starter_emergency_fund.max
        + core_reserve.max
        + extended_reserve.max
        + sinking_funds.max
        + experiences_fund.max;

    let liquid = input.liquid_assets.max(0.0);
    let totals = ReserveTotals {
        emergency_only_recommended,
        all_layers_recommended,
        all_layers_max,
        current_gap_to_recommended: (all_layers_recommended - liquid).max(0.0),
        months_of_mandatory_expenses_covered: if mandatory > 0.0 {
            liquid / mandatory
        } else {
            0.0
        },
    };

    let coverage = CoverageSnapshot {
        operational_buffer_percent: percent_of(liquid, operational_buffer.recommended),
        starter_emergency_percent: percent_of(liquid, starter_emergency_fund.recommended),
        core_reserve_percent: percent_of(liquid, core_reserve.recommended),
        extended_reserve_percent: percent_of(liquid, extended_reserve.recommended),
        sinking_funds_percent: percent_of(liquid, sinking_funds.recommended),
        experiences_fund_percent: percent_of(liquid, experiences_fund.recommended),
        debt_payment_months_covered: if input.debt.monthly_payments > 0.0 {
            liquid / input.debt.monthly_payments
        } else {
            f64::INFINITY
        },
    };

    (layers, totals, coverage, risk)
}

fn operational_buffer_range(input: &ResilienceInput, mandatory: f64) -> MoneyRange {
    let pay_cycle_fraction = input.pay_cycle_days.max(1.0) / 30.0;
    let debt = input.debt.monthly_payments.max(0.0);
    MoneyRange {
        min: mandatory * pay_cycle_fraction * 0.75,
        recommended: mandatory * pay_cycle_fraction + debt * 0.25,
        max: mandatory * pay_cycle_fraction + debt,
    }
}

fn starter_emergency_range(input: &ResilienceInput, mandatory: f64) -> MoneyRange {
    let mut starter_months: f64 = 1.0;
    if !input.household.has_secondary_household_income {
        starter_months += 0.5;
    }
    if mandatory > 0.0 && input.debt.monthly_payments / mandatory >= 0.35 {
        starter_months += 0.5;
    }
    starter_months = starter_months.min(2.0);
    MoneyRange {
        min: mandatory * 0.5,
        recommended: mandatory * starter_months,
        max: mandatory * 2.0,
    }
}

fn core_reserve_range(
    input: &ResilienceInput,
    mandatory: f64,
    risk: &RiskAssessment,
) -> MoneyRange {
    let mut core_months = 3.0 + tolerance_core_month_adjustment(input.household.risk_tolerance);
    core_months += f64::from(risk.income_stability_points) * 0.5;
    core_months += f64::from(risk.household_income_points) * 0.5;
    core_months += f64::from(risk.dependent_points) * 0.25;
    core_months += f64::from(risk.job_search_points) * 0.5;
    core_months += f64::from(risk.debt_service_points) * 0.25;
    core_months = core_months.clamp(2.0, 12.0);
    MoneyRange {
        min: mandatory * (core_months - 1.0).max(1.0),
        recommended: mandatory * core_months,
        max: mandatory * (core_months + 2.0),
    }
}

fn extended_reserve_range(mandatory: f64, risk: &RiskAssessment) -> MoneyRange {
    if risk.recommends_extended_reserve {
        let extra: f64 = if risk.score >= 12 {
            6.0
        } else if risk.score >= 10 {
            4.0
        } else {
            3.0
        };
        MoneyRange {
            min: mandatory * (extra - 1.0).max(1.0),
            recommended: mandatory * extra,
            max: mandatory * (extra + 2.0),
        }
    } else {
        MoneyRange {
            min: 0.0,
            recommended: 0.0,
            max: mandatory * 2.0,
        }
    }
}

fn sinking_funds_range(input: &ResilienceInput) -> MoneyRange {
    let sinking_target: f64 = input.sinking_funds.iter().map(sinking_fund_target).sum();
    let sinking_current: f64 = input
        .sinking_funds
        .iter()
        .map(|goal| goal.current_amount.max(0.0))
        .sum();
    MoneyRange {
        min: sinking_current,
        recommended: sinking_target.max(sinking_current),
        max: sinking_target * 1.1,
    }
}

fn experiences_fund_range(input: &ResilienceInput) -> MoneyRange {
    let experiences_monthly = input.experiences.annual_target.max(0.0) / 12.0;
    MoneyRange {
        min: experiences_monthly * 3.0,
        recommended: input
            .experiences
            .annual_target
            .max(experiences_monthly * 6.0),
        max: input
            .experiences
            .annual_target
            .max(experiences_monthly * 12.0),
    }
}

fn sinking_fund_target(goal: &SinkingFundGoal) -> f64 {
    let remaining = (goal.target_amount - goal.current_amount).max(0.0);
    if goal.months_until_due == 0 {
        return goal.target_amount.max(goal.current_amount);
    }
    goal.current_amount + remaining
}

fn percent_of(liquid: f64, target: f64) -> f64 {
    if target <= 0.0 {
        100.0
    } else {
        (liquid / target * 100.0).clamp(0.0, 999.0)
    }
}
