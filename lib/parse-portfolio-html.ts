import { parseHTML } from "linkedom";
import type {
  BrokerReport,
  BrokerTrade,
  CashFlow,
  CashPosition,
  SecurityPosition,
} from "./portfolio-types";

function parseHtmlDocument(html: string): Document {
  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(html, "text/html");
  }
  return parseHTML(html).document as unknown as Document;
}

function parseNum(text: string): number {
  const cleaned = text.replace(/\s/g, "").replace(",", ".").trim();
  if (!cleaned || cleaned === "—" || cleaned === "-") return 0;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function cellText(row: Element, index: number): string {
  const cells = row.querySelectorAll("td");
  return cells[index]?.textContent?.trim() ?? "";
}

function hasClass(row: Element, className: string): boolean {
  const value = row.getAttribute("class") ?? "";
  return value.split(/\s+/).includes(className);
}

function extractMeta(html: string, doc: Document): Partial<BrokerReport> {
  const titleText = doc.querySelector("h3")?.textContent?.replace(/\s+/g, " ") ?? "";
  const periodMatch = titleText.match(
    /с\s+(\d{2}\.\d{2}\.\d{4})\s+по\s+(\d{2}\.\d{2}\.\d{4}).*?(\d{2}\.\d{2}\.\d{4})/,
  );

  const investorBlock = [...doc.querySelectorAll("p")]
    .map((p) => p.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .find((t) => t.includes("Инвестор:"));

  const investor = investorBlock?.match(/Инвестор:\s*(.+?)\s*Договор/)?.[1]?.trim() ?? "";
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

function parseRatingAssets(doc: Document): Partial<BrokerReport> {
  const table = doc.querySelector("table.RatingAssets");
  if (!table) return {};

  const dataRow = [...table.querySelectorAll("tr")].find((row) =>
    cellText(row, 0).includes("Основной рынок"),
  );
  if (!dataRow) return {};

  return {
    securitiesStart: parseNum(cellText(dataRow, 1)),
    cashStart: parseNum(cellText(dataRow, 2)),
    assetsStart: parseNum(cellText(dataRow, 3)),
    securitiesEnd: parseNum(cellText(dataRow, 4)),
    cashEnd: parseNum(cellText(dataRow, 5)),
    assetsEnd: parseNum(cellText(dataRow, 6)),
    assetsChange: parseNum(cellText(dataRow, 9)),
  };
}

function findTableAfterHeading(doc: Document, heading: string): Element | null {
  const paragraphs = [...doc.querySelectorAll("p, br")];
  for (const node of paragraphs) {
    const text = node.textContent?.trim() ?? "";
    if (!text.includes(heading)) continue;

    let sibling = node.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === "TABLE") {
        return sibling;
      }
      if (sibling.tagName === "P" && sibling.textContent?.trim()) {
        break;
      }
      sibling = sibling.nextElementSibling;
    }
  }

  const allTables = [...doc.querySelectorAll("table")];
  return (
    allTables.find((table) => {
      const prev = table.previousElementSibling?.textContent ?? "";
      return prev.includes(heading);
    }) ?? null
  );
}

function parseSecuritiesTable(table: Element): SecurityPosition[] {
  const positions: SecurityPosition[] = [];

  for (const row of [...table.querySelectorAll("tr")]) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) {
      continue;
    }
    if (hasClass(row, "summary-row")) continue;

    const first = cellText(row, 0);
    if (!first || first.startsWith("Площадка:") || first === "\u00a0") continue;

    const isin = cellText(row, 1);
    if (!isin || isin.length < 10) continue;

    const name = first;
    positions.push({
      id: isin,
      name,
      isin,
      currency: cellText(row, 2) || "RUB",
      quantityStart: parseNum(cellText(row, 3)),
      priceStart: parseNum(cellText(row, 5)),
      valueStart: parseNum(cellText(row, 6)),
      quantityEnd: parseNum(cellText(row, 8)),
      priceEnd: parseNum(cellText(row, 10)),
      valueEnd: parseNum(cellText(row, 11)),
      valueChange: parseNum(cellText(row, 14)),
    });
  }

  return positions;
}

function parseCashTable(table: Element): CashPosition[] {
  const items: CashPosition[] = [];

  for (const row of [...table.querySelectorAll("tr")]) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) {
      continue;
    }
    if (hasClass(row, "summary-row")) continue;

    const platform = cellText(row, 0);
    if (!platform || !platform.includes("Торговый счет")) continue;

    items.push({
      platform,
      currency: cellText(row, 1),
      rateEnd: parseNum(cellText(row, 2)),
      start: parseNum(cellText(row, 3)),
      change: parseNum(cellText(row, 4)),
      end: parseNum(cellText(row, 5)),
    });
  }

  return items;
}

function parseCashFlowsTable(table: Element): CashFlow[] {
  const flows: CashFlow[] = [];

  for (const row of [...table.querySelectorAll("tr")]) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) {
      continue;
    }
    if (hasClass(row, "summary-row")) continue;

    const date = cellText(row, 0);
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) continue;

    flows.push({
      id: `${date}-${cellText(row, 2)}-${cellText(row, 4)}`,
      date,
      description: cellText(row, 2),
      currency: cellText(row, 3),
      credit: parseNum(cellText(row, 4)),
      debit: parseNum(cellText(row, 5)),
    });
  }

  return flows;
}

function parseTradesTable(table: Element): BrokerTrade[] {
  const trades: BrokerTrade[] = [];

  for (const row of [...table.querySelectorAll("tr")]) {
    if (hasClass(row, "table-header") || hasClass(row, "rn")) {
      continue;
    }
    if (hasClass(row, "summary-row")) continue;

    const date = cellText(row, 0);
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) continue;

    const dealId = cellText(row, 13) || `${date}-${cellText(row, 3)}`;
    trades.push({
      id: dealId,
      date,
      settlementDate: cellText(row, 1),
      name: cellText(row, 3),
      ticker: cellText(row, 4),
      side: cellText(row, 6),
      quantity: parseNum(cellText(row, 7)),
      price: parseNum(cellText(row, 8)),
      amount: parseNum(cellText(row, 9)),
      brokerFee: parseNum(cellText(row, 11)),
      exchangeFee: parseNum(cellText(row, 12)),
    });
  }

  return trades;
}

export function parsePortfolioHtml(html: string): BrokerReport {
  const doc = parseHtmlDocument(html);
  const meta = extractMeta(html, doc);
  const rating = parseRatingAssets(doc);

  const securitiesTable = findTableAfterHeading(doc, "Портфель Ценных Бумаг");
  const cashTable = findTableAfterHeading(doc, "Денежные средства");
  const cashFlowsTable = findTableAfterHeading(doc, "Движение денежных средств");
  const tradesTable = findTableAfterHeading(doc, "Сделки купли/продажи");

  return {
    periodStart: meta.periodStart ?? "",
    periodEnd: meta.periodEnd ?? "",
    createdAt: meta.createdAt ?? "",
    investor: meta.investor ?? "",
    contract: meta.contract ?? "",
    assetsStart: rating.assetsStart ?? 0,
    assetsEnd: rating.assetsEnd ?? 0,
    assetsChange: rating.assetsChange ?? 0,
    securitiesStart: rating.securitiesStart ?? 0,
    securitiesEnd: rating.securitiesEnd ?? 0,
    cashStart: rating.cashStart ?? 0,
    cashEnd: rating.cashEnd ?? 0,
    securities: securitiesTable ? parseSecuritiesTable(securitiesTable) : [],
    cash: cashTable ? parseCashTable(cashTable) : [],
    cashFlows: cashFlowsTable ? parseCashFlowsTable(cashFlowsTable) : [],
    trades: tradesTable ? parseTradesTable(tradesTable) : [],
  };
}
