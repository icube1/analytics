/**
 * XIRR — деньги-взвешенная доходность (годовая, 365 дней).
 *
 * Используется для доходности счёта: пополнения и выводы — это денежные потоки,
 * остаток портфеля на дату отчёта — терминальный поток. В отличие от «стоимость /
 * вложено − 1», XIRR учитывает даты и не раздувается на коротком периоде.
 */

export interface CashFlowPoint {
  /** ISO-дата: YYYY-MM-DD */
  date: string;
  /** Отрицательное — вложение денег в портфель, положительное — изъятие/остаток */
  amount: number;
}

const DAYS_IN_YEAR = 365;

/**
 * Номер дня из даты. Понимает и ISO (2026-10-02), и формат отчётов Сбера
 * (02.10.2026). Возвращает null вместо исключения — UI не должен падать
 * из-за нестандартной даты в отчёте.
 */
export function toDayNumber(value: string): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  const normalized = ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : raw.slice(0, 10);
  const ms = Date.parse(`${normalized}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

function npv(flows: CashFlowPoint[], rate: number, startDay: number): number {
  return flows.reduce((sum, flow) => {
    const day = toDayNumber(flow.date);
    if (day === null) return sum;
    const years = (day - startDay) / DAYS_IN_YEAR;
    return sum + flow.amount / Math.pow(1 + rate, years);
  }, 0);
}

/**
 * Возвращает годовую доходность (0.12 = 12%) или null, если поток не даёт решения.
 * Сначала быстрая итерация Ньютона, затем гарантированная бисекция.
 */
export function xirr(flows: CashFlowPoint[], guess = 0.1): number | null {
  const clean = flows
    .filter(
      (flow) =>
        Number.isFinite(flow.amount) &&
        flow.amount !== 0 &&
        toDayNumber(flow.date) !== null,
    )
    .sort((a, b) => (toDayNumber(a.date) ?? 0) - (toDayNumber(b.date) ?? 0));

  if (clean.length < 2) return null;
  const hasNegative = clean.some((flow) => flow.amount < 0);
  const hasPositive = clean.some((flow) => flow.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  const startDay = toDayNumber(clean[0].date) ?? 0;

  // Ньютон: до 60 итераций, шаг 1e-6 для производной
  let rate = guess;
  for (let i = 0; i < 60; i += 1) {
    const value = npv(clean, rate, startDay);
    const slope =
      (npv(clean, rate + 1e-6, startDay) -
        npv(clean, rate - 1e-6, startDay)) /
      2e-6;
    if (!Number.isFinite(slope) || slope === 0) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= -0.999999 || next > 1000) break;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }

  // Бисекция как fallback: NPV монотонен по ставке для обычного набора потоков
  let low = -0.9999;
  let high = 10;
  let lowValue = npv(clean, low, startDay);
  const highValue = npv(clean, high, startDay);
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) return null;
  if (lowValue * highValue > 0) return null;

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    const midValue = npv(clean, mid, startDay);
    if (Math.abs(midValue) < 1e-7) return mid;
    if (lowValue * midValue < 0) {
      high = mid;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }
  return (low + high) / 2;
}

/** Приводит денежные потоки к «инвестиции отрицательные» и добавляет остаток. */
export function buildPortfolioFlows(params: {
  deposits: { date: string; amount: number }[];
  withdrawals?: { date: string; amount: number }[];
  terminalValue: number;
  terminalDate: string;
}): CashFlowPoint[] {
  const flows: CashFlowPoint[] = [];
  for (const deposit of params.deposits) {
    if (deposit.amount > 0) {
      flows.push({ date: deposit.date, amount: -Math.abs(deposit.amount) });
    }
  }
  for (const withdrawal of params.withdrawals ?? []) {
    if (withdrawal.amount > 0) {
      flows.push({ date: withdrawal.date, amount: Math.abs(withdrawal.amount) });
    }
  }
  flows.push({ date: params.terminalDate, amount: Math.abs(params.terminalValue) });
  return flows;
}
