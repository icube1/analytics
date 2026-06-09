import fs from "node:fs";
import path from "node:path";
import { mergePortfolioStorage } from "./merge-portfolio-storage";
import {
  DEFAULT_DOCUMENT,
  type PortfolioDocument,
} from "./portfolio-types";

const DOC_FILE = "portfolio.json";
const BROKER_HTML = "broker-report.html";

export function getDataDirs(): string[] {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "data"),
    path.join(cwd, "..", "data"),
  ];
  return [...new Set(candidates)];
}

export function getPrimaryDataDir(): string {
  const dirs = getDataDirs();
  const existing = dirs.find((dir) => fs.existsSync(dir));
  if (existing) return existing;

  const primary = dirs[0];
  fs.mkdirSync(primary, { recursive: true });
  return primary;
}

function getDocPath(): string {
  return path.join(getPrimaryDataDir(), DOC_FILE);
}

export function getBrokerHtmlPath(): string {
  return path.join(getPrimaryDataDir(), BROKER_HTML);
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
    return {
      ...merged,
      version: 1,
      updatedAt: parsed.updatedAt ?? merged.updatedAt,
      brokerReport: parsed.brokerReport ?? null,
    };
  } catch {
    return { ...DEFAULT_DOCUMENT };
  }
}

export function writePortfolioDocument(doc: PortfolioDocument): void {
  const dir = getPrimaryDataDir();
  fs.mkdirSync(dir, { recursive: true });

  const payload: PortfolioDocument = {
    ...doc,
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(getDocPath(), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function writeBrokerHtml(html: string): void {
  const dir = getPrimaryDataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getBrokerHtmlPath(), html, "utf-8");
}

export function readBrokerHtml(): string | null {
  const filePath = getBrokerHtmlPath();
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}
