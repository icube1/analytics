import { getCustomAssetsTotal } from "./custom-assets";
import { getTotalDebtBalance } from "./debt-amortization";
import {
  calendarMonthFromRuDate,
  extractBrokerDeposits,
} from "./broker-deposits";
import { findPlanPointForCalendarMonth, resolvePlanPointCalendarMonth } from "./forecast-plans";
import type {
  BrokerBalanceSnapshot,
  BrokerReport,
  CustomAssets,
  SavedForecastPlan,
} from "./portfolio-types";

export interface MonthBalanceFact {
  brokerTotal: number;
  grandTotal: number;
  totalDebt: number;
  periodEnd: string;
  uploadedAt: string;
}

export interface TrackingMonthRow {
  calendarMonth: string;
  label: string;
  fact: {
    grandTotal: number | null;
    brokerTotal: number | null;
    brokerDeposits: number;
    totalDebt: number | null;
    balanceSource: string | null;
  };
  plans: Record<
    string,
    {
      balance: number;
      realBalance: number;
      monthlyBrokerInvest: number;
      monthlyTotalContribution: number;
      totalDebt: number;
    } | null
  >;
}

function calendarMonthFromIso(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function formatCalendarMonthLabel(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

export function aggregateBrokerDepositsByMonth(
  snapshots: BrokerBalanceSnapshot[],
): Map<string, number> {
  const seen = new Set<string>();
  const byMonth = new Map<string, number>();

  const sorted = [...snapshots].sort((a, b) =>
    a.uploadedAt.localeCompare(b.uploadedAt),
  );

  for (const snapshot of sorted) {
    for (const deposit of snapshot.deposits) {
      if (seen.has(deposit.id)) continue;
      seen.add(deposit.id);
      const month = calendarMonthFromRuDate(deposit.date);
      if (!month) continue;
      byMonth.set(month, (byMonth.get(month) ?? 0) + deposit.amount);
    }
  }

  return byMonth;
}

export function getBalanceFactsByMonth(
  snapshots: BrokerBalanceSnapshot[],
): Map<string, MonthBalanceFact> {
  const byMonth = new Map<string, MonthBalanceFact>();

  for (const snapshot of snapshots) {
    const month = calendarMonthFromRuDate(snapshot.periodEnd);
    if (!month) continue;

    const existing = byMonth.get(month);
    if (!existing || snapshot.uploadedAt > existing.uploadedAt) {
      byMonth.set(month, {
        brokerTotal: snapshot.brokerTotal,
        grandTotal: snapshot.grandTotal,
        totalDebt: snapshot.totalDebt,
        periodEnd: snapshot.periodEnd,
        uploadedAt: snapshot.uploadedAt,
      });
    }
  }

  return byMonth;
}

export function getLatestSnapshot(
  snapshots: BrokerBalanceSnapshot[],
): BrokerBalanceSnapshot | null {
  if (snapshots.length === 0) return null;
  return [...snapshots].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  )[0];
}

export function buildTrackingMonths(
  plans: SavedForecastPlan[],
  snapshots: BrokerBalanceSnapshot[],
  currentCustomDebt: number,
  currentCustomAssetsTotal: number,
): TrackingMonthRow[] {
  const depositsByMonth = aggregateBrokerDepositsByMonth(snapshots);
  const balancesByMonth = getBalanceFactsByMonth(snapshots);
  const latest = getLatestSnapshot(snapshots);
  const currentMonth = calendarMonthFromIso(new Date().toISOString());

  const monthSet = new Set<string>();
  for (const month of depositsByMonth.keys()) monthSet.add(month);
  for (const month of balancesByMonth.keys()) monthSet.add(month);
  for (const plan of plans) {
    for (const point of plan.points) {
      if (point.month <= 0) continue;
      monthSet.add(resolvePlanPointCalendarMonth(plan, point));
    }
  }

  if (plans.length > 0) {
    const earliest = plans.reduce((min, plan) =>
      plan.savedAt < min ? plan.savedAt : min,
    plans[0].savedAt);
    monthSet.add(calendarMonthFromIso(earliest));
  }

  monthSet.add(currentMonth);

  const months = [...monthSet].sort((a, b) => a.localeCompare(b));

  return months.map((calendarMonth) => {
    const balanceFact = balancesByMonth.get(calendarMonth);
    const isCurrent = calendarMonth === currentMonth;

    let grandTotal: number | null = balanceFact?.grandTotal ?? null;
    let brokerTotal: number | null = balanceFact?.brokerTotal ?? null;
    let totalDebt: number | null = balanceFact?.totalDebt ?? null;
    let balanceSource: string | null = balanceFact?.periodEnd ?? null;

    if (isCurrent && latest) {
      brokerTotal = latest.brokerTotal;
      grandTotal = latest.brokerTotal + currentCustomAssetsTotal;
      totalDebt = currentCustomDebt;
      balanceSource = latest.periodEnd;
    }

    const plansData: TrackingMonthRow["plans"] = {};
    for (const plan of plans) {
      const point = findPlanPointForCalendarMonth(plan, calendarMonth);
      plansData[plan.id] = point
        ? {
            balance: point.balance,
            realBalance: point.realBalance,
            monthlyBrokerInvest: point.monthlyBrokerInvest,
            monthlyTotalContribution: point.monthlyTotalContribution,
            totalDebt: point.totalDebt,
          }
        : null;
    }

    return {
      calendarMonth,
      label: formatCalendarMonthLabel(calendarMonth),
      fact: {
        grandTotal,
        brokerTotal,
        brokerDeposits: depositsByMonth.get(calendarMonth) ?? 0,
        totalDebt:
          isCurrent ? currentCustomDebt : totalDebt,
        balanceSource,
      },
      plans: plansData,
    };
  });
}

export function createBrokerSnapshot(
  report: BrokerReport,
  fileName: string,
  customAssets: CustomAssets,
): BrokerBalanceSnapshot {
  const customAssetsTotal = getCustomAssetsTotal(customAssets);
  const totalDebt = getTotalDebtBalance(customAssets);
  const brokerTotal = report.assetsEnd;
  const deposits = extractBrokerDeposits(report);

  return {
    id: crypto.randomUUID(),
    uploadedAt: new Date().toISOString(),
    fileName,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    brokerTotal,
    customAssetsTotal,
    totalDebt,
    grandTotal: brokerTotal + customAssetsTotal,
    deposits,
  };
}

export function buildTrackingChartData(
  rows: TrackingMonthRow[],
  planIds: string[],
  useRealBalance: boolean,
) {
  return rows.map((row) => {
    const entry: Record<string, string | number | null> = {
      label: row.label,
      calendarMonth: row.calendarMonth,
      fact: row.fact.grandTotal,
      factBrokerDeposits: row.fact.brokerDeposits || null,
    };

    for (const planId of planIds) {
      const planData = row.plans[planId];
      entry[`plan_${planId}`] = planData
        ? useRealBalance
          ? planData.realBalance
          : planData.balance
        : null;
    }

    return entry;
  });
}
