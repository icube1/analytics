import {
  DEFAULT_RESILIENCE_INPUT,
  ZERO_CAPITAL_RESILIENCE_INPUT,
  createSinkingFundGoal,
} from "@/lib/resilience-defaults";
import { evaluateResiliencePlan } from "@/lib/resilience-plan";
import { proposeSurplusAllocation } from "@/lib/journey/surplus-allocation";

function inputWith(overrides: Partial<typeof ZERO_CAPITAL_RESILIENCE_INPUT>) {
  return {
    ...ZERO_CAPITAL_RESILIENCE_INPUT,
    ...overrides,
    household: {
      ...ZERO_CAPITAL_RESILIENCE_INPUT.household,
      ...(overrides.household ?? {}),
    },
    debt: {
      ...ZERO_CAPITAL_RESILIENCE_INPUT.debt,
      ...(overrides.debt ?? {}),
    },
    experiences: {
      ...ZERO_CAPITAL_RESILIENCE_INPUT.experiences,
      ...(overrides.experiences ?? {}),
    },
    sinkingFunds: overrides.sinkingFunds ?? [],
  };
}

describe("journey surplus allocation", () => {
  it("does not invent contributions when surplus is missing", () => {
    const plan = evaluateResiliencePlan(ZERO_CAPITAL_RESILIENCE_INPUT);
    const allocation = proposeSurplusAllocation(
      ZERO_CAPITAL_RESILIENCE_INPUT,
      plan,
    );
    expect(allocation.deficit).toBe(true);
    expect(allocation.buckets).toHaveLength(0);
    expect(allocation.plannedTotal).toBe(0);
    expect(allocation.message).toMatch(/нулев/i);
  });

  it("fills the operational buffer before sinking funds", () => {
    const input = inputWith({
      mandatoryMonthlyExpenses: 80_000,
      liquidAssets: 20_000,
      monthlySurplus: 20_000,
      payCycleDays: 30,
      sinkingFunds: [
        createSinkingFundGoal({
          id: "car",
          label: "Ремонт",
          targetAmount: 120_000,
          currentAmount: 0,
          monthsUntilDue: 12,
        }),
      ],
    });
    const plan = evaluateResiliencePlan(input);
    const allocation = proposeSurplusAllocation(input, plan);

    expect(allocation.deficit).toBe(false);
    expect(allocation.nextEmergencyLayerId).toBe("operationalBuffer");
    const emergency = allocation.buckets.find(
      (bucket) => bucket.id === "next-emergency-layer",
    );
    const sinking = allocation.buckets.find(
      (bucket) => bucket.id === "sinking-funds",
    );
    expect(emergency?.monthlySuggested).toBe(20_000);
    expect(sinking?.monthlySuggested).toBe(0);
    expect(sinking?.monthlyNeed).toBe(10_000);
    expect(allocation.leftover).toBe(0);
  });

  it("splits leftover surplus across sinking funds and experiences", () => {
    const input = {
      ...DEFAULT_RESILIENCE_INPUT,
      liquidAssets: 2_000_000,
      monthlySurplus: 25_000,
      sinkingFunds: [
        createSinkingFundGoal({
          id: "tax",
          label: "Налог",
          targetAmount: 120_000,
          currentAmount: 0,
          monthsUntilDue: 12,
        }),
      ],
      experiences: { annualTarget: 24_000, currentAmount: 0 },
      debt: { ...DEFAULT_RESILIENCE_INPUT.debt, highInterestBalance: 0 },
    };
    const plan = evaluateResiliencePlan(input);
    const allocation = proposeSurplusAllocation(input, plan);

    expect(allocation.nextEmergencyLayerId).toBeNull();
    expect(allocation.sinkingMonthlyNeed).toBe(10_000);
    expect(allocation.experiencesMonthlyNeed).toBe(2_000);
    expect(
      allocation.buckets.find((bucket) => bucket.id === "sinking-funds")
        ?.monthlySuggested,
    ).toBe(10_000);
    expect(
      allocation.buckets.find((bucket) => bucket.id === "experiences-fund")
        ?.monthlySuggested,
    ).toBe(2_000);
    expect(allocation.leftover).toBe(13_000);
    expect(allocation.sustainable).toBe(true);
  });

  it("does not raid the emergency reserve when sinking funds exceed surplus", () => {
    const input = {
      ...DEFAULT_RESILIENCE_INPUT,
      liquidAssets: 2_000_000,
      monthlySurplus: 8_000,
      sinkingFunds: [
        createSinkingFundGoal({
          id: "school",
          label: "Учёба",
          targetAmount: 240_000,
          currentAmount: 0,
          monthsUntilDue: 6,
        }),
      ],
      experiences: { annualTarget: 0, currentAmount: 0 },
    };
    const plan = evaluateResiliencePlan(input);
    const allocation = proposeSurplusAllocation(input, plan);

    expect(allocation.sinkingMonthlyNeed).toBe(40_000);
    expect(
      allocation.buckets.find((bucket) => bucket.id === "sinking-funds")
        ?.monthlySuggested,
    ).toBe(8_000);
    expect(allocation.leftover).toBe(0);
    expect(allocation.sustainable).toBe(false);
    expect(allocation.message).toMatch(/срок/i);
  });
});
