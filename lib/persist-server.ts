import fs from "node:fs";
import path from "node:path";
import "./broker-adapters/install-node-dom-parser";
import { backfillDebtHistoryFromSnapshots } from "./debt-history";
import { enrichBrokerReport } from "./broker-positions";
import { mergePortfolioStorage } from "./merge-portfolio-storage";
import { parsePortfolioHtml } from "./parse-portfolio-html";
import {
  DEFAULT_DOCUMENT,
  type PortfolioDocument,
} from "./portfolio-types";
import { ensureDataDir, getDataDir } from "./project-paths";

const DOC_FILE = "portfolio.json";
const BROKER_HTML = "broker-report.html";

function getDocPath(): string {
  return path.join(getDataDir(), DOC_FILE);
}

export function getBrokerHtmlPath(): string {
  return path.join(getDataDir(), BROKER_HTML);
}

export function readPortfolioDocument(): PortfolioDocument {
  const docPath = getDocPath();

  if (!fs.existsSync(docPath)) {
    return { ...DEFAULT_DOCUMENT };
  }

  try {
    const raw = fs.readFileSync(docPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PortfolioDocument>;
    const merged = mergePortfolioStorage(parsed);
    const brokerSnapshots = parsed.brokerSnapshots ?? [];
    const html = readBrokerHtml();
    const brokerReport = html
      ? parsePortfolioHtml(html)
      : enrichBrokerReport(parsed.brokerReport ?? null);
    return {
      ...merged,
      version: 1,
      updatedAt: parsed.updatedAt ?? merged.updatedAt,
      brokerReport,
      brokerSnapshots,
      debtBalanceHistory: backfillDebtHistoryFromSnapshots(
        parsed.debtBalanceHistory ?? [],
        brokerSnapshots,
      ),
      forecastPlans: parsed.forecastPlans ?? [],
    };
  } catch {
    return { ...DEFAULT_DOCUMENT };
  }
}

export function writePortfolioDocument(doc: PortfolioDocument): void {
  ensureDataDir();

  const payload: PortfolioDocument = {
    ...doc,
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(getDocPath(), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function writeBrokerHtml(html: string): void {
  ensureDataDir();
  fs.writeFileSync(getBrokerHtmlPath(), html, "utf-8");
}

export function readBrokerHtml(): string | null {
  const filePath = getBrokerHtmlPath();
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}
