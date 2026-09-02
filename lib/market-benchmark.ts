import { calendarMonthFromRuDate } from "./broker-deposits";
import type { BrokerBalanceSnapshot } from "./portfolio-types";

export type BenchmarkPeriodKind =
  | "month"
  | "ytd"
  | "all"
  | "custom";

export interface BenchmarkPeriod {
  id: string;
  kind: BenchmarkPeriodKind;
  label: string;
  fromDate: string;
  toDate: string;
  calendarMonth?: string;
}

export interface BenchmarkReturnRow {
  id: string;
  label: string;
  group: "portfolio" | "core" | "sector" | "bonds" | "fx";
  returnPct: number | null;
  deltaVsPortfolio?: number | null;
}

function parseRuDateToIso(ruDate: string): string | null {
  const match = ruDate.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function monthEndIso(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${calendarMonth}-${String(lastDay).padStart(2, "0")}`;
}

function monthStartIso(calendarMonth: string): string {
  return `${calendarMonth}-01`;
}

function previousCalendarMonth(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function snapshotSortKey(snapshot: BrokerBalanceSnapshot): string {
  const iso = parseRuDateToIso(snapshot.periodEnd);
  return iso ?? snapshot.uploadedAt.slice(0, 10);
}

function snapshotCalendarMonth(snapshot: BrokerBalanceSnapshot): string | null {
  const iso = parseRuDateToIso(snapshot.periodEnd);
  if (iso) return iso.slice(0, 7);
  return snapshot.uploadedAt.slice(0, 7);
}

export function getSnapshotMonths(
  snapshots: BrokerBalanceSnapshot[],
): string[] {
  const months = new Set<string>();
  for (const snapshot of snapshots) {
    const month = snapshotCalendarMonth(snapshot);
    if (month) months.add(month);
  }
  return [...months].sort();
}

function monthEndBalance(
  snapshots: BrokerBalanceSnapshot[],
): Map<string, BrokerBalanceSnapshot> {
  const byMonth = new Map<string, BrokerBalanceSnapshot>();

  for (const snapshot of snapshots) {
    const month = snapshotCalendarMonth(snapshot);
    if (!month) continue;
    const existing = byMonth.get(month);
    if (!existing || snapshotSortKey(snapshot) >= snapshotSortKey(existing)) {
      byMonth.set(month, snapshot);
    }
  }

  return byMonth;
}

function depositsBetween(
  snapshots: BrokerBalanceSnapshot[],
  fromDate: string,
  toDate: string,
): number {
  const seen = new Set<string>();
  let total = 0;

  for (const snapshot of snapshots) {
    for (const deposit of snapshot.deposits) {
      if (seen.has(deposit.id)) continue;
      seen.add(deposit.id);
      const iso = parseRuDateToIso(deposit.date);
      if (!iso || iso < fromDate || iso > toDate) continue;
      total += deposit.amount;
    }
  }

  return total;
}

export function computeBrokerReturnForRange(
  snapshots: BrokerBalanceSnapshot[],
  fromDate: string,
  toDate: string,
): number | null {
  if (snapshots.length === 0) return null;

  const sorted = [...snapshots].sort((a, b) =>
    snapshotSortKey(a).localeCompare(snapshotSortKey(b)),
  );

  let startSnapshot: BrokerBalanceSnapshot | null = null;
  let endSnapshot: BrokerBalanceSnapshot | null = null;

  for (const snapshot of sorted) {
    const key = snapshotSortKey(snapshot);
    if (key <= fromDate) startSnapshot = snapshot;
    if (key <= toDate) endSnapshot = snapshot;
  }

  if (!endSnapshot) return null;
  if (!startSnapshot) startSnapshot = sorted[0];

  const startKey = snapshotSortKey(startSnapshot);
  const endKey = snapshotSortKey(endSnapshot);
  if (endKey < fromDate) return null;

  const startBalance = startSnapshot.brokerTotal;
  const endBalance = endSnapshot.brokerTotal;
  if (startBalance <= 0) return null;

  const flowStart = startKey < fromDate ? fromDate : startKey;
  const netDeposits = depositsBetween(sorted, flowStart, toDate);

  return ((endBalance - startBalance - netDeposits) / startBalance) * 100;
}

export function buildBenchmarkPeriods(
  snapshots: BrokerBalanceSnapshot[],
): BenchmarkPeriod[] {
  if (snapshots.length === 0) return [];

  const months = getSnapshotMonths(snapshots);
  const periods: BenchmarkPeriod[] = [];

  for (const calendarMonth of months) {
    periods.push({
      id: `month-${calendarMonth}`,
      kind: "month",
      label: formatMonthLabel(calendarMonth),
      fromDate: monthStartIso(calendarMonth),
      toDate: monthEndIso(calendarMonth),
      calendarMonth,
    });
  }

  const latestMonth = months[months.length - 1];
  if (latestMonth) {
    const year = latestMonth.slice(0, 4);
    periods.push({
      id: `ytd-${year}`,
      kind: "ytd",
      label: `С начала ${year}`,
      fromDate: `${year}-01-01`,
      toDate: monthEndIso(latestMonth),
    });
  }

  const sorted = [...snapshots].sort((a, b) =>
    snapshotSortKey(a).localeCompare(snapshotSortKey(b)),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstIso = parseRuDateToIso(first.periodEnd) ?? first.uploadedAt.slice(0, 10);
  const lastIso = parseRuDateToIso(last.periodEnd) ?? last.uploadedAt.slice(0, 10);

  periods.push({
    id: "all",
    kind: "all",
    label: "С первого отчёта",
    fromDate: firstIso,
    toDate: lastIso,
  });

  return periods.sort((a, b) => {
    const kindOrder = { month: 0, ytd: 1, all: 2, custom: 3 };
    if (kindOrder[a.kind] !== kindOrder[b.kind]) {
      return kindOrder[a.kind] - kindOrder[b.kind];
    }
    return b.fromDate.localeCompare(a.fromDate);
  });
}

export function formatMonthLabel(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}

export function attachPortfolioDelta(
  portfolioReturn: number | null,
  rows: Omit<BenchmarkReturnRow, "deltaVsPortfolio">[],
): BenchmarkReturnRow[] {
  return rows.map((row) => ({
    ...row,
    deltaVsPortfolio:
      portfolioReturn != null && row.returnPct != null
        ? portfolioReturn - row.returnPct
        : null,
  }));
}

export function defaultBenchmarkPeriod(
  periods: BenchmarkPeriod[],
): BenchmarkPeriod | null {
  const monthPeriods = periods.filter((period) => period.kind === "month");
  return monthPeriods[monthPeriods.length - 1] ?? periods[0] ?? null;
}

/** Для месячного периода — сравнение с предыдущим месяцем end balance as start */
export function resolveComparisonDates(period: BenchmarkPeriod): {
  fromDate: string;
  toDate: string;
} {
  if (period.kind === "month" && period.calendarMonth) {
    const prev = previousCalendarMonth(period.calendarMonth);
    return {
      fromDate: monthEndIso(prev),
      toDate: monthEndIso(period.calendarMonth),
    };
  }

  return { fromDate: period.fromDate, toDate: period.toDate };
}

export function calendarMonthFromSnapshot(snapshot: BrokerBalanceSnapshot): string | null {
  return snapshotCalendarMonth(snapshot);
}

export { calendarMonthFromRuDate };
