//! Gregorian civil-date operations without time zones or wall-clock time.

use std::fmt;

/// A validated proleptic-Gregorian calendar date.
#[derive(
    Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord, serde::Deserialize, serde::Serialize,
)]
#[serde(rename_all = "camelCase")]
pub struct CivilDate {
    pub year: i32,
    pub month: u8,
    pub day: u8,
}

/// Error returned when a civil date is not in the Gregorian calendar.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct InvalidCivilDate {
    year: i32,
    month: u8,
    day: u8,
}

impl fmt::Display for InvalidCivilDate {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "invalid civil date: {:04}-{:02}-{:02}",
            self.year, self.month, self.day
        )
    }
}

impl std::error::Error for InvalidCivilDate {}

impl CivilDate {
    /// Constructs a validated date.
    ///
    /// # Errors
    ///
    /// Returns [`InvalidCivilDate`] when `month` or `day` is out of range.
    pub fn new(year: i32, month: u8, day: u8) -> Result<Self, InvalidCivilDate> {
        if (1..=12).contains(&month) && (1..=days_in_month(year, month)).contains(&day) {
            Ok(Self { year, month, day })
        } else {
            Err(InvalidCivilDate { year, month, day })
        }
    }

    /// Parses an ISO `YYYY-MM-DD` date.
    ///
    /// # Errors
    ///
    /// Returns [`InvalidCivilDate`] for malformed or invalid input.
    pub fn parse_iso(value: &str) -> Result<Self, InvalidCivilDate> {
        let invalid = InvalidCivilDate {
            year: 0,
            month: 0,
            day: 0,
        };
        let mut parts = value.split('-');
        let year = parts.next().ok_or(invalid)?.parse().map_err(|_| invalid)?;
        let month = parts.next().ok_or(invalid)?.parse().map_err(|_| invalid)?;
        let day = parts.next().ok_or(invalid)?.parse().map_err(|_| invalid)?;
        if parts.next().is_some() {
            return Err(invalid);
        }
        Self::new(year, month, day)
    }

    /// Formats the date as ISO `YYYY-MM-DD`.
    #[must_use]
    pub fn to_iso(self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }

    /// Returns the exact number of civil days from `self` to `other`.
    #[must_use]
    pub fn days_until(self, other: Self) -> i64 {
        days_from_civil(other) - days_from_civil(self)
    }
}

/// Returns whether `year` is a Gregorian leap year.
#[must_use]
pub const fn is_leap_year(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

/// Returns the number of days in a valid month.
#[must_use]
pub const fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        2 if is_leap_year(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    }
}

// Howard Hinnant's days-from-civil algorithm, with 1970-01-01 as day zero.
fn days_from_civil(date: CivilDate) -> i64 {
    let mut year = i64::from(date.year);
    let month = i64::from(date.month);
    let day = i64::from(date.day);
    year -= i64::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let shifted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_leap_days() {
        assert!(CivilDate::new(2000, 2, 29).is_ok());
        assert!(CivilDate::new(1900, 2, 29).is_err());
    }

    #[test]
    fn counts_across_year_boundary() {
        let start = CivilDate::new(2023, 12, 31).unwrap();
        let end = CivilDate::new(2024, 3, 1).unwrap();
        assert_eq!(start.days_until(end), 61);
        assert_eq!(end.days_until(start), -61);
    }
}
