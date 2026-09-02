use crate::repositories::{JobRepository, JOB_KIND_RESILIENCE};
use crate::state::AppState;
use finance_core::resilience::{evaluate_resilience, ResilienceInput};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, Semaphore};
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

pub struct JobExecutor {
    shutdown: CancellationToken,
    handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl JobExecutor {
    pub fn start(state: AppState) -> Self {
        let shutdown = CancellationToken::new();
        let ws = shutdown.clone();
        let config = state.config().clone();
        let pool = state.pool().clone();
        let handle = tokio::spawn(async move {
            let jobs = JobRepository::new(pool.clone());
            let global = Arc::new(Semaphore::new(config.worker_concurrency.max(1)));
            let per: Arc<Mutex<HashMap<uuid::Uuid, Arc<Semaphore>>>> =
                Arc::new(Mutex::new(HashMap::new()));
            loop {
                if ws.is_cancelled() {
                    break;
                }
                let _ = jobs.reap_timed_out().await;
                let Ok(permit) = global.clone().acquire_owned().await else {
                    break;
                };
                let job = match jobs
                    .claim_next(chrono::Utc::now() + config.job_timeout)
                    .await
                {
                    Ok(j) => j,
                    Err(e) => {
                        warn!(error=%e, "claim failed");
                        drop(permit);
                        tokio::time::sleep(Duration::from_millis(250)).await;
                        continue;
                    }
                };
                let Some(job) = job else {
                    drop(permit);
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    continue;
                };
                let sem = {
                    let mut g = per.lock().await;
                    g.entry(job.household_id)
                        .or_insert_with(|| Arc::new(Semaphore::new(1)))
                        .clone()
                };
                let jobs = JobRepository::new(pool.clone());
                let timeout = config
                    .job_timeout
                    .to_std()
                    .unwrap_or(Duration::from_secs(120));
                tokio::spawn(async move {
                    let _g = permit;
                    let Ok(_t) = sem.acquire_owned().await else {
                        return;
                    };
                    if jobs.is_cancel_requested(job.id).await.unwrap_or(false) {
                        return;
                    }
                    let exec = async {
                        match job.kind.as_str() {
                            JOB_KIND_RESILIENCE => run_resilience(&job.payload_json),
                            k => Err(format!("unsupported: {k}")),
                        }
                    };
                    let result = tokio::time::timeout(timeout, exec).await;
                    if jobs.is_cancel_requested(job.id).await.unwrap_or(false) {
                        return;
                    }
                    match result {
                        Ok(Ok(json)) => {
                            let _ = jobs.mark_completed(job.id, &json).await;
                            info!(job_id=%job.id, "completed");
                        }
                        Ok(Err(msg)) => {
                            let _ = jobs.mark_failed(job.id, &msg).await;
                        }
                        Err(_) => {
                            let _ = jobs.mark_failed(job.id, "execution timed out").await;
                        }
                    }
                });
            }
        });
        Self {
            shutdown,
            handle: Mutex::new(Some(handle)),
        }
    }
    pub async fn shutdown(&self) {
        self.shutdown.cancel();
        if let Some(h) = self.handle.lock().await.take() {
            let _ = h.await;
        }
    }
}

fn run_resilience(payload: &str) -> Result<String, String> {
    let input: ResilienceInput = serde_json::from_str(payload).map_err(|e| e.to_string())?;
    serde_json::to_string(&evaluate_resilience(&input)).map_err(|e| e.to_string())
}
