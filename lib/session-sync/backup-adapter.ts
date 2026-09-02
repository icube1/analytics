/**
 * Persistence adapter: Next.js backup remains default until cloud session sync
 * is both feature-flagged on and explicitly enabled by the user.
 */
import { scheduleServerBackupSync } from "@/lib/backup-sync";
import { isWebSessionSyncFeatureEnabled } from "./feature-flags";
import { isCloudSyncEnabledByUser } from "./preferences";
import { scheduleCloudPortfolioSync } from "./sync-orchestrator";

export type PersistenceBackend = "next-backup" | "cloud-session";

export function resolvePersistenceBackend(): PersistenceBackend {
  if (isWebSessionSyncFeatureEnabled() && isCloudSyncEnabledByUser()) {
    return "cloud-session";
  }
  return "next-backup";
}

export function schedulePortfolioPersistence(): void {
  if (resolvePersistenceBackend() === "cloud-session") {
    scheduleCloudPortfolioSync();
    return;
  }
  scheduleServerBackupSync();
}

export function isNextBackupDefaultPath(): boolean {
  return resolvePersistenceBackend() === "next-backup";
}
