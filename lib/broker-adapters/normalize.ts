import { enrichBrokerReport } from "../broker-positions";
import type { BrokerReport } from "../portfolio-types";
import type { BrokerNormalizedLedger } from "./types";

export function ledgerToBrokerReport(ledger: BrokerNormalizedLedger): BrokerReport {
  const report: BrokerReport = {
    periodStart: ledger.periodStart,
    periodEnd: ledger.periodEnd,
    createdAt: ledger.createdAt,
    investor: ledger.investor,
    contract: ledger.contract,
    assetsStart: ledger.assetsStart,
    assetsEnd: ledger.assetsEnd,
    assetsChange: ledger.assetsChange,
    securitiesStart: ledger.securitiesStart,
    securitiesEnd: ledger.securitiesEnd,
    cashStart: ledger.cashStart,
    cashEnd: ledger.cashEnd,
    securities: ledger.securities,
    cash: ledger.cash,
    trades: ledger.trades,
    cashFlows: ledger.cashFlows,
  };

  return enrichBrokerReport(report) ?? report;
}

export function emptyLedger(): BrokerNormalizedLedger {
  return {
    periodStart: "",
    periodEnd: "",
    createdAt: "",
    investor: "",
    contract: "",
    assetsStart: 0,
    assetsEnd: 0,
    assetsChange: 0,
    securitiesStart: 0,
    securitiesEnd: 0,
    cashStart: 0,
    cashEnd: 0,
    securities: [],
    cash: [],
    trades: [],
    cashFlows: [],
  };
}
