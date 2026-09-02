import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { evaluateResiliencePlan } from "@/lib/resilience-plan";
import { resiliencePlansMatch } from "@/lib/resilience-parity";

const fixturePath = resolve("fixtures/finance-core/resilience-v1.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  cases: Array<{ id: string; input: Parameters<typeof evaluateResiliencePlan>[0] }>;
};

describe("resilience parity helpers", () => {
  it.each(fixture.cases.map((testCase) => [testCase.id, testCase.input] as const))(
    "treats identical TS plans as matching for %s",
    (_id, input) => {
      const first = evaluateResiliencePlan(input);
      const second = evaluateResiliencePlan(input);
      expect(resiliencePlansMatch(first, second)).toBe(true);
    },
  );

  it("detects numeric drift", () => {
    const base = evaluateResiliencePlan(fixture.cases[0].input);
    const mutated = structuredClone(base);
    mutated.totals.currentGapToRecommended += 1;
    expect(resiliencePlansMatch(base, mutated)).toBe(false);
  });
});
