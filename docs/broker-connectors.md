# Broker API connectors

Read-only brokerage API connectors live in `lib/broker-connectors/`. They are **separate** from the file-based broker adapter platform in `lib/broker-adapters/`.

## Status

| Connector ID | Status | Feature flag |
|--------------|--------|--------------|
| `tbank-invest-api-v1` | **experimental** | `BROKER_CONNECTOR_TBANK_ENABLED=true` |

Connectors are disabled by default. The library boundary is UI-neutral — no React components or routes consume these APIs yet.

## Public API

| Entry point | Purpose |
|-------------|---------|
| `syncBrokerConnector(input)` | Fetch remote data, map to normalized ledger, reconcile |
| `listBrokerConnectors()` | Registered connectors |
| `getBrokerConnector(id)` | Lookup by id |
| `isBrokerConnectorEnabled(id)` | Feature-flag check |
| `moneyValueToNumber` / `quotationToNumber` | T-Invest decimal conversion |

### `BrokerConnectorSyncInput`

```ts
{
  connectorId: "tbank-invest-api-v1";
  credentials: { token: string }; // runtime only — never persisted
  accountId?: string;
  periodStart?: string; // ISO date
  periodEnd?: string;
  environment?: "production" | "sandbox";
  fetchImpl?: typeof fetch; // tests only
  baseUrl?: string; // tests only
}
```

### `BrokerConnectorSyncResult`

Mirrors file adapter results:

- `ledger` — `BrokerNormalizedLedger`
- `report` — enriched `BrokerReport` when recognition succeeds
- `provenance` — connector id/version, API contract version, account id, sync timestamp
- `coverage` — parsed section flags and row counts
- `warnings` — `PARTIAL_PARSE`, `RECONCILIATION_MISMATCH`, …
- `reconciliation` — reported vs computed totals (±1 ₽)
- `errors` — `FEATURE_DISABLED`, `INVALID_TOKEN`, `RATE_LIMITED`, …

**Security:** the runtime token is never included in `provenance`, return payloads, or error text (`redactSecrets`).

## T-Bank Invest API (`tbank-invest-api-v1`)

Contract: [T-Invest API OpenAPI v1.43](https://github.com/RussianInvestments/investAPI/blob/main/src/docs/swagger-ui/openapi.yaml)

### Supported REST methods (read-only)

| Method | Path suffix | Pagination |
|--------|-------------|------------|
| `GetAccounts` | `UsersService/GetAccounts` | single response |
| `GetPortfolio` | `OperationsService/GetPortfolio` | single response |
| `GetOperationsByCursor` | `OperationsService/GetOperationsByCursor` | cursor (`nextCursor`) |
| `GetBrokerReport` | `OperationsService/GetBrokerReport` | generate task + page index |

### Mapped ledger fields

| Source | Target |
|--------|--------|
| `Account.id`, `Account.name` | `contract`, `investor` |
| `Portfolio.positions[]` (non-currency) | `securities[]` (qty, price, value from `Quotation`/`MoneyValue`) |
| `Portfolio.totalAmountCurrencies` | `cash[]` RUB balance |
| `Portfolio.totalAmountPortfolio` | `assetsEnd` |
| `GetBrokerReport` rows (preferred) or operations trades | `trades[]` |
| Non-trade operations | `cashFlows[]` |

### Limits

See `lib/broker-connectors/limits.ts`:

- Request timeout: 15 s
- Retries: 3 (429/503/504/network)
- Min interval between requests: 120 ms
- Max operations / broker-report rows: 50 000 each

## Fixtures

Synthetic contract fixtures: `__tests__/fixtures/tbank-invest-api/`. See `README.md` in that folder for provenance.

**Not supported:** T-Bank XLSX file import (`tbank-xlsx` adapter id) — remains **planned** until sanitized spreadsheet fixtures exist. This connector does not claim XLSX parser support.

## Real-account validation gaps

The following require live sandbox/production tokens and are **not** covered by CI fixtures:

- Token scope / access-level edge cases (`ACCOUNT_ACCESS_LEVEL_*`)
- Multi-account selection when several open accounts exist
- Long-running `GetBrokerReport` task polling latency
- FX/non-RUB portfolio currency conversion accuracy
- Futures, options, structured products, and virtual positions
- Operation type coverage beyond buy/sell/dividend samples
- Sandbox vs production host behavior and TLS
- API rate-limit headers and burst traffic
- Reconciliation against real end-of-day broker statements

## Adding a connector

1. Define contract types under `lib/broker-connectors/contracts/`.
2. Implement `BrokerConnector` with pagination client + ledger mapper.
3. Add synthetic fixtures and tests with `fetchImpl` mock transport.
4. Register in `lib/broker-connectors/registry.ts`.
5. Document supported fields and validation gaps here.
