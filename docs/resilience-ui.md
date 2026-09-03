# Resilience UI vertical slice

The `/resilience` route is the first user-facing baby-steps slice for financial
resilience planning. It is shared between the current Next.js app and the Vite
SPA under `apps/web` without replacing the production shell.

## Features

- Quick baseline inputs (mandatory/discretionary spend, liquidity, surplus,
  pay cycle).
- Layered reserves: operational buffer, starter emergency fund, core reserve,
  extended reserve, sinking funds, experiences fund.
- Household and debt factors with immediate explanatory feedback.
- Six deterministic stress scenarios, including a family care/medical shock.
- Ethical progress UX: neutral milestone language, no shame framing.
- Local persistence in `localStorage` with `schemaVersion: 1`.
- Responsive two-column layout with accessible form controls and progress bars.

## Calculation path

1. Debounced input changes trigger a dedicated resilience Web Worker.
2. The worker lazy-loads `public/wasm/finance-wasm` when WASM is preferred.
3. TypeScript `evaluateResiliencePlan` is the deterministic fallback.
4. In non-production builds, TS/WASM parity is checked before returning WASM
   output.
5. Stale in-flight worker jobs are cancelled when inputs change.

Financial payloads are not sent to product telemetry. Only engine metadata
(`typescript` vs `wasm`, parity flag) is shown in the UI.

## Commands

```bash
bash scripts/build-finance-wasm.sh
npm run compare:finance-core:resilience
npm test -- --runTestsByPath __tests__/resilience-plan.test.ts __tests__/resilience-storage.test.ts __tests__/resilience-parity.test.ts __tests__/resilience-worker.test.ts
npm run build
npm run build:web
cargo test -p finance-core -p finance-wasm --all-features
```

## Routes

| App | Path |
| --- | --- |
| Next.js | `/resilience` |
| Vite SPA | `/resilience` |
