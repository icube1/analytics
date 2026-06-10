import {
  DEFAULT_COMPOUND_PARAMS,
  type CompoundParams,
} from "./portfolio-types";

type LegacyCompoundParams = Partial<CompoundParams> & {
  monthlyWithdrawalPercent?: number;
};

export function normalizeCompoundParams(
  partial?: LegacyCompoundParams,
): CompoundParams {
  const merged = {
    ...DEFAULT_COMPOUND_PARAMS,
    ...partial,
  };

  let annualWithdrawalPercent = merged.annualWithdrawalPercent;
  if (
    partial?.annualWithdrawalPercent == null &&
    partial?.monthlyWithdrawalPercent != null &&
    partial.monthlyWithdrawalPercent > 0
  ) {
    annualWithdrawalPercent = partial.monthlyWithdrawalPercent * 12;
  } else if (
    merged.withdrawalMode === "percent" &&
    annualWithdrawalPercent > 0 &&
    annualWithdrawalPercent < 1.5
  ) {
    // Раньше вводили % в месяц — значения вроде 0,33 попали в годовое поле
    annualWithdrawalPercent *= 12;
  }

  return {
    ...merged,
    withdrawalMode: merged.withdrawalMode ?? "fixed",
    annualWithdrawalPercent:
      annualWithdrawalPercent ?? DEFAULT_COMPOUND_PARAMS.annualWithdrawalPercent,
  };
}
