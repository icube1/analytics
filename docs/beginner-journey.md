# Beginner financial-independence journey

The `/journey` route is an ethical, privacy-first onboarding path that builds on
the existing `/resilience` vertical slice instead of duplicating its calculation
engine.

## Principles

- **Baby steps with branching** — versioned milestone catalog (`JOURNEY_CATALOG_VERSION`)
  covers baseline data quality, cash-flow control, operational buffer,
  starter/core/extended emergency funds, debt/liquidity trade-offs, sinking funds,
  experiences, sustainable contributions, capital milestones, and periodic
  plan-vs-fact review.
- **Household variants** — copy and auto-detection adapt to solo, couple, and
  dependent profiles from resilience household inputs.
- **Forgiving continuity** — rolling weekly engagement counts, not daily streaks.
- **Immediate quantified feedback** — progress, stress coverage, and surplus
  allocation (`lib/journey/surplus-allocation.ts`) are derived from
  `evaluateResiliencePlan` / resilience storage inputs. Sinking funds and the
  experiences fund can be edited on `/journey` without leaving the path.
- **User control** — reorder milestones, opt out of optional steps, reset,
  export/import JSON, full local delete.
- **No gamification harms** — no leaderboards, trade incentives, shame framing,
  guaranteed outcomes, or named securities.
- **Privacy-safe events** — product events record milestone ids and timestamps
  only; telemetry sink is **disabled by default**.

## Architecture

| Layer | Path |
| --- | --- |
| Milestone catalog | `lib/journey/milestones.ts` |
| Progress engine | `lib/journey/progress.ts` |
| Surplus allocation | `lib/journey/surplus-allocation.ts` |
| Continuity | `lib/journey/continuity.ts` |
| Local persistence | `lib/journey-storage.ts` |
| Product events | `lib/product-events/schema.ts`, `telemetry.ts` |
| UI | `components/journey/*` |

Resilience baseline data is read from `analytics.resilience-baseline.v1`.
Journey state is stored in `analytics.beginner-journey.v1`.

## Routes

| App | Path |
| --- | --- |
| Next.js | `/journey` |
| Vite SPA | `/journey` |

## Commands

```bash
npm test -- --runTestsByPath __tests__/journey.test.ts __tests__/journey-review.test.ts __tests__/journey-surplus-allocation.test.ts __tests__/product-events.test.ts
npm run build
npm run build:web
npm run test:web
npm run test:mobile
npm run verify:mobile
```

## Product events

Events conform to `PRODUCT_EVENT_SCHEMA_VERSION = 1`:

```json
{
  "schemaVersion": 1,
  "kind": "milestone_completed",
  "milestoneId": "operational-buffer",
  "occurredAt": "2026-09-02T12:00:00.000Z"
}
```

Financial amounts are never included. Enable outbound telemetry only via
`configureTelemetrySink({ enabled: true, endpoint })` — not used in production UI.
