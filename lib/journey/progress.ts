import type { ResilienceInput, ResiliencePlan } from "@/lib/resilience-plan";
import {
  type BranchCondition,
  type HouseholdVariant,
  type MilestoneId,
  JOURNEY_MILESTONES,
  getMilestoneDefinition,
} from "./milestones";

export type MilestoneStatus =
  | "locked"
  | "available"
  | "in_progress"
  | "completed"
  | "opted_out"
  | "skipped";

export interface BabyStepProgress {
  id: string;
  completed: boolean;
  autoDetected: boolean;
  completedAt?: string;
}

export interface MilestoneProgress {
  id: MilestoneId;
  status: MilestoneStatus;
  babySteps: BabyStepProgress[];
  coveragePercent?: number;
  feedback: string;
  householdVariant: HouseholdVariant;
}

export interface JourneyProgressSnapshot {
  milestones: MilestoneProgress[];
  activeMilestoneId: MilestoneId | null;
  completedCount: number;
  availableCount: number;
  stressSurvivableCount: number;
  stressTotalCount: number;
  monthsCovered: number;
  gapToRecommended: number;
}

export interface JourneyStateInput {
  milestoneOrder: MilestoneId[];
  optedOutMilestones: MilestoneId[];
  completedBabySteps: Record<string, string>;
  acknowledgedMilestones: MilestoneId[];
  lastReviewAt?: string;
}

function resolveHouseholdVariant(input: ResilienceInput): HouseholdVariant {
  if (input.household.dependentCount > 0) return "dependents";
  if (input.household.hasSecondaryHouseholdIncome) return "couple";
  return "solo";
}

function branchApplies(
  condition: BranchCondition,
  input: ResilienceInput,
  plan: ResiliencePlan,
): boolean {
  switch (condition) {
    case "always":
      return true;
    case "extended-reserve-recommended":
      return plan.risk.recommendsExtendedReserve;
    case "has-debt":
      return input.debt.totalBalance > 0 || input.debt.monthlyPayments > 0;
    case "has-sinking-funds":
      return input.sinkingFunds.length > 0;
    default:
      return true;
  }
}

function prerequisitesMet(
  milestoneId: MilestoneId,
  completed: Set<MilestoneId>,
  skipped: Set<MilestoneId>,
): boolean {
  const definition = getMilestoneDefinition(milestoneId);
  if (!definition) return false;
  return definition.prerequisiteIds.every(
    (id) => completed.has(id) || skipped.has(id),
  );
}

function evaluateBabyStep(
  milestoneId: MilestoneId,
  stepId: string,
  input: ResilienceInput,
  plan: ResiliencePlan,
): boolean {
  switch (milestoneId) {
    case "baseline-data-quality":
      if (stepId === "mandatory-expenses") {
        return input.mandatoryMonthlyExpenses > 0;
      }
      if (stepId === "liquid-assets") {
        return input.liquidAssets >= 0;
      }
      if (stepId === "household-profile") {
        return (
          input.household.incomeSourceCount >= 1 &&
          input.household.jobSearchMonths >= 0
        );
      }
      break;
    case "cash-flow-control":
      if (stepId === "surplus-positive") {
        return Number.isFinite(input.monthlySurplus);
      }
      if (stepId === "discretionary-budget") {
        return input.discretionaryMonthlyExpenses >= 0;
      }
      break;
    case "operational-buffer":
      if (stepId === "pay-cycle-gap") {
        return input.payCycleDays > 0;
      }
      if (stepId === "debt-payments-cushion") {
        return plan.coverage.operationalBufferPercent >= 50;
      }
      break;
    case "starter-emergency-fund":
      if (stepId === "starter-target") {
        return plan.layers.starterEmergencyFund.recommended > 0;
      }
      if (stepId === "starter-funded") {
        return plan.coverage.starterEmergencyPercent >= 100;
      }
      break;
    case "core-emergency-fund":
      if (stepId === "core-months") {
        return plan.totals.monthsOfMandatoryExpensesCovered > 0;
      }
      if (stepId === "core-target") {
        return plan.coverage.coreReservePercent >= 100;
      }
      break;
    case "extended-emergency-fund":
      if (stepId === "extended-assess") {
        return true;
      }
      if (stepId === "extended-funded") {
        if (!plan.risk.recommendsExtendedReserve) return true;
        return plan.coverage.extendedReservePercent >= 100;
      }
      break;
    case "debt-liquidity-tradeoff":
      if (stepId === "debt-service-ratio") {
        return input.debt.monthlyPayments > 0;
      }
      if (stepId === "liquidity-vs-payoff") {
        return plan.stress.some((scenario) => scenario.id === "income-loss-with-debt");
      }
      break;
    case "sinking-funds":
      if (stepId === "define-goals") {
        return input.sinkingFunds.length > 0;
      }
      if (stepId === "fund-progress") {
        return plan.coverage.sinkingFundsPercent >= 25;
      }
      break;
    case "experiences-fund":
      if (stepId === "annual-target") {
        return input.experiences.annualTarget > 0;
      }
      if (stepId === "experiences-funded") {
        return plan.coverage.experiencesFundPercent >= 50;
      }
      break;
    case "sustainable-contributions":
      if (stepId === "surplus-allocation") {
        return input.monthlySurplus > 0;
      }
      if (stepId === "sustainable-rate") {
        return (
          input.monthlySurplus > 0 &&
          plan.coverage.operationalBufferPercent >= 100
        );
      }
      break;
    case "capital-milestones":
      if (stepId === "total-liquidity") {
        return input.liquidAssets > 0;
      }
      if (stepId === "gap-to-target") {
        return plan.totals.currentGapToRecommended >= 0;
      }
      break;
    case "plan-vs-fact-review":
      if (stepId === "schedule-review") {
        return true;
      }
      if (stepId === "record-review") {
        return false;
      }
      break;
    default:
      break;
  }
  return false;
}

function layerCoverageForMilestone(
  milestoneId: MilestoneId,
  plan: ResiliencePlan,
): number | undefined {
  const definition = getMilestoneDefinition(milestoneId);
  if (!definition?.resilienceLayerId) return undefined;
  const layer = plan.layers[definition.resilienceLayerId];
  const coverageKey = {
    operationalBuffer: plan.coverage.operationalBufferPercent,
    starterEmergencyFund: plan.coverage.starterEmergencyPercent,
    coreReserve: plan.coverage.coreReservePercent,
    extendedReserve: plan.coverage.extendedReservePercent,
    sinkingFunds: plan.coverage.sinkingFundsPercent,
    experiencesFund: plan.coverage.experiencesFundPercent,
  } as const;
  return coverageKey[definition.resilienceLayerId];
}

function buildFeedback(
  milestoneId: MilestoneId,
  plan: ResiliencePlan,
  householdVariant: HouseholdVariant,
  status: MilestoneStatus,
): string {
  const definition = getMilestoneDefinition(milestoneId);
  if (!definition) return "";
  if (status === "opted_out") {
    return "Вы отложили этот ориентир — можно вернуться в любой момент.";
  }
  if (status === "skipped") {
    return "Не требуется для текущего профиля.";
  }
  if (status === "locked") {
    return "Сначала завершите предыдущие шаги пути.";
  }

  const coverage = layerCoverageForMilestone(milestoneId, plan);
  if (coverage !== undefined) {
    const rounded = Math.round(coverage);
    if (rounded >= 100) {
      return `Покрытие слоя: ${rounded}% — ориентир достигнут.`;
    }
    return `Покрытие слоя: ${rounded}% — следующий ориентир из карты устойчивости.`;
  }

  switch (milestoneId) {
    case "baseline-data-quality":
      return `База: ${plan.totals.monthsOfMandatoryExpensesCovered.toFixed(1)} мес. обязательных расходов в ликвидности.`;
    case "cash-flow-control":
      return `Профицит учтён; дискреционные траты отделены от резервов.`;
    case "debt-liquidity-tradeoff": {
      const debtScenario = plan.stress.find(
        (s) => s.id === "income-loss-with-debt",
      );
      return debtScenario?.summary ?? definition.householdCopy[householdVariant];
    }
    case "sustainable-contributions":
      return `Операционный буфер: ${Math.round(plan.coverage.operationalBufferPercent)}% — взносы устойчивы при полном буфере.`;
    case "capital-milestones":
      return `Разрыв до совокупного ориентира: ${Math.round(plan.totals.currentGapToRecommended).toLocaleString("ru-RU")} ₽.`;
    case "plan-vs-fact-review":
      return definition.householdCopy[householdVariant];
    default:
      return definition.householdCopy[householdVariant];
  }
}

export function computeJourneyProgress(
  input: ResilienceInput,
  plan: ResiliencePlan,
  state: JourneyStateInput,
): JourneyProgressSnapshot {
  const householdVariant = resolveHouseholdVariant(input);
  const completed = new Set<MilestoneId>(state.acknowledgedMilestones);
  const optedOut = new Set<MilestoneId>(state.optedOutMilestones);
  const skipped = new Set<MilestoneId>();

  const orderedIds = state.milestoneOrder.length
    ? state.milestoneOrder
    : JOURNEY_MILESTONES.map((m) => m.id);

  const milestones: MilestoneProgress[] = [];

  for (const milestoneId of orderedIds) {
    const definition = getMilestoneDefinition(milestoneId);
    if (!definition) continue;

    if (optedOut.has(milestoneId)) {
      milestones.push({
        id: milestoneId,
        status: "opted_out",
        babySteps: definition.babySteps.map((step) => ({
          id: step.id,
          completed: false,
          autoDetected: false,
        })),
        feedback: buildFeedback(
          milestoneId,
          plan,
          householdVariant,
          "opted_out",
        ),
        householdVariant,
      });
      continue;
    }

    if (!branchApplies(definition.branchCondition, input, plan)) {
      skipped.add(milestoneId);
      milestones.push({
        id: milestoneId,
        status: "skipped",
        babySteps: definition.babySteps.map((step) => ({
          id: step.id,
          completed: true,
          autoDetected: true,
        })),
        feedback: buildFeedback(
          milestoneId,
          plan,
          householdVariant,
          "skipped",
        ),
        householdVariant,
      });
      continue;
    }

    const babySteps: BabyStepProgress[] = definition.babySteps.map((step) => {
      const manualKey = `${milestoneId}:${step.id}`;
      const manualAt = state.completedBabySteps[manualKey];
      const autoDetected = evaluateBabyStep(
        milestoneId,
        step.id,
        input,
        plan,
      );
      const completedStep =
        Boolean(manualAt) ||
        autoDetected ||
        (milestoneId === "plan-vs-fact-review" &&
          step.id === "record-review" &&
          Boolean(state.lastReviewAt));
      return {
        id: step.id,
        completed: completedStep,
        autoDetected: autoDetected && !manualAt,
        completedAt:
          manualAt ??
          (autoDetected ? new Date().toISOString() : undefined),
      };
    });

    const allStepsDone = babySteps.every((step) => step.completed);
    const anyStepDone = babySteps.some((step) => step.completed);
    const prereqsOk = prerequisitesMet(milestoneId, completed, skipped);

    let status: MilestoneStatus;
    if (completed.has(milestoneId) || allStepsDone) {
      status = "completed";
      completed.add(milestoneId);
    } else if (!prereqsOk) {
      status = "locked";
    } else if (anyStepDone) {
      status = "in_progress";
    } else {
      status = "available";
    }

    const coveragePercent = layerCoverageForMilestone(milestoneId, plan);

    milestones.push({
      id: milestoneId,
      status,
      babySteps,
      coveragePercent,
      feedback: buildFeedback(milestoneId, plan, householdVariant, status),
      householdVariant,
    });
  }

  const activeMilestone =
    milestones.find(
      (m) => m.status === "in_progress" || m.status === "available",
    ) ?? null;

  return {
    milestones,
    activeMilestoneId: activeMilestone?.id ?? null,
    completedCount: milestones.filter((m) => m.status === "completed").length,
    availableCount: milestones.filter(
      (m) => m.status === "available" || m.status === "in_progress",
    ).length,
    stressSurvivableCount: plan.stress.filter((s) => s.survivable).length,
    stressTotalCount: plan.stress.length,
    monthsCovered: plan.totals.monthsOfMandatoryExpensesCovered,
    gapToRecommended: plan.totals.currentGapToRecommended,
  };
}

export function resolveHouseholdVariantFromInput(
  input: ResilienceInput,
): HouseholdVariant {
  return resolveHouseholdVariant(input);
}
