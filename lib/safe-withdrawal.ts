import {
  calculateCompoundInterest,
  type CompoundContext,
  type CompoundResult,
} from "./compound-interest";
import type { CompoundParams } from "./portfolio-types";

export interface SafeWithdrawalAdvice {
  /** Макс. % / год от номинальной ликвидности */
  maxAnnualPercent: number;
  /** Макс. ₽ / мес в сегодняшних рублях (фикс. режим) */
  maxMonthlyReal: number;
  /** Ликвидная часть в первый месяц вывода, номинал (до списания) */
  liquidityAtWithdrawalStart: number;
  /** Та же ликвидность в сегодняшних ₽ */
  liquidityAtWithdrawalStartReal: number;
  /** Текущий сценарий укладывается в безопасный диапазон */
  currentIsSafe: boolean;
  /**
   * Эквивалент maxMonthlyReal в % / год от номинальной ликвидности
   * (целевой номинал = сумма в сегодняшних ₽ × инфляция на старт вывода)
   */
  maxMonthlyAsNominalPercent: number;
  /** Первая выплата при maxAnnualPercent, сегодняшние ₽ (на руки) */
  maxPercentAsMonthlyReal: number;
  /** Последняя выплата при maxAnnualPercent, сегодняшние ₽ (на руки) */
  maxPercentAsMonthlyRealEnd: number;
  /** Первая выплата при текущих параметрах, сегодняшние ₽ */
  currentStartPayoutReal: number;
  /** Эквивалент текущей фикс. суммы в % от номинала (если режим fixed) */
  currentFixedAsNominalPercent: number | null;
  /** Эквивалент текущего % в ₽/мес сегодня (если режим percent) */
  currentPercentAsMonthlyReal: number | null;
}

function monthlyInflationRate(params: CompoundParams): number {
  const annual = params.inflationPercent / 100;
  if ((params.monthlyRateMethod ?? "effective") === "simple") {
    return annual / 12;
  }
  return (1 + annual) ** (1 / 12) - 1;
}

function firstWithdrawalMonth(params: CompoundParams): number {
  return Math.round((params.withdrawAfterYears ?? 0) * 12) + 1;
}

function inflationFactorAtWithdrawalStart(params: CompoundParams): number {
  const month = firstWithdrawalMonth(params);
  return (1 + monthlyInflationRate(params)) ** month;
}

/** % / год от номинальной ликвидности для фикс. суммы в сегодняшних ₽ (до налога) */
export function fixedRealToNominalPercent(
  monthlyReal: number,
  nominalLiquidity: number,
  params: CompoundParams,
): number {
  if (nominalLiquidity <= 0 || monthlyReal <= 0) return 0;
  const nominalMonthlyTarget = monthlyReal * inflationFactorAtWithdrawalStart(params);
  return (nominalMonthlyTarget * 12 * 100) / nominalLiquidity;
}

function realLiquidityAtPoint(
  month: number,
  liquidityBalance: number,
  params: CompoundParams,
): number {
  const factor = (1 + monthlyInflationRate(params)) ** month;
  return liquidityBalance / factor;
}

/** Ликвидность не обнуляется и не падает в сегодняшних ₽ за фазу вывода */
export function isWithdrawalSustainable(
  result: CompoundResult,
  params: CompoundParams,
): boolean {
  if (result.withdrawalEndedEarly || result.withdrawalMonthsLiquidityEmpty > 0) {
    return false;
  }

  const withdrawalPoints = result.points.filter((p) => p.inWithdrawalPhase);
  if (withdrawalPoints.length < 2) {
    return true;
  }

  const first = withdrawalPoints[0];
  const last = withdrawalPoints[withdrawalPoints.length - 1];
  const firstReal = realLiquidityAtPoint(
    first.month,
    first.liquidityBalance,
    params,
  );
  const lastReal = realLiquidityAtPoint(
    last.month,
    last.liquidityBalance,
    params,
  );

  return lastReal >= firstReal * 0.995;
}

function getBaselineAtWithdrawalStart(
  params: CompoundParams,
  context?: CompoundContext,
): CompoundResult {
  return calculateCompoundInterest(
    {
      ...params,
      withdrawalMode: "percent",
      annualWithdrawalPercent: 0,
      monthlyWithdrawal: 0,
    },
    context,
  );
}

function getLiquidityAtWithdrawalStart(
  params: CompoundParams,
  context?: CompoundContext,
): number {
  return getBaselineAtWithdrawalStart(params, context).withdrawalStartLiquidity ?? 0;
}

function simulatePercent(
  params: CompoundParams,
  annualPercent: number,
  context?: CompoundContext,
): CompoundResult {
  return calculateCompoundInterest(
    {
      ...params,
      withdrawalMode: "percent",
      annualWithdrawalPercent: annualPercent,
      monthlyWithdrawal: 0,
    },
    context,
  );
}

function simulateFixed(
  params: CompoundParams,
  monthlyReal: number,
  context?: CompoundContext,
): CompoundResult {
  return calculateCompoundInterest(
    {
      ...params,
      withdrawalMode: "fixed",
      monthlyWithdrawal: monthlyReal,
      annualWithdrawalPercent: 0,
    },
    context,
  );
}

function findMaxAnnualPercent(
  params: CompoundParams,
  context?: CompoundContext,
): number {
  let lo = 0;
  let hi = Math.max(params.annualReturnPercent, 1);

  while (
    hi < 100 &&
    isWithdrawalSustainable(simulatePercent(params, hi, context), params)
  ) {
    lo = hi;
    hi = Math.min(100, hi * 2);
  }

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (isWithdrawalSustainable(simulatePercent(params, mid, context), params)) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 0.01) break;
  }

  return Math.round(lo * 100) / 100;
}

function findMaxMonthlyReal(
  params: CompoundParams,
  context?: CompoundContext,
  liquidityAtStart?: number,
): number {
  const liquidity =
    liquidityAtStart ?? getLiquidityAtWithdrawalStart(params, context);
  const yieldBased =
    (liquidity * (params.annualReturnPercent / 100)) / 12;
  let lo = 0;
  let hi = Math.max(yieldBased * 2, params.monthlyWithdrawal || 0, 10_000);

  while (
    hi < 50_000_000 &&
    isWithdrawalSustainable(simulateFixed(params, hi, context), params)
  ) {
    lo = hi;
    hi *= 2;
  }

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (isWithdrawalSustainable(simulateFixed(params, mid, context), params)) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1) break;
  }

  return Math.floor(lo);
}

function currentScenarioIsSafe(
  params: CompoundParams,
  context: CompoundContext | undefined,
  maxAnnualPercent: number,
  maxMonthlyReal: number,
): boolean {
  const mode = params.withdrawalMode ?? "fixed";
  if (mode === "percent") {
    const pct = params.annualWithdrawalPercent ?? 0;
    if (pct <= 0) return true;
    return (
      pct <= maxAnnualPercent + 0.01 &&
      isWithdrawalSustainable(
        simulatePercent(params, pct, context),
        params,
      )
    );
  }

  const monthly = params.monthlyWithdrawal ?? 0;
  if (monthly <= 0) return true;
  return (
    monthly <= maxMonthlyReal + 1 &&
    isWithdrawalSustainable(simulateFixed(params, monthly, context), params)
  );
}

export function computeSafeWithdrawalAdvice(
  params: CompoundParams,
  context?: CompoundContext,
): SafeWithdrawalAdvice | null {
  if (params.withdrawAfterYears == null || params.withdrawAfterYears <= 0) {
    return null;
  }

  const inflationAtStart = inflationFactorAtWithdrawalStart(params);
  const liquidityAtWithdrawalStart = getLiquidityAtWithdrawalStart(
    params,
    context,
  );
  const liquidityAtWithdrawalStartReal =
    liquidityAtWithdrawalStart / inflationAtStart;
  const maxAnnualPercent = findMaxAnnualPercent(params, context);
  const maxMonthlyReal = findMaxMonthlyReal(
    params,
    context,
    liquidityAtWithdrawalStart,
  );

  const maxMonthlyAsNominalPercent = fixedRealToNominalPercent(
    maxMonthlyReal,
    liquidityAtWithdrawalStart,
    params,
  );
  const maxPercentSim = simulatePercent(params, maxAnnualPercent, context);
  const maxPercentAsMonthlyReal = maxPercentSim.withdrawalStartPayoutReal;
  const maxPercentAsMonthlyRealEnd = maxPercentSim.withdrawalPayoutReal;

  const mode = params.withdrawalMode ?? "fixed";
  const currentSim =
    mode === "percent"
      ? simulatePercent(params, params.annualWithdrawalPercent ?? 0, context)
      : simulateFixed(params, params.monthlyWithdrawal ?? 0, context);

  const currentStartPayoutReal = currentSim.withdrawalStartPayoutReal;
  const currentFixedAsNominalPercent =
    mode === "fixed" && (params.monthlyWithdrawal ?? 0) > 0
      ? fixedRealToNominalPercent(
          params.monthlyWithdrawal ?? 0,
          liquidityAtWithdrawalStart,
          params,
        )
      : null;
  const currentPercentAsMonthlyReal =
    mode === "percent" ? currentStartPayoutReal : null;

  return {
    maxAnnualPercent,
    maxMonthlyReal,
    liquidityAtWithdrawalStart,
    liquidityAtWithdrawalStartReal,
    currentIsSafe: currentScenarioIsSafe(
      params,
      context,
      maxAnnualPercent,
      maxMonthlyReal,
    ),
    maxMonthlyAsNominalPercent: Math.round(maxMonthlyAsNominalPercent * 100) / 100,
    maxPercentAsMonthlyReal,
    maxPercentAsMonthlyRealEnd,
    currentStartPayoutReal,
    currentFixedAsNominalPercent:
      currentFixedAsNominalPercent != null
        ? Math.round(currentFixedAsNominalPercent * 100) / 100
        : null,
    currentPercentAsMonthlyReal,
  };
}
