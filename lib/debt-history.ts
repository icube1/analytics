import { getTotalDebtBalance } from "./debt-amortization";
import { calendarMonthFromRuDate } from "./broker-deposits";
import type {
  BrokerBalanceSnapshot,
  CustomAssets,
  DebtBalanceEntry,
  SavedForecastPlan,
} from "./portfolio-types";

const DEBT_CHANGE_EPS = 1;

function calendarMonthFromIso(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function createDebtBalanceEntry(
  totalDebt: number,
  source: DebtBalanceEntry["source"],
  recordedAt = new Date().toISOString(),
): DebtBalanceEntry {
  return {
    id: crypto.randomUUID(),
    recordedAt,
    totalDebt,
    source,
  };
}

/** Добавляет запись, если остаток долга изменился относительно последней */
export function appendDebtBalanceIfChanged(
  history: DebtBalanceEntry[],
  totalDebt: number,
  source: DebtBalanceEntry["source"],
  recordedAt = new Date().toISOString(),
): DebtBalanceEntry[] {
  const last = history.length > 0 ? history[history.length - 1] : null;
  if (last && Math.abs(last.totalDebt - totalDebt) < DEBT_CHANGE_EPS) {
    return history;
  }
  return [...history, createDebtBalanceEntry(totalDebt, source, recordedAt)];
}

export function appendDebtFromAssets(
  history: DebtBalanceEntry[],
  assets: CustomAssets,
  recordedAt = new Date().toISOString(),
): DebtBalanceEntry[] {
  return appendDebtBalanceIfChanged(
    history,
    getTotalDebtBalance(assets),
    "assets",
    recordedAt,
  );
}

/** Восстановить историю из старых снимков брокера, если ещё пусто */
export function backfillDebtHistoryFromSnapshots(
  history: DebtBalanceEntry[],
  snapshots: BrokerBalanceSnapshot[],
): DebtBalanceEntry[] {
  if (history.length > 0 || snapshots.length === 0) return history;

  const sorted = [...snapshots].sort((a, b) =>
    a.uploadedAt.localeCompare(b.uploadedAt),
  );

  let next: DebtBalanceEntry[] = [];
  for (const snapshot of sorted) {
    // Нулевые снимки (долг ещё не заводили) не засоряют историю
    if (snapshot.totalDebt <= DEBT_CHANGE_EPS) continue;
    next = appendDebtBalanceIfChanged(
      next,
      snapshot.totalDebt,
      "backfill",
      snapshot.uploadedAt,
    );
  }
  return next;
}

export interface DebtObservation {
  recordedAt: string;
  calendarMonth: string;
  totalDebt: number;
}

function observationMonth(entry: DebtBalanceEntry): string {
  return calendarMonthFromIso(entry.recordedAt);
}

/**
 * Собирает наблюдения по долгу: история + снимки брокера + текущий остаток.
 * Снижение долга между соседними наблюдениями атрибутируется месяцу более нового.
 */
export function collectDebtObservations(
  history: DebtBalanceEntry[],
  snapshots: BrokerBalanceSnapshot[],
  currentTotalDebt: number,
  currentMonth: string,
  nowIso = new Date().toISOString(),
  plans: SavedForecastPlan[] = [],
): DebtObservation[] {
  const raw: DebtObservation[] = [];

  if (history.length > 0) {
    for (const entry of history) {
      raw.push({
        recordedAt: entry.recordedAt,
        calendarMonth: observationMonth(entry),
        totalDebt: entry.totalDebt,
      });
    }
  } else {
    for (const snapshot of snapshots) {
      if (snapshot.totalDebt <= DEBT_CHANGE_EPS) continue;
      const month =
        calendarMonthFromRuDate(snapshot.periodEnd) ??
        calendarMonthFromIso(snapshot.uploadedAt);
      raw.push({
        recordedAt: snapshot.uploadedAt,
        calendarMonth: month,
        totalDebt: snapshot.totalDebt,
      });
    }
  }

  // Базовая точка из сохранённых сценариев (долг на момент сохранения)
  for (const plan of plans) {
    const planDebt = getTotalDebtBalance(plan.customAssets);
    if (planDebt <= DEBT_CHANGE_EPS) continue;
    raw.push({
      recordedAt: plan.savedAt,
      calendarMonth: calendarMonthFromIso(plan.savedAt),
      totalDebt: planDebt,
    });
  }

  raw.push({
    recordedAt: nowIso,
    calendarMonth: currentMonth,
    totalDebt: currentTotalDebt,
  });

  raw.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

  const deduped: DebtObservation[] = [];
  for (const obs of raw) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(last.totalDebt - obs.totalDebt) < DEBT_CHANGE_EPS) {
      deduped[deduped.length - 1] = {
        ...obs,
        totalDebt: last.totalDebt,
      };
      continue;
    }
    deduped.push(obs);
  }

  return deduped;
}

/** Сумма погашенного тела по календарным месяцам */
export function debtPrincipalPaidByMonth(
  observations: DebtObservation[],
): Map<string, number> {
  const byMonth = new Map<string, number>();

  for (let i = 1; i < observations.length; i++) {
    const prev = observations[i - 1];
    const curr = observations[i];
    const reduction = prev.totalDebt - curr.totalDebt;
    if (reduction <= DEBT_CHANGE_EPS) continue;

    byMonth.set(
      curr.calendarMonth,
      (byMonth.get(curr.calendarMonth) ?? 0) + reduction,
    );
  }

  return byMonth;
}

/** Остаток долга на конец месяца (последнее наблюдение в месяце) */
export function debtBalanceByMonth(
  observations: DebtObservation[],
): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const obs of observations) {
    byMonth.set(obs.calendarMonth, obs.totalDebt);
  }
  return byMonth;
}
