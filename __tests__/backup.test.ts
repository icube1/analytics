import {
  BACKUP_FORMAT_VERSION,
  type AnalyticsBackup,
} from "@/lib/backup-types";
import { createDefaultJourneyDocument } from "@/lib/journey-storage";
import { DEFAULT_DOCUMENT } from "@/lib/portfolio-types";
import { createZeroCapitalResilienceDocument } from "@/lib/resilience-storage";

jest.mock("@/lib/browser-idb", () => ({
  writePortfolioToDb: jest.fn(async () => undefined),
  saveAllStatementsToDb: jest.fn(async () => undefined),
  readPortfolioFromDb: jest.fn(async () => null),
  listStatementsFromDb: jest.fn(async () => []),
}));

function makeBackup(
  partial: Partial<AnalyticsBackup> = {},
): AnalyticsBackup {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: "2026-07-01T12:00:00.000Z",
    portfolio: { ...DEFAULT_DOCUMENT },
    statements: [],
    ...partial,
  };
}

describe("backup", () => {
  it("detects valid backup shape", async () => {
    const { isAnalyticsBackup } = await import("@/lib/backup");
    expect(isAnalyticsBackup(makeBackup())).toBe(true);
    expect(isAnalyticsBackup({ formatVersion: 2 })).toBe(false);
    expect(isAnalyticsBackup(null)).toBe(false);
  });

  it("restores journey and resilience documents from a backup", async () => {
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
        clear: () => memory.clear(),
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: globalThis.localStorage },
    });

    const journey = createDefaultJourneyDocument();
    journey.optedIn = true;
    const resilience = createZeroCapitalResilienceDocument();
    const { importAnalyticsBackup } = await import("@/lib/backup");
    await importAnalyticsBackup(
      makeBackup({
        journey,
        resilience,
      }),
    );

    expect(memory.get("analytics.beginner-journey.v1")).toContain(
      '"optedIn":true',
    );
    expect(memory.get("analytics.resilience-baseline.v1")).toContain(
      "mandatoryMonthlyExpenses",
    );
  });
});
