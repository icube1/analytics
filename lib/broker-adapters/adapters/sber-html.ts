import { BROKER_IMPORT_LIMITS } from "../limits";
import {
  isValidParsedNumber,
  parseBrokerNumber,
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
  BrokerAccountKind,
  BrokerDeposit,
  BrokerTrade,
  CashFlow,
  CashPosition,
  SecurityPosition,
  TaxCodeRow,
  TaxSummary,
} from "../../portfolio-types";
import type {
  BrokerAdapter,
  BrokerAdapterParseResult,
  BrokerDetectionResult,
  BrokerImportInput,
  BrokerImportWarning,
  BrokerNormalizedLedger,
} from "../types";

const RU_DATE = /^\d{2}\.\d{2}\.\d{4}$/u;
/** Код договора / торговый код: S259RFF, 4259RFF, SANITIZED-CONTRACT… */
const CONTRACT_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,}/u;
const TAX_CODE = /^\d{3,4}$/u;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function documentText(doc: Document): string {
  return normalizeWhitespace(doc.documentElement?.textContent ?? "");
}

/**
 * Извлекает человекочитаемый код договора из строки «Договор …».
 * Сбер пишет и «Договор 4259RFF от 09.09.2026», и «Договор на ведение
 * индивидуального инвестиционного счета S259RFF от 09.09.2026» — прежний
 * regex /Договор\s+(\S+)/ ловил служебное «на» вместо кода счёта.
 */
export function extractContractCode(contractLine: string): string {
  // \b не работает после кириллических букв (ASCII-слово-граница) — якорим на пробел.
  const tail = contractLine.match(/Договор(?=\s|$)([\s\S]*)$/u)?.[1] ?? "";
  for (const raw of tail.split(/\s+/u)) {
    const token = raw.replace(/[,;:]+$/u, "");
    if (!token || RU_DATE.test(token)) continue;
    if (!CONTRACT_TOKEN.test(token)) continue; // «на», «ведение», «счета», «от», «№»
    return token;
  }
  return "";
}

/** «Торговый код: S259RFF» в заголовке портфеля — резервный источник кода счёта. */
function extractTradeCode(doc: Document): string {
  const match = documentText(doc).match(
    /Торговый\s+код\s*:?\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,})/u,
  );
  return match?.[1] ?? "";
}

/**
 * Тип счёта. ИИС определяется по формулировке в заголовке договора;
 * «ИИС3»/«ИИС-3» (в том числе метка в таблице зачислений) уточняет поколение.
 */
export function detectAccountKind(doc: Document): BrokerAccountKind {
  const text = documentText(doc);
  // \w ASCII-совместим и не покрывает кириллицу — используем явный диапазон.
  const isIis =
    /индивидуальн[а-яё]*\s+инвестиционн[а-яё]*\s+сч[её]т/iu.test(text);
  if (!isIis && !/ИИС\s*\d/iu.test(text)) return "broker";
  if (/ИИС[\s-]?3(?!\d)/iu.test(text)) return "iis3";
  if (/ИИС[\s-]?1(?!\d)/iu.test(text)) return "iis1";
  return "iis2";
}

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
    extractContractCode(investorBlock ?? "") || extractTradeCode(doc);

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

/**
 * Необязательная числовая ячейка (номинал, НКД): пустая → undefined,
 * без предупреждений — у акций и фондов эти колонки не заполняются.
 */
function parseOptionalNumber(
  raw: string,
  path: string,
  warnings: BrokerImportWarning[],
): number | undefined {
  if (!raw.trim()) return undefined;
  const parsed = parseBrokerNumberOrWarn(raw, path, warnings);
  return Number.isFinite(parsed.value) ? parsed.value : undefined;
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
    // Номинал и НКД идут «внахлёст» с двух сторон: 4/9 — номинал, 7/12 — НКД.
    const nominalStart = parseOptionalNumber(
      cellText(row, 4),
      `${rowPath}.nominalStart`,
      warnings,
    );
    const nkdStart = parseOptionalNumber(
      cellText(row, 7),
      `${rowPath}.nkdStart`,
      warnings,
    );
    const nominalEnd = parseOptionalNumber(
      cellText(row, 9),
      `${rowPath}.nominalEnd`,
      warnings,
    );
    const nkdEnd = parseOptionalNumber(
      cellText(row, 12),
      `${rowPath}.nkdEnd`,
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

    const position: SecurityPosition = {
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
    };

    // Пишем необязательные поля только когда они реально есть в отчёте,
    // чтобы не менять форму объектов для акций и фондов.
    const nominal = nominalEnd ?? nominalStart;
    if (nominal !== undefined) position.nominal = nominal;
    if (nkdStart !== undefined) position.nkdStart = nkdStart;
    if (nkdEnd !== undefined) position.nkdEnd = nkdEnd;

    positions.push(position);
  }

  return positions;
}

function sumOptional(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left === undefined && right === undefined) return undefined;
  return (left ?? 0) + (right ?? 0);
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

    const merged: SecurityPosition = {
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
    };

    const nominal = existing.nominal ?? pos.nominal;
    if (nominal !== undefined) merged.nominal = nominal;
    const nkdStart = sumOptional(existing.nkdStart, pos.nkdStart);
    if (nkdStart !== undefined) merged.nkdStart = nkdStart;
    const nkdEnd = sumOptional(existing.nkdEnd, pos.nkdEnd);
    if (nkdEnd !== undefined) merged.nkdEnd = nkdEnd;

    byIsin.set(pos.isin, merged);
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

/** Таблица, идущая сразу за параграфом-заголовком, подходящим под предикат. */
function findTableAfterParagraph(
  doc: Document,
  match: (text: string) => boolean,
): Element | null {
  for (const node of [...doc.querySelectorAll("p")]) {
    const text = normalizeWhitespace(node.textContent ?? "");
    if (!text || !match(text)) continue;

    let sibling = node.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === "TABLE") return sibling;
      if (
        sibling.tagName === "P" &&
        normalizeWhitespace(sibling.textContent ?? "")
      ) {
        break;
      }
      sibling = sibling.nextElementSibling;
    }
  }
  return null;
}

/**
 * «Информация о зачислениях денежных средств на ИИС»:
 * Год | Лимит | Дата операции | Сумма | Основание | Остаток лимита.
 * Год и лимит в отчёте сгруппированы (rowspan), поэтому наследуются.
 */
function parseDepositsTable(
  table: Element,
  warnings: BrokerImportWarning[],
): BrokerDeposit[] {
  const deposits: BrokerDeposit[] = [];
  let year = "";
  let limit = "";

  for (const row of [...table.querySelectorAll("tr")]) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) continue;

    const date = cellText(row, 2);
    if (!RU_DATE.test(date)) continue;

    const rowPath = `deposits[${deposits.length}]`;
    const amount = parseBrokerNumberOrWarn(
      cellText(row, 3),
      `${rowPath}.amount`,
      warnings,
    );
    if (!isValidParsedNumber(amount)) {
      warnings.push({
        code: "SKIPPED_ROW",
        message: `Skipped IIS deposit row with malformed amount (${date})`,
        path: rowPath,
      });
      continue;
    }

    year = cellText(row, 0) || year;
    limit = cellText(row, 1) || limit;

    deposits.push({
      year,
      date,
      amount: amount.value,
      basis: cellText(row, 4),
      limit,
    });
  }

  return deposits;
}

/** Раздел I «ДОХОДЫ И РАСХОДЫ»: код дохода / сумма / облагаемая сумма / код расхода / расход. */
function parseTaxCodeRows(
  table: Element,
  warnings: BrokerImportWarning[],
): TaxCodeRow[] {
  const rows: TaxCodeRow[] = [];

  for (const row of [...table.querySelectorAll("tr")]) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) continue;

    const code = cellText(row, 1);
    if (!TAX_CODE.test(code)) continue;

    const rowPath = `tax.rows[${rows.length}]`;
    const income = parseBrokerNumberOrWarn(
      cellText(row, 2),
      `${rowPath}.income`,
      warnings,
    );
    const taxable = parseBrokerNumberOrWarn(
      cellText(row, 3),
      `${rowPath}.taxable`,
      warnings,
    );
    const expense = parseBrokerNumberOrWarn(
      cellText(row, 5),
      `${rowPath}.expense`,
      warnings,
    );

    if (![income, taxable, expense].every(isValidParsedNumber)) {
      warnings.push({
        code: "SKIPPED_ROW",
        message: `Skipped tax row with malformed amounts (${code})`,
        path: rowPath,
      });
      continue;
    }

    const expenseCodeRaw = cellText(row, 4);
    rows.push({
      code,
      income: income.value,
      taxable: taxable.value,
      expenseCode: TAX_CODE.test(expenseCodeRaw) ? expenseCodeRaw : undefined,
      expense: expense.value,
    });
  }

  return rows;
}

interface TaxTotalsResult {
  rateBands: { rate: number; base: number; tax: number }[];
  taxDue: number;
  lossCarry: number;
}

/** Раздел III «ИТОГОВЫЙ ФИНАНСОВЫЙ РЕЗУЛЬТАТ»: итоги и разбивка по ставкам 13/15/35 %. */
function parseTaxTotals(table: Element): TaxTotalsResult {
  const rateBands: { rate: number; base: number; tax: number }[] = [];
  let taxDue = 0;
  let lossCarry = 0;
  let rate: number | null = null;
  let seenTotals = false;

  const number = (row: Element, index: number): number => {
    const parsed = parseBrokerNumber(cellText(row, index));
    return parsed.ok ? parsed.parsed.value : 0;
  };

  for (const row of [...table.querySelectorAll("tr")]) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) continue;

    const cells = row.querySelectorAll("td");
    if (cells.length <= 1) {
      const band = cellText(row, 0).match(/Ставка\s+(\d+(?:[.,]\d+)?)\s*%/u);
      if (band) rate = Number(band[1].replace(",", "."));
      continue;
    }

    if (!seenTotals) {
      seenTotals = true;
      lossCarry = Math.abs(number(row, 7));
      continue;
    }

    if (rate == null) continue;
    rateBands.push({
      rate,
      base: number(row, 1),
      tax: number(row, 2),
    });
    taxDue += cells.length > 4 ? number(row, 4) : number(row, 2);
  }

  return { rateBands, taxDue, lossCarry };
}

/**
 * Налоговый блок «РАСЧЕТ И УДЕРЖАНИЕ НАЛОГА».
 *
 * income/expense/realized — результат по брокерскому обслуживанию и сделкам с ЦБ
 * (код дохода 1530): именно он соответствует реализованному результату портфеля.
 * Полная расшифровка по всем кодам (дивиденды 1535, НКД 1537, 2740 …) — в `rows`.
 */
function parseTaxSummary(
  doc: Document,
  warnings: BrokerImportWarning[],
  fallbackYear: string,
): TaxSummary | undefined {
  const rowsTable =
    findTableAfterParagraph(doc, (text) =>
      /^I\.?\s+ДОХОДЫ\s+И\s+РАСХОДЫ/iu.test(text),
    ) ??
    findTableAfterParagraph(
      doc,
      (text) =>
        /ДОХОДЫ\s+И\s+РАСХОДЫ/iu.test(text) &&
        /без\s+переноса\s+убытк/iu.test(text),
    );
  const totalsTable =
    findTableAfterParagraph(doc, (text) =>
      /^III\.?\s+ИТОГОВЫЙ\s+ФИНАНСОВЫЙ\s+РЕЗУЛЬТАТ/iu.test(text),
    ) ??
    findTableAfterParagraph(doc, (text) =>
      /ИТОГОВЫЙ\s+ФИНАНСОВЫЙ\s+РЕЗУЛЬТАТ/iu.test(text),
    );
  if (!rowsTable && !totalsTable) return undefined;

  const heading = [...doc.querySelectorAll("p")]
    .map((p) => normalizeWhitespace(p.textContent ?? ""))
    .find((text) => /РАСЧЕТ\s+И\s+УДЕРЖАНИЕ\s+НАЛОГА/iu.test(text));
  const year =
    heading?.match(/на\s+\d{2}\.\d{2}\.(\d{4})/u)?.[1] ?? fallbackYear;

  const rows = rowsTable ? parseTaxCodeRows(rowsTable, warnings) : [];
  const totals = totalsTable
    ? parseTaxTotals(totalsTable)
    : { rateBands: [], taxDue: 0, lossCarry: 0 };

  const primary = rows.find((row) => row.code === "1530");
  const income = primary
    ? primary.income
    : rows.reduce((sum, row) => sum + row.income, 0);
  const expense = primary
    ? primary.expense
    : rows.reduce((sum, row) => sum + row.expense, 0);

  return {
    year,
    rows,
    income,
    expense,
    realized: income - expense,
    rateBands: totals.rateBands,
    taxDue: totals.taxDue,
    lossCarry: totals.lossCarry,
  };
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

  const accountKind = detectAccountKind(doc);
  const depositsTable = findTableAfterHeading(
    doc,
    "Информация о зачислениях",
  );
  const deposits = depositsTable
    ? parseDepositsTable(depositsTable, warnings)
    : [];
  const tax = parseTaxSummary(doc, warnings, (meta.periodEnd ?? "").slice(-4));

  if (securities.length > BROKER_IMPORT_LIMITS.maxSecurities) {
    throw new Error("ROW_LIMIT_EXCEEDED:securities");
  }
  if (trades.length > BROKER_IMPORT_LIMITS.maxTrades) {
    throw new Error("ROW_LIMIT_EXCEEDED:trades");
  }

  const ledger: BrokerNormalizedLedger = {
    ...emptyLedger(),
    ...meta,
    accountKind,
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
  // Пустые блоки не материализуем, чтобы не раздувать отчёт и не плодить
  // ложные различия при слиянии с уже сохранёнными отчётами.
  if (deposits.length > 0) ledger.deposits = deposits;
  if (tax) ledger.tax = tax;

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
      accountKind: Boolean(accountKind),
      depositCount: deposits.length,
      tax: Boolean(tax),
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
