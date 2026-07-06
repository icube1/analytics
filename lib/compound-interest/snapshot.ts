import {
  getTotalDebtFromState,
  type WealthSimulationState,
} from "../debt-amortization";
import type { CustomAssets } from "../portfolio-types";
import { buildAssetBreakdown } from "./asset-breakdown";
import type { AssetBreakdownEntry, CompoundPoint } from "./types";

export interface SnapshotInput {
  month: number;
  balance: number;
  contributed: number;
  realContributed: number;
  inflationHurdle: number;
  totalWithdrawn: number;
  monthlyInflation: number;
  monthPayoutNominal: number;
  monthPayoutReal: number;
  monthPayoutTargetReal: number;
  inWithdrawalPhase: boolean;
  monthPayoutCapped: boolean;
  monthlyBrokerInvest: number;
  monthlyDebtPayment: number;
  monthlyDebtPrincipal: number;
  monthlyDebtInterest: number;
  monthlyWealthBuilding: number;
  monthlyCashOutflow: number;
  monthlyTotalContribution: number;
  getInvestableBalance: () => number;
  wealthState: WealthSimulationState | null;
  customAssets: CustomAssets | null;
}

export function buildSnapshot(input: SnapshotInput): CompoundPoint {
  const inflationFactor = (1 + input.monthlyInflation) ** input.month;
  const netWealth = input.balance + input.totalWithdrawn;
  const profit = netWealth - input.contributed;
  const totalDebt = input.wealthState
    ? getTotalDebtFromState(input.wealthState)
    : 0;
  const liquidityBalance = input.getInvestableBalance();
  let assetBreakdown: AssetBreakdownEntry[] = [];

  if (input.wealthState && input.customAssets) {
    assetBreakdown = buildAssetBreakdown(input.wealthState, input.customAssets);
  }

  return {
    month: input.month,
    year: Math.floor(input.month / 12),
    label:
      input.month === 0
        ? "Старт"
        : `${Math.floor(input.month / 12)}г ${input.month % 12}м`,
    balance: input.balance,
    realBalance: input.balance / inflationFactor,
    contributed: input.contributed,
    realContributed: input.realContributed,
    inflationHurdle: input.inflationHurdle,
    withdrawn: input.totalWithdrawn,
    monthlyPayoutNominal: input.monthPayoutNominal,
    monthlyPayoutReal: input.monthPayoutReal,
    monthlyPayoutTargetReal: input.monthPayoutTargetReal,
    liquidityBalance,
    inWithdrawalPhase: input.inWithdrawalPhase,
    monthlyPayoutCapped: input.monthPayoutCapped,
    assetBreakdown,
    totalDebt,
    monthlyBrokerInvest: input.monthlyBrokerInvest,
    monthlyDebtPayment: input.monthlyDebtPayment,
    monthlyDebtPrincipal: input.monthlyDebtPrincipal,
    monthlyDebtInterest: input.monthlyDebtInterest,
    monthlyWealthBuilding: input.monthlyWealthBuilding,
    monthlyCashOutflow: input.monthlyCashOutflow,
    monthlyTotalContribution: input.monthlyTotalContribution,
    profit,
    profitAfterTax: profit,
  };
}
