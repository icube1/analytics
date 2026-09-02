use std::sync::Arc;

use sqlx::SqlitePool;

use crate::auth::AuthService;
use crate::billing::BillingService;
use crate::config::Config;
use crate::observability::HttpMetrics;
use crate::repositories::BillingRepository;
use crate::worker::JobExecutor;

#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}

struct Inner {
    pool: SqlitePool,
    config: Config,
    auth: AuthService,
    billing: BillingService,
    executor: Option<JobExecutor>,
    metrics: Arc<HttpMetrics>,
}

impl AppState {
    pub fn new(pool: SqlitePool, config: Config) -> Self {
        let billing = if let Some(secret) = config.billing_webhook_secret.as_deref() {
            BillingService::test(pool.clone(), secret.as_bytes())
        } else {
            BillingService::null(pool.clone())
        };
        Self {
            inner: Arc::new(Inner {
                pool: pool.clone(),
                auth: AuthService::new(pool, config.clone()),
                billing,
                config,
                executor: None,
                metrics: HttpMetrics::new(),
            }),
        }
    }

    pub async fn with_worker(self) -> Result<Self, crate::error::ApiError> {
        self.auth().bootstrap_local_account().await?;
        let executor = JobExecutor::start(self.clone());
        Ok(Self {
            inner: Arc::new(Inner {
                pool: self.pool().clone(),
                config: self.config().clone(),
                auth: AuthService::new(self.pool().clone(), self.config().clone()),
                billing: if let Some(secret) = self.config().billing_webhook_secret.as_deref() {
                    BillingService::test(self.pool().clone(), secret.as_bytes())
                } else {
                    BillingService::null(self.pool().clone())
                },
                executor: Some(executor),
                metrics: Arc::clone(self.metrics()),
            }),
        })
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

    pub fn auth(&self) -> &AuthService {
        &self.inner.auth
    }

    pub fn billing(&self) -> &BillingService {
        &self.inner.billing
    }

    pub fn billing_repo(&self) -> BillingRepository {
        BillingRepository::new(self.pool().clone())
    }

    pub async fn shutdown(&self) {
        if let Some(executor) = &self.inner.executor {
            executor.shutdown().await;
        }
    }
}
