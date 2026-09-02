import type { BrokerImportWarning } from "./types";

export interface ParsedBrokerNumber {
  value: number;
  empty: boolean;
}

export interface MalformedBrokerNumber {
  raw: string;
  reason: "malformed" | "non_finite";
}

export type BrokerNumberParseResult =
  | { ok: true; parsed: ParsedBrokerNumber }
  | { ok: false; error: MalformedBrokerNumber };

const EMPTY_MARKERS = new Set(["", "—", "-", "–", "−", "n/a", "N/A"]);

/** Parses broker numeric cells; empty markers become zero, malformed text does not. */
export function parseBrokerNumber(raw: string): BrokerNumberParseResult {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".").trim();
  if (EMPTY_MARKERS.has(cleaned) || EMPTY_MARKERS.has(raw.trim())) {
    return { ok: true, parsed: { value: 0, empty: true } };
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: { raw, reason: "malformed" } };
  }

  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) {
    return { ok: false, error: { raw, reason: "non_finite" } };
  }

  return { ok: true, parsed: { value, empty: false } };
}

export function parseBrokerNumberOrWarn(
  raw: string,
  path: string,
  warnings: BrokerImportWarning[],
): ParsedBrokerNumber {
  const result = parseBrokerNumber(raw);
  if (result.ok) return result.parsed;

  warnings.push({
    code: "INVALID_NUMBER",
    message: `Malformed numeric value at ${path}`,
    path,
    raw: result.error.raw,
  });

  return { value: Number.NaN, empty: false };
}

export function isValidParsedNumber(parsed: ParsedBrokerNumber): boolean {
  return Number.isFinite(parsed.value);
}
