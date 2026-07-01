import {
  BACKUP_FORMAT_VERSION,
  type AnalyticsBackup,
} from "@/lib/backup-types";
import { DEFAULT_DOCUMENT } from "@/lib/portfolio-types";

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
});
