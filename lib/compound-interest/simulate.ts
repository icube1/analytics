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
import { annualizedIrr } from "./irr";
import { getAccrualPeriod, monthlyRateFromAnnual } from "./rates";
import { buildSnapshot } from "./snapshot";
import { dividendTax } from "./taxes";
import type { CompoundContext, CompoundPoint, CompoundResult } from "./types";
import {
  markWithdrawalStartWithoutPayout,
  processWithdrawal,
  type WithdrawalState,
} from "./withdrawal";

export interface CalculateCompoundInterestOptions {
  /** Сохранять снимок каждого месяца (для трекинга), а не ~48 точек */
  allMonths?: boolean;
}

export function calculateCompoundInterest(
  params: CompoundParams,
  context?: CompoundContext,
  options?: CalculateCompoundInterestOptions,
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

  const takeSnapshot = (
    month: number,
    monthPayoutNominal: number,
    monthPayoutReal: number,
    monthPayoutTargetReal: number,
    inWithdrawalPhase: boolean,
    monthPayoutCapped: boolean,
    monthlyBrokerInvest: number,
    monthlyDebtPayment: number,
    monthlyDebtPrincipal: number,
    monthlyDebtInterest: number,
    monthlyWealthBuilding: number,
    monthlyCashOutflow: number,
    monthlyTotalContribution: number,
  ) =>
    buildSnapshot({
      month,
      balance,
      contributed,
      realContributed,
      inflationHurdle,
      totalWithdrawn,
      monthlyInflation,
      monthPayoutNominal,
      monthPayoutReal,
      monthPayoutTargetReal,
      inWithdrawalPhase,
      monthPayoutCapped,
      monthlyBrokerInvest,
      monthlyDebtPayment,
      monthlyDebtPrincipal,
      monthlyDebtInterest,
      monthlyWealthBuilding,
      monthlyCashOutflow,
      monthlyTotalContribution,
      getInvestableBalance,
      wealthState,
      customAssets: context?.customAssets ?? null,
    });

  points.push(
    takeSnapshot(0, 0, 0, 0, false, false, 0, 0, 0, 0, 0, 0, 0),
  );

  const scheduledDebtService = context
    ? getMonthlyDebtService(context.customAssets)
    : 0;

  for (let month = 1; month <= months; month++) {
    let monthPayoutNominal = 0;
    let monthPayoutReal = 0;
    let monthPayoutTargetReal = 0;
    let monthPayoutCapped = false;
    let debtPayment = 0;
    let debtPrincipal = 0;
    let debtInterest = 0;
    let monthBrokerInvest = 0;
    let monthDebtPayment = 0;
    let monthDebtPrincipal = 0;
    let monthDebtInterest = 0;
    let monthWealthBuilding = 0;
    let monthCashOutflow = 0;
    let monthTotalContribution = 0;

    if (wealthState && context) {
      const debtStep = stepDebtsMonth(context.customAssets, wealthState, {
        simulationMonth: month,
        asOf: new Date(),
      });
      debtPayment = debtStep.totalPayment;
      debtPrincipal = debtStep.totalPrincipal;
      debtInterest = debtStep.totalInterest;
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
        const totalOutflow = monthlyContribution + debtPayment;
        monthBrokerInvest = investContribution;
        monthDebtPayment = debtPayment;
        monthDebtPrincipal = debtPrincipal;
        monthDebtInterest = debtInterest;
        monthWealthBuilding = investContribution + debtPrincipal;
        monthCashOutflow = totalOutflow;
        monthTotalContribution = totalOutflow;
        contributed += totalOutflow;
        costBasis += investContribution;
        realContributed += totalOutflow / (1 + monthlyInflation) ** month;
        pushIrrFlow(month, -totalOutflow);
        inflationHurdle =
          (inflationHurdle + totalOutflow) * (1 + monthlyInflation);
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

        monthBrokerInvest = investContribution;
        monthDebtPayment = debtPayment;
        monthDebtPrincipal = debtPrincipal;
        monthDebtInterest = debtInterest;
        monthWealthBuilding = investContribution + debtPrincipal;
        monthCashOutflow = monthlyContribution;
        monthTotalContribution = monthlyContribution;

        contributed += monthlyContribution;
        costBasis += investContribution;
        realContributed += monthlyContribution / (1 + monthlyInflation) ** month;
        pushIrrFlow(month, -monthlyContribution);

        inflationHurdle =
          (inflationHurdle + monthlyContribution) * (1 + monthlyInflation);
      }
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
      const withdrawalState: WithdrawalState = {
        withdrawalStartLiquidity,
        withdrawalStartPayoutNominal,
        withdrawalStartPayoutReal,
        withdrawalStartLabel,
        withdrawalLiquidityDepletedFromMonth,
        withdrawalLiquidityDepletedFromLabel,
      };

      const withdrawalResult = processWithdrawal({
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
        syncBalance,
        onNetPayout: (netPayout) => {
          totalWithdrawn += netPayout;
          pushIrrFlow(month, netPayout);
        },
        onTax: (tax) => {
          totalTaxPaid += tax;
          totalWithdrawalTax += tax;
        },
        onCostBasisReduced: (amount) => {
          costBasis -= amount;
        },
      });

      monthPayoutNominal = withdrawalResult.monthPayoutNominal;
      monthPayoutReal = withdrawalResult.monthPayoutReal;
      monthPayoutTargetReal = withdrawalResult.monthPayoutTargetReal;
      monthPayoutCapped = withdrawalResult.monthPayoutCapped;
      withdrawalMonthsWithoutPayout +=
        withdrawalResult.withdrawalMonthsWithoutPayoutDelta;
      withdrawalMonthsLiquidityEmpty +=
        withdrawalResult.withdrawalMonthsLiquidityEmptyDelta;

      if (withdrawalResult.withdrawalLiquidityDepletedFromLabel) {
        withdrawalLiquidityDepletedFromMonth = month;
        withdrawalLiquidityDepletedFromLabel =
          withdrawalResult.withdrawalLiquidityDepletedFromLabel;
      }

      if (withdrawalResult.lastWithdrawalPayoutNominal != null) {
        lastWithdrawalPayoutNominal = withdrawalResult.lastWithdrawalPayoutNominal;
        lastWithdrawalPayoutReal = withdrawalResult.lastWithdrawalPayoutReal ?? 0;
        withdrawalLastPayoutMonth = withdrawalResult.withdrawalLastPayoutMonth;
        withdrawalLastPayoutLabel = withdrawalResult.withdrawalLastPayoutLabel;
      }

      if (withdrawalResult.withdrawalStartLiquidity != null) {
        withdrawalStartLiquidity = withdrawalResult.withdrawalStartLiquidity;
      }
      if (withdrawalResult.withdrawalStartLabel) {
        withdrawalStartLabel = withdrawalResult.withdrawalStartLabel;
        withdrawalStartPayoutNominal =
          withdrawalResult.withdrawalStartPayoutNominal ?? 0;
        withdrawalStartPayoutReal =
          withdrawalResult.withdrawalStartPayoutReal ?? 0;
      }
    } else if (inWithdrawalPhase) {
      const startUpdate = markWithdrawalStartWithoutPayout(
        getInvestableBalance(),
        month,
        {
          withdrawalStartLiquidity,
          withdrawalStartPayoutNominal,
          withdrawalStartPayoutReal,
          withdrawalStartLabel,
          withdrawalLiquidityDepletedFromMonth,
          withdrawalLiquidityDepletedFromLabel,
        },
      );
      if (startUpdate.withdrawalStartLiquidity != null) {
        withdrawalStartLiquidity = startUpdate.withdrawalStartLiquidity;
        withdrawalStartLabel = startUpdate.withdrawalStartLabel ?? null;
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
    const shouldSnapshot =
      options?.allMonths ||
      month % step === 0 ||
      month === months ||
      month === withdrawalLastPayoutMonth ||
      month === firstMonthWithoutPayout ||
      month === withdrawalLiquidityDepletedFromMonth ||
      month === firstWithdrawalMonth;
    if (shouldSnapshot) {
      points.push(
        takeSnapshot(
          month,
          monthPayoutNominal,
          monthPayoutReal,
          monthPayoutTargetReal,
          inWithdrawalPhase,
          monthPayoutCapped,
          monthBrokerInvest,
          monthDebtPayment,
          monthDebtPrincipal,
          monthDebtInterest,
          monthWealthBuilding,
          monthCashOutflow,
          monthTotalContribution,
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
