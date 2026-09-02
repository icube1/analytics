//! Platform-neutral finance calculations shared by native backends and future
//! WebAssembly bindings.

pub mod date;
pub mod debt;
pub mod dto;
pub mod resilience;

pub use date::CivilDate;
