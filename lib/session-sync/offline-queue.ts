import { safeSerializeForPersistence } from "./secrets";

const QUEUE_STORAGE_KEY = "analytics.session-sync.offline-queue.v1";

export interface OfflineSyncQueueItem {
  id: string;
  baseRevision: number;
  enqueuedAt: string;
  documentFingerprint: string;
}

export interface OfflineQueueSnapshot {
  items: OfflineSyncQueueItem[];
  updatedAt: string;
}

function readQueue(): OfflineQueueSnapshot {
  if (typeof localStorage === "undefined") {
    return { items: [], updatedAt: new Date().toISOString() };
  }
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return { items: [], updatedAt: new Date().toISOString() };
    const parsed = JSON.parse(raw) as OfflineQueueSnapshot;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { items: [], updatedAt: new Date().toISOString() };
  }
}

function writeQueue(snapshot: OfflineQueueSnapshot): void {
  if (typeof localStorage === "undefined") return;
  const json = safeSerializeForPersistence(snapshot);
  localStorage.setItem(QUEUE_STORAGE_KEY, json);
}

export function listOfflineQueue(): OfflineSyncQueueItem[] {
  return readQueue().items;
}

export function enqueueOfflineSync(item: OfflineSyncQueueItem): void {
  const snapshot = readQueue();
  snapshot.items = [...snapshot.items.filter((q) => q.id !== item.id), item];
  snapshot.updatedAt = new Date().toISOString();
  writeQueue(snapshot);
}

export function dequeueOfflineSync(id: string): void {
  const snapshot = readQueue();
  snapshot.items = snapshot.items.filter((item) => item.id !== id);
  snapshot.updatedAt = new Date().toISOString();
  writeQueue(snapshot);
}

export function clearOfflineQueue(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(QUEUE_STORAGE_KEY);
}

export interface ReplayResult {
  replayed: number;
  remaining: number;
}

export async function replayOfflineQueue(
  handler: (item: OfflineSyncQueueItem) => Promise<boolean>,
): Promise<ReplayResult> {
  const items = listOfflineQueue();
  let replayed = 0;

  for (const item of items) {
    const ok = await handler(item);
    if (ok) {
      dequeueOfflineSync(item.id);
      replayed += 1;
    }
  }

  return { replayed, remaining: listOfflineQueue().length };
}
