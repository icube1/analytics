/** Mirrors finance-api auth + portfolio JSON contracts (camelCase). */

export const PORTFOLIO_SCHEMA_VERSION = 1;
export const CSRF_HEADER = "x-csrf-token";
export const IDEMPOTENCY_HEADER = "idempotency-key";

export type SessionClientKind = "web" | "mobile";

export interface LoginRequest {
  email: string;
  password: string;
  householdId?: string;
  clientKind?: SessionClientKind;
  rotateSessionId?: string;
}

export interface LoginResponse {
  userId: string;
  householdId: string;
  csrfToken: string;
  bearerToken?: string | null;
  expiresAt: string;
}

export interface MeResponse {
  userId: string;
  email?: string | null;
  displayName: string;
  householdId: string;
  householdName: string;
  role: string;
  sessionId: string;
  expiresAt: string;
  plan?: string;
  features?: string[];
}

export interface PortfolioSyncRequest {
  schemaVersion: number;
  baseRevision: number;
  document: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface PortfolioSyncResponse {
  schemaVersion: number;
  revision: number;
  householdId: string;
  document: Record<string, unknown>;
  updatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: {
      expectedRevision?: number;
      actualRevision?: number;
      [key: string]: unknown;
    };
  };
}

export interface RevisionConflictDetails {
  expectedRevision: number;
  actualRevision: number;
}

export class SessionApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: RevisionConflictDetails;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: RevisionConflictDetails,
  ) {
    super(message);
    this.name = "SessionApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function parseSessionApiError(
  response: Response,
): Promise<SessionApiError> {
  let code = "unknown_error";
  let message = response.statusText || "request failed";
  let details: RevisionConflictDetails | undefined;

  try {
    const body = (await response.json()) as ApiErrorBody;
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
    if (body.error?.details?.expectedRevision != null) {
      details = {
        expectedRevision: body.error.details.expectedRevision,
        actualRevision: body.error.details.actualRevision ?? -1,
      };
    }
  } catch {
    // keep defaults
  }

  return new SessionApiError(response.status, code, message, details);
}
