//! Low-resource Axum modular-monolith API foundation.
#![allow(clippy::pedantic, clippy::type_complexity)]

pub mod app;
pub mod auth;
pub mod billing;
pub mod config;
pub mod db;
pub mod error;
pub mod models;
pub mod repositories;
pub mod routes;
pub mod state;

pub use app::{build_app, init_tracing, startup_banner};
pub use config::Config;
pub use error::ApiError;
pub use state::AppState;
