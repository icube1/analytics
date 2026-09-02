# T-Bank Invest API contract fixtures

Synthetic JSON fixtures for the read-only `tbank-invest-api-v1` connector tests.

## Provenance

| Fixture | Source |
|---------|--------|
| All files in this directory | Hand-authored from [T-Invest API OpenAPI v1.43](https://github.com/RussianInvestments/investAPI/blob/main/src/docs/swagger-ui/openapi.yaml) schema field names and example shapes |

## Sanitization

- No real account IDs, tokens, investor names, or trade history
- `SANITIZED-*` prefixes mark synthetic identifiers
- FIGI `BBG004730N88` is a public instrument identifier (Sberbank MOEX), not account data

## Not included

- T-Bank XLSX brokerage report exports (`tbank-xlsx` file adapter remains **planned** until sanitized spreadsheet fixtures exist)
- Live API responses or credentials
