import type { CompoundParams } from "../portfolio-types";

/** Налог на дивиденды по акциям/ПИФам */
export function dividendTax(
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

export function withdrawalGainTax(
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
