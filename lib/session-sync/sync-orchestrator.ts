import { exportAnalyticsBackup } from "@/lib/backup";
import type { PortfolioDocument } from "@/lib/portfolio-types";
import { fetchPortfolioDocument } from "@/lib/portfolio-storage";
import { isWebSessionSyncFeatureEnabled } from "./feature-flags";
import { isCloudSyncEnabledByUser } from "./preferences";
import { refreshAuthState } from "./auth-client";
import {
  enqueueOfflineSync,
  listOfflineQueue,
  replayOfflineQueue,
  type OfflineSyncQueueItem,
} from "./offline-queue";
import {
  pullPortfolio,
  pushPortfolio,
  readLocalRevision,
  type PortfolioConflictResult,
} from "./portfolio-sync";
import { randomId } from "@/lib/random-id";

export interface SyncOrchestratorState {
  mode: "next-backup" | "cloud-session" | "disabled";
  pendingOffline: number;
  lastConflict: PortfolioConflictResult | null;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let lastConflict: PortfolioConflictResult | null = null;

export function readLastSyncConflict(): PortfolioConflictResult | null {
  return lastConflict;
}

export function clearLastSyncConflict(): void {
  lastConflict = null;
}

export async function resolveSyncMode(): Promise<SyncOrchestratorState["mode"]> {
  if (!isWebSessionSyncFeatureEnabled()) return "next-backup";
  if (!isCloudSyncEnabledByUser()) return "disabled";
  const auth = await refreshAuthState();
  return auth.isAuthenticated ? "cloud-session" : "disabled";
}

export function scheduleCloudPortfolioSync(): void {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    void runCloudPortfolioSync();
  }, 2000);
}

function fingerprintDocument(doc: PortfolioDocument): string {
  return `${doc.updatedAt}:${doc.brokerSnapshots.length}:${doc.forecastPlans.length}`;
}

export async function runCloudPortfolioSync(): Promise<boolean> {
  const mode = await resolveSyncMode();
  if (mode !== "cloud-session") return false;

  const doc = await fetchPortfolioDocument();
  const baseRevision = readLocalRevision();
  const id = randomId();

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const item: OfflineSyncQueueItem = {
      id,
      baseRevision,
      enqueuedAt: new Date().toISOString(),
      documentFingerprint: fingerprintDocument(doc),
    };
    enqueueOfflineSync(item);
    return false;
  }

  const outcome = await pushPortfolio(doc, { baseRevision, idempotencyKey: id });
  if (outcome.conflict) {
    lastConflict = outcome;
    return false;
  }

  lastConflict = null;
  return true;
}

export async function replayPendingOfflineSync(): Promise<{
  replayed: number;
  remaining: number;
}> {
  const mode = await resolveSyncMode();
  if (mode !== "cloud-session") {
    return { replayed: 0, remaining: listOfflineQueue().length };
  }

  return replayOfflineQueue(async () => {
    const doc = await fetchPortfolioDocument();
    const outcome = await pushPortfolio(doc);
    if (outcome.conflict) {
      lastConflict = outcome;
      return false;
    }
    lastConflict = null;
    return true;
  });
}

export async function pullRemotePortfolioIntoLocal(): Promise<PortfolioDocument | null> {
  const mode = await resolveSyncMode();
  if (mode !== "cloud-session") return null;
  const remote = await pullPortfolio();
  return remote.document as unknown as PortfolioDocument;
}

export async function buildSyncOrchestratorState(): Promise<SyncOrchestratorState> {
  return {
    mode: await resolveSyncMode(),
    pendingOffline: listOfflineQueue().length,
    lastConflict: lastConflict,
  };
}

export async function exportBackupFallbackSnapshot(): Promise<ReturnType<
  typeof exportAnalyticsBackup
>> {
  return exportAnalyticsBackup();
}
