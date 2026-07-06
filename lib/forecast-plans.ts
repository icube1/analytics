import { calendarMonthFromPlanMonth } from "./broker-deposits";
import { calculateCompoundInterest } from "./compound-interest";
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
): SavedForecastPlan {
  const savedAt = new Date().toISOString();
  const result = calculateCompoundInterest(
    params,
    { customAssets, brokerTotal },
    { allMonths: true },
  );

  const points: ForecastPlanPoint[] = result.points
    .filter((point) => point.month > 0)
    .map((point) => ({
      month: point.month,
      calendarMonth: calendarMonthFromPlanMonth(savedAt, point.month - 1),
      label: point.label,
      balance: point.balance,
      realBalance: point.realBalance,
      monthlyTotalContribution: point.monthlyTotalContribution,
      monthlyBrokerInvest: point.monthlyBrokerInvest,
      monthlyDebtPayment: point.monthlyDebtPayment,
      monthlyDebtPrincipal: point.monthlyDebtPrincipal,
      monthlyDebtInterest: point.monthlyDebtInterest,
      monthlyWealthBuilding: point.monthlyWealthBuilding,
      monthlyCashOutflow: point.monthlyCashOutflow,
      totalDebt: point.totalDebt,
    }));

  return {
    id: crypto.randomUUID(),
    name: name.trim() || "Сценарий",
    savedAt,
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

export function resolvePlanPointCalendarMonth(
  plan: SavedForecastPlan,
  point: ForecastPlanPoint,
): string {
  if (point.calendarMonth) return point.calendarMonth;
  if (point.month > 0) {
    return calendarMonthFromPlanMonth(plan.savedAt, point.month - 1);
  }
  return calendarMonthFromPlanMonth(plan.savedAt, point.month);
}

export function findPlanPointForCalendarMonth(
  plan: SavedForecastPlan,
  calendarMonth: string,
): ForecastPlanPoint | null {
  for (const point of plan.points) {
    if (point.month <= 0) continue;
    if (resolvePlanPointCalendarMonth(plan, point) === calendarMonth) {
      return point;
    }
  }
  return null;
}
