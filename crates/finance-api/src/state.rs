use std::sync::Arc;

use sqlx::SqlitePool;

use crate::auth::AuthService;
use crate::billing::{build_billing_service, BillingService};
use crate::config::Config;
use crate::observability::HttpMetrics;
use crate::repositories::{AuditRepository, BillingRepository};
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
        let billing = build_billing_service(pool.clone(), &config).unwrap_or_else(|error| {
            tracing::warn!(error = %error, "falling back to null billing provider");
            BillingService::null(pool.clone())
        });
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
        let billing =
            build_billing_service(self.pool().clone(), self.config()).unwrap_or_else(|error| {
                tracing::warn!(error = %error, "falling back to null billing provider");
                BillingService::null(self.pool().clone())
            });
        Ok(Self {
            inner: Arc::new(Inner {
                pool: self.pool().clone(),
                config: self.config().clone(),
                auth: AuthService::new(self.pool().clone(), self.config().clone()),
                billing,
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

    pub fn audit(&self) -> AuditRepository {
        AuditRepository::new(self.pool().clone())
    }

    pub async fn shutdown(&self) {
        if let Some(executor) = &self.inner.executor {
            executor.shutdown().await;
        }
    }
}
