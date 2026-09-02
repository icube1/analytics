#![allow(clippy::ref_option, clippy::option_map_or_none, clippy::missing_errors_doc, clippy::assigning_clones, clippy::if_not_else, clippy::map_unwrap_or, clippy::needless_late_init, clippy::needless_pass_by_value, clippy::struct_excessive_bools, clippy::too_many_arguments)]
//! Term deposit helpers mirroring `lib/term-deposits.ts`.

use crate::date::CivilDate;

use super::types::{AssetKind, CustomAssetItem, DepositInterestMode, MonthlyRateMethod};

pub fn is_deposit_item(item: &CustomAssetItem) -> bool {
    matches!(item.asset_kind, AssetKind::Deposit)
}

pub fn add_calendar_months(date: CivilDate, months: i32) -> CivilDate {
    let total_months = i32::from(date.month) - 1 + months;
    let year = date.year + total_months.div_euclid(12);
    let month = u8::try_from(total_months.rem_euclid(12) + 1).expect("month in range");
    let day = date.day.min(crate::date::days_in_month(year, month));
    CivilDate::new(year, month, day).expect("valid shifted date")
}

pub fn simulation_date(as_of: CivilDate, simulation_month: u32) -> CivilDate {
    add_calendar_months(as_of, i32::try_from(simulation_month).unwrap_or(i32::MAX))
}

pub fn get_deposit_maturity_date(item: &CustomAssetItem) -> Option<CivilDate> {
    if !is_deposit_item(item) {
        return None;
    }
    let opened_at = item.deposit_opened_at.as_deref()?;
    let term_months = item.deposit_term_months?;
    let opened = CivilDate::parse_iso(opened_at).ok()?;
    Some(add_calendar_months(
        opened,
        i32::try_from(term_months).unwrap_or(i32::MAX),
    ))
}

pub fn is_deposit_active(item: &CustomAssetItem, as_of: CivilDate) -> bool {
    if !is_deposit_item(item) || !item.enabled || item.value <= 0.0 {
        return false;
    }
    let Some(maturity) = get_deposit_maturity_date(item) else {
        return true;
    };
    as_of < maturity
}

pub fn deposit_matures_in_simulation_month(
    item: &CustomAssetItem,
    as_of: CivilDate,
    simulation_month: u32,
) -> bool {
    let Some(maturity) = get_deposit_maturity_date(item) else {
        return false;
    };
    let prev = simulation_date(as_of, simulation_month.saturating_sub(1));
    let current = simulation_date(as_of, simulation_month);
    prev < maturity && current >= maturity
}

pub fn estimate_deposit_maturity_value(
    principal: f64,
    annual_rate_percent: f64,
    term_months: u32,
    mode: DepositInterestMode,
    rate_method: MonthlyRateMethod,
) -> f64 {
    if principal <= 0.0 || term_months == 0 {
        return principal;
    }
    let annual_rate = annual_rate_percent / 100.0;

    match mode {
        DepositInterestMode::MonthlyCapitalized => {
            let monthly_rate = match rate_method {
                MonthlyRateMethod::Simple => annual_rate / 12.0,
                MonthlyRateMethod::Effective => (1.0 + annual_rate).powf(1.0 / 12.0) - 1.0,
            };
            principal * (1.0 + monthly_rate).powi(i32::try_from(term_months).unwrap_or(i32::MAX))
        }
        DepositInterestMode::AtMaturity => {
            principal * (1.0 + annual_rate * (f64::from(term_months) / 12.0))
        }
    }
}
