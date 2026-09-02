import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_RESILIENCE_INPUT } from "@/lib/resilience-defaults";
import {
  createDefaultResilienceDocument,
  normalizeResilienceDocument,
  RESILIENCE_STORAGE_SCHEMA_VERSION,
} from "@/lib/resilience-storage";

describe("resilience storage", () => {
  it("creates a versioned default document", () => {
    const document = createDefaultResilienceDocument();
    expect(document.schemaVersion).toBe(RESILIENCE_STORAGE_SCHEMA_VERSION);
    expect(document.input.mandatoryMonthlyExpenses).toBe(
      DEFAULT_RESILIENCE_INPUT.mandatoryMonthlyExpenses,
    );
  });

  it("normalizes unknown payloads to defaults", () => {
    const document = normalizeResilienceDocument({ schemaVersion: 99 });
    expect(document.schemaVersion).toBe(RESILIENCE_STORAGE_SCHEMA_VERSION);
    expect(document.input.debt.totalBalance).toBe(0);
  });

  it("preserves valid stored input", () => {
    const fixturePath = resolve("fixtures/finance-core/resilience-v1.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      cases: Array<{ input: typeof DEFAULT_RESILIENCE_INPUT }>;
    };
    const input = fixture.cases[0].input;
    const document = normalizeResilienceDocument({
      schemaVersion: RESILIENCE_STORAGE_SCHEMA_VERSION,
      savedAt: "2026-01-01T00:00:00.000Z",
      input,
    });
    expect(document.input.liquidAssets).toBe(input.liquidAssets);
    expect(document.input.household.incomeStability).toBe("stable");
  });
});
