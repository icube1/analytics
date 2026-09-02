import type { InvestApiMoneyValue, InvestApiQuotation } from "./contracts/invest-api-v1";

const NANO_SCALE = 1_000_000_000;

function parseUnits(units: string | number | undefined): number {
  if (units == null || units === "") return 0;
  const parsed = typeof units === "number" ? units : Number(units);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNano(nano: number | undefined): number {
  if (nano == null || !Number.isFinite(nano)) return 0;
  return nano / NANO_SCALE;
}

/**
 * Convert T-Invest API MoneyValue (units + nano + currency) to a JS number.
 * Sign follows units; nano must share the sign per API contract.
 */
export function moneyValueToNumber(
  value: InvestApiMoneyValue | null | undefined,
): number {
  if (!value) return 0;
  const units = parseUnits(value.units);
  const nano = parseNano(value.nano);
  if (units < 0 || nano < 0) {
    return units - Math.abs(nano);
  }
  return units + nano;
}

/** Convert T-Invest API Quotation (units + nano, no currency) to a JS number. */
export function quotationToNumber(
  value: InvestApiQuotation | null | undefined,
): number {
  if (!value) return 0;
  const units = parseUnits(value.units);
  const nano = parseNano(value.nano);
  if (units < 0 || nano < 0) {
    return units - Math.abs(nano);
  }
  return units + nano;
}
