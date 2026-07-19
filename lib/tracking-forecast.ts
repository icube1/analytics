import { calendarMonthFromPlanMonth, formatCalendarMonth } from "./broker-deposits";
import { calculateCompoundInterest } from "./compound-interest";
import { resolvePlanParams } from "./forecast-plans";
import type {
  CompoundParams,
  CustomAssets,
  SavedForecastPlan,
} from "./portfolio-types";

export const FORECAST_HORIZONS = [
  { id: "1y", label: "1 год", months: 12 },
  { id: "3y", label: "3 года", months: 36 },
  { id: "5y", label: "5 лет", months: 60 },
] as const;

export type ForecastHorizonId = (typeof FORECAST_HORIZONS)[number]["id"];

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
  hybridMonthlyContribution: number;
  contributionSource: "fact-average" | "scenario";
  factMonthsUsed: number;
  basePlanId: string;
  basePlanName: string;
  horizonMonths: number;
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

export function buildHybridForecastParams(
  basePlan: SavedForecastPlan,
  hybridMonthlyContribution: number,
  horizonMonths: number,
  currentGrandTotal: number,
): CompoundParams {
  const base = resolvePlanParams(basePlan);
  return {
    ...base,
    initialCapital: currentGrandTotal,
    monthlyContribution: hybridMonthlyContribution,
    years: Math.max(1 / 12, horizonMonths / 12),
    // Короткий ориентир без фазы вывода
    withdrawAfterYears: null,
    monthlyWithdrawal: 0,
  };
}

export function buildLiveTrackingForecast(input: {
  basePlan: SavedForecastPlan;
  currentBrokerTotal: number;
  currentCustomAssets: CustomAssets;
  currentGrandTotal: number;
  depositsByMonth: Map<string, number>;
  horizonMonths: number;
  asOf?: Date;
}): LiveForecastResult {
  const asOf = input.asOf ?? new Date();
  const startMonth = formatCalendarMonth(asOf);

  const factAvg = averageRecentBrokerDeposits(input.depositsByMonth, asOf, 3);
  const scenarioContribution = resolvePlanParams(input.basePlan).monthlyContribution;
  const hybridMonthlyContribution = factAvg?.average ?? scenarioContribution;
  const contributionSource = factAvg ? "fact-average" : "scenario";

  const params = buildHybridForecastParams(
    input.basePlan,
    hybridMonthlyContribution,
    input.horizonMonths,
    input.currentGrandTotal,
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
    hybridMonthlyContribution,
    contributionSource,
    factMonthsUsed: factAvg?.monthsUsed ?? 0,
    basePlanId: input.basePlan.id,
    basePlanName: input.basePlan.name,
    horizonMonths: input.horizonMonths,
  };
}
