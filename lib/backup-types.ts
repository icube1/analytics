import type { StatementRecord } from "./browser-idb";
import type { JourneyStorageDocument } from "./journey-storage";
import type { PortfolioDocument } from "./portfolio-types";
import type { ResilienceStorageDocument } from "./resilience-storage";

export const BACKUP_FORMAT_VERSION = 1 as const;

export interface AnalyticsBackup {
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  portfolio: PortfolioDocument;
  statements: StatementRecord[];
  journey?: JourneyStorageDocument;
  resilience?: ResilienceStorageDocument;
}

export const LAST_BACKUP_STORAGE_KEY = "analytics-last-backup-at";

export function isAnalyticsBackup(value: unknown): value is AnalyticsBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<AnalyticsBackup>;
  return (
    backup.formatVersion === BACKUP_FORMAT_VERSION &&
    typeof backup.exportedAt === "string" &&
    backup.portfolio != null &&
    Array.isArray(backup.statements)
  );
}
