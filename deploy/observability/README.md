# Lightweight observability (disabled until cutover)

Enable only after `OBSERVABILITY_CUTOVER=1`. DNS/TLS for `metrics.gala-soft.ru` are manual steps.

## Cutover checklist

1. Install nginx snippets and metrics vhost (`*.disabled` → live paths).
2. Enable logrotate config and collector systemd timer.
3. Set `/etc/analytics-observability.env` (`OBSERVABILITY_TOKEN`, auth header).
4. Build dashboard: `npm run build:metrics-dashboard` → `/opt/analytics/metrics-dashboard`.
5. Reload nginx; enable `analytics-metrics-collector.timer`.

Run `bash deploy/observability/install.sh.disabled` only when `OBSERVABILITY_CUTOVER=1`.
