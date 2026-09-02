import { BROKER_IMPORT_LIMITS } from "../limits";
import {
  isValidParsedNumber,
  parseBrokerNumberOrWarn,
} from "../numbers";
import {
  cellText,
  findTableAfterHeading,
  hasClass,
  parseHtmlDocument,
} from "../html";
import { reconcileBrokerLedger } from "../reconcile";
import { emptyLedger } from "../normalize";
import type {
  BrokerTrade,
  CashFlow,
  CashPosition,
  SecurityPosition,
} from "../../portfolio-types";
import type {
  BrokerAdapter,
  BrokerAdapterParseResult,
  BrokerDetectionResult,
  BrokerImportInput,
  BrokerImportWarning,
  BrokerNormalizedLedger,
} from "../types";

function extractMeta(
  doc: Document,
  warnings: BrokerImportWarning[],
): Partial<BrokerNormalizedLedger> {
  const titleText =
    doc.querySelector("h3")?.textContent?.replace(/\s+/g, " ") ?? "";
  const periodMatch = titleText.match(
    /с\s+(\d{2}\.\d{2}\.\d{4})\s+по\s+(\d{2}\.\d{2}\.\d{4}).*?(\d{2}\.\d{2}\.\d{4})/,
  );

  if (!periodMatch) {
    warnings.push({
      code: "MISSING_META",
      message: "Report period heading not found in Sber HTML",
      path: "meta.period",
    });
  }

  const investorBlock = [...doc.querySelectorAll("p")]
    .map((p) => p.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .find((t) => t.includes("Инвестор:"));

  const investor =
    investorBlock?.match(/Инвестор:\s*(.+?)\s*Договор/)?.[1]?.trim() ?? "";
  const contract =
    investorBlock?.match(/Договор\s+(\S+)/)?.[1]?.trim() ?? "";

  return {
    periodStart: periodMatch?.[1] ?? "",
    periodEnd: periodMatch?.[2] ?? "",
    createdAt: periodMatch?.[3] ?? "",
    investor,
    contract,
  };
}

function parseRatingAssets(
  doc: Document,
  warnings: BrokerImportWarning[],
): Partial<BrokerNormalizedLedger> {
  const table = doc.querySelector("table.RatingAssets");
  if (!table) {
    warnings.push({
      code: "MISSING_TABLE",
      message: "RatingAssets table not found",
      path: "rating",
    });
    return {};
  }

  const dataRow = [...table.querySelectorAll("tr")].find((row) =>
    cellText(row, 0).includes("Основной рынок"),
  );
  if (!dataRow) {
    warnings.push({
      code: "MISSING_TABLE",
      message: "Основной рынок row not found in RatingAssets",
      path: "rating.mainMarket",
    });
    return {};
  }

  const fields: Array<[keyof BrokerNormalizedLedger, number]> = [
    ["securitiesStart", 1],
    ["cashStart", 2],
    ["assetsStart", 3],
    ["securitiesEnd", 4],
    ["cashEnd", 5],
    ["assetsEnd", 6],
    ["assetsChange", 9],
  ];

  const result: Partial<BrokerNormalizedLedger> = {};
  for (const [key, index] of fields) {
    const parsed = parseBrokerNumberOrWarn(
      cellText(dataRow, index),
      `rating.${String(key)}`,
      warnings,
    );
    if (isValidParsedNumber(parsed)) {
      result[key] = parsed.value as never;
    }
  }

  return result;
}

function parseSecuritiesTable(
  table: Element,
  warnings: BrokerImportWarning[],
): SecurityPosition[] {
  const positions: SecurityPosition[] = [];

  for (const [rowIndex, row] of [...table.querySelectorAll("tr")].entries()) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) continue;
    if (hasClass(row, "summary-row")) continue;

    const first = cellText(row, 0);
    if (!first || first.startsWith("Площадка:") || first === "\u00a0") continue;

    const isin = cellText(row, 1);
    if (!isin || isin.length < 10) continue;

    const rowPath = `securities[${rowIndex}]`;
    const quantityStart = parseBrokerNumberOrWarn(
      cellText(row, 3),
      `${rowPath}.quantityStart`,
      warnings,
    );
    const priceStart = parseBrokerNumberOrWarn(
      cellText(row, 5),
      `${rowPath}.priceStart`,
      warnings,
    );
    const valueStart = parseBrokerNumberOrWarn(
      cellText(row, 6),
      `${rowPath}.valueStart`,
      warnings,
    );
    const quantityEnd = parseBrokerNumberOrWarn(
      cellText(row, 8),
      `${rowPath}.quantityEnd`,
      warnings,
    );
    const priceEnd = parseBrokerNumberOrWarn(
      cellText(row, 10),
      `${rowPath}.priceEnd`,
      warnings,
    );
    const valueEnd = parseBrokerNumberOrWarn(
      cellText(row, 11),
      `${rowPath}.valueEnd`,
      warnings,
    );
    const valueChange = parseBrokerNumberOrWarn(
      cellText(row, 14),
      `${rowPath}.valueChange`,
      warnings,
    );

    const required = [
      quantityStart,
      priceStart,
      valueStart,
      quantityEnd,
      priceEnd,
      valueEnd,
      valueChange,
    ];
    if (!required.every(isValidParsedNumber)) {
      warnings.push({
        code: "SKIPPED_ROW",
        message: `Skipped security row with malformed required numbers (${isin})`,
        path: rowPath,
      });
      continue;
    }

    positions.push({
      id: isin,
      name: first,
      isin,
      currency: cellText(row, 2) || "RUB",
      quantityStart: quantityStart.value,
      priceStart: priceStart.value,
      valueStart: valueStart.value,
      quantityEnd: quantityEnd.value,
      priceEnd: priceEnd.value,
      valueEnd: valueEnd.value,
      valueChange: valueChange.value,
      plannedCredits: parseBrokerNumberOrWarn(
        cellText(row, 15),
        `${rowPath}.plannedCredits`,
        warnings,
      ).value,
      plannedDebits: parseBrokerNumberOrWarn(
        cellText(row, 16),
        `${rowPath}.plannedDebits`,
        warnings,
      ).value,
      quantityPlanned: parseBrokerNumberOrWarn(
        cellText(row, 17),
        `${rowPath}.quantityPlanned`,
        warnings,
      ).value,
    });
  }

  return positions;
}

function mergeSecurityPositions(
  positions: SecurityPosition[],
): SecurityPosition[] {
  const byIsin = new Map<string, SecurityPosition>();

  for (const pos of positions) {
    const existing = byIsin.get(pos.isin);
    if (!existing) {
      byIsin.set(pos.isin, { ...pos });
      continue;
    }

    const quantityStart = existing.quantityStart + pos.quantityStart;
    const quantityEnd = existing.quantityEnd + pos.quantityEnd;
    const valueStart = existing.valueStart + pos.valueStart;
    const valueEnd = existing.valueEnd + pos.valueEnd;

    const quantityPlanned =
      (existing.quantityPlanned ?? existing.quantityEnd) +
      (pos.quantityPlanned ?? pos.quantityEnd);

    byIsin.set(pos.isin, {
      ...existing,
      quantityStart,
      quantityEnd,
      quantityPlanned,
      plannedCredits:
        (existing.plannedCredits ?? 0) + (pos.plannedCredits ?? 0),
      plannedDebits: (existing.plannedDebits ?? 0) + (pos.plannedDebits ?? 0),
      valueStart,
      valueEnd,
      valueChange: existing.valueChange + pos.valueChange,
      priceStart:
        quantityStart > 0
          ? valueStart / quantityStart
          : existing.priceStart || pos.priceStart,
      priceEnd:
        quantityEnd > 0 ? valueEnd / quantityEnd : existing.priceEnd || pos.priceEnd,
    });
  }

  return [...byIsin.values()];
}

function parseCashTable(
  table: Element,
  warnings: BrokerImportWarning[],
): CashPosition[] {
  const items: CashPosition[] = [];

  for (const [rowIndex, row] of [...table.querySelectorAll("tr")].entries()) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) continue;
    if (hasClass(row, "summary-row")) continue;

    const platform = cellText(row, 0);
    if (!platform || !platform.includes("Торговый счет")) continue;

    const rowPath = `cash[${rowIndex}]`;
    const rateEnd = parseBrokerNumberOrWarn(
      cellText(row, 2),
      `${rowPath}.rateEnd`,
      warnings,
    );
    const start = parseBrokerNumberOrWarn(
      cellText(row, 3),
      `${rowPath}.start`,
      warnings,
    );
    const change = parseBrokerNumberOrWarn(
      cellText(row, 4),
      `${rowPath}.change`,
      warnings,
    );
    const end = parseBrokerNumberOrWarn(
      cellText(row, 5),
      `${rowPath}.end`,
      warnings,
    );

    if (![rateEnd, start, change, end].every(isValidParsedNumber)) {
      warnings.push({
        code: "SKIPPED_ROW",
        message: `Skipped cash row with malformed required numbers (${platform})`,
        path: rowPath,
      });
      continue;
    }

    items.push({
      platform,
      currency: cellText(row, 1),
      rateEnd: rateEnd.value,
      start: start.value,
      change: change.value,
      end: end.value,
      plannedCredits: parseBrokerNumberOrWarn(
        cellText(row, 6),
        `${rowPath}.plannedCredits`,
        warnings,
      ).value,
      plannedDebits: parseBrokerNumberOrWarn(
        cellText(row, 7),
        `${rowPath}.plannedDebits`,
        warnings,
      ).value,
      endPlanned: parseBrokerNumberOrWarn(
        cellText(row, 8),
        `${rowPath}.endPlanned`,
        warnings,
      ).value,
    });
  }

  return items;
}

function parseCashFlowsTable(
  table: Element,
  warnings: BrokerImportWarning[],
): CashFlow[] {
  const flows: CashFlow[] = [];

  for (const [rowIndex, row] of [...table.querySelectorAll("tr")].entries()) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) continue;
    if (hasClass(row, "summary-row")) continue;

    const date = cellText(row, 0);
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) continue;

    const rowPath = `cashFlows[${rowIndex}]`;
    const credit = parseBrokerNumberOrWarn(
      cellText(row, 4),
      `${rowPath}.credit`,
      warnings,
    );
    const debit = parseBrokerNumberOrWarn(
      cellText(row, 5),
      `${rowPath}.debit`,
      warnings,
    );

    if (![credit, debit].every(isValidParsedNumber)) {
      warnings.push({
        code: "SKIPPED_ROW",
        message: `Skipped cash flow row with malformed amounts (${date})`,
        path: rowPath,
      });
      continue;
    }

    flows.push({
      id: `${date}-${cellText(row, 2)}-${cellText(row, 4)}`,
      date,
      description: cellText(row, 2),
      currency: cellText(row, 3),
      credit: credit.value,
      debit: debit.value,
    });
  }

  return flows;
}

function parseTradesTable(
  table: Element,
  warnings: BrokerImportWarning[],
): BrokerTrade[] {
  const trades: BrokerTrade[] = [];

  for (const [rowIndex, row] of [...table.querySelectorAll("tr")].entries()) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) continue;
    if (hasClass(row, "summary-row")) continue;

    const date = cellText(row, 0);
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) continue;

    const rowPath = `trades[${rowIndex}]`;
    const quantity = parseBrokerNumberOrWarn(
      cellText(row, 7),
      `${rowPath}.quantity`,
      warnings,
    );
    const price = parseBrokerNumberOrWarn(
      cellText(row, 8),
      `${rowPath}.price`,
      warnings,
    );
    const amount = parseBrokerNumberOrWarn(
      cellText(row, 9),
      `${rowPath}.amount`,
      warnings,
    );
    const brokerFee = parseBrokerNumberOrWarn(
      cellText(row, 11),
      `${rowPath}.brokerFee`,
      warnings,
    );
    const exchangeFee = parseBrokerNumberOrWarn(
      cellText(row, 12),
      `${rowPath}.exchangeFee`,
      warnings,
    );

    if (![quantity, price, amount, brokerFee, exchangeFee].every(isValidParsedNumber)) {
      warnings.push({
        code: "SKIPPED_ROW",
        message: `Skipped trade row with malformed required numbers (${date})`,
        path: rowPath,
      });
      continue;
    }

    const dealId = cellText(row, 13);
    const side = cellText(row, 6);
    const ticker = cellText(row, 4);
    const id =
      dealId || `${date}-${ticker}-${side}-${cellText(row, 7)}-${trades.length}`;

    trades.push({
      id,
      date,
      settlementDate: cellText(row, 1),
      name: cellText(row, 3),
      ticker,
      side,
      quantity: quantity.value,
      price: price.value,
      amount: amount.value,
      brokerFee: brokerFee.value,
      exchangeFee: exchangeFee.value,
    });
  }

  return trades;
}

function detectSberHtml(input: BrokerImportInput): BrokerDetectionResult | null {
  const sample = input.content.slice(0, 32_768);
  const signals: string[] = [];
  let confidence = 0;

  if (/<html[\s>]/i.test(sample)) signals.push("html-root");
  if (/table\.RatingAssets|class="RatingAssets"/i.test(sample)) {
    signals.push("rating-assets-table");
    confidence += 0.45;
  }
  if (/Портфель Ценных Бумаг/i.test(sample)) {
    signals.push("securities-heading-ru");
    confidence += 0.2;
  }
  if (/Инвестор:/i.test(sample)) {
    signals.push("investor-block");
    confidence += 0.15;
  }
  if (/Сбер/i.test(sample) || /Sber/i.test(sample)) {
    signals.push("sber-branding");
    confidence += 0.1;
  }

  if (confidence < 0.5) return null;

  return {
    adapterId: "sber-html-v1",
    confidence: Math.min(1, confidence),
    signals,
  };
}

function parseSberHtml(input: BrokerImportInput): BrokerAdapterParseResult {
  const warnings: BrokerImportWarning[] = [];
  const doc = parseHtmlDocument(input.content);
  const meta = extractMeta(doc, warnings);
  const rating = parseRatingAssets(doc, warnings);

  const securitiesTable = findTableAfterHeading(doc, "Портфель Ценных Бумаг");
  const cashTable = findTableAfterHeading(doc, "Денежные средства");
  const cashFlowsTable = findTableAfterHeading(
    doc,
    "Движение денежных средств",
  );
  const tradesTable = findTableAfterHeading(doc, "Сделки купли/продажи");

  if (!securitiesTable) {
    warnings.push({
      code: "MISSING_TABLE",
      message: "Securities table not found",
      path: "securities",
    });
  }
  if (!cashTable) {
    warnings.push({
      code: "MISSING_TABLE",
      message: "Cash table not found",
      path: "cash",
    });
  }

  const securitiesRaw = securitiesTable
    ? parseSecuritiesTable(securitiesTable, warnings)
    : [];
  const securities = mergeSecurityPositions(securitiesRaw);
  const cash = cashTable ? parseCashTable(cashTable, warnings) : [];
  const cashFlows = cashFlowsTable
    ? parseCashFlowsTable(cashFlowsTable, warnings)
    : [];
  const trades = tradesTable ? parseTradesTable(tradesTable, warnings) : [];

  if (securities.length > BROKER_IMPORT_LIMITS.maxSecurities) {
    throw new Error("ROW_LIMIT_EXCEEDED:securities");
  }
  if (trades.length > BROKER_IMPORT_LIMITS.maxTrades) {
    throw new Error("ROW_LIMIT_EXCEEDED:trades");
  }

  const ledger: BrokerNormalizedLedger = {
    ...emptyLedger(),
    ...meta,
    assetsStart: rating.assetsStart ?? 0,
    assetsEnd: rating.assetsEnd ?? 0,
    assetsChange: rating.assetsChange ?? 0,
    securitiesStart: rating.securitiesStart ?? 0,
    securitiesEnd: rating.securitiesEnd ?? 0,
    cashStart: rating.cashStart ?? 0,
    cashEnd: rating.cashEnd ?? 0,
    securities,
    cash,
    cashFlows,
    trades,
  };

  const reconciliation = reconcileBrokerLedger(ledger);
  if (!reconciliation.withinTolerance) {
    warnings.push({
      code: "RECONCILIATION_MISMATCH",
      message: "Computed portfolio totals differ from reported rating row",
      path: "reconciliation",
    });
  }

  return {
    ledger,
    coverage: {
      meta: Boolean(meta.periodStart && meta.periodEnd),
      rating: Boolean(rating.assetsEnd != null),
      securities: securities.length > 0,
      cash: cash.length > 0,
      cashFlows: cashFlows.length > 0,
      trades: trades.length > 0,
      securitiesCount: securities.length,
      cashCount: cash.length,
      cashFlowCount: cashFlows.length,
      tradeCount: trades.length,
    },
    warnings,
    reconciliation,
  };
}

export const sberHtmlAdapter: BrokerAdapter = {
  id: "sber-html-v1",
  version: "1.0.0",
  label: "Sber Investments HTML",
  status: "production",
  supportedExtensions: [".html", ".htm"],
  detect: detectSberHtml,
  parse: parseSberHtml,
};

export function parseSberPortfolioHtml(html: string): BrokerAdapterParseResult {
  return sberHtmlAdapter.parse({ content: html });
}
