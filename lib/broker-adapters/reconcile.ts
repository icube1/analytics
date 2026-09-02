import { BROKER_IMPORT_LIMITS } from "./limits";
import type { BrokerImportReconciliation, BrokerNormalizedLedger } from "./types";

export function emptyReconciliation(): BrokerImportReconciliation {
  return {
    assetsEndReported: null,
    assetsEndComputed: null,
    securitiesEndReported: null,
    securitiesEndComputed: null,
    cashEndReported: null,
    cashEndComputed: null,
    assetsDelta: null,
    securitiesDelta: null,
    cashDelta: null,
    withinTolerance: true,
  };
}

export function reconcileBrokerLedger(
  ledger: BrokerNormalizedLedger,
): BrokerImportReconciliation {
  const securitiesEndComputed = ledger.securities.reduce(
    (sum, position) => sum + position.valueEnd,
    0,
  );
  const cashEndComputed = ledger.cash
    .filter((item) => item.currency === "RUB")
    .reduce((sum, item) => sum + item.end, ledger.cashEnd);

  const assetsEndComputed = securitiesEndComputed + cashEndComputed;
  const tolerance = BROKER_IMPORT_LIMITS.reconciliationToleranceRub;

  const securitiesDelta =
    ledger.securitiesEnd > 0
      ? securitiesEndComputed - ledger.securitiesEnd
      : null;
  const cashDelta =
    ledger.cashEnd > 0 ? cashEndComputed - ledger.cashEnd : null;
  const assetsDelta =
    ledger.assetsEnd > 0 ? assetsEndComputed - ledger.assetsEnd : null;

  const withinTolerance =
    (assetsDelta == null || Math.abs(assetsDelta) <= tolerance) &&
    (securitiesDelta == null || Math.abs(securitiesDelta) <= tolerance) &&
    (cashDelta == null || Math.abs(cashDelta) <= tolerance);

  return {
    assetsEndReported: ledger.assetsEnd || null,
    assetsEndComputed,
    securitiesEndReported: ledger.securitiesEnd || null,
    securitiesEndComputed,
    cashEndReported: ledger.cashEnd || null,
    cashEndComputed,
    assetsDelta,
    securitiesDelta,
    cashDelta,
    withinTolerance,
  };
}
