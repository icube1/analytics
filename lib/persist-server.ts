import fs from "node:fs";
import path from "node:path";
import { backfillDebtHistoryFromSnapshots } from "./debt-history";
import { enrichBrokerReport } from "./broker-positions";
import {
  combinedReportFromAccounts,
  normalizeBrokerAccounts,
} from "./merge-broker-reports";
import { mergePortfolioStorage } from "./merge-portfolio-storage";
import { parsePortfolioHtml } from "./parse-portfolio-html";
import {
  DEFAULT_DOCUMENT,
  type PortfolioDocument,
} from "./portfolio-types";
import { ensureDataDir } from "./project-paths";

const DOC_FILE = "portfolio.json";
const BROKER_HTML = "broker-report.html";
/** Мультипортфельное хранилище: data/portfolios/<id>.json */
const PORTFOLIOS_DIR = "portfolios";

function getDocPath(): string {
  return path.join(ensureDataDir(), DOC_FILE);
}

function getBrokerHtmlPath(): string {
  return path.join(ensureDataDir(), BROKER_HTML);
}

function getPortfoliosDir(): string {
  const dir = path.join(ensureDataDir(), PORTFOLIOS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizePortfolioId(id: string): string {
  const safe = (id || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  return safe || "default";
}

function getPortfolioPath(id: string): string {
  return path.join(getPortfoliosDir(), `${sanitizePortfolioId(id)}.json`);
}

function brokerHtmlPathFor(id: string): string {
  const safe = sanitizePortfolioId(id);
  const base = getBrokerHtmlPath();
  return safe === "default" ? base : base.replace(/\.html$/, `.${safe}.html`);
}

function readPortfolioDocument(id = "default"): PortfolioDocument {
  const portfolioPath = getPortfolioPath(id);
  const legacyPath = getDocPath();
  // data/portfolios/<id>.json → data/portfolio.json (только для default)
  const docPath = fs.existsSync(portfolioPath)
    ? portfolioPath
    : id === "default" && fs.existsSync(legacyPath)
      ? legacyPath
      : null;

  if (!docPath) {
    return { ...DEFAULT_DOCUMENT, id: sanitizePortfolioId(id) };
  }

  try {
    const raw = fs.readFileSync(docPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PortfolioDocument>;
    const merged = mergePortfolioStorage(parsed);
    const brokerSnapshots = parsed.brokerSnapshots ?? [];
    const lastFileName =
      parsed.lastBrokerFileName ?? DEFAULT_DOCUMENT.lastBrokerFileName;
    let brokerAccounts = normalizeBrokerAccounts(
      parsed.brokerAccounts,
      enrichBrokerReport(parsed.brokerReport ?? null),
      lastFileName,
    );
    if (!Array.isArray(parsed.brokerAccounts) && brokerAccounts.length === 0) {
      const html = readBrokerHtml();
      const fromHtml = html ? parsePortfolioHtml(html, lastFileName) : null;
      brokerAccounts = normalizeBrokerAccounts(undefined, fromHtml, lastFileName);
    }
    const brokerReport = combinedReportFromAccounts(
      brokerAccounts.map((account) => ({
        ...account,
        report: enrichBrokerReport(account.report) ?? account.report,
      })),
    );
    return {
      ...merged,
      id: sanitizePortfolioId(parsed.id ?? id),
      version: 1,
      updatedAt: parsed.updatedAt ?? merged.updatedAt,
      lastBrokerFileName: lastFileName,
      brokerAccounts,
      brokerReport,
      brokerSnapshots,
      debtBalanceHistory: backfillDebtHistoryFromSnapshots(
        parsed.debtBalanceHistory ?? [],
        brokerSnapshots,
      ),
      forecastPlans: parsed.forecastPlans ?? [],
    };
  } catch {
    return { ...DEFAULT_DOCUMENT, id: sanitizePortfolioId(id) };
  }
}

function writePortfolioDocument(doc: PortfolioDocument): void {
  ensureDataDir();

  const payload: PortfolioDocument = {
    ...doc,
    id: sanitizePortfolioId(doc.id ?? "default"),
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    getPortfolioPath(payload.id),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf-8",
  );
}

/** Все портфели из data/portfolios/. Пустой каталог → единственный legacy-документ. */
function listPortfolios(): PortfolioDocument[] {
  const dir = getPortfoliosDir();
  const ids = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""));

  if (ids.length === 0) {
    if (fs.existsSync(getDocPath())) return [readPortfolioDocument("default")];
    return [];
  }

  return ids.sort().map((id) => readPortfolioDocument(id));
}

/** Компактный список для селектора в UI. */
function listPortfolioSummaries(): {
  id: string;
  groupId?: string;
  title?: string;
  updatedAt: string;
  accounts: number;
}[] {
  return listPortfolios().map((doc) => ({
    id: doc.id,
    groupId: doc.groupId,
    title: doc.title,
    updatedAt: doc.updatedAt,
    accounts: doc.brokerAccounts?.length ?? 0,
  }));
}

function createPortfolioDocument(
  id?: string,
  groupId?: string,
): PortfolioDocument {
  const nextId = sanitizePortfolioId(
    id ?? `portfolio-${Date.now().toString(36)}`,
  );
  const doc: PortfolioDocument = {
    ...DEFAULT_DOCUMENT,
    id: nextId,
    groupId,
    updatedAt: new Date().toISOString(),
  };
  writePortfolioDocument(doc);
  return doc;
}

function deletePortfolioDocument(id: string): boolean {
  const target = getPortfolioPath(id);
  if (!fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  return true;
}

function writeBrokerHtml(html: string, id = "default"): void {
  ensureDataDir();
  fs.writeFileSync(brokerHtmlPathFor(id), html, "utf-8");
}

function readBrokerHtml(id = "default"): string | null {
  const filePath = brokerHtmlPathFor(id);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

export {
  getDocPath,
  getBrokerHtmlPath,
  getPortfolioPath,
  readPortfolioDocument,
  writePortfolioDocument,
  writeBrokerHtml,
  readBrokerHtml,
  listPortfolios,
  listPortfolioSummaries,
  createPortfolioDocument,
  deletePortfolioDocument,
  sanitizePortfolioId,
};
