import type { JourneyProgressSnapshot } from "./progress";

export const REVIEW_STALE_MS = 28 * 24 * 60 * 60 * 1000;

export interface JourneyReviewSnapshot {
  recordedAt: string;
  monthsCovered: number;
  stressSurvivableCount: number;
  milestonesCompleted: number;
}

export interface JourneyReviewDelta {
  monthsCoveredDelta: number;
  stressSurvivableDelta: number;
  milestonesCompletedDelta: number;
}

export function captureReviewSnapshot(
  progress: JourneyProgressSnapshot,
  recordedAt = new Date().toISOString(),
): JourneyReviewSnapshot {
  return {
    recordedAt,
    monthsCovered: progress.monthsCovered,
    stressSurvivableCount: progress.stressSurvivableCount,
    milestonesCompleted: progress.completedCount,
  };
}

export function diffReviewSnapshots(
  previous: JourneyReviewSnapshot,
  current: JourneyReviewSnapshot,
): JourneyReviewDelta {
  return {
    monthsCoveredDelta: current.monthsCovered - previous.monthsCovered,
    stressSurvivableDelta:
      current.stressSurvivableCount - previous.stressSurvivableCount,
    milestonesCompletedDelta:
      current.milestonesCompleted - previous.milestonesCompleted,
  };
}

export function isReviewStale(
  lastReviewAt: string | undefined,
  now = Date.now(),
): boolean {
  if (!lastReviewAt) return true;
  const parsed = Date.parse(lastReviewAt);
  if (Number.isNaN(parsed)) return true;
  return now - parsed >= REVIEW_STALE_MS;
}
