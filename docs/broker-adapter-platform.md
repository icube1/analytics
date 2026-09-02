# Broker adapter platform

Versioned import pipeline for brokerage reports. Production adapters require sanitized fixtures in the repository; additional broker formats are documented below until real fixtures land.

## Public API

| Entry point | Purpose |
|-------------|---------|
| `importBrokerReport(input)` | Detect adapter, parse, reconcile, return warnings/errors |
| `detectBrokerAdapters(input)` | Rank adapters by confidence |
| `parsePortfolioHtml(html)` | **Legacy facade** — returns `BrokerReport` (Sber-compatible) |
| `listBrokerAdapters()` | Registered production adapters |

### `BrokerImportInput`

```ts
{
  content: string;
  fileName?: string;
  mimeType?: string;
  sanitizeFixture?: boolean; // runs scripts/sanitize-broker-fixture.ts
}
```

### `BrokerImportResult`

- `report` — enriched `BrokerReport` when recognition succeeds
- `ledger` — normalized intermediate representation
- `provenance` — adapter id/version, bytes, sanitization flag
- `coverage` — which sections were parsed and row counts
- `warnings` — non-fatal issues (`INVALID_NUMBER`, `SKIPPED_ROW`, `RECONCILIATION_MISMATCH`, …)
- `reconciliation` — reported vs computed totals (RUB tolerance ±1)
- `errors` — deterministic codes (`NO_ADAPTER_MATCH`, `FILE_TOO_LARGE`, `RECOGNITION_FAILED`, …)

## Production adapters

| ID | Format | Fixtures |
|----|--------|----------|
| `sber-html-v1` | Sber Investments HTML | `public/portfolio.html`, `__tests__/fixtures/sber-t1-report.html` |
| `manual-csv-v1` | Manual CSV template | generated via `buildManualCsvTemplate()` |

## Import safety limits

Defined in `lib/broker-adapters/limits.ts`:

- Max file size: 12 MiB
- Max securities: 5 000
- Max trades: 50 000
- Max cash flows: 20 000
- Reconciliation tolerance: ±1 ₽

Malformed **required** numeric cells emit `INVALID_NUMBER` and the row is skipped — they are **not** coerced to `0`. Empty cells and em-dash markers still map to zero.

## Fixture sanitization

Set `sanitizeFixture: true` on import to strip PII before parsing. The standalone script remains:

```bash
npm run sanitize:broker-fixtures
```

See [broker-fixture-sanitization.md](./broker-fixture-sanitization.md).

## Planned adapters (fixtures required)

No production parser is registered until sanitized sample files exist in `__tests__/fixtures/`.

### T-Bank (`tbank-xlsx`)

**Need:** period portfolio XLSX export (positions + cash + trades sheets).

| Field | Requirement |
|-------|-------------|
| Positions | ISIN or ticker, quantity end, price end, market value |
| Cash | currency, end balance |
| Trades | trade date, settlement date, side, qty, price, amount, fees |
| Meta | investor label (sanitized), contract/account id (sanitized), period dates |

### VTB (`vtb-xls` / `vtb-xlsx`)

**Need:** VTB brokerage report `.xls` or `.xlsx` with portfolio and movement sections.

| Field | Requirement |
|-------|-------------|
| Securities table | name, ISIN, venue, opening/closing qty and value |
| Cash | RUB and FX balances |
| Trades | dated deals with settlement column |
| Meta | report period header |

### Alfa (`alfa-xml`)

**Need:** Alfa-Direct / Alfa-Investments XML broker statement.

| Field | Requirement |
|-------|-------------|
| Root | identifiable Alfa XML namespace or root element |
| Positions | `isin`, `quantity`, `price`, `value` nodes |
| Cash | per-currency balances |
| Operations | trades and cash movements with dates |

### Finam (`finam-xml`)

**Need:** Finam Trade XML export or documented API JSON sample (sanitized).

| Field | Requirement |
|-------|-------------|
| Positions | ticker, qty, market value |
| Cash | account balance |
| Trades | execution records with fees |
| Meta | account id (sanitized), as-of date |

### BCS (`bcs-xls`)

**Need:** BCS brokerage Excel report with standard section headings.

| Field | Requirement |
|-------|-------------|
| Portfolio | securities with ISIN and end-of-period metrics |
| Money | cash lines per currency |
| Deals | buy/sell grid |
| Meta | client code (sanitized), period |

## Adding a new adapter

1. Add sanitized fixture(s) under `__tests__/fixtures/`.
2. Implement `BrokerAdapter` in `lib/broker-adapters/adapters/`.
3. Register in `lib/broker-adapters/registry.ts`.
4. Add detection + reconciliation tests.
5. Document required columns in this file.

## Manual CSV template

```csv
# analytics-broker-manual-v1

[meta]
period_start,period_end,created_at,investor,contract,assets_end
01.01.2025,31.01.2025,01.02.2025,Manual Investor,MANUAL-001,1500

[securities]
name,isin,currency,quantity_start,price_start,value_start,quantity_end,price_end,value_end,value_change
Example Corp,RU0000000001,RUB,0,100,0,10,150,1500,0

[cash]
platform,currency,rate_end,start,change,end
Manual RUB,RUB,1,0,0,0
```

Generate a starter file: `buildManualCsvTemplate()` from `@/lib/broker-adapters`.
