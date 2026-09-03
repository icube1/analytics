#![allow(
    clippy::ref_option,
    clippy::option_map_or_none,
    clippy::missing_errors_doc,
    clippy::assigning_clones,
    clippy::if_not_else,
    clippy::map_unwrap_or,
    clippy::needless_late_init,
    clippy::needless_pass_by_value,
    clippy::struct_excessive_bools,
    clippy::too_many_arguments
)]
//! Compound projection and Monte Carlo simulation.

#![allow(
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

pub mod deposits;
pub mod irr;
pub mod monte_carlo;
pub mod rates;
pub mod safe_withdrawal;
pub mod simulate;
pub mod snapshot;
pub mod taxes;
pub mod tracking;
pub mod types;
pub mod wealth;
pub mod withdrawal;

pub use monte_carlo::run_monte_carlo_simulation;
pub use safe_withdrawal::{
    compute_safe_withdrawal_advice, fixed_real_to_nominal_percent, is_withdrawal_sustainable,
    SafeWithdrawalAdvice,
};
pub use simulate::{calculate_compound_interest, CompoundError};
pub use tracking::{
    build_live_tracking_forecast, live_forecast_from_projection, LiveForecastResult,
    LiveTrackingInput,
};
pub use types::{
    CompoundContext, CompoundOptions, CompoundParams, CompoundResult, MonteCarloOptions,
    MonteCarloResult, UNSUPPORTED_COMPOUND_FIELDS,
};
