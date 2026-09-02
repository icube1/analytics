use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;

use crate::config::Config;
use crate::error::{ApiError, ApiResult};

pub async fn connect(config: &Config) -> ApiResult<SqlitePool> {
    let connect_options = parse_sqlite_url(&config.database_url)?
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(config.db_max_connections)
        .acquire_timeout(config.db_acquire_timeout)
        .connect_with(connect_options)
        .await?;

    let migrations = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let migrator = sqlx::migrate::Migrator::new(migrations.as_path())
        .await
        .map_err(|error| ApiError::Config {
            message: format!("failed to load migrations: {error}"),
        })?;
    migrator
        .run(&pool)
        .await
        .map_err(|error| ApiError::Config {
            message: format!("failed to run migrations: {error}"),
        })?;

    Ok(pool)
}

fn parse_sqlite_url(database_url: &str) -> ApiResult<SqliteConnectOptions> {
    let without_scheme =
        database_url
            .strip_prefix("sqlite://")
            .ok_or_else(|| ApiError::Config {
                message: "FINANCE_API_DATABASE_URL must use sqlite://".to_owned(),
            })?;

    let (path, _) = without_scheme
        .split_once('?')
        .unwrap_or((without_scheme, ""));

    if let Some(parent) = Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|error| ApiError::Config {
            message: format!("failed to create database directory: {error}"),
        })?;
    }

    Ok(SqliteConnectOptions::new().filename(path))
}
