import { calendarMonthFromPlanMonth, formatCalendarMonth } from "./broker-deposits";
import { calculateCompoundInterest } from "./compound-interest";
import {
  resolvePlanParams,
  resolvePlanPointCalendarMonth,
} from "./forecast-plans";
import type {
  CompoundParams,
  CustomAssets,
  SavedForecastPlan,
} from "./portfolio-types";

export const FORECAST_HORIZONS = [
  { id: "1y", label: "1 год", months: 12 },
  { id: "3y", label: "3 года", months: 36 },
  { id: "5y", label: "5 лет", months: 60 },
  { id: "scenario", label: "До конца сценария", months: null },
] as const;

export type ForecastHorizonId = (typeof FORECAST_HORIZONS)[number]["id"];

/** Сколько месяцев осталось от asOf до последней точки сценария */
export function scenarioRemainingMonths(
  plan: SavedForecastPlan,
  asOf: Date = new Date(),
): number {
  const lastPoint = [...plan.points]
    .filter((point) => point.month > 0)
    .sort((a, b) => b.month - a.month)[0];

  if (lastPoint) {
    const endMonth = resolvePlanPointCalendarMonth(plan, lastPoint);
    const [endY, endM] = endMonth.split("-").map(Number);
    const startTotal = asOf.getFullYear() * 12 + asOf.getMonth();
    const endTotal = endY * 12 + (endM - 1);
    return Math.max(1, endTotal - startTotal);
  }

  return Math.max(1, Math.round(resolvePlanParams(plan).years * 12));
}

export function resolveForecastHorizonMonths(
  horizonId: ForecastHorizonId,
  basePlan: SavedForecastPlan | null,
  asOf: Date = new Date(),
): number {
  const preset = FORECAST_HORIZONS.find((item) => item.id === horizonId);
  if (preset?.months != null) return preset.months;
  if (basePlan) return scenarioRemainingMonths(basePlan, asOf);
  return 36;
}

export interface LiveForecastPoint {
  calendarMonth: string;
  label: string;
  balance: number;
  realBalance: number;
  monthlyBrokerInvest: number;
  monthlyDebtPayment: number;
  monthlyDebtPrincipal: number;
  monthlyDebtInterest: number;
  monthlyWealthBuilding: number;
  monthlyTotalContribution: number;
  totalDebt: number;
  /** Точка старта = текущий факт, без взноса */
  isStart: boolean;
}

export interface LiveForecastResult {
  points: LiveForecastPoint[];
  monthlyContribution: number;
  suggestedFromFact: number | null;
  factMonthsUsed: number;
  suggestedFromScenario: number;
  basePlanId: string;
  basePlanName: string;
  horizonMonths: number;
  /** Лет до начала вывода в прогнозе (null — вывода нет) */
  withdrawAfterYears: number | null;
  /** Календарный месяц начала вывода (как в сценарии) */
  withdrawCalendarMonth: string | null;
}

function formatMonthLabel(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("ru-RU", {
    month: "short",
    year: "2-digit",
  });
}

/**
 * Среднее пополнений брокера за последние до `window` месяцев с ненулевыми взносами.
 * Если факта нет — null.
 */
export function averageRecentBrokerDeposits(
  depositsByMonth: Map<string, number>,
  asOf: Date = new Date(),
  window = 3,
): { average: number; monthsUsed: number } | null {
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
    months.push(formatCalendarMonth(d));
  }

  const samples: number[] = [];
  for (const month of months) {
    const amount = depositsByMonth.get(month) ?? 0;
    if (amount > 0) {
      samples.push(amount);
      if (samples.length >= window) break;
    }
  }

  if (samples.length === 0) return null;
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return { average, monthsUsed: samples.length };
}

/**
 * Календарный месяц начала вывода в сценарии (первый месяц фазы вывода).
 * Совпадает с month > withdrawAfterYears*12 в симуляции.
 */
export function scenarioWithdrawCalendarMonth(
  plan: SavedForecastPlan,
): string | null {
  const params = resolvePlanParams(plan);
  if (params.withdrawAfterYears == null || params.withdrawAfterYears <= 0) {
    return null;
  }
  const offsetMonths = Math.round(params.withdrawAfterYears * 12);
  // Фаза вывода: month > offset → первый месяц offset+1 → календарь savedAt + offset
  return calendarMonthFromPlanMonth(plan.savedAt, offsetMonths);
}

/**
 * Сколько лет от asOf до той же календарной даты начала вывода, что в сценарии.
 * Если дата уже прошла — вывод с 1-го месяца прогноза.
 */
export function remainingWithdrawAfterYears(
  plan: SavedForecastPlan,
  asOf: Date = new Date(),
): number | null {
  const withdrawMonth = scenarioWithdrawCalendarMonth(plan);
  if (!withdrawMonth) return null;

  const [wy, wm] = withdrawMonth.split("-").map(Number);
  const withdrawAbsMonths = wy * 12 + (wm - 1);
  const asOfAbsMonths = asOf.getFullYear() * 12 + asOf.getMonth();
  const remainingMonths = withdrawAbsMonths - asOfAbsMonths;

  // Первый месяц вывода в live-прогнозе: asOf + remainingMonths
  // (calendarMonth = asOf + month). Фаза: month > withdrawAfterYears*12
  // → withdrawStart = remainingMonths - 1.
  if (remainingMonths <= 1) {
    return 1 / 48;
  }

  return (remainingMonths - 1) / 12;
}

export function buildHybridForecastParams(
  basePlan: SavedForecastPlan,
  hybridMonthlyContribution: number,
  horizonMonths: number,
  currentGrandTotal: number,
  asOf: Date = new Date(),
): CompoundParams {
  const base = resolvePlanParams(basePlan);
  const withdrawAfterYears = remainingWithdrawAfterYears(basePlan, asOf);

  return {
    ...base,
    initialCapital: currentGrandTotal,
    monthlyContribution: hybridMonthlyContribution,
    years: Math.max(1 / 12, horizonMonths / 12),
    // Та же календарная дата вывода, что в сценарии (не отключаем)
    withdrawAfterYears,
  };
}

export function buildLiveTrackingForecast(input: {
  basePlan: SavedForecastPlan;
  currentBrokerTotal: number;
  currentCustomAssets: CustomAssets;
  currentGrandTotal: number;
  depositsByMonth: Map<string, number>;
  horizonMonths: number;
  /** Ручной взнос в брокера; если не задан — сценарий (не среднее по факту) */
  monthlyContribution?: number;
  asOf?: Date;
}): LiveForecastResult {
  const asOf = input.asOf ?? new Date();
  const startMonth = formatCalendarMonth(asOf);

  const factAvg = averageRecentBrokerDeposits(input.depositsByMonth, asOf, 3);
  const suggestedFromScenario = resolvePlanParams(input.basePlan).monthlyContribution;
  const monthlyContribution =
    input.monthlyContribution != null && Number.isFinite(input.monthlyContribution)
      ? Math.max(0, input.monthlyContribution)
      : suggestedFromScenario;

  const params = buildHybridForecastParams(
    input.basePlan,
    monthlyContribution,
    input.horizonMonths,
    input.currentGrandTotal,
    asOf,
  );

  const result = calculateCompoundInterest(
    params,
    {
      customAssets: input.currentCustomAssets,
      brokerTotal: input.currentBrokerTotal,
    },
    { allMonths: true },
  );

  const startIso = asOf.toISOString();
  const points: LiveForecastPoint[] = [];

  const startPoint = result.points.find((point) => point.month === 0);
  points.push({
    calendarMonth: startMonth,
    label: formatMonthLabel(startMonth),
    balance: startPoint?.balance ?? input.currentGrandTotal,
    realBalance: startPoint?.realBalance ?? input.currentGrandTotal,
    monthlyBrokerInvest: 0,
    monthlyDebtPayment: 0,
    monthlyDebtPrincipal: 0,
    monthlyDebtInterest: 0,
    monthlyWealthBuilding: 0,
    monthlyTotalContribution: 0,
    totalDebt: startPoint?.totalDebt ?? 0,
    isStart: true,
  });

  for (const point of result.points) {
    if (point.month <= 0 || point.month > input.horizonMonths) continue;
    const calendarMonth = calendarMonthFromPlanMonth(startIso, point.month);
    points.push({
      calendarMonth,
      label: formatMonthLabel(calendarMonth),
      balance: point.balance,
      realBalance: point.realBalance,
      monthlyBrokerInvest: point.monthlyBrokerInvest,
      monthlyDebtPayment: point.monthlyDebtPayment,
      monthlyDebtPrincipal: point.monthlyDebtPrincipal,
      monthlyDebtInterest: point.monthlyDebtInterest,
      monthlyWealthBuilding: point.monthlyWealthBuilding,
      monthlyTotalContribution: point.monthlyTotalContribution,
      totalDebt: point.totalDebt,
      isStart: false,
    });
  }

  return {
    points,
    monthlyContribution,
    suggestedFromFact: factAvg?.average ?? null,
    factMonthsUsed: factAvg?.monthsUsed ?? 0,
    suggestedFromScenario,
    basePlanId: input.basePlan.id,
    basePlanName: input.basePlan.name,
    horizonMonths: input.horizonMonths,
    withdrawAfterYears: params.withdrawAfterYears,
    withdrawCalendarMonth: scenarioWithdrawCalendarMonth(input.basePlan),
  };
}
