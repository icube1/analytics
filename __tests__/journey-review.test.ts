import {
  captureReviewSnapshot,
  diffReviewSnapshots,
  isReviewStale,
} from "@/lib/journey/review-snapshot";
import type { JourneyProgressSnapshot } from "@/lib/journey/progress";

function snapshot(
  partial: Partial<JourneyProgressSnapshot> = {},
): JourneyProgressSnapshot {
  return {
    milestones: [],
    activeMilestoneId: null,
    completedCount: 1,
    availableCount: 2,
    stressSurvivableCount: 3,
    stressTotalCount: 6,
    monthsCovered: 2,
    gapToRecommended: 0,
    ...partial,
  };
}

describe("journey review snapshots", () => {
  it("diffs only privacy-safe counters", () => {
    const previous = captureReviewSnapshot(
      snapshot({ completedCount: 1, monthsCovered: 2, stressSurvivableCount: 3 }),
      "2026-08-01T00:00:00.000Z",
    );
    const current = captureReviewSnapshot(
      snapshot({ completedCount: 3, monthsCovered: 4, stressSurvivableCount: 5 }),
      "2026-09-01T00:00:00.000Z",
    );
    expect(diffReviewSnapshots(previous, current)).toEqual({
      monthsCoveredDelta: 2,
      stressSurvivableDelta: 2,
      milestonesCompletedDelta: 2,
    });
  });

  it("treats a review older than 28 days as stale", () => {
    expect(isReviewStale(undefined, Date.parse("2026-09-03T00:00:00.000Z"))).toBe(
      true,
    );
    expect(
      isReviewStale(
        "2026-09-01T00:00:00.000Z",
        Date.parse("2026-09-03T00:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isReviewStale(
        "2026-08-01T00:00:00.000Z",
        Date.parse("2026-09-03T00:00:00.000Z"),
      ),
    ).toBe(true);
  });
});
