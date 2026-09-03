//! Deterministic stress scenarios for reserve adequacy.

use super::layers::ResilienceInput;

/// One stress scenario outcome.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StressScenarioResult {
    pub id: String,
    pub label: String,
    pub months_tested: u8,
    pub survivable: bool,
    pub shortfall: f64,
    pub remaining_liquid: f64,
    pub summary: String,
}

#[must_use]
pub fn run_stress_scenarios(input: &ResilienceInput) -> Vec<StressScenarioResult> {
    vec![
        income_loss(input, 1, "income-loss-1m", "One-month income interruption"),
        income_loss(
            input,
            3,
            "income-loss-3m",
            "Three-month income interruption",
        ),
        income_loss(input, 6, "income-loss-6m", "Six-month income interruption"),
        unexpected_expense(input),
        income_loss_with_debt(input),
        family_care_shock(input),
    ]
}

fn income_loss(input: &ResilienceInput, months: u8, id: &str, label: &str) -> StressScenarioResult {
    let mandatory = input.mandatory_monthly_expenses.max(0.0);
    let burn = mandatory * f64::from(months);
    let remaining = input.liquid_assets - burn;
    let survivable = remaining >= 0.0;
    let shortfall = (-remaining).max(0.0);
    let summary = if survivable {
        format!(
            "Liquid assets cover about {months} month(s) of mandatory expenses without new income."
        )
    } else {
        format!("Mandatory expenses for {months} month(s) exceed liquid assets by {shortfall:.0}.")
    };
    StressScenarioResult {
        id: id.to_owned(),
        label: label.to_owned(),
        months_tested: months,
        survivable,
        shortfall,
        remaining_liquid: remaining.max(0.0),
        summary,
    }
}

fn unexpected_expense(input: &ResilienceInput) -> StressScenarioResult {
    let mandatory = input.mandatory_monthly_expenses.max(0.0);
    let shock = mandatory.max(10_000.0);
    let remaining = input.liquid_assets - shock;
    let survivable = remaining >= mandatory * 0.5;
    let shortfall = if survivable {
        0.0
    } else {
        (mandatory * 0.5 - remaining).max(0.0)
    };
    let summary = if survivable {
        format!(
            "A one-time expense of about {shock:.0} leaves enough liquidity to keep a half-month operational cushion."
        )
    } else {
        format!(
            "A one-time expense of about {shock:.0} would erode the operational buffer below a half-month cushion."
        )
    };
    StressScenarioResult {
        id: "unexpected-expense".to_owned(),
        label: "Unexpected mandatory expense".to_owned(),
        months_tested: 0,
        survivable,
        shortfall,
        remaining_liquid: remaining.max(0.0),
        summary,
    }
}

fn income_loss_with_debt(input: &ResilienceInput) -> StressScenarioResult {
    let months: u8 = 3;
    let mandatory = input.mandatory_monthly_expenses.max(0.0);
    let debt = input.debt.monthly_payments.max(0.0);
    let burn = (mandatory + debt) * f64::from(months);
    let remaining = input.liquid_assets - burn;
    let survivable = remaining >= 0.0;
    let shortfall = (-remaining).max(0.0);
    let summary = if survivable {
        format!(
            "Liquid assets cover {months} months of mandatory expenses plus scheduled debt payments."
        )
    } else {
        format!(
            "Maintaining debt payments for {months} months without income would require about {shortfall:.0} more liquidity."
        )
    };
    StressScenarioResult {
        id: "income-loss-with-debt".to_owned(),
        label: "Income loss with ongoing debt payments".to_owned(),
        months_tested: months,
        survivable,
        shortfall,
        remaining_liquid: remaining.max(0.0),
        summary,
    }
}

fn family_care_shock(input: &ResilienceInput) -> StressScenarioResult {
    let dependents = input.household.dependent_count.min(4);
    let mandatory = input.mandatory_monthly_expenses.max(0.0);
    let months: u8 = 2;
    let shock = mandatory * (0.5 + 0.35 * f64::from(dependents));
    let remaining = input.liquid_assets - shock;
    let cushion = mandatory * 0.5;
    let survivable = remaining >= cushion;
    let shortfall = if survivable {
        0.0
    } else {
        (cushion - remaining).max(0.0)
    };
    let summary = if survivable {
        format!(
            "A two-month family care shock of about {shock:.0} leaves a half-month operational cushion."
        )
    } else {
        format!(
            "A two-month family care shock of about {shock:.0} would erode the operational buffer below a half-month cushion."
        )
    };
    StressScenarioResult {
        id: "family-care-shock".to_owned(),
        label: "Family care or medical shock".to_owned(),
        months_tested: months,
        survivable,
        shortfall,
        remaining_liquid: remaining.max(0.0),
        summary,
    }
}
