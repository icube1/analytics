use std::sync::Arc;

use sqlx::SqlitePool;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    pub pool: SqlitePool,
    pub config: Config,
}

impl AppState {
    pub fn new(pool: SqlitePool, config: Config) -> Self {
        Self {
            inner: Arc::new(AppStateInner { pool, config }),
        }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.inner.pool
    }

    pub fn config(&self) -> &Config {
        &self.inner.config
    }
}
