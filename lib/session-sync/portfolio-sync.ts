import { randomId } from "@/lib/random-id";
import type { PortfolioDocument } from "@/lib/portfolio-types";
import {
  IDEMPOTENCY_HEADER,
  PORTFOLIO_SCHEMA_VERSION,
  type PortfolioSyncResponse,
  parseSessionApiError,
} from "./contracts";
import { authenticatedFetch } from "./transport";
import { safeSerializeForPersistence } from "./secrets";

export interface PortfolioSyncHead {
  revision: number;
  householdId: string;
  updatedAt: string;
}

export interface PortfolioPushResult {
  response: PortfolioSyncResponse;
  conflict: false;
}

export interface PortfolioConflictResult {
  conflict: true;
  localRevision: number;
  remoteRevision: number;
  remoteDocument: Record<string, unknown>;
  message: string;
}

export type PortfolioSyncOutcome = PortfolioPushResult | PortfolioConflictResult;

const REVISION_STORAGE_KEY = "analytics.session-sync.revision.v1";

export function readLocalRevision(): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = localStorage.getItem(REVISION_STORAGE_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function writeLocalRevision(revision: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(REVISION_STORAGE_KEY, String(revision));
}

export function clearLocalRevision(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(REVISION_STORAGE_KEY);
}

export async function pullPortfolio(): Promise<PortfolioSyncResponse> {
  const response = await authenticatedFetch("/portfolio");
  if (!response.ok) throw await parseSessionApiError(response);
  const body = (await response.json()) as PortfolioSyncResponse;
  writeLocalRevision(body.revision);
  return body;
}

export async function pushPortfolio(
  document: PortfolioDocument,
  options?: { baseRevision?: number; idempotencyKey?: string },
): Promise<PortfolioSyncOutcome> {
  const baseRevision = options?.baseRevision ?? readLocalRevision();
  const idempotencyKey = options?.idempotencyKey ?? randomId();
  const payload = {
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    baseRevision,
    document: document as unknown as Record<string, unknown>,
    idempotencyKey,
  };

  const response = await authenticatedFetch("/portfolio", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      [IDEMPOTENCY_HEADER]: idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 409) {
    const err = await parseSessionApiError(response);
    let remote: PortfolioSyncResponse | null = null;
    try {
      remote = await pullPortfolio();
    } catch {
      remote = null;
    }
    return {
      conflict: true,
      localRevision: baseRevision,
      remoteRevision:
        err.details?.actualRevision ?? remote?.revision ?? baseRevision,
      remoteDocument: remote?.document ?? {},
      message: err.message,
    };
  }

  if (!response.ok) throw await parseSessionApiError(response);

  const body = (await response.json()) as PortfolioSyncResponse;
  writeLocalRevision(body.revision);
  return { conflict: false, response: body };
}

export function serializeSyncQueueItem(item: {
  id: string;
  baseRevision: number;
  enqueuedAt: string;
}): string {
  return safeSerializeForPersistence(item);
}
