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
- `dto::v1`: serde request/response boundary with an explicit
  `schemaVersion: 1`. New transports should depend on this boundary rather
  than exposing Rust internals.

Monte Carlo, portfolio state mutation, asset growth, deposits, and UI wiring
remain in TypeScript.

## Compatibility contract

The source of truth for this slice remains `lib/debt-daycount.ts` and the debt
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
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
npm run compare:finance-core
npm test -- --runTestsByPath __tests__/debt-daycount.test.ts __tests__/upcoming-events.test.ts
npx tsc --noEmit
```

The Rust crate's minimum supported toolchain is Rust 1.83. The differential
script requires Node.js, npm dependencies, and Cargo; it builds only a local
test runner and does not alter production bundles.
