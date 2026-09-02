//! Debt day-count and amortization behavior ported from the TypeScript core.

use crate::date::{days_in_month, CivilDate};

/// TypeScript's fallback period when callers omit an explicit day count.
pub const DEFAULT_PERIOD_DAYS: f64 = 365.0 / 12.0;
const MAX_PAYOFF_MONTHS: u32 = 12 * 50;

/// The dates bracketing a monthly payment period.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PaymentDates {
    pub previous: CivilDate,
    pub next: CivilDate,
}

/// One debt-payment calculation.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Amortization {
    pub balance: f64,
    pub interest: f64,
    pub principal: f64,
}

/// Mirrors `clampPaymentDay`: payment days are rounded and restricted to 1–28.
#[must_use]
#[allow(clippy::cast_possible_truncation)]
pub fn clamp_payment_day(payment_day: f64) -> u8 {
    if payment_day.is_nan() {
        return 1;
    }
    payment_day.round().clamp(1.0, 28.0) as u8
}

/// Creates a payment date from a zero-based month, normalizing month overflow
/// and clamping the payment day like JavaScript's `Date` constructor.
#[must_use]
pub fn payment_date(year: i32, month_index_zero: i32, payment_day: f64) -> CivilDate {
    let normalized_year = year + month_index_zero.div_euclid(12);
    let month = u8::try_from(month_index_zero.rem_euclid(12) + 1).unwrap();
    let day = clamp_payment_day(payment_day).min(days_in_month(normalized_year, month));
    CivilDate::new(normalized_year, month, day).unwrap()
}

/// Returns the previous and next payment dates relative to `as_of`.
///
/// A payment occurring on `as_of` is the previous date, matching JavaScript's
/// strict `day < paymentDay` branch.
#[must_use]
pub fn surrounding_payment_dates(as_of: CivilDate, payment_day: f64) -> PaymentDates {
    let this_month = payment_date(as_of.year, i32::from(as_of.month) - 1, payment_day);
    if as_of.day < this_month.day {
        PaymentDates {
            previous: shifted_payment_date(as_of.year, as_of.month, -1, payment_day),
            next: this_month,
        }
    } else {
        PaymentDates {
            previous: this_month,
            next: shifted_payment_date(as_of.year, as_of.month, 1, payment_day),
        }
    }
}

/// Number of days in the payment period containing `as_of`.
#[must_use]
pub fn current_payment_period_days(payment_day: f64, as_of: CivilDate) -> i64 {
    let dates = surrounding_payment_dates(as_of, payment_day);
    dates.previous.days_until(dates.next).max(1)
}

/// Returns a monthly payment date offset from `base`.
#[must_use]
pub fn add_months_payment_date(base: CivilDate, delta_months: i32, payment_day: f64) -> CivilDate {
    shifted_payment_date(base.year, base.month, delta_months, payment_day)
}

/// Day count for a one-based simulation payment month.
#[must_use]
pub fn simulation_payment_period_days(
    as_of_start: CivilDate,
    payment_month_index: i32,
    payment_day: f64,
) -> i64 {
    let first_payment = surrounding_payment_dates(as_of_start, payment_day).next;
    let end = add_months_payment_date(first_payment, payment_month_index - 1, payment_day);
    let start = add_months_payment_date(first_payment, payment_month_index - 2, payment_day);
    start.days_until(end).max(1)
}

/// Actual/365 simple interest for one period.
#[must_use]
pub fn interest_for_period(balance: f64, annual_interest_rate: f64, period_days: f64) -> f64 {
    if balance <= 0.0 || annual_interest_rate <= 0.0 || period_days <= 0.0 {
        return 0.0;
    }
    balance * annual_interest_rate / 100.0 * (period_days / 365.0)
}

/// Applies one scheduled debt payment.
#[must_use]
pub fn amortize_debt_month(
    balance: f64,
    payment: f64,
    annual_interest_rate: f64,
    period_days: Option<f64>,
) -> Amortization {
    if balance <= 0.0 || payment <= 0.0 {
        return Amortization {
            balance: balance.max(0.0),
            interest: 0.0,
            principal: 0.0,
        };
    }

    let interest = interest_for_period(
        balance,
        annual_interest_rate,
        period_days.unwrap_or(DEFAULT_PERIOD_DAYS),
    );
    let principal = balance.min((payment - interest).max(0.0));
    Amortization {
        balance: (balance - principal).max(0.0),
        interest,
        principal,
    }
}

/// Estimates payoff payments with the same 600-payment cap as TypeScript.
///
/// `None` means the payment never reduces principal. For compatibility, a debt
/// that still declines after 600 payments returns `Some(600)`.
#[must_use]
pub fn estimate_payoff_months(
    balance: f64,
    payment: f64,
    annual_interest_rate: f64,
    payment_day: f64,
    as_of: CivilDate,
) -> Option<u32> {
    if balance <= 0.0 {
        return Some(0);
    }
    if payment <= 0.0 {
        return None;
    }

    let mut remaining = balance;
    let mut months = 0;
    let day = resolve_payment_day(payment_day);
    while remaining > 0.01 && months < MAX_PAYOFF_MONTHS {
        let period_days =
            simulation_payment_period_days(as_of, i32::try_from(months + 1).unwrap(), day);
        let step = amortize_debt_month(
            remaining,
            payment,
            annual_interest_rate,
            Some(period_days as f64),
        );
        if step.principal <= 0.0 {
            return None;
        }
        remaining = step.balance;
        months += 1;
    }
    Some(months)
}

fn resolve_payment_day(payment_day: f64) -> f64 {
    if payment_day <= 0.0 || payment_day.is_nan() {
        6.0
    } else {
        payment_day.round().min(28.0)
    }
}

fn shifted_payment_date(year: i32, month: u8, delta_months: i32, payment_day: f64) -> CivilDate {
    payment_date(year, i32::from(month) - 1 + delta_months, payment_day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_alfa_august_2026_schedule() {
        let as_of = CivilDate::new(2026, 7, 19).unwrap();
        assert_eq!(current_payment_period_days(6.0, as_of), 31);
        let step = amortize_debt_month(1_922_641.02, 55_200.0, 10.5, Some(31.0));
        assert!((step.interest - 17_145.75).abs() < 0.1);
        assert!((step.principal - 38_054.25).abs() < 0.1);
    }

    #[test]
    fn payment_date_itself_starts_the_next_period() {
        let as_of = CivilDate::new(2026, 7, 6).unwrap();
        let dates = surrounding_payment_dates(as_of, 6.0);
        assert_eq!(dates.previous, as_of);
        assert_eq!(dates.next, CivilDate::new(2026, 8, 6).unwrap());
        assert_eq!(simulation_payment_period_days(as_of, 1, 6.0), 30);
    }

    #[test]
    fn non_amortizing_payment_has_no_payoff() {
        let as_of = CivilDate::new(2026, 7, 19).unwrap();
        assert_eq!(
            estimate_payoff_months(100_000.0, 1.0, 20.0, 6.0, as_of),
            None
        );
    }
}
