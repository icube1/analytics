import {
  applyCustomAssetIncome,
  getMonthlyDebtService,
  getNetWorth,
  getTotalDebtFromState,
  growCustomAssets,
  initWealthSimulationState,
  stepDebtsMonth,
} from "../debt-amortization";
import type { CompoundParams } from "../portfolio-types";
import { getAccrualPeriod, monthlyRateFromAnnual } from "./rates";
import type { CompoundContext } from "./types";
import { processWithdrawal, type WithdrawalState } from "./withdrawal";

export interface MonteCarloOptions {
  simulations?: number;
  /** Годовая волатильность доходности, % */
  volatilityPercent?: number;
  seed?: number;
  /** Базовая календарная дата расчёта; обязательна для воспроизводимых прогонов */
  asOf?: Date;
}

export interface MonteCarloPercentilePoint {
  month: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloResult {
  simulations: number;
  volatilityPercent: number;
  points: MonteCarloPercentilePoint[];
  finalBalance: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleMonthlyReturnRate(
  expectedMonthlyRate: number,
  volatilityPercent: number,
  rng: () => number,
): number {
  const sigma = volatilityPercent / 100 / Math.sqrt(12);
  const mu =
    expectedMonthlyRate > -0.999
      ? Math.log(1 + expectedMonthlyRate) - 0.5 * sigma ** 2
      : -10;
  const monthly = Math.exp(mu + sigma * randomNormal(rng)) - 1;
  return Math.max(-0.99, monthly);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function simulateRandomPath(
  params: CompoundParams,
  context: CompoundContext | undefined,
  rng: () => number,
  volatilityPercent: number,
  months: number,
  asOf: Date,
): number[] {
  const rateMethod = params.monthlyRateMethod ?? "effective";
  const monthlyInflation = monthlyRateFromAnnual(params.inflationPercent, rateMethod);
  const accrual = getAccrualPeriod(params.compoundFrequency, rateMethod);
  const expectedMonthlyReturn = monthlyRateFromAnnual(
    params.annualReturnPercent,
    rateMethod,
  );

  const withdrawalStartMonth =
    params.withdrawAfterYears != null && params.withdrawAfterYears > 0
      ? Math.round(params.withdrawAfterYears * 12)
      : null;

  const wealthState = context
    ? initWealthSimulationState(context.customAssets, context.brokerTotal)
    : null;

  let balance = params.initialCapital;
  if (wealthState) {
    const netWorth = getNetWorth(wealthState);
    const diff = params.initialCapital - netWorth;
    if (Math.abs(diff) > 1) {
      wealthState.investmentBalance += diff;
    }
    balance = getNetWorth(wealthState);
  }

  let costBasis = params.initialCapital;
  let monthlyContribution = params.monthlyContribution;
  const monthlyWithdrawalReal = params.monthlyWithdrawal;
  const withdrawalMode = params.withdrawalMode ?? "fixed";
  const annualWithdrawalPercent = params.annualWithdrawalPercent ?? 0;
  const monthlyWithdrawalFromAnnual = annualWithdrawalPercent / 12;

  const balances: number[] = [balance];
  let accruedIncome = 0;

  const getInvestableBalance = () =>
    wealthState ? wealthState.investmentBalance : balance;

  const setInvestableBalance = (value: number) => {
    if (wealthState) {
      wealthState.investmentBalance = value;
      balance = getNetWorth(wealthState);
      return;
    }
    balance = value;
  };

  const scheduledDebtService = context
    ? getMonthlyDebtService(context.customAssets)
    : 0;

  let withdrawalState: WithdrawalState = {
    withdrawalStartLiquidity: null,
    withdrawalStartPayoutNominal: 0,
    withdrawalStartPayoutReal: 0,
    withdrawalStartLabel: null,
    withdrawalLiquidityDepletedFromMonth: null,
    withdrawalLiquidityDepletedFromLabel: null,
  };

  for (let month = 1; month <= months; month++) {
    let debtPayment = 0;

    if (wealthState && context) {
      const debtStep = stepDebtsMonth(context.customAssets, wealthState, {
        simulationMonth: month,
        asOf,
      });
      debtPayment = debtStep.totalPayment;
      growCustomAssets(
        context.customAssets,
        wealthState,
        params.inflationPercent,
        rateMethod,
        { asOf, simulationMonth: month },
      );
      applyCustomAssetIncome(
        context.customAssets,
        wealthState,
        params.reinvestReturns,
      );
    }

    const inWithdrawalPhase =
      withdrawalStartMonth !== null && month > withdrawalStartMonth;
    const totalDebt = wealthState ? getTotalDebtFromState(wealthState) : 0;
    let investContribution = 0;

    if (!inWithdrawalPhase) {
      const debtSeparate = params.debtPaymentsSeparateFromContribution ?? false;

      if (debtSeparate && wealthState) {
        investContribution = monthlyContribution;
        if (
          params.reinvestFreedDebtPayments &&
          totalDebt <= 0.01 &&
          scheduledDebtService > 0
        ) {
          investContribution = monthlyContribution + scheduledDebtService;
        }
      } else {
        investContribution = wealthState
          ? Math.max(0, monthlyContribution - debtPayment)
          : monthlyContribution;

        if (
          params.reinvestFreedDebtPayments &&
          wealthState &&
          totalDebt <= 0.01 &&
          scheduledDebtService > 0
        ) {
          investContribution = monthlyContribution + scheduledDebtService;
        }
      }
    } else if (wealthState && debtPayment > 0) {
      setInvestableBalance(Math.max(0, getInvestableBalance() - debtPayment));
    }

    setInvestableBalance(getInvestableBalance() + investContribution);

    const monthlyReturnRate = sampleMonthlyReturnRate(
      expectedMonthlyReturn,
      volatilityPercent,
      rng,
    );
    accruedIncome += getInvestableBalance() * monthlyReturnRate;

    const accrualPeriodEnd =
      month % accrual.intervalMonths === 0 || month === months;
    if (accrualPeriodEnd && accruedIncome !== 0) {
      setInvestableBalance(getInvestableBalance() + accruedIncome);
      accruedIncome = 0;
    }

    if (wealthState) {
      balance = getNetWorth(wealthState);
    } else {
      balance = getInvestableBalance();
    }

    const withdrawalConfigured =
      withdrawalMode === "percent"
        ? annualWithdrawalPercent > 0
        : monthlyWithdrawalReal > 0;

    if (inWithdrawalPhase && withdrawalConfigured) {
      processWithdrawal({
        month,
        params,
        monthlyInflation,
        withdrawalMode,
        monthlyWithdrawalReal,
        monthlyWithdrawalFromAnnual,
        annualWithdrawalPercent,
        investableBefore: getInvestableBalance(),
        costBasis,
        state: withdrawalState,
        setInvestableBalance,
        getInvestableBalance,
        syncBalance: () => {
          if (wealthState) balance = getNetWorth(wealthState);
          else balance = getInvestableBalance();
        },
        onNetPayout: () => {},
        onTax: () => {},
        onCostBasisReduced: (amount) => {
          costBasis -= amount;
        },
      });
      if (wealthState) balance = getNetWorth(wealthState);
      else balance = getInvestableBalance();
    }

    if (!inWithdrawalPhase) {
      if (params.adjustContributionsForInflation) {
        monthlyContribution *= 1 + monthlyInflation;
      } else if (month % 12 === 0) {
        monthlyContribution *= 1 + params.contributionGrowthPercent / 100;
      }
    }

    balances.push(balance);
  }

  return balances;
}

export function runMonteCarloSimulation(
  params: CompoundParams,
  context: CompoundContext | undefined,
  options: MonteCarloOptions = {},
): MonteCarloResult {
  const simulations = Math.max(50, Math.min(options.simulations ?? 400, 2000));
  const volatilityPercent = Math.max(1, options.volatilityPercent ?? 18);
  const seed = options.seed ?? 42;
  const asOf = options.asOf ?? new Date();
  const months = Math.max(1, Math.round(params.years * 12));

  const paths: number[][] = [];

  for (let sim = 0; sim < simulations; sim += 1) {
    const rng = mulberry32(seed + sim * 9973);
    paths.push(
      simulateRandomPath(params, context, rng, volatilityPercent, months, asOf),
    );
  }

  const points: MonteCarloPercentilePoint[] = [];

  for (let month = 0; month <= months; month += 1) {
    const values = paths.map((path) => path[month] ?? path[path.length - 1]).sort(
      (a, b) => a - b,
    );
    points.push({
      month,
      p10: percentile(values, 0.1),
      p25: percentile(values, 0.25),
      p50: percentile(values, 0.5),
      p75: percentile(values, 0.75),
      p90: percentile(values, 0.9),
    });
  }

  const finalValues = paths.map((path) => path[path.length - 1] ?? 0).sort(
    (a, b) => a - b,
  );

  return {
    simulations,
    volatilityPercent,
    points,
    finalBalance: {
      p10: percentile(finalValues, 0.1),
      p25: percentile(finalValues, 0.25),
      p50: percentile(finalValues, 0.5),
      p75: percentile(finalValues, 0.75),
      p90: percentile(finalValues, 0.9),
    },
  };
}
