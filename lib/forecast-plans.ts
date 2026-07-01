import { calendarMonthFromPlanMonth } from "./broker-deposits";
import type { CompoundResult } from "./compound-interest/types";
import type {
  CompoundParams,
  CustomAssets,
  ForecastPlanPoint,
  SavedForecastPlan,
} from "./portfolio-types";

export function buildForecastPlan(
  name: string,
  params: CompoundParams,
  customAssets: CustomAssets,
  brokerTotal: number,
  result: CompoundResult,
): SavedForecastPlan {
  const points: ForecastPlanPoint[] = result.points.map((point) => ({
    month: point.month,
    label: point.label,
    balance: point.balance,
    realBalance: point.realBalance,
    monthlyTotalContribution: point.monthlyTotalContribution,
    monthlyBrokerInvest: point.monthlyBrokerInvest,
    monthlyDebtPayment: point.monthlyDebtPayment,
    totalDebt: point.totalDebt,
  }));

  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Сценарий",
    savedAt: new Date().toISOString(),
    params,
    brokerTotal,
    customAssets,
    points,
    summary: {
      finalBalance: result.finalBalance,
      finalRealBalance: result.finalRealBalance,
      totalContributed: result.totalContributed,
      effectiveAnnualReturn: result.effectiveAnnualReturn,
      finalTotalDebt: result.finalTotalDebt,
    },
  };
}

export function findPlanPointForCalendarMonth(
  plan: SavedForecastPlan,
  calendarMonth: string,
): ForecastPlanPoint | null {
  for (const point of plan.points) {
    if (calendarMonthFromPlanMonth(plan.savedAt, point.month) === calendarMonth) {
      return point;
    }
  }
  return null;
}
