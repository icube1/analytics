import {
  createProductEvent,
  normalizeProductEvents,
  type ProductEvent,
} from "@/lib/product-events/schema";
import { emitProductEvent } from "@/lib/product-events/telemetry";
import {
  defaultMilestoneOrder,
  type MilestoneId,
} from "@/lib/journey/milestones";
import type { ContinuityEngagement } from "@/lib/journey/continuity";
import { recordEngagement } from "@/lib/journey/continuity";

export const JOURNEY_STORAGE_SCHEMA_VERSION = 1 as const;
const STORAGE_KEY = "analytics.beginner-journey.v1";

export interface JourneyStorageDocument {
  schemaVersion: typeof JOURNEY_STORAGE_SCHEMA_VERSION;
  savedAt: string;
  startedAt: string;
  optedIn: boolean;
  milestoneOrder: MilestoneId[];
  optedOutMilestones: MilestoneId[];
  completedBabySteps: Record<string, string>;
  acknowledgedMilestones: MilestoneId[];
  lastReviewAt?: string;
  engagements: ContinuityEngagement[];
  productEvents: ProductEvent[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMilestoneId(value: unknown): value is MilestoneId {
  return typeof value === "string";
}

export function createDefaultJourneyDocument(): JourneyStorageDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: JOURNEY_STORAGE_SCHEMA_VERSION,
    savedAt: now,
    startedAt: now,
    optedIn: false,
    milestoneOrder: defaultMilestoneOrder(),
    optedOutMilestones: [],
    completedBabySteps: {},
    acknowledgedMilestones: [],
    engagements: [],
    productEvents: [],
  };
}

export function normalizeJourneyDocument(value: unknown): JourneyStorageDocument {
  if (!isObject(value)) {
    return createDefaultJourneyDocument();
  }

  if (value.schemaVersion !== JOURNEY_STORAGE_SCHEMA_VERSION) {
    return createDefaultJourneyDocument();
  }

  const defaults = createDefaultJourneyDocument();

  return {
    schemaVersion: JOURNEY_STORAGE_SCHEMA_VERSION,
    savedAt:
      typeof value.savedAt === "string" ? value.savedAt : defaults.savedAt,
    startedAt:
      typeof value.startedAt === "string" ? value.startedAt : defaults.startedAt,
    optedIn: value.optedIn === true,
    milestoneOrder: Array.isArray(value.milestoneOrder)
      ? value.milestoneOrder.filter(isMilestoneId)
      : defaults.milestoneOrder,
    optedOutMilestones: Array.isArray(value.optedOutMilestones)
      ? value.optedOutMilestones.filter(isMilestoneId)
      : [],
    completedBabySteps: isObject(value.completedBabySteps)
      ? (Object.fromEntries(
          Object.entries(value.completedBabySteps).filter(
            ([, v]) => typeof v === "string",
          ),
        ) as Record<string, string>)
      : {},
    acknowledgedMilestones: Array.isArray(value.acknowledgedMilestones)
      ? value.acknowledgedMilestones.filter(isMilestoneId)
      : [],
    lastReviewAt:
      typeof value.lastReviewAt === "string" ? value.lastReviewAt : undefined,
    engagements: Array.isArray(value.engagements)
      ? value.engagements.filter(
          (e) =>
            isObject(e) &&
            typeof e.weekKey === "string" &&
            typeof e.lastEngagedAt === "string",
        )
      : [],
    productEvents: normalizeProductEvents(value.productEvents),
  };
}

export function readJourneyDocument(): JourneyStorageDocument | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeJourneyDocument(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeJourneyDocument(document: JourneyStorageDocument): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  const payload: JourneyStorageDocument = {
    ...document,
    schemaVersion: JOURNEY_STORAGE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearJourneyDocument(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

function appendEvent(
  document: JourneyStorageDocument,
  event: ProductEvent,
): JourneyStorageDocument {
  void emitProductEvent(event);
  return {
    ...document,
    productEvents: [...document.productEvents, event],
  };
}

export function optInToJourney(
  document: JourneyStorageDocument,
): JourneyStorageDocument {
  if (document.optedIn) {
    return touchEngagement(document);
  }
  const withStart = appendEvent(
    { ...document, optedIn: true },
    createProductEvent("journey_started"),
  );
  return touchEngagement(withStart);
}

export function touchEngagement(
  document: JourneyStorageDocument,
): JourneyStorageDocument {
  return {
    ...document,
    engagements: recordEngagement(document.engagements),
  };
}

export function completeBabyStep(
  document: JourneyStorageDocument,
  milestoneId: MilestoneId,
  babyStepId: string,
): JourneyStorageDocument {
  const key = `${milestoneId}:${babyStepId}`;
  const now = new Date().toISOString();
  let next: JourneyStorageDocument = {
    ...touchEngagement(document),
    completedBabySteps: {
      ...document.completedBabySteps,
      [key]: now,
    },
  };
  next = appendEvent(
    next,
    createProductEvent("baby_step_completed", { milestoneId, babyStepId }),
  );
  return next;
}

export function acknowledgeMilestone(
  document: JourneyStorageDocument,
  milestoneId: MilestoneId,
): JourneyStorageDocument {
  if (document.acknowledgedMilestones.includes(milestoneId)) {
    return touchEngagement(document);
  }
  let next: JourneyStorageDocument = {
    ...touchEngagement(document),
    acknowledgedMilestones: [...document.acknowledgedMilestones, milestoneId],
  };
  next = appendEvent(
    next,
    createProductEvent("milestone_completed", { milestoneId }),
  );
  return next;
}

export function optOutMilestone(
  document: JourneyStorageDocument,
  milestoneId: MilestoneId,
): JourneyStorageDocument {
  const optedOut = document.optedOutMilestones.includes(milestoneId)
    ? document.optedOutMilestones
    : [...document.optedOutMilestones, milestoneId];
  let next: JourneyStorageDocument = {
    ...touchEngagement(document),
    optedOutMilestones: optedOut,
  };
  next = appendEvent(
    next,
    createProductEvent("milestone_opted_out", { milestoneId }),
  );
  return next;
}

export function optInMilestone(
  document: JourneyStorageDocument,
  milestoneId: MilestoneId,
): JourneyStorageDocument {
  return {
    ...touchEngagement(document),
    optedOutMilestones: document.optedOutMilestones.filter(
      (id) => id !== milestoneId,
    ),
  };
}

export function reorderMilestones(
  document: JourneyStorageDocument,
  order: MilestoneId[],
): JourneyStorageDocument {
  return {
    ...touchEngagement(document),
    milestoneOrder: order,
  };
}

export function recordPlanReview(
  document: JourneyStorageDocument,
): JourneyStorageDocument {
  const now = new Date().toISOString();
  let next: JourneyStorageDocument = {
    ...touchEngagement(document),
    lastReviewAt: now,
    completedBabySteps: {
      ...document.completedBabySteps,
      "plan-vs-fact-review:record-review": now,
    },
  };
  next = appendEvent(
    next,
    createProductEvent("plan_review_recorded", {
      milestoneId: "plan-vs-fact-review",
    }),
  );
  return next;
}

export function resetJourney(
  document: JourneyStorageDocument,
): JourneyStorageDocument {
  const fresh = createDefaultJourneyDocument();
  let next: JourneyStorageDocument = {
    ...fresh,
    optedIn: document.optedIn,
  };
  next = appendEvent(next, createProductEvent("journey_reset"));
  return next;
}

export interface JourneyExportBundle {
  schemaVersion: typeof JOURNEY_STORAGE_SCHEMA_VERSION;
  exportedAt: string;
  journey: Omit<JourneyStorageDocument, "productEvents">;
  productEvents: ProductEvent[];
}

export function exportJourneyBundle(
  document: JourneyStorageDocument,
): JourneyExportBundle {
  const { productEvents, ...journey } = document;
  return {
    schemaVersion: JOURNEY_STORAGE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    journey,
    productEvents,
  };
}

export function importJourneyBundle(
  bundle: unknown,
): JourneyStorageDocument | null {
  if (!isObject(bundle)) return null;
  if (bundle.schemaVersion !== JOURNEY_STORAGE_SCHEMA_VERSION) return null;
  if (!isObject(bundle.journey)) return null;

  const journey = normalizeJourneyDocument({
    ...bundle.journey,
    productEvents: normalizeProductEvents(bundle.productEvents),
  });

  let next = journey;
  next = appendEvent(next, createProductEvent("journey_exported"));
  return next;
}

export function downloadJourneyExport(
  document: JourneyStorageDocument,
): void {
  if (typeof window === "undefined") return;
  const bundle = exportJourneyBundle(document);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `beginner-journey-${bundle.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
