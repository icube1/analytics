import {
  listStatementsFromDb,
  readPortfolioFromDb,
  saveAllStatementsToDb,
  writePortfolioToDb,
  type StatementRecord,
} from "./browser-idb";
import {
  BACKUP_FORMAT_VERSION,
  LAST_BACKUP_STORAGE_KEY,
  isAnalyticsBackup,
  type AnalyticsBackup,
} from "./backup-types";
import {
  decryptAnalyticsBackup,
  isEncryptedAnalyticsBackup,
  type EncryptedAnalyticsBackup,
} from "./backup-crypto";
import { normalizeCustomAssets } from "./custom-assets";
import { normalizeCompoundParams } from "./normalize-compound-params";
import {
  DEFAULT_DOCUMENT,
  type PortfolioDocument,
} from "./portfolio-types";

function normalizePortfolioDocument(
  data: Partial<PortfolioDocument>,
): PortfolioDocument {
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
    brokerSnapshots: data.brokerSnapshots ?? [],
    debtBalanceHistory: data.debtBalanceHistory ?? [],
    forecastPlans: data.forecastPlans ?? [],
    lastBrokerFileName:
      data.lastBrokerFileName ?? DEFAULT_DOCUMENT.lastBrokerFileName,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export async function exportAnalyticsBackup(): Promise<AnalyticsBackup> {
  const stored = await readPortfolioFromDb<PortfolioDocument>();
  const portfolio = normalizePortfolioDocument(stored ?? DEFAULT_DOCUMENT);
  const statements = await listStatementsFromDb();

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    portfolio,
    statements,
  };
}

export { isAnalyticsBackup };

export async function parseBackupFile(
  file: File,
  passphrase?: string,
): Promise<AnalyticsBackup> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Файл не является корректным JSON");
  }

  if (isEncryptedAnalyticsBackup(parsed)) {
    if (!passphrase) {
      throw new Error("Для зашифрованного бэкапа нужен пароль");
    }
    return decryptAnalyticsBackup(parsed, passphrase);
  }

  if (!isAnalyticsBackup(parsed)) {
    throw new Error(
      "Неверный формат бэкапа. Ожидается файл, экспортированный из этого приложения.",
    );
  }

  return parsed;
}

export async function importAnalyticsBackup(
  backup: AnalyticsBackup,
): Promise<void> {
  const portfolio = normalizePortfolioDocument(backup.portfolio);
  const statements: StatementRecord[] = backup.statements.map((record) => ({
    fileName: record.fileName,
    content: record.content,
  }));

  await writePortfolioToDb(portfolio);
  await saveAllStatementsToDb(statements);
  clearLegacyPortfolioStorage();
}

function clearLegacyPortfolioStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("analytics-portfolio-v1");
}

export function downloadAnalyticsBackup(
  backup: AnalyticsBackup | EncryptedAnalyticsBackup,
): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = backup.exportedAt.slice(0, 10);
  const encrypted = isEncryptedAnalyticsBackup(backup);
  anchor.href = url;
  anchor.download = encrypted
    ? `analytics-backup-${date}.enc.json`
    : `analytics-backup-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function markBackupCompleted(exportedAt: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_BACKUP_STORAGE_KEY, exportedAt);
}

export function readLastBackupAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
}

export async function hasLocalPortfolioData(): Promise<boolean> {
  const portfolio = await readPortfolioFromDb<PortfolioDocument>();
  const statements = await listStatementsFromDb();
  return portfolio != null || statements.length > 0;
}
