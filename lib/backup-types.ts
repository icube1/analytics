import type { PortfolioDocument } from "./portfolio-types";
import type { StatementRecord } from "./browser-idb";

export const BACKUP_FORMAT_VERSION = 1 as const;

export interface AnalyticsBackup {
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  portfolio: PortfolioDocument;
  statements: StatementRecord[];
}

export const LAST_BACKUP_STORAGE_KEY = "analytics-last-backup-at";
