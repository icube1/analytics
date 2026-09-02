use std::env;
use std::path::PathBuf;
use std::time::Duration;

use crate::error::ApiError;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: String,
    pub database_url: String,
    pub environment: Environment,
    pub auth_user: Option<String>,
    pub auth_password: Option<String>,
    pub bootstrap_email: Option<String>,
    pub bootstrap_password: Option<String>,
    pub bootstrap_display_name: Option<String>,
    pub bootstrap_household_name: Option<String>,
    pub billing_webhook_secret: Option<String>,
    pub session_ttl: chrono::Duration,
    pub session_cookie_secure: bool,
    pub max_request_bytes: usize,
    pub db_max_connections: u32,
    pub db_acquire_timeout: Duration,
    pub worker_concurrency: usize,
    pub job_timeout: chrono::Duration,
    pub max_pending_jobs_per_household: usize,
    pub idempotency_ttl: Duration,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Environment {
    Development,
    Production,
}

impl Config {
    pub fn from_env() -> Result<Self, ApiError> {
        let environment = match env::var("FINANCE_API_ENV")
            .or_else(|_| env::var("NODE_ENV"))
            .unwrap_or_else(|_| "development".to_owned())
            .as_str()
        {
            "production" => Environment::Production,
            _ => Environment::Development,
        };

        let database_url = env::var("FINANCE_API_DATABASE_URL").unwrap_or_else(|_| {
            let default_path = PathBuf::from(
                env::var("FINANCE_API_DATA_DIR").unwrap_or_else(|_| "data".to_owned()),
            )
            .join("finance-api.db");
            format!("sqlite://{}?mode=rwc", default_path.display())
        });

        Ok(Self {
            bind_addr: env::var("FINANCE_API_BIND").unwrap_or_else(|_| "127.0.0.1:8080".to_owned()),
            database_url,
            environment,
            auth_user: env::var("ANALYTICS_AUTH_USER")
                .ok()
                .filter(|value| !value.is_empty()),
            auth_password: env::var("ANALYTICS_AUTH_PASSWORD")
                .ok()
                .filter(|value| !value.is_empty()),
            bootstrap_email: env::var("FINANCE_API_BOOTSTRAP_EMAIL")
                .ok()
                .filter(|value| !value.is_empty()),
            bootstrap_password: env::var("FINANCE_API_BOOTSTRAP_PASSWORD")
                .ok()
                .filter(|value| !value.is_empty()),
            bootstrap_display_name: env::var("FINANCE_API_BOOTSTRAP_DISPLAY_NAME").ok(),
            bootstrap_household_name: env::var("FINANCE_API_BOOTSTRAP_HOUSEHOLD_NAME").ok(),
            billing_webhook_secret: env::var("FINANCE_API_BILLING_WEBHOOK_SECRET")
                .ok()
                .filter(|value| !value.is_empty()),
            session_ttl: chrono::Duration::seconds(parse_u64(
                "FINANCE_API_SESSION_TTL_SECS",
                604_800,
            )? as i64),
            session_cookie_secure: parse_bool(
                "FINANCE_API_SESSION_COOKIE_SECURE",
                environment == Environment::Production,
            )?,
            max_request_bytes: parse_usize("FINANCE_API_MAX_REQUEST_BYTES", 10 * 1024 * 1024)?,
            db_max_connections: parse_u32("FINANCE_API_DB_MAX_CONNECTIONS", 2)?,
            db_acquire_timeout: Duration::from_millis(parse_u64(
                "FINANCE_API_DB_ACQUIRE_TIMEOUT_MS",
                5_000,
            )?),
            worker_concurrency: parse_usize("FINANCE_API_WORKER_CONCURRENCY", 1)?,
            job_timeout: chrono::Duration::seconds(
                parse_u64("FINANCE_API_JOB_TIMEOUT_SECS", 120)? as i64
            ),
            max_pending_jobs_per_household: parse_usize(
                "FINANCE_API_MAX_PENDING_JOBS_PER_HOUSEHOLD",
                4,
            )?,
            idempotency_ttl: Duration::from_secs(parse_u64(
                "FINANCE_API_IDEMPOTENCY_TTL_SECS",
                86_400,
            )?),
        })
    }

    pub fn auth_configured(&self) -> bool {
        self.auth_user.is_some() && self.auth_password.is_some()
    }

    pub fn local_auth_enabled(&self) -> bool {
        self.bootstrap_email.is_some() && self.bootstrap_password.is_some()
    }
}

fn parse_bool(key: &str, default: bool) -> Result<bool, ApiError> {
    match env::var(key) {
        Ok(value) => match value.to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Ok(true),
            "0" | "false" | "no" | "off" => Ok(false),
            _ => Err(ApiError::Config {
                message: format!("invalid boolean for {key}"),
            }),
        },
        Err(_) => Ok(default),
    }
}

fn parse_u32(key: &str, default: u32) -> Result<u32, ApiError> {
    match env::var(key) {
        Ok(value) => value.parse().map_err(|_| ApiError::Config {
            message: format!("invalid integer for {key}"),
        }),
        Err(_) => Ok(default),
    }
}

fn parse_u64(key: &str, default: u64) -> Result<u64, ApiError> {
    match env::var(key) {
        Ok(value) => value.parse().map_err(|_| ApiError::Config {
            message: format!("invalid integer for {key}"),
        }),
        Err(_) => Ok(default),
    }
}

fn parse_usize(key: &str, default: usize) -> Result<usize, ApiError> {
    parse_u64(key, default as u64).map(|value| value as usize)
}
