//! Exact money amounts in minor currency units.
//!
//! Compound, Monte Carlo, IRR and volatility stay on `f64`. Ledger balances,
//! commissions and tax line items convert through these rounding rules.

use std::fmt;

/// How an `f64` major-unit amount is converted into integer minor units.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RoundingMode {
    /// Russian cash rounding: 0.5 steps away from zero.
    #[default]
    HalfAwayFromZero,
    /// Banker's rounding: ties to even.
    HalfEven,
    TowardZero,
}

/// ISO-4217 alphabetic code stored uppercase.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct CurrencyCode([u8; 3]);

impl CurrencyCode {
    /// Parses a 3-letter alphabetic currency code.
    ///
    /// # Errors
    ///
    /// Returns [`MoneyError::InvalidCurrency`] when the value is not three ASCII letters.
    pub fn parse(value: &str) -> Result<Self, MoneyError> {
        let trimmed = value.trim();
        let bytes = trimmed.as_bytes();
        if bytes.len() != 3 || !bytes.iter().all(u8::is_ascii_alphabetic) {
            return Err(MoneyError::InvalidCurrency(value.to_owned()));
        }
        Ok(Self([
            bytes[0].to_ascii_uppercase(),
            bytes[1].to_ascii_uppercase(),
            bytes[2].to_ascii_uppercase(),
        ]))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        std::str::from_utf8(&self.0).expect("currency codes are ASCII")
    }

    #[must_use]
    pub fn exponent(self) -> u8 {
        match self.as_str() {
            "JPY" | "KRW" | "VND" | "CLP" => 0,
            "KWD" | "BHD" | "OMR" | "JOD" => 3,
            _ => 2,
        }
    }
}

impl fmt::Display for CurrencyCode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Integer minor-unit amount plus currency exponent.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Money {
    pub currency: CurrencyCode,
    pub minor: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MoneyError {
    InvalidCurrency(String),
    NonFiniteAmount,
    UnsafeInteger(&'static str),
    InvalidPeriod,
    InvalidYearDays,
}

impl fmt::Display for MoneyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidCurrency(value) => write!(formatter, "invalid currency code {value}"),
            Self::NonFiniteAmount => formatter.write_str("non-finite money amount"),
            Self::UnsafeInteger(label) => write!(formatter, "{label} must be a safe integer"),
            Self::InvalidPeriod => formatter.write_str("periodDays must be a non-negative integer"),
            Self::InvalidYearDays => formatter.write_str("yearDays must be a positive integer"),
        }
    }
}

impl std::error::Error for MoneyError {}

const JS_MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

fn assert_safe_integer(value: i64, label: &'static str) -> Result<(), MoneyError> {
    if !(-JS_MAX_SAFE_INTEGER..=JS_MAX_SAFE_INTEGER).contains(&value) {
        return Err(MoneyError::UnsafeInteger(label));
    }
    Ok(())
}

fn round_scaled(scaled: f64, mode: RoundingMode) -> Result<i64, MoneyError> {
    if !scaled.is_finite() {
        return Err(MoneyError::NonFiniteAmount);
    }

    let rounded = match mode {
        RoundingMode::TowardZero => scaled.trunc(),
        RoundingMode::HalfAwayFromZero => {
            if scaled == 0.0 {
                0.0
            } else {
                scaled.signum() * (scaled.abs() + 0.5).trunc()
            }
        }
        RoundingMode::HalfEven => {
            let sign = if scaled.is_sign_negative() { -1.0 } else { 1.0 };
            let abs = scaled.abs();
            let truncated = abs.trunc();
            let fraction = abs - truncated;
            let even = (truncated as i64) % 2 == 0;
            let mag = if fraction > 0.5 || (fraction == 0.5 && !even) {
                truncated + 1.0
            } else {
                truncated
            };
            sign * mag
        }
    };

    #[allow(clippy::cast_possible_truncation)]
    let minor = rounded as i64;
    assert_safe_integer(minor, "minor units")?;
    Ok(minor)
}

fn factor(exponent: u8) -> f64 {
    10_f64.powi(i32::from(exponent))
}

/// Converts a major-unit `f64` into minor units using `mode`.
///
/// # Errors
///
/// Returns [`MoneyError`] for invalid currency or non-finite / overflowing amounts.
pub fn money_from_major(
    major: f64,
    currency: &str,
    mode: RoundingMode,
) -> Result<Money, MoneyError> {
    let currency = CurrencyCode::parse(currency)?;
    let minor = round_scaled(major * factor(currency.exponent()), mode)?;
    Ok(Money { currency, minor })
}

/// Wraps an already-rounded minor-unit amount.
///
/// # Errors
///
/// Returns [`MoneyError`] for invalid currency or an integer outside the JS safe range.
pub fn money_from_minor(minor: i64, currency: &str) -> Result<Money, MoneyError> {
    let currency = CurrencyCode::parse(currency)?;
    assert_safe_integer(minor, "minor units")?;
    Ok(Money { currency, minor })
}

/// Adds two minor-unit amounts of the same currency.
///
/// # Errors
///
/// Returns [`MoneyError`] when the currency is invalid or the sum overflows the JS safe range.
pub fn add_money(left_minor: i64, right_minor: i64, currency: &str) -> Result<Money, MoneyError> {
    assert_safe_integer(left_minor, "leftMinor")?;
    assert_safe_integer(right_minor, "rightMinor")?;
    let sum = left_minor
        .checked_add(right_minor)
        .ok_or(MoneyError::UnsafeInteger("sum"))?;
    money_from_minor(sum, currency)
}

/// Accrues simple interest, then rounds the result to minor units.
///
/// # Errors
///
/// Returns [`MoneyError`] for invalid inputs or overflow.
pub fn interest_money(
    principal_minor: i64,
    annual_rate_percent: f64,
    period_days: i64,
    year_days: i64,
    currency: &str,
    mode: RoundingMode,
) -> Result<Money, MoneyError> {
    assert_safe_integer(principal_minor, "principalMinor")?;
    if period_days < 0 {
        return Err(MoneyError::InvalidPeriod);
    }
    if year_days <= 0 {
        return Err(MoneyError::InvalidYearDays);
    }
    let accrued = (principal_minor as f64)
        * (annual_rate_percent / 100.0)
        * (period_days as f64 / year_days as f64);
    let minor = round_scaled(accrued, mode)?;
    money_from_minor(minor, currency)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MoneyAmortization {
    pub balance: Money,
    pub interest: Money,
    pub principal: Money,
}

/// Rounds actual/365 interest to minor units, then splits the payment.
///
/// # Errors
///
/// Returns [`MoneyError`] for invalid inputs or overflow.
pub fn amortize_money(
    balance_minor: i64,
    payment_minor: i64,
    annual_rate_percent: f64,
    period_days: i64,
    year_days: i64,
    currency: &str,
    mode: RoundingMode,
) -> Result<MoneyAmortization, MoneyError> {
    assert_safe_integer(balance_minor, "balanceMinor")?;
    assert_safe_integer(payment_minor, "paymentMinor")?;
    if balance_minor <= 0 || payment_minor <= 0 {
        return Ok(MoneyAmortization {
            balance: money_from_minor(balance_minor.max(0), currency)?,
            interest: money_from_minor(0, currency)?,
            principal: money_from_minor(0, currency)?,
        });
    }

    let interest = interest_money(
        balance_minor,
        annual_rate_percent,
        period_days,
        year_days,
        currency,
        mode,
    )?;
    // Interest is the full rounded accrual. When it exceeds the payment, principal
    // is 0 and the balance is unchanged — unpaid interest is not capitalized.
    let interest_minor = interest.minor.max(0);
    let principal_minor = (payment_minor - interest_minor).max(0).min(balance_minor);
    let next_balance = (balance_minor - principal_minor).max(0);
    Ok(MoneyAmortization {
        balance: money_from_minor(next_balance, currency)?,
        interest: money_from_minor(interest_minor, currency)?,
        principal: money_from_minor(principal_minor, currency)?,
    })
}

#[must_use]
pub fn money_major(amount: Money) -> f64 {
    amount.minor as f64 / factor(amount.currency.exponent())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rub_half_away_rounds_five_up() {
        let money = money_from_major(10.125, "rub", RoundingMode::HalfAwayFromZero).unwrap();
        assert_eq!(money.minor, 1013);
        assert_eq!(money.currency.as_str(), "RUB");
    }

    #[test]
    fn half_even_ties_to_even() {
        let money = money_from_major(10.125, "RUB", RoundingMode::HalfEven).unwrap();
        assert_eq!(money.minor, 1012);
    }

    #[test]
    fn jpy_has_zero_exponent() {
        let money = money_from_major(100.4, "JPY", RoundingMode::HalfAwayFromZero).unwrap();
        assert_eq!(money.minor, 100);
        assert_eq!(money.currency.exponent(), 0);
    }

    #[test]
    fn amortize_splits_payment_after_rounding_interest() {
        let result = amortize_money(
            10_000_000,
            250_000,
            20.0,
            31,
            365,
            "RUB",
            RoundingMode::HalfAwayFromZero,
        )
        .unwrap();
        assert_eq!(result.interest.minor, 169_863);
        assert_eq!(result.principal.minor, 80_137);
        assert_eq!(result.interest.minor + result.principal.minor, 250_000);
        assert_eq!(result.balance.minor + result.principal.minor, 10_000_000);
    }

    #[test]
    fn amortize_does_not_reduce_principal_when_interest_exceeds_payment() {
        let result = amortize_money(
            10_000_000,
            150_000,
            20.0,
            31,
            365,
            "RUB",
            RoundingMode::HalfAwayFromZero,
        )
        .unwrap();
        assert_eq!(result.interest.minor, 169_863);
        assert_eq!(result.principal.minor, 0);
        assert_eq!(result.balance.minor, 10_000_000);
    }
}
