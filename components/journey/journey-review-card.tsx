"use client";

import {
  captureReviewSnapshot,
  diffReviewSnapshots,
  isReviewStale,
  type JourneyReviewSnapshot,
} from "@/lib/journey/review-snapshot";
import type { JourneyProgressSnapshot } from "@/lib/journey/progress";

function formatDelta(value: number, unit: string): string {
  if (value === 0) return `без изменения ${unit}`;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} ${unit}`;
}

export function JourneyReviewCard({
  progress,
  lastReviewAt,
  lastReviewSnapshot,
  onRecordReview,
}: {
  progress: JourneyProgressSnapshot;
  lastReviewAt?: string;
  lastReviewSnapshot?: JourneyReviewSnapshot;
  onRecordReview: (snapshot: JourneyReviewSnapshot) => void;
}) {
  const current = captureReviewSnapshot(progress);
  const stale = isReviewStale(lastReviewAt);
  const delta = lastReviewSnapshot
    ? diffReviewSnapshots(lastReviewSnapshot, current)
    : null;

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      aria-labelledby="journey-review-title"
    >
      <h2
        id="journey-review-title"
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
      >
        Что изменилось с прошлого обзора
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        {stale
          ? "Прошёл месяц или обзор ещё не фиксировали. Это напоминание, не дедлайн."
          : "Последний обзор свежий — можно просто посмотреть дельту."}
      </p>
      {delta ? (
        <ul className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
          <li>{formatDelta(delta.monthsCoveredDelta, "мес. покрытия")}</li>
          <li>
            {formatDelta(delta.stressSurvivableDelta, "покрытых стресс-сценариев")}
          </li>
          <li>
            {formatDelta(delta.milestonesCompletedDelta, "ориентиров")}
          </li>
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          После первой фиксации здесь появятся только счётчики, без сумм.
        </p>
      )}
      <button
        type="button"
        onClick={() => onRecordReview(current)}
        className="mt-4 rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Зафиксировать обзор план/факт
      </button>
    </section>
  );
}
