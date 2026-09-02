use std::sync::Arc;

use sqlx::SqlitePool;

use crate::config::Config;
use crate::observability::HttpMetrics;

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    pub pool: SqlitePool,
    pub config: Config,
    pub metrics: Arc<HttpMetrics>,
}

impl AppState {
    pub fn new(pool: SqlitePool, config: Config) -> Self {
        Self {
            inner: Arc::new(AppStateInner {
                pool,
                config,
                metrics: HttpMetrics::new(),
            }),
        }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.inner.pool
    }

    pub fn config(&self) -> &Config {
        &self.inner.config
    }

    pub fn metrics(&self) -> &Arc<HttpMetrics> {
        &self.inner.metrics
    }
}
