export const BROKER_IMPORT_LIMITS = {
  maxContentBytes: 12 * 1024 * 1024,
  maxSecurities: 5_000,
  maxCashRows: 500,
  maxCashFlows: 20_000,
  maxTrades: 50_000,
  maxCsvRows: 25_000,
  reconciliationToleranceRub: 1.0,
} as const;

export function assertContentWithinLimits(
  content: string,
): { ok: true; bytes: number } | { ok: false; bytes: number } {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > BROKER_IMPORT_LIMITS.maxContentBytes) {
    return { ok: false, bytes };
  }
  return { ok: true, bytes };
}
