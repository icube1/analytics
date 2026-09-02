import type { BrokerReport } from "./portfolio-types";
import {
  emptyLedger,
  importBrokerReport,
  ledgerToBrokerReport,
  parseSberPortfolioHtml,
} from "./broker-adapters";

/**
 * Legacy compatibility facade for Sber HTML portfolio reports.
 * Prefer `importBrokerReport` for detection, warnings, and reconciliation.
 */
export function parsePortfolioHtml(html: string): BrokerReport {
  const imported = importBrokerReport({
    content: html,
    fileName: "portfolio.html",
  });

  if (imported.report) {
    return imported.report;
  }

  if (/<html[\s>]/i.test(html)) {
    const parsed = parseSberPortfolioHtml(html);
    return ledgerToBrokerReport(parsed.ledger);
  }

  return ledgerToBrokerReport(emptyLedger());
}

export { importBrokerReport } from "./broker-adapters";
