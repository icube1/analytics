//! Household and debt risk scoring for reserve sizing.

/// How predictable primary income is.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum IncomeStability {
    Stable,
    Variable,
    Seasonal,
}

/// Health and liability insurance coverage level.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InsuranceCoverage {
    Low,
    Medium,
    High,
}

/// User-stated comfort with liquidity versus growth trade-offs.
#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RiskTolerance {
    Conservative,
    Moderate,
    Aggressive,
}

/// Household factors that widen or narrow reserve ranges.
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HouseholdRiskInput {
    pub income_stability: IncomeStability,
    pub income_source_count: u8,
    pub has_secondary_household_income: bool,
    pub dependent_count: u8,
    pub job_search_months: u8,
    pub insurance_coverage: InsuranceCoverage,
    pub risk_tolerance: RiskTolerance,
}

/// Debt burden inputs used for reserve/debt trade-off context.
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebtRiskInput {
    pub total_balance: f64,
    pub monthly_payments: f64,
    pub weighted_annual_rate: f64,
    pub high_interest_balance: f64,
}

/// Aggregated risk score and factor breakdown.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskAssessment {
    pub score: u8,
    pub income_stability_points: u8,
    pub income_source_points: u8,
    pub household_income_points: u8,
    pub dependent_points: u8,
    pub job_search_points: u8,
    pub insurance_points: u8,
    pub debt_service_points: u8,
    pub high_interest_debt_points: u8,
    pub recommends_extended_reserve: bool,
}

#[must_use]
pub fn assess_risk(
    household: &HouseholdRiskInput,
    debt: &DebtRiskInput,
    mandatory_monthly: f64,
) -> RiskAssessment {
    let income_stability_points = match household.income_stability {
        IncomeStability::Stable => 0,
        IncomeStability::Variable => 2,
        IncomeStability::Seasonal => 3,
    };

    let income_source_points = if household.income_source_count <= 1 {
        2
    } else {
        u8::from(household.income_source_count == 2)
    };

    let household_income_points = if household.has_secondary_household_income {
        0
    } else {
        2
    };

    let dependent_points = household.dependent_count.min(4);

    let job_search_points = if household.job_search_months >= 9 {
        3
    } else if household.job_search_months >= 6 {
        2
    } else {
        u8::from(household.job_search_months >= 3)
    };

    let insurance_points = match household.insurance_coverage {
        InsuranceCoverage::High => 0,
        InsuranceCoverage::Medium => 1,
        InsuranceCoverage::Low => 2,
    };

    let debt_service_ratio = if mandatory_monthly > 0.0 {
        debt.monthly_payments / mandatory_monthly
    } else {
        0.0
    };
    let debt_service_points = if debt_service_ratio >= 0.5 {
        3
    } else if debt_service_ratio >= 0.35 {
        2
    } else {
        u8::from(debt_service_ratio >= 0.2)
    };

    let high_interest_debt_points = if debt.high_interest_balance > 0.0 {
        if debt.total_balance > 0.0 && debt.high_interest_balance / debt.total_balance >= 0.5 {
            2
        } else {
            1
        }
    } else {
        0
    };

    let score = income_stability_points
        + income_source_points
        + household_income_points
        + dependent_points
        + job_search_points
        + insurance_points
        + debt_service_points
        + high_interest_debt_points;

    RiskAssessment {
        score,
        income_stability_points,
        income_source_points,
        household_income_points,
        dependent_points,
        job_search_points,
        insurance_points,
        debt_service_points,
        high_interest_debt_points,
        recommends_extended_reserve: score >= 8,
    }
}

/// Extra core-reserve months implied by risk tolerance.
#[must_use]
pub fn tolerance_core_month_adjustment(tolerance: RiskTolerance) -> f64 {
    match tolerance {
        RiskTolerance::Conservative => 1.0,
        RiskTolerance::Moderate => 0.0,
        RiskTolerance::Aggressive => -0.5,
    }
}
