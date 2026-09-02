#![allow(clippy::ref_option, clippy::option_map_or_none, clippy::missing_errors_doc, clippy::assigning_clones, clippy::if_not_else, clippy::map_unwrap_or, clippy::needless_late_init, clippy::needless_pass_by_value, clippy::struct_excessive_bools, clippy::too_many_arguments)]
//! Rate conversion helpers mirroring `lib/compound-interest/rates.ts`.

use super::types::{CompoundFrequency, MonthlyRateMethod};

#[derive(Clone, Copy, Debug)]
pub struct AccrualPeriod {
    pub interval_months: u32,
}

pub fn period_rate_from_annual(
    annual_percent: f64,
    interval_months: u32,
    method: MonthlyRateMethod,
) -> f64 {
    let annual = annual_percent / 100.0;
    match method {
        MonthlyRateMethod::Simple => (annual * f64::from(interval_months)) / 12.0,
        MonthlyRateMethod::Effective => {
            (1.0 + annual).powf(f64::from(interval_months) / 12.0) - 1.0
        }
    }
}

pub fn monthly_rate_from_annual(annual_percent: f64, method: MonthlyRateMethod) -> f64 {
    period_rate_from_annual(annual_percent, 1, method)
}

pub fn get_accrual_period(
    frequency: CompoundFrequency,
    _method: MonthlyRateMethod,
) -> AccrualPeriod {
    let interval_months = match frequency {
        CompoundFrequency::Quarterly => 3,
        CompoundFrequency::Semiannual => 6,
        CompoundFrequency::Yearly => 12,
        CompoundFrequency::Monthly => 1,
    };
    AccrualPeriod { interval_months }
}
