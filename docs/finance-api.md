# finance-api foundation

`crates/finance-api` is a low-resource Axum modular-monolith backend foundation.
It is **not wired into production routing** yet; the existing Next.js API routes
remain authoritative.

## Architecture

```text
finance-api (binary)
├── config          # env-driven settings, pool/worker limits
├── app             # router assembly, tracing, request limits
├── auth            # temporary owner Basic auth + session-ready TenantScope
├── routes
│   ├── /health
│   └── /api/v1/portfolio   # sync vertical slice
├── repositories    # tenant-scoped SQLite access
├── billing         # provider-neutral BillingProvider trait (Null impl)
└── db              # SQLite WAL pool + embedded migrations
```

Tenant boundary: every repository method takes `TenantScope { household_id }`.
Handlers resolve `AuthContext` from `X-User-Id` + `X-Household-Id` after auth and
membership checks.

## Schema (SQLite WAL)

Migration: `crates/finance-api/migrations/001_initial.sql`

| Table | Purpose |
| --- | --- |
| `users` | global identity |
| `households` | tenant root |
| `household_members` | memberships (`owner` / `member` / `viewer`) |
| `devices` | registered clients per household |
| `portfolio_documents` | revision head per household |
| `portfolio_revisions` | immutable document payloads |
| `jobs` | bounded job queue rows |
| `subscriptions` | provider-neutral subscription state |
| `entitlements` | feature grants per household |
| `billing_events` | append-only billing audit log |
| `idempotency_responses` | cached HTTP responses |

All tenant-owned tables include `household_id`. Unique indexes include the tenant key.

## Resource-conscious defaults

| Setting | Default | Env var |
| --- | --- | --- |
| DB pool size | 2 | `FINANCE_API_DB_MAX_CONNECTIONS` |
| DB acquire timeout | 5s | `FINANCE_API_DB_ACQUIRE_TIMEOUT_MS` |
| Worker concurrency | 1 | `FINANCE_API_WORKER_CONCURRENCY` |
| Max request body | 10 MiB | `FINANCE_API_MAX_REQUEST_BYTES` |
| Idempotency TTL | 24h | `FINANCE_API_IDEMPOTENCY_TTL_SECS` |

SQLite uses WAL + `synchronous=NORMAL` on connect.

## Auth boundary

Mirrors `lib/server-auth.ts`:

- development: open when `ANALYTICS_AUTH_USER` / `ANALYTICS_AUTH_PASSWORD` absent
- production: fails closed (`503`) without credentials; `401` on invalid Basic auth

Session-ready headers (required for `/api/v1/*`):

- `X-User-Id`: UUID
- `X-Household-Id`: UUID (must match membership)

## Portfolio sync contract

`GET /api/v1/portfolio`

```json
{
  "schemaVersion": 1,
  "revision": 0,
  "householdId": "...",
  "document": {},
  "updatedAt": "..."
}
```

`PUT /api/v1/portfolio`

Request:

```json
{
  "schemaVersion": 1,
  "baseRevision": 0,
  "document": { "version": 1 }
}
```

Headers: `Idempotency-Key` (optional, deduplicates for 24h).

Semantics:

- `baseRevision` mismatch → `409 revision_conflict`
- duplicate idempotency key → replay stored response
- revision stored immutably in `portfolio_revisions`

## Commands

Requires Rust **1.88+** (transitive `axum` / `sqlx` dependency floor).

```bash
cargo +1.88.0 fmt --all
cargo +1.88.0 clippy -p finance-api --all-targets -- -D warnings
cargo +1.88.0 test -p finance-api
cargo +1.88.0 run -p finance-api
```

### Startup / RSS measurement

```bash
/usr/bin/time -v cargo +1.88.0 run -p finance-api &
sleep 2
PID=$(pgrep -n finance-api)
grep -E 'VmRSS|VmHWM' /proc/$PID/status
kill $PID
```

## Blockers / next steps

1. **Production routing** — reverse proxy still points at Next.js; wire `api.gala-soft.ru` separately.
2. **Real sessions** — replace header-based tenant resolution with signed session tokens.
3. **Job worker loop** — schema + repository exist; bounded executor not started yet.
4. **Billing provider** — `NullBillingProvider` only; no external credentials by design.
5. **MSRV split** — `finance-core` remains 1.85; `finance-api` needs 1.88 until deps are pinned down.
