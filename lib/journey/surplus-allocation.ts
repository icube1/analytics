import type { ResilienceInput, ResiliencePlan } from "@/lib/resilience-plan";

export type SurplusBucketId =
  | "next-emergency-layer"
  | "sinking-funds"
  | "experiences-fund"
  | "unassigned";

export type EmergencyLayerId =
  | "operationalBuffer"
  | "starterEmergencyFund"
  | "coreReserve"
  | "extendedReserve";

export interface SurplusBucket {
  id: SurplusBucketId;
  label: string;
  monthlySuggested: number;
  monthlyNeed: number;
  monthsToFill: number | null;
  reason: string;
}

export interface SurplusAllocation {
  monthlySurplus: number;
  deficit: boolean;
  nextEmergencyLayerId: EmergencyLayerId | null;
  nextEmergencyGap: number;
  sinkingMonthlyNeed: number;
  experiencesMonthlyNeed: number;
  buckets: SurplusBucket[];
  plannedTotal: number;
  leftover: number;
  sustainable: boolean;
  message: string;
}

const EMERGENCY_LAYERS: Array<{
  id: EmergencyLayerId;
  label: string;
  coverageKey:
    | "operationalBufferPercent"
    | "starterEmergencyPercent"
    | "coreReservePercent"
    | "extendedReservePercent";
  layerKey: EmergencyLayerId;
}> = [
  {
    id: "operationalBuffer",
    label: "Операционный буфер",
    coverageKey: "operationalBufferPercent",
    layerKey: "operationalBuffer",
  },
  {
    id: "starterEmergencyFund",
    label: "Стартовый резерв",
    coverageKey: "starterEmergencyPercent",
    layerKey: "starterEmergencyFund",
  },
  {
    id: "coreReserve",
    label: "Базовый резерв",
    coverageKey: "coreReservePercent",
    layerKey: "coreReserve",
  },
  {
    id: "extendedReserve",
    label: "Расширенный резерв",
    coverageKey: "extendedReservePercent",
    layerKey: "extendedReserve",
  },
];

function roundRub(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function monthsToFill(gap: number, monthly: number): number | null {
  if (gap <= 0) return 0;
  if (monthly <= 0) return null;
  return Math.ceil(gap / monthly);
}

export function sinkingFundsMonthlyNeed(input: ResilienceInput): number {
  return roundRub(
    input.sinkingFunds.reduce((sum, goal) => {
      const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
      const months = Math.max(goal.monthsUntilDue, 1);
      return sum + remaining / months;
    }, 0),
  );
}

export function experiencesMonthlyNeed(input: ResilienceInput): number {
  const remaining = Math.max(
    input.experiences.annualTarget - input.experiences.currentAmount,
    0,
  );
  return roundRub(remaining / 12);
}

function nextIncompleteEmergency(
  input: ResilienceInput,
  plan: ResiliencePlan,
): { id: EmergencyLayerId; label: string; gap: number } | null {
  const liquid = Math.max(input.liquidAssets, 0);
  for (const layer of EMERGENCY_LAYERS) {
    if (
      layer.id === "extendedReserve" &&
      !plan.risk.recommendsExtendedReserve
    ) {
      continue;
    }
    const recommended = plan.layers[layer.layerKey].recommended;
    if (recommended <= 0) continue;
    if (plan.coverage[layer.coverageKey] >= 100) continue;
    const gap = roundRub(Math.max(recommended - liquid, 0));
    if (gap <= 0) continue;
    return { id: layer.id, label: layer.label, gap };
  }
  return null;
}

export function proposeSurplusAllocation(
  input: ResilienceInput,
  plan: ResiliencePlan,
): SurplusAllocation {
  const monthlySurplus = Number.isFinite(input.monthlySurplus)
    ? input.monthlySurplus
    : 0;
  const sinkingNeed = sinkingFundsMonthlyNeed(input);
  const experiencesNeed = experiencesMonthlyNeed(input);
  const nextEmergency = nextIncompleteEmergency(input, plan);

  if (monthlySurplus <= 0) {
    return {
      monthlySurplus,
      deficit: true,
      nextEmergencyLayerId: nextEmergency?.id ?? null,
      nextEmergencyGap: nextEmergency?.gap ?? 0,
      sinkingMonthlyNeed: sinkingNeed,
      experiencesMonthlyNeed: experiencesNeed,
      buckets: [],
      plannedTotal: 0,
      leftover: 0,
      sustainable: false,
      message:
        monthlySurplus < 0
          ? "После обязательных расходов остаётся дефицит. Сначала разберитесь с потоком — целевые фонды подождут."
          : "Профицит пока нулевой. Цели можно записать заранее: взносы появятся, когда появится остаток.",
    };
  }

  let remaining = roundRub(monthlySurplus);
  const buckets: SurplusBucket[] = [];

  if (nextEmergency) {
    const assigned = Math.min(remaining, nextEmergency.gap);
    remaining -= assigned;
    buckets.push({
      id: "next-emergency-layer",
      label: nextEmergency.label,
      monthlySuggested: assigned,
      monthlyNeed: nextEmergency.gap,
      monthsToFill: monthsToFill(nextEmergency.gap, assigned),
      reason:
        assigned >= nextEmergency.gap
          ? "Этот слой можно закрыть текущим остатком за месяц."
          : `Свободный остаток идёт в ${nextEmergency.label.toLowerCase()} — около ${monthsToFill(nextEmergency.gap, assigned)} мес. до ориентира.`,
    });
  }

  if (input.sinkingFunds.length > 0) {
    const assigned = Math.min(remaining, sinkingNeed);
    remaining -= assigned;
    const sinkingStock = roundRub(
      input.sinkingFunds.reduce(
        (sum, goal) =>
          sum + Math.max(goal.targetAmount - goal.currentAmount, 0),
        0,
      ),
    );
    buckets.push({
      id: "sinking-funds",
      label: "Целевые накопления",
      monthlySuggested: assigned,
      monthlyNeed: sinkingNeed,
      monthsToFill: monthsToFill(sinkingStock, assigned),
      reason:
        sinkingNeed === 0
          ? "По текущим целям уже накоплено достаточно."
          : assigned < sinkingNeed
            ? `Цели просят ${sinkingNeed.toLocaleString("ru-RU")} ₽/мес, сейчас можно направить ${assigned.toLocaleString("ru-RU")} ₽. Срок сдвинется, резерв не трогаем.`
            : `План взносов по целям: ${sinkingNeed.toLocaleString("ru-RU")} ₽/мес отдельно от аварийного резерва.`,
    });
  }

  if (input.experiences.annualTarget > 0) {
    const assigned = Math.min(remaining, experiencesNeed);
    remaining -= assigned;
    const experiencesStock = roundRub(
      Math.max(
        input.experiences.annualTarget - input.experiences.currentAmount,
        0,
      ),
    );
    buckets.push({
      id: "experiences-fund",
      label: "Фонд впечатлений",
      monthlySuggested: assigned,
      monthlyNeed: experiencesNeed,
      monthsToFill: monthsToFill(experiencesStock, assigned),
      reason:
        assigned < experiencesNeed
          ? "Впечатления копим после буфера и обязательных целей — без стыда за меньший взнос."
          : `Годовой ориентир впечатлений: около ${experiencesNeed.toLocaleString("ru-RU")} ₽/мес.`,
    });
  }

  const leftover = Math.max(remaining, 0);
  if (leftover > 0) {
    const highInterest = input.debt.highInterestBalance > 0;
    buckets.push({
      id: "unassigned",
      label: "На ваш выбор",
      monthlySuggested: leftover,
      monthlyNeed: leftover,
      monthsToFill: 1,
      reason: highInterest
        ? "Остаток можно направить в долгосрочные цели, впечатления сверх плана или досрочное погашение дорогого долга — без единого «правильного» ответа."
        : "Остаток — на долгосрочные цели или впечатления сверх плана. После выбранного резерва продукт не требует бесконечно копить cash.",
    });
  }

  const plannedTotal = roundRub(monthlySurplus - leftover);
  const sinkingUnmet =
    input.sinkingFunds.length > 0 &&
    sinkingNeed > 0 &&
    (buckets.find((bucket) => bucket.id === "sinking-funds")?.monthlySuggested ??
      0) < sinkingNeed;
  const sustainable =
    plan.coverage.operationalBufferPercent >= 100 && !sinkingUnmet;

  const emergencyBucket = buckets.find(
    (bucket) => bucket.id === "next-emergency-layer",
  );
  const message = emergencyBucket
    ? `Свободные ${monthlySurplus.toLocaleString("ru-RU")} ₽/мес в первую очередь закрывают ${emergencyBucket.label.toLowerCase()}.`
    : sinkingUnmet
      ? "Буфер закрыт, но цели не укладываются в текущий профицит — срок сдвинется, аварийный резерв не трогаем."
      : `Буфер закрыт. Из ${monthlySurplus.toLocaleString("ru-RU")} ₽/мес можно распределить взносы по целям и впечатлениям.`;

  return {
    monthlySurplus,
    deficit: false,
    nextEmergencyLayerId: nextEmergency?.id ?? null,
    nextEmergencyGap: nextEmergency?.gap ?? 0,
    sinkingMonthlyNeed: sinkingNeed,
    experiencesMonthlyNeed: experiencesNeed,
    buckets,
    plannedTotal,
    leftover,
    sustainable,
    message,
  };
}
