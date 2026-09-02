# Native finance FFI (`finance-ffi`)

Mobile-native bindings for `finance-core` using **UniFFI 0.27** (proc-macro mode).
The Capacitor WebView path remains the default compute backend (`finance-wasm` in
the finance worker). Native bindings are opt-in via a future Capacitor plugin.

## Why UniFFI (not hand-rolled per-month FFI)

| Requirement | Approach |
| --- | --- |
| Coarse batch APIs | Single `evaluate_finance_core(request_json)` call mirrors `finance-wasm` |
| No per-month chatter | Compound/Monte Carlo run entirely inside Rust |
| Panics never cross FFI | `catch_unwind` maps to `FinanceFfiError::Internal { code: PANIC_AT_FFI_BOUNDARY }` |
| No secret/payload logging | Boundary layer never logs request or response JSON |
| Kotlin + Swift | `uniffi-bindgen` emits host bindings from the same contract |

A stable C ABI header is copied from the Swift binding output
(`artifacts/finance-ffi/bindings/c/finance_ffi.h`, sourced from `finance_ffiFFI.h`)

## Exported API (schema version 1)

| Function | Input | Output | Notes |
| --- | --- | --- | --- |
| `finance_core_schema_version()` | — | `u16` | Matches `dto::v1::SCHEMA_VERSION` |
| `evaluate_finance_core` | JSON `RequestBatch` | JSON `ResponseBatch` or `FinanceFfiError` | Debt, resilience, compound, Monte Carlo |
| `evaluate_finance_core_monte_carlo_percentiles` | JSON batch with one `monteCarlo` case | `MonteCarloPercentiles` record | Percentile bands only (no path arrays) |

### Supported `operation` values (batch `cases[]`)

- `dayCount`, `amortize`, `estimatePayoff` — debt slice
- `resiliencePlan` — resilience slice
- `compoundProjection` — deterministic compound projection
- `monteCarlo` — full Monte Carlo result (batch) or percentile shortcut API

Fixture source of truth: `fixtures/finance-core/{v1,resilience-v1,compound-v1}.json`.

## Memory ownership and error model

### Strings and records

UniFFI owns the Rust → host transfer:

- **Input `String`**: copied into Rust for the duration of the call; host retains its copy.
- **Output `String`**: allocated by Rust, ownership transferred to Swift/Kotlin; freed by the UniFFI runtime when the host value is dropped.
- **`MonteCarloPercentiles`**: plain record; fields are `f64` scalars with no heap ownership.

Hosts must not free Rust pointers manually when using generated bindings.

### Errors (`FinanceFfiError`)

All failures are **typed errors**, never panics across the boundary:

| Variant | `code` examples | When |
| --- | --- | --- |
| `ParseFailed` | `PARSE_FAILED` | Invalid JSON |
| `EvaluationFailed` | `UNSUPPORTED_SCHEMA_VERSION_2`, `INVALID_DATE`, `COMPOUND_EVALUATION_FAILED`, `MONTE_CARLO_BATCH_REQUIRES_SINGLE_CASE` | Domain or schema errors |
| `SerializeFailed` | `SERIALIZE_FAILED` | Response JSON encoding failed |
| `Internal` | `PANIC_AT_FFI_BOUNDARY` | Rust panic caught at boundary |

Error messages intentionally carry **codes only**, not user payloads, balances, or tokens.

### Threading

Exports are synchronous and re-entrant safe for independent calls. Hosts should
serialize calls on a single background queue if they share mutable UI state.

## Mobile integration adapter (design)

```text
apps/web/lib/finance-worker/*
        │ same JSON batch contract
        ▼
┌───────────────────────────────────────┐
│  Capacitor FinanceNativePlugin (future) │
│  - mirrors resilience-contract.ts       │
│  - selects native vs WASM vs TS         │
└───────────────────────────────────────┘
        │ evaluate_finance_core(json)
        ▼
┌───────────────────────────────────────┐
│  finance-ffi (UniFFI)                  │
│  libfinance_ffi.a / .so                │
└───────────────────────────────────────┘
        │
        ▼
   finance-core
```

### Selection order (keep WASM default)

1. **Web / Capacitor without plugin** → existing finance worker + `finance-wasm`.
2. **Capacitor with `@analytics/finance-native` plugin** → UniFFI bindings on a background executor.
3. **TypeScript fallback** → unchanged parity path.

Plugin surface (proposed):

```typescript
interface FinanceNativeBridge {
  schemaVersion(): Promise<number>;
  evaluateBatch(requestJson: string): Promise<string>;
  evaluateMonteCarloPercentiles(requestJson: string): Promise<MonteCarloPercentiles>;
}
```

Registration hooks live beside `initCapacitorShell()`; no store accounts or
committed `ios/` / `android/` trees are required for local development.

## Build commands

```bash
npm run build:ffi              # release cdylib + bindings
npm run test:ffi               # cross-binding fixture tests + binding scaffolding
npm run measure:ffi            # artifact sizes (host + installed mobile targets)
```

Low-level:

```bash
bash scripts/build-finance-ffi.sh
FINANCE_FFI_TARGET=aarch64-apple-ios bash scripts/build-finance-ffi.sh
bash scripts/generate-finance-ffi-bindings.sh
bash scripts/test-finance-ffi-bindings.sh
```

## External toolchain blockers

| Tool | Purpose | Required for |
| --- | --- | --- |
| Rust ≥ 1.88 (workspace MSRV) | Build `finance-ffi` | CI + local |
| `rustup target add aarch64-apple-ios` etc. | Mobile static libs | Device/simulator binaries |
| Xcode + `swiftc` | Swift binding compile check | Optional validation |
| Android NDK + `kotlinc` | Kotlin binding compile check | Optional validation |
| UniFFI ≥ 0.27, &lt; 0.32 on MSRV 1.88 | Bindgen | Pinned in crate; 0.32 needs Rust 1.91 |

No App Store / Play Console accounts are required for artifact generation.

## Artifacts (gitignored)

```
artifacts/finance-ffi/
  libfinance_ffi.so | .a
  bindings/
    swift/
    kotlin/
    c/finance_ffi.h
```

## Testing

- `cargo test -p finance-ffi` — unit + `cross_binding_fixtures` parity vs `finance-core`
- `bash scripts/test-finance-ffi-bindings.sh` — binding file presence + optional Swift/Kotlin syntax checks
- Existing WASM/TS parity scripts remain the production default checks
