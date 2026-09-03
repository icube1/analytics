import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { evaluateResiliencePlan } from "@/lib/resilience-plan";

const fixturePath = resolve("fixtures/finance-core/resilience-v1.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
  cases: Array<{ id: string; input: Parameters<typeof evaluateResiliencePlan>[0] }>;
};

describe("resilience plan contract", () => {
  it.each(fixture.cases.map((testCase) => [testCase.id, testCase.input] as const))(
    "produces stable layered output for %s",
    (_id, input) => {
      const first = evaluateResiliencePlan(input);
      const second = evaluateResiliencePlan(input);

      expect(first).toEqual(second);
      expect(first.layers.operationalBuffer.recommended).toBeGreaterThan(0);
      expect(first.totals.allLayersRecommended).toBeGreaterThanOrEqual(
        first.totals.emergencyOnlyRecommended,
      );
      expect(first.stress).toHaveLength(6);
      expect(
        first.stress.some((scenario) => scenario.id === "family-care-shock"),
      ).toBe(true);
      expect(
        first.notes.some((note) => note.topic === "disclaimer"),
      ).toBe(true);
    },
  );
});
