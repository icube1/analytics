# finance-api product backend

`crates/finance-api` is a low-resource Axum modular-monolith backend foundation.
It is **not wired into production routing** yet; the existing Next.js API routes
remain authoritative.

## Architecture

```text
finance-api (binary)
├── auth            # opaque sessions, Argon2id, CSRF, login/logout/me
├── worker          # bounded SQLite job executor (resilience + finance-core DTO)
├── billing         # provider-neutral webhook ingestion (Null/Test/YooKassa*)
├── entitlements    # feature checks (e.g. resilience.compute)
├── routes
│   ├── /health
│   ├── /api/v1/auth/*
│   ├── /api/v1/portfolio
│   ├── /api/v1/statements
│   ├── /api/v1/broker/imports
│   ├── /api/v1/backup/export
│   ├── /api/v1/jobs/*
│   ├── /api/v1/audit-events
│   ├── /api/v1/usage-summary
│   └── /api/v1/billing/webhook
├── repositories    # tenant-scoped SQLite access
└── db              # SQLite WAL pool + embedded migrations
```

## Auth

- **Sessions**: opaque server-side tokens; SHA-256 hashed at rest
- **Web**: `finance_session` HttpOnly cookie + `X-CSRF-Token` on mutations
- **Mobile**: `Authorization: Bearer <token>` (CSRF exempt)
- **Passwords**: Argon2id via `local_credentials` (bootstrap env only)
- **Tenant context**: membership-based `household_id` from session, never client headers
- **Jobs**: `resilience.evaluate` (entitlement `resilience.compute`);
  `finance.evaluate` accepts a finance-core `RequestBatch`. Compound / money /
  tracking / safe-withdrawal run for any authenticated household. Monte Carlo
  requires `finance.heavy`. Identical `finance.evaluate` payloads are served
  from `calculation_results` keyed by `ENGINE_ID` + SHA-256.

### Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | public |
| POST | `/api/v1/auth/logout` | session |
| GET | `/api/v1/auth/me` | session |
| GET/PUT | `/api/v1/portfolio` | session |
| POST | `/api/v1/jobs` | session + entitlement |
| GET | `/api/v1/jobs/:id` | session |
| POST | `/api/v1/jobs/:id/cancel` | session |
| POST | `/api/v1/billing/webhook` | HMAC signature (Test) / API re-fetch (YooKassa*) |
| POST | `/api/v1/billing/checkout` | session + Idempotency-Key (YooKassa*) |
| GET/POST | `/api/v1/statements` | session |
| GET | `/api/v1/statements/:id(/content)` | session |
| GET/POST | `/api/v1/broker/imports` | session |
| GET | `/api/v1/broker/imports/:id(/content)` | session |
| GET | `/api/v1/backup/export` | session |
| GET | `/api/v1/audit-events` | session (`limit`, `action`, `before`) |
| GET | `/api/v1/usage-summary` | session |

## Schema (SQLite WAL)

Migrations: `001_initial.sql`, `002_product_backend.sql`, `003_import_storage.sql`,
`004_calculation_cache.sql`, `005_audit_events.sql`, `006_usage_events.sql`

| Table | Purpose |
| --- | --- |
| `sessions` | opaque web/mobile sessions |
| `local_credentials` | Argon2id password hashes |
| `statements` | statement import metadata + blob FK |
| `import_content_blobs` | immutable deduped import payloads |
| `broker_accounts` / `broker_imports` | broker import metadata (+ delegated parse flag) |
| `data_migration_runs` | CLI migration idempotency + rollback snapshots |
| `jobs` | bounded queue (+ timing/cancel columns) |
| `calculation_results` | per-household finance-core result cache |
| `audit_events` | household-scoped security events without amounts |
| `usage_events` | privacy-safe job/import counters |
| (existing) | users, households, memberships, portfolio, billing, entitlements |

## Resource limits

| Setting | Default | Env var |
| --- | --- | --- |
| DB pool size | 2 | `FINANCE_API_DB_MAX_CONNECTIONS` |
| Worker concurrency | 1 | `FINANCE_API_WORKER_CONCURRENCY` |
| Job timeout | 120s | `FINANCE_API_JOB_TIMEOUT_SECS` |
| Max pending jobs/household | 4 | `FINANCE_API_MAX_PENDING_JOBS_PER_HOUSEHOLD` |
| Session TTL | 7d | `FINANCE_API_SESSION_TTL_SECS` |
| Max request body | 10 MiB | `FINANCE_API_MAX_REQUEST_BYTES` |

## Commands

Requires Rust **1.88+**.

```bash
cargo +1.88.0 fmt --all
cargo +1.88.0 clippy -p finance-api --all-targets -- -D warnings
cargo +1.88.0 test -p finance-api
cargo +1.88.0 run -p finance-api
cargo +1.88.0 run -p finance-api --bin finance-api-migrate -- import --help
```

See `docs/data-migration.md` for migration/import CLI and endpoint details.

### Startup / RSS measurement

```bash
/usr/bin/time -v cargo +1.88.0 run -p finance-api &
sleep 2
PID=$(pgrep -n finance-api)
grep -E 'VmRSS|VmHWM' /proc/$PID/status
kill $PID
```

## Blockers / next steps

1. **Production routing** — reverse proxy still points at Next.js.
2. **OAuth/SSO** — local bootstrap accounts only; no external IdP.
3. **Real billing provider** — YooKassa adapter available but disabled by default; see `docs/yookassa-billing-ru.md`.
4. **Payload storage** — implemented in `003_import_storage.sql`; production routing still on Next.js.
5. **Broker parsing** — Rust stores raw imports only; parsing delegated to TS pipeline.
6. **Server finance jobs** — `finance.evaluate` runs the same DTO as WASM/native;
   production routing still points at Next.js, so clients keep using the local Worker.
