import type { CompoundParams } from "../portfolio-types";
import { LIQUIDITY_EPS } from "./constants";
import { formatMonthLabel } from "./format";
import { withdrawalGainTax } from "./taxes";
import type { WithdrawalMonthResult } from "./types";

export interface WithdrawalState {
  withdrawalStartLiquidity: number | null;
  withdrawalStartPayoutNominal: number;
  withdrawalStartPayoutReal: number;
  withdrawalStartLabel: string | null;
  withdrawalLiquidityDepletedFromMonth: number | null;
  withdrawalLiquidityDepletedFromLabel: string | null;
}

export interface ProcessWithdrawalInput {
  month: number;
  params: CompoundParams;
  monthlyInflation: number;
  withdrawalMode: "fixed" | "percent";
  monthlyWithdrawalReal: number;
  monthlyWithdrawalFromAnnual: number;
  annualWithdrawalPercent: number;
  investableBefore: number;
  costBasis: number;
  state: WithdrawalState;
  setInvestableBalance: (value: number) => void;
  getInvestableBalance: () => number;
  syncBalance: () => void;
  onNetPayout: (netPayout: number) => void;
  onTax: (tax: number) => void;
  onCostBasisReduced: (amount: number) => void;
}

export function processWithdrawal(
  input: ProcessWithdrawalInput,
): WithdrawalMonthResult {
  const {
    month,
    params,
    monthlyInflation,
    withdrawalMode,
    monthlyWithdrawalReal,
    monthlyWithdrawalFromAnnual,
    investableBefore,
    costBasis,
    state,
    setInvestableBalance,
    getInvestableBalance,
    syncBalance,
    onNetPayout,
    onTax,
    onCostBasisReduced,
  } = input;

  const inflationFactor = (1 + monthlyInflation) ** month;
  let monthPayoutNominal = 0;
  let monthPayoutReal = 0;
  let monthPayoutTargetReal = 0;
  let monthPayoutCapped = false;
  let withdrawalMonthsWithoutPayoutDelta = 0;
  let withdrawalMonthsLiquidityEmptyDelta = 0;
  let withdrawalLiquidityDepletedFromLabel: string | null = null;
  let lastWithdrawalPayoutNominal: number | null = null;
  let lastWithdrawalPayoutReal: number | null = null;
  let withdrawalLastPayoutMonth: number | null = null;
  let withdrawalLastPayoutLabel: string | null = null;
  let withdrawalStartLiquidity = state.withdrawalStartLiquidity;
  let withdrawalStartPayoutNominal: number | null = null;
  let withdrawalStartPayoutReal: number | null = null;
  let withdrawalStartLabel: string | null = null;

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
    withdrawalMonthsLiquidityEmptyDelta = 1;
    if (state.withdrawalLiquidityDepletedFromMonth === null) {
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
      onTax(tax);
    }
    const netPayout = payout - tax;
    onNetPayout(netPayout);
    onCostBasisReduced(principalReturned);
    monthPayoutNominal = netPayout;
    monthPayoutReal = netPayout / inflationFactor;
    lastWithdrawalPayoutNominal = monthPayoutNominal;
    lastWithdrawalPayoutReal = monthPayoutReal;
    withdrawalLastPayoutMonth = month;
    withdrawalLastPayoutLabel = formatMonthLabel(month);
    syncBalance();
  } else if (withdrawalFailed) {
    withdrawalMonthsWithoutPayoutDelta = 1;
  }

  if (state.withdrawalStartLabel === null) {
    withdrawalStartLabel = formatMonthLabel(month);
    withdrawalStartPayoutNominal = monthPayoutNominal;
    withdrawalStartPayoutReal = monthPayoutReal;
  }

  return {
    monthPayoutNominal,
    monthPayoutReal,
    monthPayoutTargetReal,
    monthPayoutCapped,
    withdrawalMonthsWithoutPayoutDelta,
    withdrawalMonthsLiquidityEmptyDelta,
    withdrawalLiquidityDepletedFromLabel,
    lastWithdrawalPayoutNominal,
    lastWithdrawalPayoutReal,
    withdrawalLastPayoutMonth,
    withdrawalLastPayoutLabel,
    withdrawalStartLiquidity,
    withdrawalStartPayoutNominal,
    withdrawalStartPayoutReal,
    withdrawalStartLabel,
  };
}

export function markWithdrawalStartWithoutPayout(
  investableBalance: number,
  month: number,
  state: WithdrawalState,
): Partial<WithdrawalState> {
  if (state.withdrawalStartLiquidity !== null) {
    return {};
  }

  return {
    withdrawalStartLiquidity: investableBalance,
    withdrawalStartLabel: formatMonthLabel(month),
  };
}
