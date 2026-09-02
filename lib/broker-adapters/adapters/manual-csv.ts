import { BROKER_IMPORT_LIMITS } from "../limits";
import {
  isValidParsedNumber,
  parseBrokerNumberOrWarn,
} from "../numbers";
import { emptyLedger } from "../normalize";
import { reconcileBrokerLedger } from "../reconcile";
import type {
  BrokerAdapter,
  BrokerAdapterParseResult,
  BrokerDetectionResult,
  BrokerImportInput,
  BrokerImportWarning,
} from "../types";

export const MANUAL_CSV_MAGIC = "# analytics-broker-manual-v1";

type CsvSection =
  | "meta"
  | "securities"
  | "cash"
  | "cash_flows"
  | "trades"
  | null;

function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const counts = {
    ",": (headerLine.match(/,/g) ?? []).length,
    ";": (headerLine.match(/;/g) ?? []).length,
    "\t": (headerLine.match(/\t/g) ?? []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return (best?.[0] as "," | ";" | "\t") ?? ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseManualCsv(input: BrokerImportInput): BrokerAdapterParseResult {
  const warnings: BrokerImportWarning[] = [];
  const lines = input.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length > BROKER_IMPORT_LIMITS.maxCsvRows) {
    throw new Error("ROW_LIMIT_EXCEEDED:csv");
  }

  const ledger = emptyLedger();
  let section: CsvSection = null;
  let headers: string[] = [];
  let delimiter: "," | ";" | "\t" = ",";

  for (const [lineIndex, line] of lines.entries()) {
    const sectionMatch = line.match(/^\[(meta|securities|cash|cash_flows|trades)\]$/i);
    if (sectionMatch) {
      section = sectionMatch[1].toLowerCase() as CsvSection;
      headers = [];
      continue;
    }

    if (!section) continue;

    if (headers.length === 0) {
      delimiter = detectDelimiter(line);
      headers = splitCsvLine(line, delimiter).map((h) => h.toLowerCase());
      continue;
    }

    const cells = splitCsvLine(line, delimiter);
    const rowPath = `${section}[${lineIndex}]`;
    const value = (name: string): string => {
      const index = headers.indexOf(name);
      return index >= 0 ? (cells[index] ?? "") : "";
    };

    if (section === "meta") {
      ledger.periodStart = value("period_start") || ledger.periodStart;
      ledger.periodEnd = value("period_end") || ledger.periodEnd;
      ledger.createdAt = value("created_at") || ledger.createdAt;
      ledger.investor = value("investor") || ledger.investor;
      ledger.contract = value("contract") || ledger.contract;
      const assetsEnd = parseBrokerNumberOrWarn(
        value("assets_end"),
        `${rowPath}.assets_end`,
        warnings,
      );
      if (isValidParsedNumber(assetsEnd)) ledger.assetsEnd = assetsEnd.value;
      continue;
    }

    if (section === "securities") {
      const isin = value("isin");
      if (!isin) continue;
      const quantityEnd = parseBrokerNumberOrWarn(
        value("quantity_end"),
        `${rowPath}.quantity_end`,
        warnings,
      );
      const priceEnd = parseBrokerNumberOrWarn(
        value("price_end"),
        `${rowPath}.price_end`,
        warnings,
      );
      const valueEnd = parseBrokerNumberOrWarn(
        value("value_end"),
        `${rowPath}.value_end`,
        warnings,
      );
      if (![quantityEnd, priceEnd, valueEnd].every(isValidParsedNumber)) {
        warnings.push({
          code: "SKIPPED_ROW",
          message: `Skipped manual CSV security row (${isin})`,
          path: rowPath,
        });
        continue;
      }

      ledger.securities.push({
        id: isin,
        name: value("name") || isin,
        isin,
        currency: value("currency") || "RUB",
        quantityStart: parseBrokerNumberOrWarn(
          value("quantity_start"),
          `${rowPath}.quantity_start`,
          warnings,
        ).value,
        quantityEnd: quantityEnd.value,
        priceStart: parseBrokerNumberOrWarn(
          value("price_start"),
          `${rowPath}.price_start`,
          warnings,
        ).value,
        priceEnd: priceEnd.value,
        valueStart: parseBrokerNumberOrWarn(
          value("value_start"),
          `${rowPath}.value_start`,
          warnings,
        ).value,
        valueEnd: valueEnd.value,
        valueChange: parseBrokerNumberOrWarn(
          value("value_change"),
          `${rowPath}.value_change`,
          warnings,
        ).value,
      });
      continue;
    }

    if (section === "cash") {
      const currency = value("currency");
      if (!currency) continue;
      const end = parseBrokerNumberOrWarn(
        value("end"),
        `${rowPath}.end`,
        warnings,
      );
      if (!isValidParsedNumber(end)) {
        warnings.push({
          code: "SKIPPED_ROW",
          message: `Skipped manual CSV cash row (${currency})`,
          path: rowPath,
        });
        continue;
      }

      ledger.cash.push({
        platform: value("platform") || `Manual ${currency}`,
        currency,
        rateEnd: parseBrokerNumberOrWarn(
          value("rate_end"),
          `${rowPath}.rate_end`,
          warnings,
        ).value,
        start: parseBrokerNumberOrWarn(
          value("start"),
          `${rowPath}.start`,
          warnings,
        ).value,
        change: parseBrokerNumberOrWarn(
          value("change"),
          `${rowPath}.change`,
          warnings,
        ).value,
        end: end.value,
      });
      continue;
    }

    if (section === "cash_flows") {
      const date = value("date");
      if (!date) continue;
      ledger.cashFlows.push({
        id: value("id") || `${date}-${lineIndex}`,
        date,
        description: value("description"),
        currency: value("currency") || "RUB",
        credit: parseBrokerNumberOrWarn(
          value("credit"),
          `${rowPath}.credit`,
          warnings,
        ).value,
        debit: parseBrokerNumberOrWarn(
          value("debit"),
          `${rowPath}.debit`,
          warnings,
        ).value,
      });
      continue;
    }

    if (section === "trades") {
      const date = value("date");
      if (!date) continue;
      const quantity = parseBrokerNumberOrWarn(
        value("quantity"),
        `${rowPath}.quantity`,
        warnings,
      );
      const price = parseBrokerNumberOrWarn(
        value("price"),
        `${rowPath}.price`,
        warnings,
      );
      const amount = parseBrokerNumberOrWarn(
        value("amount"),
        `${rowPath}.amount`,
        warnings,
      );
      if (![quantity, price, amount].every(isValidParsedNumber)) {
        warnings.push({
          code: "SKIPPED_ROW",
          message: `Skipped manual CSV trade row (${date})`,
          path: rowPath,
        });
        continue;
      }

      ledger.trades.push({
        id: value("id") || `${date}-${lineIndex}`,
        date,
        settlementDate: value("settlement_date"),
        name: value("name"),
        ticker: value("ticker"),
        side: value("side"),
        quantity: quantity.value,
        price: price.value,
        amount: amount.value,
        brokerFee: parseBrokerNumberOrWarn(
          value("broker_fee"),
          `${rowPath}.broker_fee`,
          warnings,
        ).value,
        exchangeFee: parseBrokerNumberOrWarn(
          value("exchange_fee"),
          `${rowPath}.exchange_fee`,
          warnings,
        ).value,
      });
    }
  }

  const reconciliation = reconcileBrokerLedger(ledger);
  return {
    ledger,
    coverage: {
      meta: Boolean(ledger.periodStart && ledger.periodEnd),
      rating: ledger.assetsEnd > 0,
      securities: ledger.securities.length > 0,
      cash: ledger.cash.length > 0,
      cashFlows: ledger.cashFlows.length > 0,
      trades: ledger.trades.length > 0,
      securitiesCount: ledger.securities.length,
      cashCount: ledger.cash.length,
      cashFlowCount: ledger.cashFlows.length,
      tradeCount: ledger.trades.length,
    },
    warnings,
    reconciliation,
  };
}

function detectManualCsv(input: BrokerImportInput): BrokerDetectionResult | null {
  const trimmed = input.content.trimStart();
  if (!trimmed.startsWith(MANUAL_CSV_MAGIC)) return null;

  return {
    adapterId: "manual-csv-v1",
    confidence: 1,
    signals: ["manual-csv-magic", "[meta]-section"],
  };
}

export const manualCsvAdapter: BrokerAdapter = {
  id: "manual-csv-v1",
  version: "1.0.0",
  label: "Manual broker CSV template",
  status: "production",
  supportedExtensions: [".csv", ".txt"],
  detect: detectManualCsv,
  parse: parseManualCsv,
};

export function buildManualCsvTemplate(): string {
  return [
    MANUAL_CSV_MAGIC,
    "# Sections: [meta], [securities], [cash], [cash_flows], [trades]",
    "",
    "[meta]",
    "period_start,period_end,created_at,investor,contract,assets_end",
    "01.01.2025,31.01.2025,01.02.2025,Manual Investor,MANUAL-001,0",
    "",
    "[securities]",
    "name,isin,currency,quantity_start,price_start,value_start,quantity_end,price_end,value_end,value_change",
    "Example Corp,RU0000000001,RUB,0,100,0,10,150,1500,0",
    "",
    "[cash]",
    "platform,currency,rate_end,start,change,end",
    "Manual RUB,RUB,1,1000,0,1000",
  ].join("\n");
}
