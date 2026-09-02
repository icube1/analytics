use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;

const LATENCY_BUCKETS_MS: &[u64] = &[5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];

#[derive(Debug)]
pub struct HttpMetrics {
    started_at: Instant,
    total_requests: AtomicU64,
    status_2xx: AtomicU64,
    status_3xx: AtomicU64,
    status_4xx: AtomicU64,
    status_5xx: AtomicU64,
    latency_buckets: Vec<AtomicU64>,
}

impl HttpMetrics {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            started_at: Instant::now(),
            total_requests: AtomicU64::new(0),
            status_2xx: AtomicU64::new(0),
            status_3xx: AtomicU64::new(0),
            status_4xx: AtomicU64::new(0),
            status_5xx: AtomicU64::new(0),
            latency_buckets: (0..=LATENCY_BUCKETS_MS.len())
                .map(|_| AtomicU64::new(0))
                .collect(),
        })
    }

    pub fn record(&self, status: u16, latency_ms: f64) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        match status {
            200..=299 => self.status_2xx.fetch_add(1, Ordering::Relaxed),
            300..=399 => self.status_3xx.fetch_add(1, Ordering::Relaxed),
            400..=499 => self.status_4xx.fetch_add(1, Ordering::Relaxed),
            _ => self.status_5xx.fetch_add(1, Ordering::Relaxed),
        };
        self.latency_buckets[latency_bucket_index(latency_ms)].fetch_add(1, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> HttpMetricsSnapshot {
        let total = self.total_requests.load(Ordering::Relaxed);
        let buckets: Vec<u64> = self
            .latency_buckets
            .iter()
            .map(|counter| counter.load(Ordering::Relaxed))
            .collect();

        HttpMetricsSnapshot {
            uptime_secs: self.started_at.elapsed().as_secs_f64(),
            requests: total,
            latency_ms: percentile_from_buckets(&buckets, total),
            status: StatusBreakdown {
                s2xx: self.status_2xx.load(Ordering::Relaxed),
                s3xx: self.status_3xx.load(Ordering::Relaxed),
                s4xx: self.status_4xx.load(Ordering::Relaxed),
                s5xx: self.status_5xx.load(Ordering::Relaxed),
            },
        }
    }
}

#[derive(Serialize)]
pub struct HttpMetricsSnapshot {
    pub uptime_secs: f64,
    pub requests: u64,
    pub latency_ms: LatencyPercentiles,
    pub status: StatusBreakdown,
}

#[derive(Serialize)]
pub struct LatencyPercentiles {
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
}

#[derive(Serialize)]
pub struct StatusBreakdown {
    #[serde(rename = "2xx")]
    pub s2xx: u64,
    #[serde(rename = "3xx")]
    pub s3xx: u64,
    #[serde(rename = "4xx")]
    pub s4xx: u64,
    #[serde(rename = "5xx")]
    pub s5xx: u64,
}

fn latency_bucket_index(latency_ms: f64) -> usize {
    let value = latency_ms.max(0.0) as u64;
    LATENCY_BUCKETS_MS
        .iter()
        .position(|&upper| value <= upper)
        .unwrap_or(LATENCY_BUCKETS_MS.len())
}

fn percentile_from_buckets(buckets: &[u64], total: u64) -> LatencyPercentiles {
    if total == 0 {
        return LatencyPercentiles {
            p50: 0.0,
            p95: 0.0,
            p99: 0.0,
        };
    }
    LatencyPercentiles {
        p50: bucket_percentile(buckets, total, 0.50),
        p95: bucket_percentile(buckets, total, 0.95),
        p99: bucket_percentile(buckets, total, 0.99),
    }
}

fn bucket_percentile(buckets: &[u64], total: u64, quantile: f64) -> f64 {
    let target = ((total as f64) * quantile).ceil() as u64;
    let mut seen = 0_u64;
    for (index, count) in buckets.iter().enumerate() {
        seen += count;
        if seen >= target {
            return bucket_upper_bound_ms(index);
        }
    }
    bucket_upper_bound_ms(buckets.len().saturating_sub(1))
}

fn bucket_upper_bound_ms(index: usize) -> f64 {
    if index >= LATENCY_BUCKETS_MS.len() {
        LATENCY_BUCKETS_MS.last().copied().unwrap_or(10_000) as f64
    } else {
        LATENCY_BUCKETS_MS[index] as f64
    }
}

pub fn sanitize_route(path: &str) -> String {
    let segments: Vec<&str> = path
        .split('/')
        .filter(|part| !part.is_empty())
        .map(|segment| {
            if uuid::Uuid::parse_str(segment).is_ok()
                || (segment.len() >= 16
                    && segment
                        .chars()
                        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-'))
            {
                ":id"
            } else {
                segment
            }
        })
        .collect();
    format!("/{}", segments.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_uuid_path_segments() {
        let id = uuid::Uuid::new_v4();
        assert_eq!(
            sanitize_route(&format!("/api/v1/portfolio/{id}/items")),
            "/api/v1/portfolio/:id/items"
        );
    }
}
