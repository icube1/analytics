import {
  DEFAULT_RESILIENCE_INPUT,
  ZERO_CAPITAL_RESILIENCE_INPUT,
  createSinkingFundGoal,
} from "@/lib/resilience-defaults";
import { evaluateResiliencePlan } from "@/lib/resilience-plan";
import {
  computeContinuity,
  CONTINUITY_WINDOW_WEEKS,
  recordEngagement,
} from "@/lib/journey/continuity";
import {
  defaultMilestoneOrder,
  JOURNEY_CATALOG_VERSION,
  JOURNEY_MILESTONES,
} from "@/lib/journey/milestones";
import { computeJourneyProgress } from "@/lib/journey/progress";
import {
  acknowledgeMilestone,
  createDefaultJourneyDocument,
  exportJourneyBundle,
  importJourneyBundle,
  normalizeJourneyDocument,
  optInToJourney,
  resetJourney,
} from "@/lib/journey-storage";

describe("journey milestones catalog", () => {
  it("ships a versioned catalog with branching milestones", () => {
    expect(JOURNEY_CATALOG_VERSION).toBe(1);
    expect(JOURNEY_MILESTONES.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(JOURNEY_MILESTONES.map((m) => m.id));
    expect(ids.has("baseline-data-quality")).toBe(true);
    expect(ids.has("plan-vs-fact-review")).toBe(true);
    expect(defaultMilestoneOrder().length).toBe(JOURNEY_MILESTONES.length);
  });
});

describe("journey progress", () => {
  it("unlocks milestones after prerequisites and gives quantified feedback", () => {
    const plan = evaluateResiliencePlan(DEFAULT_RESILIENCE_INPUT);
    const state = {
      milestoneOrder: defaultMilestoneOrder(),
      optedOutMilestones: [],
      completedBabySteps: {},
      acknowledgedMilestones: [],
    };
    const snapshot = computeJourneyProgress(
      DEFAULT_RESILIENCE_INPUT,
      plan,
      state,
    );
    const baseline = snapshot.milestones.find(
      (m) => m.id === "baseline-data-quality",
    );
    const cashFlow = snapshot.milestones.find(
      (m) => m.id === "cash-flow-control",
    );
    expect(baseline?.status).not.toBe("locked");
    expect(cashFlow?.status).not.toBe("locked");
    expect(snapshot.stressTotalCount).toBe(6);
    expect(snapshot.monthsCovered).toBeGreaterThan(0);
  });

  it("skips extended reserve when not recommended", () => {
    const input = {
      ...DEFAULT_RESILIENCE_INPUT,
      household: {
        ...DEFAULT_RESILIENCE_INPUT.household,
        incomeStability: "stable" as const,
        dependentCount: 0,
        hasSecondaryHouseholdIncome: true,
      },
      debt: { ...DEFAULT_RESILIENCE_INPUT.debt, totalBalance: 0 },
    };
    const plan = evaluateResiliencePlan(input);
    const snapshot = computeJourneyProgress(input, plan, {
      milestoneOrder: defaultMilestoneOrder(),
      optedOutMilestones: [],
      completedBabySteps: {},
      acknowledgedMilestones: [],
    });
    const extended = snapshot.milestones.find(
      (m) => m.id === "extended-emergency-fund",
    );
    expect(extended?.status).toBe("skipped");
  });

  it("starts the zero-capital path without invented reserves", () => {
    const plan = evaluateResiliencePlan(ZERO_CAPITAL_RESILIENCE_INPUT);
    const snapshot = computeJourneyProgress(
      ZERO_CAPITAL_RESILIENCE_INPUT,
      plan,
      {
        milestoneOrder: defaultMilestoneOrder(),
        optedOutMilestones: [],
        completedBabySteps: {},
        acknowledgedMilestones: [],
      },
    );
    expect(ZERO_CAPITAL_RESILIENCE_INPUT.liquidAssets).toBe(0);
    expect(ZERO_CAPITAL_RESILIENCE_INPUT.monthlySurplus).toBe(0);
    expect(snapshot.monthsCovered).toBe(0);
    expect(
      snapshot.milestones.find((m) => m.id === "baseline-data-quality")?.status,
    ).not.toBe("locked");
  });

  it("unlocks sinking-funds after a goal is added", () => {
    const withoutFunds = computeJourneyProgress(
      DEFAULT_RESILIENCE_INPUT,
      evaluateResiliencePlan(DEFAULT_RESILIENCE_INPUT),
      {
        milestoneOrder: defaultMilestoneOrder(),
        optedOutMilestones: [],
        completedBabySteps: {},
        acknowledgedMilestones: [],
      },
    );
    expect(
      withoutFunds.milestones.find((m) => m.id === "sinking-funds")?.status,
    ).toBe("skipped");

    const input = {
      ...DEFAULT_RESILIENCE_INPUT,
      sinkingFunds: [
        createSinkingFundGoal({
          id: "repair",
          label: "Ремонт",
          targetAmount: 60_000,
          currentAmount: 15_000,
          monthsUntilDue: 6,
        }),
      ],
    };
    const snapshot = computeJourneyProgress(
      input,
      evaluateResiliencePlan(input),
      {
        milestoneOrder: defaultMilestoneOrder(),
        optedOutMilestones: [],
        completedBabySteps: {},
        acknowledgedMilestones: [],
      },
    );
    const sinking = snapshot.milestones.find((m) => m.id === "sinking-funds");
    expect(sinking?.status).not.toBe("skipped");
    expect(sinking?.babySteps.find((step) => step.id === "define-goals")?.completed).toBe(
      true,
    );
    expect(
      snapshot.milestones.find((m) => m.id === "experiences-fund")?.babySteps.find(
        (step) => step.id === "annual-target",
      )?.completed,
    ).toBe(true);
  });
});

describe("journey continuity", () => {
  it("tracks engagement by week without daily streak semantics", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    const engagements = recordEngagement([], now);
    const snapshot = computeContinuity(engagements, now);
    expect(snapshot.engagedWeeksInWindow).toBe(1);
    expect(snapshot.windowWeeks).toBe(CONTINUITY_WINDOW_WEEKS);
    expect(snapshot.message).toMatch(/недел/i);
  });
});

describe("journey storage", () => {
  it("creates a versioned default document", () => {
    const doc = createDefaultJourneyDocument();
    expect(doc.schemaVersion).toBe(1);
    expect(doc.optedIn).toBe(false);
    expect(doc.productEvents).toEqual([]);
  });

  it("records opt-in and milestone events without financial values", () => {
    let doc = optInToJourney(createDefaultJourneyDocument());
    doc = acknowledgeMilestone(doc, "baseline-data-quality");
    const last = doc.productEvents.at(-1);
    expect(last?.kind).toBe("milestone_completed");
    expect(last?.milestoneId).toBe("baseline-data-quality");
    expect(JSON.stringify(doc.productEvents)).not.toMatch(/amount|balance|rub/i);
  });

  it("exports and imports journey bundles", () => {
    const doc = optInToJourney(createDefaultJourneyDocument());
    const bundle = exportJourneyBundle(doc);
    expect(bundle.journey.optedIn).toBe(true);
    const imported = importJourneyBundle(bundle);
    expect(imported?.optedIn).toBe(true);
    expect(imported?.productEvents.some((e) => e.kind === "journey_exported")).toBe(
      true,
    );
  });

  it("resets progress while preserving opt-in preference", () => {
    const doc = optInToJourney(
      acknowledgeMilestone(createDefaultJourneyDocument(), "baseline-data-quality"),
    );
    const reset = resetJourney(doc);
    expect(reset.optedIn).toBe(true);
    expect(reset.acknowledgedMilestones).toEqual([]);
    expect(reset.productEvents.some((e) => e.kind === "journey_reset")).toBe(true);
  });

  it("normalizes unknown payloads", () => {
    const doc = normalizeJourneyDocument({ schemaVersion: 99 });
    expect(doc.schemaVersion).toBe(1);
  });
});
