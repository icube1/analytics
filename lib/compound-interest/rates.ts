import type { CompoundParams } from "../portfolio-types";

export function periodRateFromAnnual(
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

export function monthlyRateFromAnnual(
  annualPercent: number,
  method: CompoundParams["monthlyRateMethod"],
): number {
  return periodRateFromAnnual(annualPercent, 1, method);
}

export function getAccrualPeriod(
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
