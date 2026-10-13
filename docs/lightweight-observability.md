# Lightweight observability on a 1 GB VPS

Prometheus/Grafana-free stack: structured logs, authenticated snapshots, a minute collector, bounded retention, and a static dashboard for future `metrics.gala-soft.ru` cutover.

## Architecture

```mermaid
flowchart LR
  nginx[Nginx timing JSON log]
  node[Next.js /api/internal/health]
  axum[Axum /internal/metrics]
  collector[Collector timer]
  store[(JSONL latest.json)]
  dash[Static dashboard]
  nginx --> collector
  node --> collector
  axum --> collector
  collector --> store
  store --> dash
```

| Layer | Role | Default |
| --- | --- | --- |
| Nginx `analytics_timing` | Latency/status aggregates | Disabled snippet |
| finance-api JSON logs | systemd journal fields | Enabled |
| `/internal/metrics` | RSS, HTTP, jobs, DB pool | Auth required |
| `/api/internal/health` | Heap/RSS, cache, imports | Auth required |
| Collector | Minute snapshots + retention | systemd disabled |
| Dashboard | Private static UI | Build only |

## Metrics schema (v1)

Schema: `observability/schema/metrics-v1.schema.json`.

**Included:** CPU%, RSS, disk, HTTP latency percentiles, status classes, job queue counts by kind, market cache freshness/size, broker import success/fail counters.

**Excluded:** portfolio payloads, broker HTML, statements, backups, UUIDs, e-mails, idempotency keys, job payload/result JSON.

## Authentication

`Authorization: Bearer $OBSERVABILITY_TOKEN` when set, else HTTP Basic (`ANALYTICS_AUTH_USER` / `ANALYTICS_AUTH_PASSWORD`). Production fails closed without credentials.

## Storage

| Variable | Default |
| --- | --- |
| `OBSERVABILITY_DATA_DIR` | `data/observability` |
| `OBSERVABILITY_MAX_SAMPLES` | `10080` (~7d @ 1/min) |
| `OBSERVABILITY_MAX_JSONL_BYTES` | `5242880` (5 MB) |

```bash
npx tsx observability/collector/run.ts
npm run benchmark:observability
npm run build:metrics-dashboard
```

## Deployment gaps (intentional)

- Nginx vhost/timing snippets ship as `*.disabled`
- Collector systemd units disabled until `OBSERVABILITY_CUTOVER=1`
- No production routing changes until that cutover

### `metrics.gala-soft.ru` currently serves the Next.js app

DNS for `metrics.gala-soft.ru` already points at the VPS (`5.253.30.126`), but
the metrics vhost is still disabled. Production `deploy/nginx-analytics.conf`
listens on port 80 as `default_server`, so HTTP for any hostname — including
`metrics.` — 301s to HTTPS. The only TLS server is `gala-soft.ru` /
`www.gala-soft.ru`, which nginx uses as the default 443 vhost. Result:
`https://metrics.gala-soft.ru` is the ordinary Next.js site (login / 401), not
the static metrics dashboard.

The Let's Encrypt certificate SAN is only `gala-soft.ru` and `www.gala-soft.ru`.
There is no `metrics.gala-soft.ru` name, so browsers also show a certificate
warning. Enabling the dashboard needs a dedicated vhost (see
`deploy/observability/nginx-metrics-site.conf.disabled` or
`deploy/blue-green/nginx-metrics-staging.conf.disabled`), a matching
certificate, and `OBSERVABILITY_CUTOVER=1` / `PLATFORM_CUTOVER=1` — not a
silent fallback to the public app.

See `deploy/observability/README.md`.
