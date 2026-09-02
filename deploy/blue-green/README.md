# Blue-green platform deployment (staging only)

Artifacts land in versioned release directories under `/opt/analytics-platform`.
Public production stays on the existing Next.js vhost (`deploy/nginx-analytics.conf`)
until `PLATFORM_CUTOVER=1`.

## Layout

```text
/opt/analytics-platform/
├── data/                         # persistent SQLite + backups (not in tarball)
├── data/backups/
├── releases/<version>/           # immutable unpacked release
├── staging/current -> releases/<version>
└── staging/previous -> releases/<older>
```

## Units and configs

| File | Purpose |
|------|---------|
| `finance-api.service` | Hardened non-root Axum unit, loopback `:8080` |
| `nginx-*-staging.conf.disabled` | HTTP/2 + TLS 1.2 + Basic auth vhosts (not enabled by default) |
| `analytics-finance-api.env.example` | Server-only secrets template |

## Scripts (repo root)

```bash
bash scripts/package-platform-release.sh          # CI / laptop build
bash scripts/test-platform-package.sh               # local packaging + smoke gate
bash scripts/deploy-platform-release.sh <tarball>   # VPS staging install
bash scripts/smoke-platform-release.sh              # health + migration checks
bash scripts/rollback-platform-release.sh           # revert staging symlink
PLATFORM_CUTOVER=1 bash scripts/cutover-platform-release.sh
```

See `docs/blue-green-deployment.md` for cutover prerequisites and rollback.
