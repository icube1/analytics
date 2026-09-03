//! Platform-neutral finance calculations shared by native backends and future
//! WebAssembly bindings.

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss,
    clippy::cast_lossless,
    clippy::too_many_lines,
    clippy::must_use_candidate,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::ref_option,
    clippy::option_map_or_none
)]
pub mod compound;
pub mod date;
pub mod debt;
#[allow(clippy::too_many_lines)]
pub mod dto;
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::float_cmp,
    clippy::missing_panics_doc,
    clippy::must_use_candidate
)]
pub mod money;
pub mod resilience;

pub use compound::{
    calculate_compound_interest, run_monte_carlo_simulation, CompoundContext, CompoundError,
    CompoundOptions, CompoundParams, CompoundResult, MonteCarloOptions, MonteCarloResult,
    UNSUPPORTED_COMPOUND_FIELDS,
};
pub use date::CivilDate;
pub use money::{
    add_money, amortize_money, interest_money, money_from_major, money_from_minor, money_major,
    CurrencyCode, Money, MoneyAmortization, MoneyError, RoundingMode,
};
