import type { ResilienceInput, SinkingFundGoal } from "./resilience-plan";

export const DEFAULT_RESILIENCE_INPUT: ResilienceInput = {
  mandatoryMonthlyExpenses: 80_000,
  discretionaryMonthlyExpenses: 20_000,
  liquidAssets: 300_000,
  monthlySurplus: 25_000,
  payCycleDays: 30,
  household: {
    incomeStability: "stable",
    incomeSourceCount: 1,
    hasSecondaryHouseholdIncome: false,
    dependentCount: 0,
    jobSearchMonths: 3,
    insuranceCoverage: "medium",
    riskTolerance: "moderate",
  },
  debt: {
    totalBalance: 0,
    monthlyPayments: 0,
    weightedAnnualRate: 0,
    highInterestBalance: 0,
  },
  sinkingFunds: [],
  experiences: {
    annualTarget: 60_000,
    currentAmount: 0,
  },
};

export function createSinkingFundGoal(
  partial?: Partial<SinkingFundGoal>,
): SinkingFundGoal {
  const id =
    partial?.id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `sinking-${Date.now()}`);
  return {
    id,
    label: partial?.label ?? "Новая цель",
    targetAmount: partial?.targetAmount ?? 50_000,
    currentAmount: partial?.currentAmount ?? 0,
    monthsUntilDue: partial?.monthsUntilDue ?? 12,
    priority: partial?.priority ?? 1,
  };
}
