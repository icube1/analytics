# Rust finance core

`crates/finance-core` is the first platform-neutral finance slice. It is a
workspace library with both `rlib` and `cdylib` outputs so a native backend can
link it now and a later `wasm-bindgen` adapter can wrap the same public API.
No UI code calls Rust yet.

## Scope

- `date`: validated Gregorian `CivilDate`, exact civil-day differences, and
  leap/month handling without host time-zone behavior.
- `debt`: payment-period boundaries, actual/365 interest, monthly
  amortization, and payoff estimation.
- `resilience`: layered operational buffer, starter emergency fund, core and
  extended reserves, sinking funds, experiences fund, household/debt risk
  scoring, stress scenarios, and descriptive (non-advisory) notes.
- `dto::v1`: serde request/response boundary with an explicit
  `schemaVersion: 1`. New transports should depend on this boundary rather
  than exposing Rust internals.

Monte Carlo, portfolio state mutation, asset growth, deposits, and UI wiring
remain in TypeScript.

## Compound module

The compound slice ports deterministic projection, contribution growth/inflation,
withdrawals/taxes/IRR, portfolio/debt context, and seeded Monte Carlo from
`lib/compound-interest/*`:

- `compound::simulate` — monthly projection with accrual periods and snapshots.
- `compound::wealth` — debt stepping, custom asset growth, deposits, income.
- `compound::monte_carlo` — mulberry32-seeded paths with percentile bands.
- `dto::v1` operations: `compoundProjection`, `monteCarlo`.

Unsupported document fields (not read by Rust): `brokerReport`, `forecastPlans`,
`brokerSnapshots`, `debtBalanceHistory`. See `UNSUPPORTED_COMPOUND_FIELDS`.

`fixtures/finance-core/compound-v1.json` drives differential tests via
`npm run compare:finance-core:compound`. Parity tolerance: `1e-10` relative for
finite `f64` values (same as debt slice). Experimental UI integration is gated by
`NEXT_PUBLIC_RUST_COMPOUND_PARITY=1`; production keeps TypeScript unless parity
passes (`lib/compound-wasm.ts`).

Release benchmarks: `npm run benchmark:finance:rust` (TS vs Rust `compound` bench).

## Resilience module

The resilience slice models liquidity layers described in the product
architecture roadmap:

1. operational buffer (pay-cycle cash-flow gap),
2. starter emergency fund,
3. core reserve (income-loss coverage),
4. extended reserve (elevated household risk),
5. sinking funds (planned irregular expenses),
6. experiences fund (quality-of-life goals, separate from emergencies).

`dto::v1` exposes a `resiliencePlan` operation. Inputs include mandatory
expenses, liquid assets, household risk factors, debt burden, sinking-fund
goals, and experiences targets. Outputs include layer ranges, coverage
percentages, a risk score, five deterministic stress scenarios, factor
explanations, and descriptive debt-tradeoff notes. Nothing in this module
constitutes personalized securities or credit advice.

`fixtures/finance-core/resilience-v1.json` covers stable, variable-income, and
high-risk household cases. `lib/resilience-plan.ts` mirrors the Rust logic for
differential testing via `npm run compare:finance-core:resilience`.

## WebAssembly adapter

`crates/finance-wasm` wraps the versioned DTO batch evaluator for browser Worker
hosts:

- `evaluate_finance_core(request_json) -> response_json`
- `finance_core_schema_version() -> u16`

This adapter does not replace production TypeScript calculations yet. Build for
the `wasm32-unknown-unknown` target when the toolchain is available:

```bash
npm run build:wasm
```

The resilience UI (`/resilience`) lazy-loads this package from a dedicated Web
Worker with TypeScript fallback and non-production parity checks. See
`docs/resilience-ui.md`.

## Native mobile FFI adapter

`crates/finance-ffi` exposes the same versioned DTO batch contract through UniFFI
for iOS/Android hosts:

- `finance_core_schema_version() -> u16`
- `evaluate_finance_core(request_json) -> response_json`
- `evaluate_finance_core_monte_carlo_percentiles(request_json) -> percentile record`

Build and validate:

```bash
npm run build:ffi
npm run test:ffi
npm run measure:ffi
```

Capacitor continues to use WASM by default. See `docs/finance-native-ffi.md`.

## Compatibility contract

The source of truth for the debt slice remains `lib/debt-daycount.ts` and the debt
functions in `lib/debt-amortization.ts`. Rust intentionally preserves:

- payment-day rounding and clamping to 1–28;
- a payment on the as-of date beginning the next payment period;
- actual/365 simple interest and the `365 / 12` default period;
- principal capped by both payment after interest and remaining balance;
- the existing 600-payment payoff cap behavior.

`fixtures/finance-core/v1.json` covers bank-schedule examples and edge cases.
The differential command evaluates every fixture through both implementations
and compares integer/string/null values exactly and finite floating-point
values with a `1e-10` relative tolerance.

## Commands

Run from the repository root:

```bash
cargo fmt --all -- --check
cargo clippy -p finance-core -p finance-wasm -p finance-ffi --all-targets --all-features -- -D warnings
cargo test -p finance-core -p finance-wasm -p finance-ffi --all-features
cargo run --release -p finance-core --bench resilience
npm run compare:finance-core
npm run compare:finance-core:resilience
npm test -- --runTestsByPath __tests__/debt-daycount.test.ts __tests__/upcoming-events.test.ts __tests__/resilience-plan.test.ts
npx tsc --noEmit
```

The Rust crate's minimum supported toolchain is Rust 1.85 (required by current
dev-dependency lock resolution). The differential script requires Node.js, npm
dependencies, and Cargo; it builds only a local test runner and does not alter
production bundles.
