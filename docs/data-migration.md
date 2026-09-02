# Axum data migration and import storage

Safe, non-cutover migration path from the existing Analytics backup/portfolio JSON
and `statements/` directory into the Axum/SQLite product backend.

## Scope

- **In scope**: versioned migration CLI, import blob storage, statement/broker HTTP
  metadata+content endpoints, backup v1 export, tenant isolation, dedupe, rollback
  snapshots, dry-run/checksum/idempotent rerun.
- **Out of scope**: production routing cutover, broker HTML parsing in Rust, retention
  enforcement jobs.

## CLI

Binary: `finance-api-migrate`

```bash
export FINANCE_API_DATABASE_URL=sqlite://data/finance-api.db?mode=rwc

# Validate + fingerprint only (no writes)
cargo run -p finance-api --bin finance-api-migrate -- checksum \
  --backup fixtures/finance-api/backup-v1-minimal.json \
  --statements-dir fixtures/finance-api/statements

# Dry-run (validate + counts, no writes)
cargo run -p finance-api --bin finance-api-migrate -- import \
  --backup fixtures/finance-api/backup-v1-minimal.json \
  --statements-dir fixtures/finance-api/statements \
  --bootstrap-email owner@example.test \
  --bootstrap-password 'secret' \
  --dry-run

# Import into bootstrap owner household (creates user/household if missing)
cargo run -p finance-api --bin finance-api-migrate -- import \
  --backup fixtures/finance-api/backup-v1-minimal.json \
  --statements-dir fixtures/finance-api/statements \
  --bootstrap-email owner@example.test \
  --bootstrap-password 'secret' \
  --rollback-dir data/rollbacks

# Target an existing household
cargo run -p finance-api --bin finance-api-migrate -- import \
  --backup fixtures/finance-api/backup-v1-minimal.json \
  --household-id <uuid>

# Roll back using pre-migration DB snapshot
cargo run -p finance-api --bin finance-api-migrate -- rollback \
  --run-id <uuid> --household-id <uuid>
```

### CLI guarantees

| Feature | Behavior |
| --- | --- |
| Dry-run | Validates/sanitizes inputs, reports byte/count/checksum metadata only |
| Checksum | Computes `source_fingerprint` over backup JSON + sorted statement files |
| Idempotent rerun | Skips when `(household, migration_version, fingerprint)` already completed |
| Rollback | Copies file-backed SQLite DB before write; `rollback` restores snapshot |
| Logging | Never logs portfolio/statement/broker payloads (metadata only) |

## HTTP endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/statements` | List statement metadata (tenant-scoped) |
| POST | `/api/v1/statements` | Upload CSV statement content + metadata |
| GET | `/api/v1/statements/:id` | Statement metadata |
| GET | `/api/v1/statements/:id/content` | Raw content (`x-content-sha256` header) |
| GET | `/api/v1/broker/imports` | List broker import metadata |
| POST | `/api/v1/broker/imports` | Store broker file; parsing **delegated** (`parseDelegated: true`, `status: pending`) |
| GET | `/api/v1/broker/imports/:id` | Broker import metadata |
| GET | `/api/v1/broker/imports/:id/content` | Raw broker file bytes |
| GET | `/api/v1/backup/export` | Export Analytics backup v1 JSON |

All endpoints require a session (cookie or bearer). Tenant isolation is enforced via
`household_id` from the session — never from client headers.

Request bodies are limited by `FINANCE_API_MAX_REQUEST_BYTES` (default 10 MiB).

## Schema (`003_import_storage.sql`)

| Table / column | Purpose |
| --- | --- |
| `import_content_blobs` | Immutable deduped payload storage (`UNIQUE(household_id, checksum_sha256)`) |
| `statements.content_blob_id` | FK to blob; metadata row stays queryable without loading payload |
| `statements.provenance_source` | `api`, `migration`, … |
| `statements.retention_until` | Retention-ready nullable deadline |
| `broker_imports.parse_delegated` | Explicit flag: Rust stores only, TS pipeline parses |
| `broker_imports.status` | `pending` until delegated parser completes |
| `data_migration_runs` | CLI idempotency + rollback snapshot path |

## Backup v1 compatibility

Export shape matches `lib/backup-types.ts`:

```json
{
  "formatVersion": 1,
  "exportedAt": "<iso>",
  "portfolio": { "version": 1, ... },
  "statements": [{ "fileName": "...", "content": "..." }]
}
```

Import CLI accepts the same shape. Portfolio fields are normalized (`version: 1`);
statement file names are sanitized (basename, `.csv` only, no traversal).

## Resource / storage measurements

Measured on Linux amd64, Rust 1.88, empty WAL DB after migrations:

| Artifact | Approx. size |
| --- | --- |
| `import_content_blobs` per unique payload | `byte_size` + ~120 B index overhead |
| `statements` metadata row | ~300 B + `metadata_json` |
| `portfolio_revisions` row | `len(payload_json)` + ~200 B |
| Pre-migration rollback snapshot | Full SQLite file copy (same as DB size) |

Example fixture import (`backup-v1-minimal.json` + 1 extra CSV):

- Portfolio JSON: ~650 B
- Statements: ~90 B total raw content
- Deduped blobs: 2 rows (backup statement + `extra.csv`)

Measure locally:

```bash
/usr/bin/time -v cargo +1.88.0 test -p finance-api import_migration -- --nocapture
ls -lh data/finance-api.db data/rollbacks/ 2>/dev/null || true
```

## Tests

```bash
cargo +1.88.0 test -p finance-api import_migration
cargo +1.88.0 test -p finance-api
```

Covers: statement/broker roundtrips, checksum dedupe, negative tenant isolation,
backup export v1 shape, migration dry-run/idempotency/checksum.

## Blockers

1. **Production cutover** — reverse proxy still serves Next.js; Axum import API is not wired.
2. **Broker parsing** — HTML/JSON broker reports are stored raw; parsing remains in the
   existing TypeScript broker pipeline (`parseDelegated: true`).
3. **Retention enforcement** — `retention_until` column exists; no purge worker yet.
4. **In-memory SQLite rollback** — rollback snapshots require file-backed
   `FINANCE_API_DATABASE_URL` (CLI sets `FINANCE_API_DATABASE_FILE` automatically).
