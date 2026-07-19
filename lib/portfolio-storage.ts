import { normalizeCustomAssets } from "./custom-assets";
import { createBrokerSnapshot } from "./tracking";
import {
  appendDebtBalanceIfChanged,
  appendDebtFromAssets,
  backfillDebtHistoryFromSnapshots,
} from "./debt-history";
import { getTotalDebtBalance } from "./debt-amortization";
import { mergePortfolioStorage, isEmptyDocument } from "./merge-portfolio-storage";
import { normalizeCompoundParams } from "./normalize-compound-params";
import { parsePortfolioHtml } from "./parse-portfolio-html";
import { readPortfolioFromDb, writePortfolioToDb } from "./browser-idb";
import { scheduleServerBackupSync } from "./backup-sync";
import {
  DEFAULT_DOCUMENT,
  type PortfolioDocument,
  type SavedForecastPlan,
} from "./portfolio-types";

const LEGACY_STORAGE_KEY = "analytics-portfolio-v1";

function normalizeDocument(data: Partial<PortfolioDocument>): PortfolioDocument {
  const brokerSnapshots = data.brokerSnapshots ?? [];
  const debtBalanceHistory = backfillDebtHistoryFromSnapshots(
    data.debtBalanceHistory ?? [],
    brokerSnapshots,
  );

  return {
    ...DEFAULT_DOCUMENT,
    ...data,
    version: 1,
    customAssets: normalizeCustomAssets(data.customAssets),
    compoundParams: normalizeCompoundParams({
      ...DEFAULT_DOCUMENT.compoundParams,
      ...data.compoundParams,
    }),
    brokerReport: data.brokerReport ?? null,
    brokerSnapshots,
    debtBalanceHistory,
    forecastPlans: data.forecastPlans ?? [],
    lastBrokerFileName:
      data.lastBrokerFileName ?? DEFAULT_DOCUMENT.lastBrokerFileName,
    updatedAt: data.updatedAt ?? DEFAULT_DOCUMENT.updatedAt,
  };
}

async function readStoredDocument(): Promise<PortfolioDocument | null> {
  const stored = await readPortfolioFromDb<PortfolioDocument>();
  if (!stored) return null;
  return normalizeDocument(stored);
}

async function writeStoredDocument(doc: PortfolioDocument): Promise<PortfolioDocument> {
  const payload: PortfolioDocument = {
    ...doc,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  await writePortfolioToDb(payload);
  scheduleServerBackupSync();
  return payload;
}

async function migrateLegacyLocalStorage(): Promise<PortfolioDocument | null> {
  const legacy = readLegacyLocalStorage();
  if (!legacy) return null;

  const doc = normalizeDocument(legacy);
  await writeStoredDocument(doc);
  clearLegacyLocalStorage();
  return doc;
}

async function migrateFromServerIfEmpty(): Promise<PortfolioDocument | null> {
  try {
    const res = await fetch("/api/portfolio");
    if (!res.ok) return null;

    const data = (await res.json()) as PortfolioDocument;
    const doc = normalizeDocument(data);
    if (isEmptyDocument(doc)) return null;

    await writeStoredDocument(doc);
    return doc;
  } catch {
    return null;
  }
}

export async function fetchPortfolioDocument(): Promise<PortfolioDocument> {
  let doc = await readStoredDocument();

  if (!doc || isEmptyDocument(doc)) {
    doc = (await migrateLegacyLocalStorage()) ?? doc;
  }

  if (!doc || isEmptyDocument(doc)) {
    doc = (await migrateFromServerIfEmpty()) ?? doc;
  }

  return doc ?? { ...DEFAULT_DOCUMENT };
}

export async function savePortfolioDocument(
  patch: Partial<PortfolioDocument>,
): Promise<PortfolioDocument> {
  const current = await fetchPortfolioDocument();
  const next = normalizeDocument({
    ...mergePortfolioStorage({
      ...current,
      customAssets: patch.customAssets ?? current.customAssets,
      compoundParams: patch.compoundParams ?? current.compoundParams,
      lastBrokerFileName:
        patch.lastBrokerFileName ?? current.lastBrokerFileName,
    }),
    brokerReport:
      patch.brokerReport !== undefined
        ? patch.brokerReport
        : current.brokerReport,
    brokerSnapshots:
      patch.brokerSnapshots !== undefined
        ? patch.brokerSnapshots
        : current.brokerSnapshots,
    debtBalanceHistory:
      patch.debtBalanceHistory !== undefined
        ? patch.debtBalanceHistory
        : patch.customAssets !== undefined
          ? appendDebtFromAssets(
              current.debtBalanceHistory ?? [],
              patch.customAssets,
            )
          : current.debtBalanceHistory,
    forecastPlans:
      patch.forecastPlans !== undefined
        ? patch.forecastPlans
        : current.forecastPlans,
  });

  return writeStoredDocument(next);
}

export async function addForecastPlan(
  plan: SavedForecastPlan,
): Promise<PortfolioDocument> {
  const current = await fetchPortfolioDocument();
  return savePortfolioDocument({
    forecastPlans: [...current.forecastPlans, plan],
  });
}

export async function removeForecastPlan(
  planId: string,
): Promise<PortfolioDocument> {
  const current = await fetchPortfolioDocument();
  return savePortfolioDocument({
    forecastPlans: current.forecastPlans.filter((plan) => plan.id !== planId),
  });
}

export async function uploadBrokerReport(
  file: File,
): Promise<{ report: PortfolioDocument["brokerReport"]; fileName: string }> {
  const html = await file.text();
  const report = parsePortfolioHtml(html);

  if (report.securities.length === 0 && report.assetsEnd === 0) {
    throw new Error("Не удалось распознать данные в отчёте");
  }

  const fileName = file.name || "broker-report.html";
  const current = await fetchPortfolioDocument();
  const snapshot = createBrokerSnapshot(
    report,
    fileName,
    current.customAssets,
  );
  const debtBalanceHistory = appendDebtBalanceIfChanged(
    current.debtBalanceHistory ?? [],
    getTotalDebtBalance(current.customAssets),
    "broker-upload",
  );

  await savePortfolioDocument({
    lastBrokerFileName: fileName,
    brokerReport: report,
    brokerSnapshots: [...current.brokerSnapshots, snapshot],
    debtBalanceHistory,
  });

  return { report, fileName };
}

export function readLegacyLocalStorage(): Partial<PortfolioDocument> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PortfolioDocument>;
  } catch {
    return null;
  }
}

export function clearLegacyLocalStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
