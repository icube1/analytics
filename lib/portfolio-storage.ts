import { normalizeCustomAssets } from "./custom-assets";
import { createBrokerSnapshot } from "./tracking";
import {
  appendDebtBalanceIfChanged,
  appendDebtFromAssets,
  backfillDebtHistoryFromSnapshots,
} from "./debt-history";
import { getTotalDebtBalance } from "./debt-amortization";
import { mergePortfolioStorage, isEmptyDocument } from "./merge-portfolio-storage";
import { enrichBrokerReport } from "./broker-positions";
import { normalizeCompoundParams } from "./normalize-compound-params";
import {
  describeBrokerUploadError,
  importUploadedBrokerFile,
  type BrokerImportProvenance,
  type BrokerImportReconciliation,
  type BrokerImportResult,
  type BrokerImportWarning,
} from "./broker-adapters";
import type { BrokerConnectorSyncResult } from "./broker-connectors";
import { apiFetch } from "./api-base";
import { readPortfolioFromDb, writePortfolioToDb } from "./browser-idb";
import { schedulePortfolioPersistence } from "./session-sync/backup-adapter";
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
    brokerReport: enrichBrokerReport(data.brokerReport ?? null),
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
  schedulePortfolioPersistence();
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
    const res = await apiFetch("/api/portfolio");
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

  const normalized = doc ?? { ...DEFAULT_DOCUMENT };
  const enrichedReport = enrichBrokerReport(normalized.brokerReport);
  if (enrichedReport !== normalized.brokerReport) {
    return writeStoredDocument({
      ...normalized,
      brokerReport: enrichedReport,
    });
  }

  return normalized;
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

export interface BrokerUploadResult {
  report: PortfolioDocument["brokerReport"];
  fileName: string;
  provenance: BrokerImportProvenance;
  warnings: BrokerImportWarning[];
  reconciliation: BrokerImportReconciliation | null;
}

export async function uploadBrokerReport(
  file: File,
): Promise<BrokerUploadResult> {
  const content = await file.text();
  const fileName = file.name || "broker-report.html";
  const imported = await importBrokerFileOffMainThread(
    content,
    fileName,
    file.type || undefined,
  );

  if (!imported.ok || !imported.report) {
    throw new Error(describeBrokerUploadError(imported, fileName));
  }

  const report = imported.report;
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

  return {
    report,
    fileName,
    provenance: imported.provenance,
    warnings: imported.warnings,
    reconciliation: imported.reconciliation,
  };
}

export async function applyBrokerConnectorReport(
  result: BrokerConnectorSyncResult,
): Promise<BrokerUploadResult> {
  if (!result.ok || !result.report) {
    const detail = result.errors[0]?.message ?? "Broker connector sync failed";
    throw new Error(detail);
  }

  const report = result.report;
  const fileName = `tbank-invest-api:${result.provenance.accountId ?? "account"}`;
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

  return {
    report,
    fileName,
    provenance: {
      adapterId: "tbank-xlsx",
      adapterVersion: result.provenance.connectorVersion,
      adapterLabel: result.provenance.connectorLabel,
      fileName,
      mimeType: "application/json",
      contentBytes: 0,
      sanitized: true,
      detectedAt: result.provenance.syncedAt,
    },
    warnings: result.warnings,
    reconciliation: result.reconciliation,
  };
}

async function importBrokerFileOffMainThread(
  content: string,
  fileName: string,
  mimeType?: string,
): Promise<BrokerImportResult> {
  if (typeof Worker === "undefined") {
    return importUploadedBrokerFile(content, fileName, mimeType);
  }

  try {
    const { importBrokerReportInWorker } = await import(
      "./broker-adapters/worker-client"
    );
    return await importBrokerReportInWorker({ content, fileName, mimeType });
  } catch {
    return importUploadedBrokerFile(content, fileName, mimeType);
  }
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
