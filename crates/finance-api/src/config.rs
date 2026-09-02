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
    pub max_request_bytes: usize,
    pub db_max_connections: u32,
    pub db_acquire_timeout: Duration,
    pub worker_concurrency: usize,
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
            max_request_bytes: parse_usize("FINANCE_API_MAX_REQUEST_BYTES", 10 * 1024 * 1024)?,
            db_max_connections: parse_u32("FINANCE_API_DB_MAX_CONNECTIONS", 2)?,
            db_acquire_timeout: Duration::from_millis(parse_u64(
                "FINANCE_API_DB_ACQUIRE_TIMEOUT_MS",
                5_000,
            )?),
            worker_concurrency: parse_usize("FINANCE_API_WORKER_CONCURRENCY", 1)?,
            idempotency_ttl: Duration::from_secs(parse_u64(
                "FINANCE_API_IDEMPOTENCY_TTL_SECS",
                86_400,
            )?),
        })
    }

    pub fn auth_configured(&self) -> bool {
        self.auth_user.is_some() && self.auth_password.is_some()
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
