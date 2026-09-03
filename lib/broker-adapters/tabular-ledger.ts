import { BROKER_IMPORT_LIMITS } from "./limits";
import { emptyLedger } from "./normalize";
import {
  isValidParsedNumber,
  parseBrokerNumberOrWarn,
} from "./numbers";
import { reconcileBrokerLedger } from "./reconcile";
import {
  firstValue,
  parseTabularDocument,
  sectionRows,
  type ParsedTabularDocument,
  type TabularRow,
} from "./tabular";
import type {
  BrokerAdapterParseResult,
  BrokerImportWarning,
  BrokerNormalizedLedger,
} from "./types";

function numberField(
  row: TabularRow,
  aliases: string[],
  path: string,
  warnings: BrokerImportWarning[],
): number {
  const raw = firstValue(row, aliases);
  if (!raw) return 0;
  const parsed = parseBrokerNumberOrWarn(raw, path, warnings);
  return isValidParsedNumber(parsed) ? parsed.value : 0;
}

function applyMeta(ledger: BrokerNormalizedLedger, rows: TabularRow[]): void {
  for (const row of rows) {
    ledger.periodStart =
      firstValue(row, ["period_start", "period start", "с", "date from"]) ||
      ledger.periodStart;
    ledger.periodEnd =
      firstValue(row, ["period_end", "period end", "по", "date to"]) ||
      ledger.periodEnd;
    ledger.createdAt =
      firstValue(row, ["created_at", "created at", "дата отчета", "report date"]) ||
      ledger.createdAt;
    ledger.investor =
      firstValue(row, ["investor", "инвестор", "клиент", "client"]) ||
      ledger.investor;
    ledger.contract =
      firstValue(row, ["contract", "договор", "счет", "account"]) ||
      ledger.contract;
    const assetsEnd = firstValue(row, ["assets_end", "assets end", "оценка", "итого"]);
    if (assetsEnd) {
      const parsed = parseBrokerNumberOrWarn(assetsEnd, "meta.assets_end", []);
      if (isValidParsedNumber(parsed)) ledger.assetsEnd = parsed.value;
    }
  }
}

function parseSecurities(
  rows: TabularRow[],
  warnings: BrokerImportWarning[],
): BrokerNormalizedLedger["securities"] {
  const securities: BrokerNormalizedLedger["securities"] = [];
  for (const [index, row] of rows.entries()) {
    const isin = firstValue(row, ["isin"]);
    const name =
      firstValue(row, ["name", "название", "наименование", "инструмент"]) || isin;
    if (!isin && !name) continue;
    const path = `securities[${index}]`;
    const quantityEnd = numberField(
      row,
      ["quantity_end", "quantity end", "количество", "кол-во", "qty"],
      `${path}.quantity_end`,
      warnings,
    );
    const priceEnd = numberField(
      row,
      ["price_end", "price end", "цена", "price"],
      `${path}.price_end`,
      warnings,
    );
    const valueEnd = numberField(
      row,
      ["value_end", "value end", "стоимость", "оценка", "value"],
      `${path}.value_end`,
      warnings,
    );
    securities.push({
      id: isin || `sec-${index + 1}`,
      name,
      isin: isin || `SYNTH-${index + 1}`,
      currency: firstValue(row, ["currency", "валюта"]) || "RUB",
      quantityStart: numberField(
        row,
        ["quantity_start", "quantity start"],
        `${path}.quantity_start`,
        warnings,
      ),
      quantityEnd,
      priceStart: numberField(
        row,
        ["price_start", "price start"],
        `${path}.price_start`,
        warnings,
      ),
      priceEnd,
      valueStart: numberField(
        row,
        ["value_start", "value start"],
        `${path}.value_start`,
        warnings,
      ),
      valueEnd: valueEnd || quantityEnd * priceEnd,
      valueChange: numberField(
        row,
        ["value_change", "value change"],
        `${path}.value_change`,
        warnings,
      ),
    });
  }
  return securities;
}

function parseCash(
  rows: TabularRow[],
  warnings: BrokerImportWarning[],
): BrokerNormalizedLedger["cash"] {
  return rows.map((row, index) => {
    const path = `cash[${index}]`;
    const end = numberField(
      row,
      ["end", "остаток", "balance"],
      `${path}.end`,
      warnings,
    );
    return {
      platform: firstValue(row, ["platform", "площадка", "счет"]) || "RUB",
      currency: firstValue(row, ["currency", "валюта"]) || "RUB",
      rateEnd: numberField(row, ["rate_end", "rate end", "курс"], `${path}.rate_end`, warnings) || 1,
      start: numberField(row, ["start", "начало"], `${path}.start`, warnings),
      change: numberField(row, ["change", "изменение"], `${path}.change`, warnings),
      end,
    };
  });
}

function parseCashFlows(
  rows: TabularRow[],
  warnings: BrokerImportWarning[],
): BrokerNormalizedLedger["cashFlows"] {
  return rows.map((row, index) => {
    const path = `cash_flows[${index}]`;
    return {
      id: `cf-${index + 1}`,
      date: firstValue(row, ["date", "дата"]),
      description: firstValue(row, ["description", "описание", "операция"]),
      currency: firstValue(row, ["currency", "валюта"]) || "RUB",
      credit: numberField(row, ["credit", "зачисление"], `${path}.credit`, warnings),
      debit: numberField(row, ["debit", "списание"], `${path}.debit`, warnings),
    };
  });
}

function parseTrades(
  rows: TabularRow[],
  warnings: BrokerImportWarning[],
): BrokerNormalizedLedger["trades"] {
  return rows.map((row, index) => {
    const path = `trades[${index}]`;
    return {
      id: `tr-${index + 1}`,
      date: firstValue(row, ["date", "дата", "дата сделки", "дата заключения"]),
      settlementDate: firstValue(row, [
        "settlement_date",
        "settlement date",
        "дата поставки",
        "дата расчетов",
      ]),
      name: firstValue(row, ["name", "название", "инструмент"]),
      ticker: firstValue(row, ["ticker", "тикер"]),
      side: firstValue(row, ["side", "операция", "тип", "направление"]),
      quantity: numberField(
        row,
        ["quantity", "количество", "кол-во"],
        `${path}.quantity`,
        warnings,
      ),
      price: numberField(row, ["price", "цена"], `${path}.price`, warnings),
      amount: numberField(row, ["amount", "сумма"], `${path}.amount`, warnings),
      brokerFee: numberField(
        row,
        ["broker_fee", "broker fee", "комиссия", "комиссия брокера"],
        `${path}.broker_fee`,
        warnings,
      ),
      exchangeFee: numberField(
        row,
        ["exchange_fee", "exchange fee", "комиссия биржи"],
        `${path}.exchange_fee`,
        warnings,
      ),
    };
  });
}

export function parseStandardTabularLedger(
  document: ParsedTabularDocument,
): BrokerAdapterParseResult {
  const warnings: BrokerImportWarning[] = [];
  const ledger = emptyLedger();
  applyMeta(ledger, sectionRows(document, ["meta"]));

  ledger.securities = parseSecurities(
    sectionRows(document, ["securities", "positions", "portfolio"]),
    warnings,
  );
  ledger.cash = parseCash(sectionRows(document, ["cash", "money"]), warnings);
  ledger.cashFlows = parseCashFlows(
    sectionRows(document, ["cash_flows", "cashflows", "operations"]),
    warnings,
  );
  ledger.trades = parseTrades(
    sectionRows(document, ["trades", "deals"]),
    warnings,
  );

  if (ledger.securities.length > BROKER_IMPORT_LIMITS.maxSecurities) {
    throw new Error("ROW_LIMIT_EXCEEDED:securities");
  }
  if (ledger.trades.length > BROKER_IMPORT_LIMITS.maxTrades) {
    throw new Error("ROW_LIMIT_EXCEEDED:trades");
  }
  if (ledger.cashFlows.length > BROKER_IMPORT_LIMITS.maxCashFlows) {
    throw new Error("ROW_LIMIT_EXCEEDED:cash_flows");
  }

  ledger.assetsChange = ledger.assetsEnd - ledger.assetsStart;

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

export function parseStandardTabularContent(content: string): BrokerAdapterParseResult {
  return parseStandardTabularLedger(parseTabularDocument(content));
}
