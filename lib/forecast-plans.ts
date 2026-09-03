import { calendarMonthFromPlanMonth } from "./broker-deposits";
import { randomId } from "./random-id";
import { calculateCompoundInterest } from "./compound-interest";
import type { CompoundResult } from "./compound-interest/types";
import type {
  CompoundParams,
  CustomAssets,
  ForecastPlanPoint,
  SavedForecastPlan,
} from "./portfolio-types";
import { DEFAULT_COMPOUND_PARAMS, DEFAULT_CUSTOM_ASSETS } from "./portfolio-types";

export interface PlanCalculatorSnapshot {
  params: CompoundParams;
  customAssets: CustomAssets;
  brokerTotal: number;
}

/** Параметры сценария с подстановкой значений по умолчанию для старых сохранений */
export function resolvePlanParams(plan: SavedForecastPlan): CompoundParams {
  return { ...DEFAULT_COMPOUND_PARAMS, ...plan.params };
}

export function getPlanCalculatorSnapshot(
  plan: SavedForecastPlan,
): PlanCalculatorSnapshot {
  return {
    params: resolvePlanParams(plan),
    customAssets: plan.customAssets ?? DEFAULT_CUSTOM_ASSETS,
    brokerTotal: plan.brokerTotal,
  };
}

export function forecastPlanFromProjection(
  name: string,
  params: CompoundParams,
  customAssets: CustomAssets,
  brokerTotal: number,
  result: CompoundResult,
  savedAt: string = new Date().toISOString(),
): SavedForecastPlan {
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
    id: randomId(),
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

export function buildForecastPlan(
  name: string,
  params: CompoundParams,
  customAssets: CustomAssets,
  brokerTotal: number,
  savedAt: string = new Date().toISOString(),
): SavedForecastPlan {
  const result = calculateCompoundInterest(
    params,
    { customAssets, brokerTotal },
    { allMonths: true },
  );
  return forecastPlanFromProjection(
    name,
    params,
    customAssets,
    brokerTotal,
    result,
    savedAt,
  );
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
