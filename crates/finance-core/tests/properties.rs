use finance_core::{
    date::{days_in_month, CivilDate},
    debt::{amortize_debt_month, current_payment_period_days, simulation_payment_period_days},
};
use proptest::prelude::*;

proptest! {
    #[test]
    fn civil_day_difference_is_antisymmetric(
        year in 1900i32..2200,
        month in 1u8..=12,
        day in 1u8..=28,
        other_year in 1900i32..2200,
        other_month in 1u8..=12,
        other_day in 1u8..=28,
    ) {
        let a = CivilDate::new(year, month, day).unwrap();
        let b = CivilDate::new(other_year, other_month, other_day).unwrap();
        prop_assert_eq!(a.days_until(b), -b.days_until(a));
    }

    #[test]
    fn monthly_periods_are_valid_calendar_lengths(
        year in 1900i32..2200,
        month in 1u8..=12,
        day in 1u8..=28,
        payment_day in 1u8..=28,
        simulation_month in 1i32..600,
    ) {
        let as_of = CivilDate::new(year, month, day).unwrap();
        let current = current_payment_period_days(f64::from(payment_day), as_of);
        let simulated = simulation_payment_period_days(
            as_of,
            simulation_month,
            f64::from(payment_day),
        );
        prop_assert!((28..=31).contains(&current));
        prop_assert!((28..=31).contains(&simulated));
    }

    #[test]
    fn amortization_conserves_balance_and_never_overpays_principal(
        balance in 0.01f64..10_000_000.0,
        payment in 0.01f64..1_000_000.0,
        rate in 0.0f64..100.0,
        days in 1.0f64..366.0,
    ) {
        let result = amortize_debt_month(balance, payment, rate, Some(days));
        prop_assert!(result.principal >= 0.0);
        prop_assert!(result.principal <= balance);
        prop_assert!(result.balance >= 0.0);
        prop_assert!((result.balance + result.principal - balance).abs() < 1e-7);
    }

    #[test]
    fn every_constructed_month_accepts_its_last_day(
        year in 1600i32..2400,
        month in 1u8..=12,
    ) {
        let last = days_in_month(year, month);
        prop_assert!(CivilDate::new(year, month, last).is_ok());
        prop_assert!(CivilDate::new(year, month, last + 1).is_err());
    }
}
