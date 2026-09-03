export type RoundingMode = "halfAwayFromZero" | "halfEven" | "towardZero";

export type CurrencyCode = string;

export interface MoneyAmount {
  currency: CurrencyCode;
  minor: number;
  major: number;
  exponent: number;
}

export interface MoneyRoundInput {
  major: number;
  currency: CurrencyCode;
  mode?: RoundingMode;
}

export interface MoneyAddInput {
  leftMinor: number;
  rightMinor: number;
  currency: CurrencyCode;
}

export interface MoneyInterestInput {
  principalMinor: number;
  annualRatePercent: number;
  periodDays: number;
  yearDays?: number;
  currency: CurrencyCode;
  mode?: RoundingMode;
}

export interface MoneyAmortizeInput {
  balanceMinor: number;
  paymentMinor: number;
  annualRatePercent: number;
  periodDays: number;
  yearDays?: number;
  currency: CurrencyCode;
  mode?: RoundingMode;
}

export interface MoneyAmortizeResult {
  currency: CurrencyCode;
  exponent: number;
  balanceMinor: number;
  interestMinor: number;
  principalMinor: number;
  balanceMajor: number;
  interestMajor: number;
  principalMajor: number;
}

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "CLP"]);
const THREE_DECIMAL_CURRENCIES = new Set(["KWD", "BHD", "OMR", "JOD"]);

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function currencyExponent(currency: CurrencyCode): number {
  const code = normalizeCurrency(currency);
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export function normalizeCurrency(currency: CurrencyCode): string {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new MoneyError(`invalid currency code ${currency}`);
  }
  return code;
}

export function defaultRoundingMode(): RoundingMode {
  return "halfAwayFromZero";
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer`);
  }
}

function roundScaled(scaled: number, mode: RoundingMode): number {
  if (!Number.isFinite(scaled)) {
    throw new MoneyError("non-finite money amount");
  }

  if (mode === "towardZero") {
    return Math.trunc(scaled);
  }

  if (mode === "halfAwayFromZero") {
    if (scaled === 0) return 0;
    return Math.sign(scaled) * Math.trunc(Math.abs(scaled) + 0.5);
  }

  const sign = scaled < 0 ? -1 : 1;
  const abs = Math.abs(scaled);
  const truncated = Math.trunc(abs);
  const fraction = abs - truncated;
  if (fraction > 0.5) {
    return sign * (truncated + 1);
  }
  if (fraction < 0.5) {
    return sign * truncated;
  }
  return sign * (truncated % 2 === 0 ? truncated : truncated + 1);
}

export function moneyFromMajor(
  major: number,
  currency: CurrencyCode,
  mode: RoundingMode = defaultRoundingMode(),
): MoneyAmount {
  const code = normalizeCurrency(currency);
  const exponent = currencyExponent(code);
  const factor = 10 ** exponent;
  const minor = roundScaled(major * factor, mode);
  assertSafeInteger(minor, "minor units");
  return {
    currency: code,
    minor,
    major: minor / factor,
    exponent,
  };
}

export function moneyFromMinor(
  minor: number,
  currency: CurrencyCode,
): MoneyAmount {
  const code = normalizeCurrency(currency);
  assertSafeInteger(minor, "minor units");
  const exponent = currencyExponent(code);
  const factor = 10 ** exponent;
  return {
    currency: code,
    minor,
    major: minor / factor,
    exponent,
  };
}

export function roundMoney(input: MoneyRoundInput): MoneyAmount {
  return moneyFromMajor(
    input.major,
    input.currency,
    input.mode ?? defaultRoundingMode(),
  );
}

export function addMoney(input: MoneyAddInput): MoneyAmount {
  const code = normalizeCurrency(input.currency);
  assertSafeInteger(input.leftMinor, "leftMinor");
  assertSafeInteger(input.rightMinor, "rightMinor");
  const sum = input.leftMinor + input.rightMinor;
  assertSafeInteger(sum, "sum");
  return moneyFromMinor(sum, code);
}

export function interestMoney(input: MoneyInterestInput): MoneyAmount {
  const code = normalizeCurrency(input.currency);
  assertSafeInteger(input.principalMinor, "principalMinor");
  if (!Number.isInteger(input.periodDays) || input.periodDays < 0) {
    throw new MoneyError("periodDays must be a non-negative integer");
  }
  const yearDays = input.yearDays ?? 365;
  if (!Number.isInteger(yearDays) || yearDays <= 0) {
    throw new MoneyError("yearDays must be a positive integer");
  }
  const mode = input.mode ?? defaultRoundingMode();
  const accrued =
    input.principalMinor *
    (input.annualRatePercent / 100) *
    (input.periodDays / yearDays);
  const minor = roundScaled(accrued, mode);
  assertSafeInteger(minor, "interest minor units");
  return moneyFromMinor(minor, code);
}

export function amortizeMoney(input: MoneyAmortizeInput): MoneyAmortizeResult {
  const code = normalizeCurrency(input.currency);
  assertSafeInteger(input.balanceMinor, "balanceMinor");
  assertSafeInteger(input.paymentMinor, "paymentMinor");
  const exponent = currencyExponent(code);
  const factor = 10 ** exponent;
  const empty = (balanceMinor: number): MoneyAmortizeResult => ({
    currency: code,
    exponent,
    balanceMinor: Math.max(0, balanceMinor),
    interestMinor: 0,
    principalMinor: 0,
    balanceMajor: Math.max(0, balanceMinor) / factor,
    interestMajor: 0,
    principalMajor: 0,
  });

  if (input.balanceMinor <= 0 || input.paymentMinor <= 0) {
    return empty(input.balanceMinor);
  }

  const interest = interestMoney({
    principalMinor: input.balanceMinor,
    annualRatePercent: input.annualRatePercent,
    periodDays: input.periodDays,
    yearDays: input.yearDays,
    currency: code,
    mode: input.mode,
  });
  const interestMinor = Math.max(0, interest.minor);
  // Interest is the full rounded accrual. When it exceeds the payment, principal
  // is 0 and the balance is unchanged — unpaid interest is not capitalized.
  const principalMinor = Math.max(
    0,
    Math.min(input.balanceMinor, input.paymentMinor - interestMinor),
  );
  const balanceMinor = Math.max(0, input.balanceMinor - principalMinor);
  return {
    currency: code,
    exponent,
    balanceMinor,
    interestMinor,
    principalMinor,
    balanceMajor: balanceMinor / factor,
    interestMajor: interestMinor / factor,
    principalMajor: principalMinor / factor,
  };
}
