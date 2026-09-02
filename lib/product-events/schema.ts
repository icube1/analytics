/**
 * North-star / product event schema.
 * Records milestone identifiers and timestamps only — never financial values.
 */

export const PRODUCT_EVENT_SCHEMA_VERSION = 1 as const;

export type ProductEventKind =
  | "journey_started"
  | "milestone_completed"
  | "baby_step_completed"
  | "milestone_opted_out"
  | "journey_reset"
  | "journey_exported"
  | "plan_review_recorded";

export interface ProductEvent {
  schemaVersion: typeof PRODUCT_EVENT_SCHEMA_VERSION;
  kind: ProductEventKind;
  /** Milestone catalog id, e.g. `operational-buffer` */
  milestoneId?: string;
  /** Baby-step id within the milestone catalog */
  babyStepId?: string;
  /** ISO-8601 timestamp */
  occurredAt: string;
}

export function createProductEvent(
  kind: ProductEventKind,
  partial?: Partial<Pick<ProductEvent, "milestoneId" | "babyStepId" | "occurredAt">>,
): ProductEvent {
  return {
    schemaVersion: PRODUCT_EVENT_SCHEMA_VERSION,
    kind,
    milestoneId: partial?.milestoneId,
    babyStepId: partial?.babyStepId,
    occurredAt: partial?.occurredAt ?? new Date().toISOString(),
  };
}

export function isProductEvent(value: unknown): value is ProductEvent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === PRODUCT_EVENT_SCHEMA_VERSION &&
    typeof record.kind === "string" &&
    typeof record.occurredAt === "string" &&
    (record.milestoneId === undefined ||
      typeof record.milestoneId === "string") &&
    (record.babyStepId === undefined || typeof record.babyStepId === "string")
  );
}

export function normalizeProductEvents(value: unknown): ProductEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isProductEvent);
}
