# Blue-green platform deployment

Safe staging path for Astro (site), Vite (app), Axum (api), metrics dashboard, and
Next.js fallback **without switching public production**. Rust builds run on GitHub
Actions; the VPS only unpacks prebuilt binaries.

## Architecture

```text
GitHub Actions (verify + package)
        │
        ▼
platform-release.tar.gz  ──SCP──►  /opt/analytics-platform/releases/<version>/
        │                                    │
        │                                    ├─ staging/current → version
        │                                    ├─ data/ (SQLite WAL + backups)
        │                                    └─ finance-api @ 127.0.0.1:8080
        │
        ▼
Public traffic (unchanged)
  deploy/nginx-analytics.conf → Next @ 127.0.0.1:3000
```

Disabled nginx vhosts in `deploy/blue-green/*.conf.disabled` mirror HTTP/2 + TLS 1.2
+ Basic auth for future cutover. They are **not** enabled until `PLATFORM_CUTOVER=1`.

## Commands

```bash
# CI-equivalent packaging (builds Rust + all frontends)
bash scripts/package-platform-release.sh platform-release.tar.gz

# Local gate (package + loopback smoke, no systemd)
bash scripts/test-platform-package.sh

# VPS staging (keeps public Next vhost)
bash scripts/deploy-platform-release.sh platform-release.tar.gz
bash scripts/smoke-platform-release.sh

# Rollback staging symlink + restart finance-api
bash scripts/rollback-platform-release.sh

# Explicit cutover only
PLATFORM_CUTOVER=1 bash scripts/cutover-platform-release.sh
```

## Versioned release layout

| Path | Purpose |
|------|---------|
| `/opt/analytics-platform/releases/<version>/` | Immutable unpacked artifacts |
| `/opt/analytics-platform/staging/current` | Symlink to active staged release |
| `/opt/analytics-platform/staging/previous` | Prior release for rollback |
| `/opt/analytics-platform/data/` | SQLite (`finance-api.db`) |
| `/opt/analytics-platform/data/backups/` | Pre-deploy DB copies |

Tarball components:

- `finance-api/bin/finance-api` — release Axum binary (built on CI)
- `web/dist/` — Vite SPA
- `site/dist/` — Astro marketing site
- `metrics-dashboard/dist/` — observability dashboard
- `next/` — Next standalone fallback
- `manifest.json` — sizes only (no secrets)

## Secret hygiene

- Tarballs must not contain `.env`, credentials, or inline secrets (`package-platform-release.sh` enforces this).
- Server secrets live in `/etc/analytics-auth.env` (existing) and `/etc/analytics-finance-api.env` (see `deploy/blue-green/analytics-finance-api.env.example`).
- Deploy logs never print passwords or webhook secrets.

## finance-api systemd unit

`deploy/blue-green/finance-api.service`:

- runs as `analytics` (non-root)
- binds `127.0.0.1:8080` only
- `MemoryMax=192M`, `ProtectSystem=strict`, `NoNewPrivileges=true`
- SQLite data under `/opt/analytics-platform/data`

Migrations run automatically on startup (`sqlx::migrate` in `finance-api`).

## Smoke checks

`scripts/smoke-platform-release.sh` verifies:

1. All staged artifacts exist
2. `GET http://127.0.0.1:8080/health` returns `"database":"ok"` (migration + DB)
3. Artifact sizes from `manifest.json`
4. finance-api RSS (KiB) when running under systemd or local smoke

## Workflow gates

| Gate | When |
|------|------|
| `verify.yml` | PR + all deploy paths |
| `platform-package` job | Builds tarball on CI (Rust + frontends) |
| `smoke-platform-release.sh` | After VPS staging deploy |
| `PLATFORM_CUTOVER=1` | Required to enable nginx vhosts / stop Next public service |

Existing `deploy.yml` **Next-only production deploy is unchanged** unless cutover runs.

## Cutover prerequisites

Before `PLATFORM_CUTOVER=1`:

1. Staged release passes `smoke-platform-release.sh` on the VPS.
2. `/etc/analytics-finance-api.env` populated (bootstrap credentials, webhook secret).
3. TLS certs already present for `gala-soft.ru` (reuse paths in disabled configs; **no new DNS or cert issuance** in this workflow).
4. Optional: `/var/lib/analytics/observability/` for metrics `/data/` alias.
5. Manual validation of staging artifacts (loopback API + static file review).
6. Maintenance window agreed — cutover disables `analytics.service` (Next public).

Subdomain vhosts (`app.`, `api.`, `metrics.`) use the same `gala-soft.ru` certificate
until dedicated certs exist; update nginx SSL paths before external DNS cutover if needed.

## Rollback steps

### Staging rollback (safe, no public impact)

```bash
bash scripts/rollback-platform-release.sh
```

This rewinds `staging/current` → `staging/previous`, restarts `finance-api`, and re-runs smoke.

### Post-cutover rollback (public impact)

1. Re-enable Next production:
   ```bash
   systemctl enable --now analytics
   ln -sf /etc/nginx/sites-available/analytics /etc/nginx/sites-enabled/analytics
   rm -f /etc/nginx/sites-enabled/analytics-platform-*
   nginx -t && systemctl reload nginx
   ```
2. Roll back staging release (command above).
3. Confirm `https://gala-soft.ru` serves Next again.

## CI artifacts

`ci-reports/platform-release.json` and `platform-smoke.json` record tarball and
component sizes plus finance-api RSS from smoke runs.
