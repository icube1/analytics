//! Live tracking forecast mapping mirroring `lib/tracking-forecast.ts`.

use std::collections::BTreeMap;

use serde::Deserialize;

use crate::date::CivilDate;

use super::deposits::add_calendar_months;
use super::simulate::{calculate_compound_interest, CompoundError};
use super::types::{CompoundContext, CompoundOptions, CompoundParams, CompoundResult};

const RU_MONTH_SHORT: [&str; 12] = [
    "янв.",
    "февр.",
    "март",
    "апр.",
    "май",
    "июнь",
    "июль",
    "авг.",
    "сент.",
    "окт.",
    "нояб.",
    "дек.",
];

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveForecastPoint {
    pub calendar_month: String,
    pub label: String,
    pub balance: f64,
    pub real_balance: f64,
    pub monthly_broker_invest: f64,
    pub monthly_debt_payment: f64,
    pub monthly_debt_principal: f64,
    pub monthly_debt_interest: f64,
    pub monthly_wealth_building: f64,
    pub monthly_total_contribution: f64,
    pub total_debt: f64,
    pub is_start: bool,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveForecastResult {
    pub points: Vec<LiveForecastPoint>,
    pub monthly_contribution: f64,
    pub suggested_from_fact: Option<f64>,
    pub fact_months_used: u32,
    pub suggested_from_scenario: f64,
    pub base_plan_id: String,
    pub base_plan_name: String,
    pub horizon_months: u32,
    pub withdraw_after_years: Option<f64>,
    pub withdraw_calendar_month: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveTrackingInput {
    pub horizon_months: u32,
    pub current_grand_total: f64,
    pub monthly_contribution: f64,
    pub suggested_from_scenario: f64,
    #[serde(default)]
    pub deposits_by_month: BTreeMap<String, f64>,
    #[serde(default)]
    pub withdraw_calendar_month: Option<String>,
    #[serde(default)]
    pub withdraw_after_years: Option<f64>,
    pub base_plan_id: String,
    pub base_plan_name: String,
}

pub fn calendar_month(date: CivilDate) -> String {
    format!("{:04}-{:02}", date.year, date.month)
}

pub fn shift_calendar_month(as_of: CivilDate, months: i32) -> String {
    let start = CivilDate::new(as_of.year, as_of.month, 1).expect("valid month start");
    calendar_month(add_calendar_months(start, months))
}

pub fn format_civil_month_label(calendar_month_key: &str) -> String {
    let mut parts = calendar_month_key.split('-');
    let year = parts
        .next()
        .and_then(|value| value.parse::<i32>().ok())
        .unwrap_or(0);
    let month = parts
        .next()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(1)
        .clamp(1, 12);
    let name = RU_MONTH_SHORT[month - 1];
    format!("{name} {:02} г.", year.rem_euclid(100))
}

pub fn average_recent_broker_deposits(
    deposits_by_month: &BTreeMap<String, f64>,
    as_of: CivilDate,
    window: usize,
) -> Option<(f64, usize)> {
    let mut samples = Vec::new();
    for offset in 0_i32..12 {
        let month = shift_calendar_month(as_of, -offset);
        let amount = deposits_by_month.get(&month).copied().unwrap_or(0.0);
        if amount > 0.0 {
            samples.push(amount);
            if samples.len() >= window {
                break;
            }
        }
    }
    if samples.is_empty() {
        return None;
    }
    let average = samples.iter().sum::<f64>() / samples.len() as f64;
    Some((average, samples.len()))
}

pub fn live_forecast_from_projection(
    result: &CompoundResult,
    as_of: CivilDate,
    input: &LiveTrackingInput,
    params_withdraw_after_years: Option<f64>,
) -> LiveForecastResult {
    let start_month = calendar_month(as_of);
    let fact = average_recent_broker_deposits(&input.deposits_by_month, as_of, 3);
    let mut points = Vec::new();

    let start_point = result.points.iter().find(|point| point.month == 0);
    points.push(LiveForecastPoint {
        calendar_month: start_month.clone(),
        label: format_civil_month_label(&start_month),
        balance: start_point.map_or(input.current_grand_total, |point| point.balance),
        real_balance: start_point.map_or(input.current_grand_total, |point| point.real_balance),
        monthly_broker_invest: 0.0,
        monthly_debt_payment: 0.0,
        monthly_debt_principal: 0.0,
        monthly_debt_interest: 0.0,
        monthly_wealth_building: 0.0,
        monthly_total_contribution: 0.0,
        total_debt: start_point.map_or(0.0, |point| point.total_debt),
        is_start: true,
    });

    for point in &result.points {
        if point.month == 0 || point.month > input.horizon_months {
            continue;
        }
        let calendar = shift_calendar_month(as_of, i32::try_from(point.month).unwrap_or(i32::MAX));
        points.push(LiveForecastPoint {
            calendar_month: calendar.clone(),
            label: format_civil_month_label(&calendar),
            balance: point.balance,
            real_balance: point.real_balance,
            monthly_broker_invest: point.monthly_broker_invest,
            monthly_debt_payment: point.monthly_debt_payment,
            monthly_debt_principal: point.monthly_debt_principal,
            monthly_debt_interest: point.monthly_debt_interest,
            monthly_wealth_building: point.monthly_wealth_building,
            monthly_total_contribution: point.monthly_total_contribution,
            total_debt: point.total_debt,
            is_start: false,
        });
    }

    LiveForecastResult {
        points,
        monthly_contribution: input.monthly_contribution,
        suggested_from_fact: fact.map(|(average, _)| average),
        fact_months_used: fact.map_or(0, |(_, count)| u32::try_from(count).unwrap_or(0)),
        suggested_from_scenario: input.suggested_from_scenario,
        base_plan_id: input.base_plan_id.clone(),
        base_plan_name: input.base_plan_name.clone(),
        horizon_months: input.horizon_months,
        withdraw_after_years: params_withdraw_after_years,
        withdraw_calendar_month: input.withdraw_calendar_month.clone(),
    }
}

pub fn build_live_tracking_forecast(
    params: &CompoundParams,
    context: Option<&CompoundContext>,
    options: &CompoundOptions,
    input: &LiveTrackingInput,
) -> Result<LiveForecastResult, CompoundError> {
    let mut options = options.clone();
    options.all_months = true;
    let as_of = options
        .as_of
        .as_deref()
        .and_then(|value| CivilDate::parse_iso(value).ok())
        .unwrap_or(CivilDate {
            year: 2026,
            month: 1,
            day: 15,
        });
    let result = calculate_compound_interest(params, context, &options)?;
    Ok(live_forecast_from_projection(
        &result,
        as_of,
        input,
        params.withdraw_after_years,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn averages_recent_nonzero_deposits() {
        let deposits = BTreeMap::from([
            ("2026-05".to_owned(), 50_000.0),
            ("2026-06".to_owned(), 70_000.0),
            ("2026-07".to_owned(), 60_000.0),
        ]);
        let as_of = CivilDate::new(2026, 7, 19).unwrap();
        let (average, months) = average_recent_broker_deposits(&deposits, as_of, 3).unwrap();
        assert_eq!(months, 3);
        assert!((average - 60_000.0).abs() < f64::EPSILON);
    }

    #[test]
    fn formats_civil_month_labels() {
        assert_eq!(format_civil_month_label("2026-07"), "июль 26 г.");
        assert_eq!(format_civil_month_label("2026-01"), "янв. 26 г.");
    }
}
