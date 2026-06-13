import {
  applyCustomAssetIncome,
  getMonthlyDebtService,
  getNetWorth,
  getTotalDebtFromState,
  growCustomAssets,
  initWealthSimulationState,
  stepDebtsMonth,
  type WealthSimulationState,
} from "./debt-amortization";
import type { CompoundParams } from "./portfolio-types";

export interface CompoundContext {
  customAssets: import("./portfolio-types").CustomAssets;
  brokerTotal: number;
}

export interface CompoundPoint {
  month: number;
  year: number;
  label: string;
  balance: number;
  /** Покупательная способность портфеля в рублях сегодня */
  realBalance: number;
  contributed: number;
  /** Все взносы, приведённые к рублям сегодня */
  realContributed: number;
  /** Номинальная стоимость, если капитал рос только на уровне инфляции */
  inflationHurdle: number;
  withdrawn: number;
  /** Выплата в этом месяце, номинальные ₽ (0 вне фазы вывода) */
  monthlyPayoutNominal: number;
  /** Выплата в этом месяце в сегодняшних ₽ */
  monthlyPayoutReal: number;
  /** Целевая выплата в сегодняшних ₽ (фикс. — сумма из поля; % — доля ном. баланса / m) */
  monthlyPayoutTargetReal: number;
  /** Выплата урезана из‑за нехватки ликвидной части */
  monthlyPayoutCapped: boolean;
  /** Ликвидная часть (брокер + реинвестируемые доходы), доступная для вывода */
  liquidityBalance: number;
  /** Месяц в фазе вывода */
  inWithdrawalPhase: boolean;
  totalDebt: number;
  profit: number;
  profitAfterTax: number;
}

export interface CompoundResult {
  points: CompoundPoint[];
  finalBalance: number;
  finalRealBalance: number;
  totalContributed: number;
  finalRealContributed: number;
  totalWithdrawn: number;
  totalTaxPaid: number;
  totalDividendTax: number;
  totalWithdrawalTax: number;
  totalProfit: number;
  totalProfitAfterTax: number;
  /** Доходность портфеля с учётом дат взносов (IRR), % годовых */
  effectiveAnnualReturn: number;
  realAnnualReturn: number;
  monthlyReturnPercent: number;
  monthlyReturnPercentReal: number;
  monthlyIncomeAtEnd: number;
  monthlyIncomeRealAtEnd: number;
  finalTotalDebt: number;
  totalDebtPrincipalPaid: number;
  /** Последняя ежемесячная выплата в фазе вывода, номинал */
  withdrawalPayoutNominal: number;
  /** Последняя ежемесячная выплата в фазе вывода, сегодняшние ₽ */
  withdrawalPayoutReal: number;
  /** Последний месяц с ненулевой выплатой (null — выплаты шли до конца горизонта) */
  withdrawalLastPayoutMonth: number | null;
  withdrawalLastPayoutLabel: string | null;
  /** Выплаты прекратились до конца горизонта из‑за нехватки ликвидной части */
  withdrawalEndedEarly: boolean;
  /** Месяцев в фазе вывода без выплат после исчерпания */
  withdrawalMonthsWithoutPayout: number;
  /** Месяцев с нулевой (или почти нулевой) ликвидной частью в фазе вывода */
  withdrawalMonthsLiquidityEmpty: number;
  /** Первый месяц, когда ликвидная часть обнулилась */
  withdrawalLiquidityDepletedFromLabel: string | null;
  /** Ликвидная часть в первый месяц вывода (до списания) */
  withdrawalStartLiquidity: number | null;
  /** Первая выплата на руки, номинал и сегодняшние ₽ */
  withdrawalStartPayoutNominal: number;
  withdrawalStartPayoutReal: number;
  withdrawalStartLabel: string | null;
}

const LIQUIDITY_EPS = 0.01;

function formatMonthLabel(month: number): string {
  return `${Math.floor(month / 12)}г ${month % 12}м`;
}

function periodRateFromAnnual(
  annualPercent: number,
  intervalMonths: number,
  method: CompoundParams["monthlyRateMethod"],
): number {
  const annual = annualPercent / 100;
  if (method === "simple") {
    return (annual * intervalMonths) / 12;
  }
  return (1 + annual) ** (intervalMonths / 12) - 1;
}

function monthlyRateFromAnnual(
  annualPercent: number,
  method: CompoundParams["monthlyRateMethod"],
): number {
  return periodRateFromAnnual(annualPercent, 1, method);
}

function getAccrualPeriod(
  frequency: CompoundParams["compoundFrequency"],
  method: CompoundParams["monthlyRateMethod"],
) {
  switch (frequency) {
    case "quarterly":
      return {
        intervalMonths: 3,
        rate: (annual: number) => periodRateFromAnnual(annual, 3, method),
      };
    case "semiannual":
      return {
        intervalMonths: 6,
        rate: (annual: number) => periodRateFromAnnual(annual, 6, method),
      };
    case "yearly":
      return {
        intervalMonths: 12,
        rate: (annual: number) => periodRateFromAnnual(annual, 12, method),
      };
    default:
      return {
        intervalMonths: 1,
        rate: (annual: number) => periodRateFromAnnual(annual, 1, method),
      };
  }
}

/** Налог на дивиденды по акциям/ПИФам */
function dividendTax(
  balance: number,
  params: CompoundParams,
  monthsInPeriod: number,
): number {
  if (
    !params.taxDividends ||
    params.taxOnProfitPercent <= 0 ||
    params.taxableAssetShare <= 0 ||
    params.dividendYieldPercent <= 0
  ) {
    return 0;
  }

  const dividendIncome =
    balance *
    params.taxableAssetShare *
    (params.dividendYieldPercent / 100) *
    (monthsInPeriod / 12);

  return dividendIncome * (params.taxOnProfitPercent / 100);
}

function withdrawalGainTax(
  balance: number,
  costBasis: number,
  payout: number,
  taxRatePercent: number,
): { tax: number; principalReturned: number } {
  const gain = Math.max(0, balance - costBasis);
  const gainRatio = balance > 0 ? gain / balance : 0;
  const taxableGain = payout * gainRatio;
  const tax = taxableGain * (taxRatePercent / 100);
  const principalReturned = payout - taxableGain;
  return { tax, principalReturned };
}

/** IRR по месячным потокам → годовая ставка, % */
function annualizedIrr(cashFlows: number[]): number {
  if (cashFlows.length < 2) return 0;

  let rate = 0.01;
  for (let i = 0; i < 64; i++) {
    let npv = 0;
    let derivative = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const factor = (1 + rate) ** t;
      npv += cashFlows[t] / factor;
      if (t > 0) {
        derivative -= (t * cashFlows[t]) / ((1 + rate) ** (t + 1));
      }
    }
    if (Math.abs(derivative) < 1e-12) break;
    const next = rate - npv / derivative;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-9) {
      rate = next;
      break;
    }
    rate = next;
  }

  if (!Number.isFinite(rate)) return 0;
  return ((1 + rate) ** 12 - 1) * 100;
}

export function calculateCompoundInterest(
  params: CompoundParams,
  context?: CompoundContext,
): CompoundResult {
  const months = Math.max(1, Math.round(params.years * 12));
  const rateMethod = params.monthlyRateMethod ?? "effective";
  const monthlyInflation = monthlyRateFromAnnual(params.inflationPercent, rateMethod);
  const accrual = getAccrualPeriod(params.compoundFrequency, rateMethod);
  const monthlyReturnRate = monthlyRateFromAnnual(
    params.annualReturnPercent,
    rateMethod,
  );
  const monthlyReturnPercent = monthlyReturnRate * 100;
  const monthlyReturnPercentReal =
    ((1 + monthlyReturnRate) / (1 + monthlyInflation) - 1) * 100;

  const withdrawalStartMonth =
    params.withdrawAfterYears != null && params.withdrawAfterYears > 0
      ? Math.round(params.withdrawAfterYears * 12)
      : null;

  const useWealthModel = Boolean(context);
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
  let contributed = params.initialCapital;
  let realContributed = params.initialCapital;
  let inflationHurdle = params.initialCapital;
  let totalWithdrawn = 0;
  let totalTaxPaid = 0;
  let totalDividendTax = 0;
  let totalWithdrawalTax = 0;
  let totalDebtPrincipalPaid = 0;
  let monthlyContribution = params.monthlyContribution;
  const monthlyWithdrawalReal = params.monthlyWithdrawal;
  const withdrawalMode = params.withdrawalMode ?? "fixed";
  const annualWithdrawalPercent = params.annualWithdrawalPercent ?? 0;
  const monthlyWithdrawalFromAnnual = annualWithdrawalPercent / 12;

  const irrFlows: number[] = [-params.initialCapital];
  let lastWithdrawalPayoutNominal = 0;
  let lastWithdrawalPayoutReal = 0;
  let withdrawalLastPayoutMonth: number | null = null;
  let withdrawalLastPayoutLabel: string | null = null;
  let withdrawalMonthsWithoutPayout = 0;
  let withdrawalMonthsLiquidityEmpty = 0;
  let withdrawalLiquidityDepletedFromMonth: number | null = null;
  let withdrawalLiquidityDepletedFromLabel: string | null = null;
  let withdrawalStartLiquidity: number | null = null;
  let withdrawalStartPayoutNominal = 0;
  let withdrawalStartPayoutReal = 0;
  let withdrawalStartLabel: string | null = null;
  const points: CompoundPoint[] = [];
  let accruedIncome = 0;
  let monthsInAccrualPeriod = 0;

  const pushIrrFlow = (month: number, amount: number) => {
    irrFlows[month] = (irrFlows[month] ?? 0) + amount;
  };

  const syncBalance = () => {
    if (wealthState) {
      balance = getNetWorth(wealthState);
    }
  };

  const getInvestableBalance = () =>
    wealthState ? wealthState.investmentBalance : balance;

  const setInvestableBalance = (value: number) => {
    if (wealthState) {
      wealthState.investmentBalance = value;
      syncBalance();
      return;
    }
    balance = value;
  };

  const creditAccruedIncome = () => {
    if (accruedIncome <= 0) return;

    const income = accruedIncome;
    accruedIncome = 0;
    const periodMonths = monthsInAccrualPeriod;
    monthsInAccrualPeriod = 0;

    if (params.reinvestReturns) {
      setInvestableBalance(getInvestableBalance() + income);
      const divTax = dividendTax(
        getInvestableBalance(),
        params,
        periodMonths,
      );
      if (divTax > 0) {
        setInvestableBalance(getInvestableBalance() - divTax);
        totalTaxPaid += divTax;
        totalDividendTax += divTax;
      }
    } else {
      const investable = getInvestableBalance();
      const divTax = dividendTax(investable, params, periodMonths);
      totalTaxPaid += divTax;
      totalDividendTax += divTax;
      totalWithdrawn += income - divTax;
    }
  };

  const snapshot = (
    month: number,
    monthPayoutNominal: number,
    monthPayoutReal: number,
    monthPayoutTargetReal: number,
    inWithdrawalPhase: boolean,
    monthPayoutCapped: boolean,
  ) => {
    const inflationFactor = (1 + monthlyInflation) ** month;
    const netWealth = balance + totalWithdrawn;
    const profit = netWealth - contributed;
    const profitAfterTax = profit;
    const totalDebt = wealthState ? getTotalDebtFromState(wealthState) : 0;
    const liquidityBalance = getInvestableBalance();

    return {
      month,
      year: Math.floor(month / 12),
      label:
        month === 0
          ? "Старт"
          : `${Math.floor(month / 12)}г ${month % 12}м`,
      balance,
      realBalance: balance / inflationFactor,
      contributed,
      realContributed,
      inflationHurdle,
      withdrawn: totalWithdrawn,
      monthlyPayoutNominal: monthPayoutNominal,
      monthlyPayoutReal: monthPayoutReal,
      monthlyPayoutTargetReal: monthPayoutTargetReal,
      liquidityBalance,
      inWithdrawalPhase,
      monthlyPayoutCapped: monthPayoutCapped,
      totalDebt,
      profit,
      profitAfterTax,
    };
  };

  points.push(snapshot(0, 0, 0, 0, false, false));

  const scheduledDebtService = context
    ? getMonthlyDebtService(context.customAssets)
    : 0;

  for (let month = 1; month <= months; month++) {
    let monthPayoutNominal = 0;
    let monthPayoutReal = 0;
    let monthPayoutTargetReal = 0;
    let monthPayoutCapped = false;
    let debtPayment = 0;
    if (wealthState && context) {
      const debtStep = stepDebtsMonth(context.customAssets, wealthState);
      debtPayment = debtStep.totalPayment;
      totalDebtPrincipalPaid += debtStep.totalPrincipal;
      growCustomAssets(
        context.customAssets,
        wealthState,
        params.inflationPercent,
        rateMethod,
      );
      const assetIncome = applyCustomAssetIncome(
        context.customAssets,
        wealthState,
        params.reinvestReturns,
      );
      if (!params.reinvestReturns && assetIncome > 0) {
        totalWithdrawn += assetIncome;
      }
    }

    const inWithdrawalPhase =
      withdrawalStartMonth !== null && month > withdrawalStartMonth;

    const totalDebt = wealthState ? getTotalDebtFromState(wealthState) : 0;
    let investContribution = 0;

    if (!inWithdrawalPhase) {
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

      contributed += monthlyContribution;
      costBasis += investContribution;
      realContributed += monthlyContribution / (1 + monthlyInflation) ** month;
      pushIrrFlow(month, -monthlyContribution);

      inflationHurdle =
        (inflationHurdle + monthlyContribution) * (1 + monthlyInflation);
    } else {
      inflationHurdle *= 1 + monthlyInflation;
      if (wealthState && debtPayment > 0) {
        setInvestableBalance(
          Math.max(0, getInvestableBalance() - debtPayment),
        );
      }
    }

    setInvestableBalance(getInvestableBalance() + investContribution);

    accruedIncome += getInvestableBalance() * monthlyReturnRate;
    monthsInAccrualPeriod += 1;

    const accrualPeriodEnd =
      month % accrual.intervalMonths === 0 || month === months;
    if (accrualPeriodEnd) {
      creditAccruedIncome();
    }

    syncBalance();

    const withdrawalConfigured =
      withdrawalMode === "percent"
        ? annualWithdrawalPercent > 0
        : monthlyWithdrawalReal > 0;

    if (inWithdrawalPhase && withdrawalConfigured) {
      const inflationFactor = (1 + monthlyInflation) ** month;
      const investableBefore = getInvestableBalance();

      if (withdrawalStartLiquidity === null) {
        withdrawalStartLiquidity = investableBefore;
      }

      const targetPayout =
        withdrawalMode === "percent"
          ? investableBefore * (monthlyWithdrawalFromAnnual / 100)
          : monthlyWithdrawalReal * inflationFactor;
      monthPayoutTargetReal =
        withdrawalMode === "percent"
          ? targetPayout / inflationFactor
          : monthlyWithdrawalReal;
      const payout = Math.min(targetPayout, investableBefore);
      monthPayoutCapped =
        withdrawalMode === "percent"
          ? targetPayout > investableBefore + LIQUIDITY_EPS
          : targetPayout > LIQUIDITY_EPS && payout <= LIQUIDITY_EPS;

      if (investableBefore <= LIQUIDITY_EPS) {
        withdrawalMonthsLiquidityEmpty += 1;
        if (withdrawalLiquidityDepletedFromMonth === null) {
          withdrawalLiquidityDepletedFromMonth = month;
          withdrawalLiquidityDepletedFromLabel = formatMonthLabel(month);
        }
      }

      const withdrawalFailed =
        withdrawalMode === "fixed"
          ? targetPayout > LIQUIDITY_EPS && payout <= LIQUIDITY_EPS
          : investableBefore <= LIQUIDITY_EPS;

      if (payout > LIQUIDITY_EPS) {
        const { tax, principalReturned } = withdrawalGainTax(
          investableBefore,
          costBasis,
          payout,
          params.taxOnProfitPercent,
        );
        setInvestableBalance(investableBefore - payout);
        if (tax > 0) {
          setInvestableBalance(getInvestableBalance() - tax);
          totalTaxPaid += tax;
          totalWithdrawalTax += tax;
        }
        const netPayout = payout - tax;
        totalWithdrawn += netPayout;
        pushIrrFlow(month, netPayout);
        costBasis -= principalReturned;
        monthPayoutNominal = netPayout;
        monthPayoutReal = netPayout / inflationFactor;
        lastWithdrawalPayoutNominal = monthPayoutNominal;
        lastWithdrawalPayoutReal = monthPayoutReal;
        withdrawalLastPayoutMonth = month;
        withdrawalLastPayoutLabel = formatMonthLabel(month);
        syncBalance();
      } else if (withdrawalFailed) {
        withdrawalMonthsWithoutPayout += 1;
      }

      if (withdrawalStartLabel === null) {
        withdrawalStartLabel = formatMonthLabel(month);
        withdrawalStartPayoutNominal = monthPayoutNominal;
        withdrawalStartPayoutReal = monthPayoutReal;
      }
    } else if (inWithdrawalPhase) {
      if (withdrawalStartLiquidity === null) {
        withdrawalStartLiquidity = getInvestableBalance();
        withdrawalStartLabel = formatMonthLabel(month);
      }
      withdrawalMonthsWithoutPayout += 1;
    }

    if (!inWithdrawalPhase) {
      if (params.adjustContributionsForInflation) {
        monthlyContribution *= 1 + monthlyInflation;
      } else if (month % 12 === 0) {
        monthlyContribution *= 1 + params.contributionGrowthPercent / 100;
      }
    }

    if (month === months) {
      pushIrrFlow(month, balance);
    }

    const step = Math.max(1, Math.floor(months / 48));
    const firstMonthWithoutPayout =
      withdrawalLastPayoutMonth !== null ? withdrawalLastPayoutMonth + 1 : null;
    const firstWithdrawalMonth =
      withdrawalStartMonth !== null ? withdrawalStartMonth + 1 : null;
    if (
      month % step === 0 ||
      month === months ||
      month === withdrawalLastPayoutMonth ||
      month === firstMonthWithoutPayout ||
      month === withdrawalLiquidityDepletedFromMonth ||
      month === firstWithdrawalMonth
    ) {
      points.push(
        snapshot(
          month,
          monthPayoutNominal,
          monthPayoutReal,
          monthPayoutTargetReal,
          inWithdrawalPhase,
          monthPayoutCapped,
        ),
      );
    }
  }

  const withdrawalEndedEarly =
    withdrawalMonthsLiquidityEmpty > 0 ||
    (withdrawalMonthsWithoutPayout > 0 &&
      withdrawalLastPayoutMonth !== null &&
      withdrawalLastPayoutMonth < months);

  const last = points[points.length - 1];
  const endInflationFactor = (1 + monthlyInflation) ** months;
  const endInvestable = wealthState
    ? wealthState.investmentBalance
    : last.balance;
  const monthlyIncomeAtEnd = endInvestable * monthlyReturnRate;
  const monthlyIncomeRealAtEnd = monthlyIncomeAtEnd / endInflationFactor;

  const nominalIrr = annualizedIrr(irrFlows);
  const realAnnualReturn =
    last.realContributed > 0 && months > 0
      ? ((last.realBalance / last.realContributed) ** (12 / months) - 1) * 100
      : 0;

  return {
    points,
    finalBalance: last.balance,
    finalRealBalance: last.realBalance,
    totalContributed: last.contributed,
    finalRealContributed: last.realContributed,
    totalWithdrawn,
    totalTaxPaid,
    totalDividendTax,
    totalWithdrawalTax,
    totalProfit: last.profit,
    totalProfitAfterTax: last.profitAfterTax,
    effectiveAnnualReturn: nominalIrr,
    realAnnualReturn,
    monthlyReturnPercent,
    monthlyReturnPercentReal,
    monthlyIncomeAtEnd,
    monthlyIncomeRealAtEnd,
    finalTotalDebt: last.totalDebt,
    totalDebtPrincipalPaid,
    withdrawalPayoutNominal: lastWithdrawalPayoutNominal,
    withdrawalPayoutReal: lastWithdrawalPayoutReal,
    withdrawalLastPayoutMonth,
    withdrawalLastPayoutLabel,
    withdrawalEndedEarly,
    withdrawalMonthsWithoutPayout,
    withdrawalMonthsLiquidityEmpty,
    withdrawalLiquidityDepletedFromLabel,
    withdrawalStartLiquidity,
    withdrawalStartPayoutNominal,
    withdrawalStartPayoutReal,
    withdrawalStartLabel,
  };
}
