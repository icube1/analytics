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
| `tbank-xlsx` | T-Bank CSV/TSV text export | `__tests__/fixtures/tbank-report.csv` |
| `vtb-xls` | VTB CSV/TSV text export | `__tests__/fixtures/vtb-report.csv` |
| `alfa-xml` | Alfa-Investments XML | `__tests__/fixtures/alfa-report.xml` |
| `finam-xml` | Finam XML | `__tests__/fixtures/finam-report.xml` |
| `bcs-xls` | BCS CSV/TSV text export | `__tests__/fixtures/bcs-report.csv` |
| `gazprombank-csv` | Gazprombank CSV/TSV text export | `__tests__/fixtures/gazprombank-report.csv` |
| `otkritie-csv` | Otkritie CSV/TSV text export | `__tests__/fixtures/otkritie-report.csv` |

Shared parsers live in `lib/broker-adapters/tabular.ts` and `xml.ts`.
Binary Excel workbooks are **not** unzipped; save/export as CSV or XML.

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

## API connectors (experimental)

Read-only brokerage API sync is implemented separately in `lib/broker-connectors/`. See [broker-connectors.md](./broker-connectors.md). File adapters below remain the production import path.

## Planned adapters (live broker samples)

Text CSV/XML fixtures above are synthetic and sanitized. Binary `.xlsx`/`.xls`
from T-Bank, VTB, and BCS still need a live anonymized sample before a native
workbook parser is registered. Until then the tabular adapters accept the
CSV/TSV export of those reports.

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
