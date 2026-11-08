import type {
  BrokerAccountSource,
  BrokerReport,
  CashPosition,
  SecurityPosition,
} from "./portfolio-types";

function ruDateValue(value: string): number {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function pickEarlierDate(left: string, right: string): string {
  const leftValue = ruDateValue(left);
  const rightValue = ruDateValue(right);
  if (Number.isNaN(leftValue)) return right || left;
  if (Number.isNaN(rightValue)) return left || right;
  return leftValue <= rightValue ? left : right;
}

function pickLaterDate(left: string, right: string): string {
  const leftValue = ruDateValue(left);
  const rightValue = ruDateValue(right);
  if (Number.isNaN(leftValue)) return right || left;
  if (Number.isNaN(rightValue)) return left || right;
  return leftValue >= rightValue ? left : right;
}

function uniqueJoined(values: string[]): string {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(trimmed);
  }
  return ordered.join(" + ");
}

export function brokerAccountKey(
  report: BrokerReport,
  fileName = "",
): string {
  const contract = report.contract.trim().toLowerCase();
  if (contract) return `contract:${contract}`;
  const name = fileName.trim().toLowerCase();
  if (name) return `file:${name}`;
  return "default";
}

export function mergeSecurityPositions(
  positions: SecurityPosition[],
): SecurityPosition[] {
  const byIsin = new Map<string, SecurityPosition>();

  for (const pos of positions) {
    const existing = byIsin.get(pos.isin);
    if (!existing) {
      byIsin.set(pos.isin, { ...pos, id: pos.isin || pos.id });
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
      id: existing.isin || existing.id,
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

function mergeCashPositions(items: CashPosition[]): CashPosition[] {
  const byCurrency = new Map<string, CashPosition>();

  for (const item of items) {
    const existing = byCurrency.get(item.currency);
    if (!existing) {
      byCurrency.set(item.currency, { ...item });
      continue;
    }

    const start = existing.start + item.start;
    const end = existing.end + item.end;
    const endPlanned =
      (existing.endPlanned ?? existing.end) + (item.endPlanned ?? item.end);

    byCurrency.set(item.currency, {
      ...existing,
      platform:
        existing.platform === item.platform
          ? existing.platform
          : uniqueJoined([existing.platform, item.platform]) || existing.platform,
      rateEnd: existing.rateEnd || item.rateEnd,
      start,
      change: existing.change + item.change,
      end,
      plannedCredits:
        (existing.plannedCredits ?? 0) + (item.plannedCredits ?? 0),
      plannedDebits: (existing.plannedDebits ?? 0) + (item.plannedDebits ?? 0),
      endPlanned,
    });
  }

  return [...byCurrency.values()];
}

function prefixId<T extends { id: string }>(item: T, prefix: string, index: number): T {
  return { ...item, id: `${prefix}:${item.id || index}` };
}

function mergeDeposits(reports: BrokerReport[]) {
  return reports.flatMap((report) => report.deposits ?? []);
}

function mergeTaxSummaries(reports: BrokerReport[]) {
  const withTax = reports.filter((report) => report.tax);
  if (withTax.length === 0) return undefined;
  if (withTax.length === 1) return withTax[0].tax;

  const rows = withTax.flatMap((report) => report.tax?.rows ?? []);
  const income = withTax.reduce((sum, report) => sum + (report.tax?.income ?? 0), 0);
  const expense = withTax.reduce((sum, report) => sum + (report.tax?.expense ?? 0), 0);
  const lossCarry = withTax.reduce(
    (sum, report) => sum + Math.abs(report.tax?.lossCarry ?? 0),
    0,
  );
  const taxDue = withTax.reduce((sum, report) => sum + (report.tax?.taxDue ?? 0), 0);

  const bands = new Map<number, { rate: number; base: number; tax: number }>();
  for (const report of withTax) {
    for (const band of report.tax?.rateBands ?? []) {
      const current = bands.get(band.rate) ?? { rate: band.rate, base: 0, tax: 0 };
      current.base += band.base;
      current.tax += band.tax;
      bands.set(band.rate, current);
    }
  }

  return {
    year: withTax[0].tax?.year ?? "",
    rows,
    income,
    expense,
    realized: income - expense,
    rateBands: [...bands.values()].sort((a, b) => a.rate - b.rate),
    taxDue,
    lossCarry,
  };
}

/** Тип счёта объединённого отчёта: единый, если у всех счетов он одинаковый. */
function mergeAccountKind(reports: BrokerReport[]) {
  const kinds = new Set(
    reports.map((report) => report.accountKind).filter(Boolean) as string[],
  );
  if (kinds.size === 1) return reports[0].accountKind;
  return undefined;
}

export function combineBrokerReports(reports: BrokerReport[]): BrokerReport | null {
  const present = reports.filter(Boolean);
  if (present.length === 0) return null;
  if (present.length === 1) return present[0];

  const securities = mergeSecurityPositions(
    present.flatMap((report) => report.securities),
  );
  const cash = mergeCashPositions(present.flatMap((report) => report.cash));
  const trades = present.flatMap((report, reportIndex) =>
    report.trades.map((trade, index) =>
      prefixId(trade, report.contract || `account-${reportIndex}`, index),
    ),
  );
  const cashFlows = present.flatMap((report, reportIndex) =>
    report.cashFlows.map((flow, index) =>
      prefixId(flow, report.contract || `account-${reportIndex}`, index),
    ),
  );

  const assetsStart = present.reduce((sum, report) => sum + report.assetsStart, 0);
  const assetsEnd = present.reduce((sum, report) => sum + report.assetsEnd, 0);
  const securitiesStart = present.reduce(
    (sum, report) => sum + report.securitiesStart,
    0,
  );
  const securitiesEnd = present.reduce(
    (sum, report) => sum + report.securitiesEnd,
    0,
  );
  const cashStart = present.reduce((sum, report) => sum + report.cashStart, 0);
  const cashEnd = present.reduce((sum, report) => sum + report.cashEnd, 0);

  return {
    periodStart: present.reduce(
      (earliest, report) => pickEarlierDate(earliest, report.periodStart),
      present[0].periodStart,
    ),
    periodEnd: present.reduce(
      (latest, report) => pickLaterDate(latest, report.periodEnd),
      present[0].periodEnd,
    ),
    createdAt: present.reduce(
      (latest, report) => pickLaterDate(latest, report.createdAt),
      present[0].createdAt,
    ),
    investor: uniqueJoined(present.map((report) => report.investor)),
    contract: uniqueJoined(present.map((report) => report.contract)),
    assetsStart,
    assetsEnd,
    assetsChange: assetsEnd - assetsStart,
    securitiesStart,
    securitiesEnd,
    cashStart,
    cashEnd,
    securities,
    cash,
    trades,
    cashFlows,
    accountKind: mergeAccountKind(present),
    deposits: mergeDeposits(present),
    tax: mergeTaxSummaries(present),
  };
}

export function normalizeBrokerAccounts(
  accounts: BrokerAccountSource[] | undefined,
  legacyReport: BrokerReport | null | undefined,
  lastFileName: string,
): BrokerAccountSource[] {
  if (Array.isArray(accounts)) {
    return accounts
      .filter((account) => account?.report)
      .map((account) => ({
        id:
          account.id ||
          brokerAccountKey(account.report, account.fileName || lastFileName),
        fileName: account.fileName || lastFileName,
        uploadedAt: account.uploadedAt || new Date(0).toISOString(),
        report: account.report,
      }));
  }

  if (!legacyReport) return [];

  return [
    {
      id: brokerAccountKey(legacyReport, lastFileName),
      fileName: lastFileName,
      uploadedAt: new Date(0).toISOString(),
      report: legacyReport,
    },
  ];
}

export function upsertBrokerAccount(
  accounts: BrokerAccountSource[],
  incoming: BrokerReport,
  fileName: string,
  uploadedAt = new Date().toISOString(),
): BrokerAccountSource[] {
  const id = brokerAccountKey(incoming, fileName);
  const next: BrokerAccountSource = {
    id,
    fileName,
    uploadedAt,
    report: incoming,
  };
  const index = accounts.findIndex((account) => account.id === id);
  if (index === -1) return [...accounts, next];
  const copy = [...accounts];
  copy[index] = next;
  return copy;
}

export function removeBrokerAccount(
  accounts: BrokerAccountSource[],
  accountId: string,
): BrokerAccountSource[] {
  return accounts.filter((account) => account.id !== accountId);
}

export function combinedReportFromAccounts(
  accounts: BrokerAccountSource[],
): BrokerReport | null {
  return combineBrokerReports(accounts.map((account) => account.report));
}

export function previewCombinedBrokerReport(
  accounts: BrokerAccountSource[],
  incoming: BrokerReport,
  fileName: string,
): BrokerReport | null {
  return combinedReportFromAccounts(
    upsertBrokerAccount(accounts, incoming, fileName),
  );
}
