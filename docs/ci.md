# Monorepo CI

See `scripts/ci-verify.sh` for the deterministic local entry point.

## Workflows

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci.yml` | PR, push to `master`/`main` | `verify` |
| `deploy.yml` | push to `master`, manual | `verify` → `package` → `deploy` |

Deploy never runs unless `verify` passes. Production stays on **Next.js standalone** (not Vite/Axum).

## Local run

```bash
npm ci
bash scripts/ci-verify.sh --skip-install
bash scripts/package-deploy.sh deploy.tar.gz
```

## Rust

Pinned to **1.88.0** via `rust-toolchain.toml`. CI uses `dtolnay/rust-toolchain` + `Swatinem/rust-cache`.

## Turbopack NFT fix

Market benchmark disk cache loads via `import(/* turbopackIgnore: true */ "./cache")` so Turbopack does not trace the monorepo filesystem. Production cache dir: `MARKET_CACHE_DIR=/opt/analytics/data` in `deploy/analytics.service`.

## Standalone hygiene

`outputFileTracingExcludes` + `scripts/prepare-standalone.sh` prune `target/`, `crates/`, `apps/`, and other dev trees from `.next/standalone`.
