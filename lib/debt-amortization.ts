import {
  getAssetMonthlyIncome,
  getAssetCapitalGrowthPercent,
  getEnabledItems,
} from "./custom-assets";
import type { CustomAssetItem, CustomAssets, DebtObligation } from "./portfolio-types";

export interface DebtMonthResult {
  totalPayment: number;
  totalPrincipal: number;
  totalInterest: number;
  assetDebts: number[];
  otherDebts: number[];
}

export interface AssetSimulationState {
  id: string;
  grossValue: number;
  debtBalance: number;
}

export interface WealthSimulationState {
  investmentBalance: number;
  assetItems: AssetSimulationState[];
  otherDebts: number[];
}

export function amortizeDebtMonth(
  balance: number,
  payment: number,
  annualInterestRate: number,
): { balance: number; interest: number; principal: number } {
  if (balance <= 0 || payment <= 0) {
    return { balance: Math.max(0, balance), interest: 0, principal: 0 };
  }

  const monthlyRate = annualInterestRate / 100 / 12;
  const interest = balance * monthlyRate;
  const principal = Math.min(balance, Math.max(0, payment - interest));

  return {
    balance: Math.max(0, balance - principal),
    interest,
    principal,
  };
}

function getOtherDebts(assets: CustomAssets): DebtObligation[] {
  return assets.otherDebts ?? [];
}

export function getEnabledDebts(assets: CustomAssets): DebtObligation[] {
  return getOtherDebts(assets).filter(
    (debt) => debt.enabled && (debt.balance > 0 || debt.monthlyPayment > 0),
  );
}

function getAssetDebtItems(assets: CustomAssets): CustomAssetItem[] {
  return getEnabledItems(assets).filter(
    (item) => item.debt > 0 || item.monthlyDebtPayment > 0,
  );
}

export function getMonthlyDebtService(assets: CustomAssets): number {
  let total = 0;

  for (const item of getAssetDebtItems(assets)) {
    if (item.monthlyDebtPayment > 0) {
      total += item.monthlyDebtPayment;
    }
  }

  for (const debt of getEnabledDebts(assets)) {
    total += debt.monthlyPayment;
  }

  return total;
}

export function getTotalDebtBalance(assets: CustomAssets): number {
  let total = 0;

  for (const item of getEnabledItems(assets)) {
    total += item.debt;
  }

  for (const debt of getEnabledDebts(assets)) {
    total += debt.balance;
  }

  return total;
}

export function estimatePayoffMonths(
  balance: number,
  payment: number,
  annualInterestRate: number,
): number | null {
  if (balance <= 0) return 0;
  if (payment <= 0) return null;

  let remaining = balance;
  let months = 0;
  const maxMonths = 12 * 50;

  while (remaining > 0.01 && months < maxMonths) {
    const step = amortizeDebtMonth(remaining, payment, annualInterestRate);
    if (step.principal <= 0) return null;
    remaining = step.balance;
    months += 1;
  }

  return months > maxMonths ? null : months;
}

export function initWealthSimulationState(
  assets: CustomAssets,
  brokerTotal: number,
): WealthSimulationState {
  return {
    investmentBalance: brokerTotal,
    assetItems: getEnabledItems(assets).map((item) => ({
      id: item.id,
      grossValue: item.value,
      debtBalance: item.debt,
    })),
    otherDebts: getEnabledDebts(assets).map((debt) => debt.balance),
  };
}

export function getTotalDebtFromState(state: WealthSimulationState): number {
  const assetDebt = state.assetItems.reduce((sum, item) => sum + item.debtBalance, 0);
  const otherDebt = state.otherDebts.reduce((sum, balance) => sum + balance, 0);
  return assetDebt + otherDebt;
}

export function getNetWorth(state: WealthSimulationState): number {
  const trackedNet = state.assetItems.reduce(
    (sum, item) => sum + item.grossValue - item.debtBalance,
    0,
  );
  const otherDebt = state.otherDebts.reduce((sum, balance) => sum + balance, 0);
  return state.investmentBalance + trackedNet - otherDebt;
}

export function stepDebtsMonth(
  assets: CustomAssets,
  state: WealthSimulationState,
): DebtMonthResult {
  let totalPayment = 0;
  let totalPrincipal = 0;
  let totalInterest = 0;

  const assetDebtItems = getAssetDebtItems(assets);

  for (let i = 0; i < state.assetItems.length; i++) {
    const sim = state.assetItems[i];
    const item = assetDebtItems.find((candidate) => candidate.id === sim.id);
    if (!item || sim.debtBalance <= 0 || item.monthlyDebtPayment <= 0) continue;

    const step = amortizeDebtMonth(
      sim.debtBalance,
      item.monthlyDebtPayment,
      item.debtAnnualRate,
    );
    sim.debtBalance = step.balance;
    totalPayment += item.monthlyDebtPayment;
    totalPrincipal += step.principal;
    totalInterest += step.interest;
  }

  const enabledDebts = getEnabledDebts(assets);
  for (let i = 0; i < enabledDebts.length; i++) {
    const debt = enabledDebts[i];
    if (state.otherDebts[i] <= 0 || debt.monthlyPayment <= 0) continue;

    const step = amortizeDebtMonth(
      state.otherDebts[i],
      debt.monthlyPayment,
      debt.annualInterestRate,
    );
    state.otherDebts[i] = step.balance;
    totalPayment += debt.monthlyPayment;
    totalPrincipal += step.principal;
    totalInterest += step.interest;
  }

  return {
    totalPayment,
    totalPrincipal,
    totalInterest,
    assetDebts: state.assetItems.map((item) => item.debtBalance),
    otherDebts: [...state.otherDebts],
  };
}

function monthlyRateFromAnnual(
  annualReturnPercent: number,
  rateMethod: "effective" | "simple",
): number {
  return rateMethod === "simple"
    ? annualReturnPercent / 100 / 12
    : (1 + annualReturnPercent / 100) ** (1 / 12) - 1;
}

export function growCustomAssets(
  assets: CustomAssets,
  state: WealthSimulationState,
  inflationPercent: number,
  rateMethod: "effective" | "simple",
): void {
  const itemById = new Map(assets.items.map((item) => [item.id, item]));

  for (const sim of state.assetItems) {
    if (sim.grossValue <= 0) continue;
    const item = itemById.get(sim.id);
    if (!item) continue;

    const annualGrowth = getAssetCapitalGrowthPercent(item, inflationPercent);
    if (annualGrowth <= 0) continue;

    const monthlyRate = monthlyRateFromAnnual(annualGrowth, rateMethod);
    sim.grossValue *= 1 + monthlyRate;
  }
}

export function applyCustomAssetIncome(
  assets: CustomAssets,
  state: WealthSimulationState,
  reinvestReturns: boolean,
): number {
  let totalIncome = 0;

  for (const item of getEnabledItems(assets)) {
    if (item.returnMode !== "income") continue;
    const monthly = getAssetMonthlyIncome(item);
    if (monthly <= 0) continue;
    totalIncome += monthly;
    if (reinvestReturns) {
      state.investmentBalance += monthly;
    }
  }

  return totalIncome;
}
