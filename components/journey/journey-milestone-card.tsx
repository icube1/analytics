"use client";

import type { MilestoneProgress } from "@/lib/journey/progress";
import {
  getMilestoneDefinition,
  type MilestoneId,
} from "@/lib/journey/milestones";

const STATUS_LABELS: Record<MilestoneProgress["status"], string> = {
  locked: "Ожидает предшественников",
  available: "Доступен",
  in_progress: "В процессе",
  completed: "Ориентир достигнут",
  opted_out: "Отложен",
  skipped: "Не требуется",
};

interface JourneyMilestoneCardProps {
  progress: MilestoneProgress;
  onCompleteStep: (milestoneId: MilestoneId, babyStepId: string) => void;
  onAcknowledge: (milestoneId: MilestoneId) => void;
  onOptOut: (milestoneId: MilestoneId) => void;
  onOptIn: (milestoneId: MilestoneId) => void;
  onMoveUp: (milestoneId: MilestoneId) => void;
  onMoveDown: (milestoneId: MilestoneId) => void;
  canReorder: boolean;
}

export function JourneyMilestoneCard({
  progress,
  onCompleteStep,
  onAcknowledge,
  onOptOut,
  onOptIn,
  onMoveUp,
  onMoveDown,
  canReorder,
}: JourneyMilestoneCardProps) {
  const definition = getMilestoneDefinition(progress.id);
  if (!definition) return null;

  const completedSteps = progress.babySteps.filter((s) => s.completed).length;
  const totalSteps = progress.babySteps.length;
  const stepPercent =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <article
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      aria-labelledby={`milestone-${progress.id}-title`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {STATUS_LABELS[progress.status]}
            {definition.optional ? " · опционально" : ""}
          </p>
          <h3
            id={`milestone-${progress.id}-title`}
            className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {definition.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {definition.description}
          </p>
        </div>
        {canReorder && progress.status !== "opted_out" ? (
          <div className="flex gap-1" aria-label="Изменить порядок">
            <button
              type="button"
              onClick={() => onMoveUp(progress.id)}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label={`Поднять «${definition.title}»`}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onMoveDown(progress.id)}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label={`Опустить «${definition.title}»`}
            >
              ↓
            </button>
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-indigo-700 dark:text-indigo-300" aria-live="polite">
        {progress.feedback}
      </p>

      {progress.coveragePercent !== undefined ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Покрытие слоя</span>
            <span className="tabular-nums">
              {Math.round(progress.coveragePercent)}%
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
            role="progressbar"
            aria-valuenow={Math.min(progress.coveragePercent, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Покрытие: ${definition.title}`}
          >
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{
                width: `${Math.min(progress.coveragePercent, 100)}%`,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Шаги</span>
            <span className="tabular-nums">
              {completedSteps}/{totalSteps}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
            role="progressbar"
            aria-valuenow={stepPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${stepPercent}%` }}
            />
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2" aria-label={`Шаги: ${definition.title}`}>
        {definition.babySteps.map((step) => {
          const stepProgress = progress.babySteps.find((s) => s.id === step.id);
          const done = stepProgress?.completed ?? false;
          return (
            <li
              key={step.id}
              className="flex items-start gap-3 rounded-xl border border-zinc-100 px-3 py-2 dark:border-zinc-800"
            >
              <input
                type="checkbox"
                id={`${progress.id}-${step.id}`}
                checked={done}
                disabled={
                  progress.status === "locked" ||
                  progress.status === "opted_out" ||
                  progress.status === "skipped"
                }
                onChange={() => {
                  if (!done) onCompleteStep(progress.id, step.id);
                }}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                aria-describedby={`${progress.id}-${step.id}-desc`}
              />
              <label
                htmlFor={`${progress.id}-${step.id}`}
                className="min-w-0 flex-1 cursor-pointer"
              >
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {step.title}
                  {stepProgress?.autoDetected ? (
                    <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                      (по данным устойчивости)
                    </span>
                  ) : null}
                </span>
                <span
                  id={`${progress.id}-${step.id}-desc`}
                  className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {step.description}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {progress.status === "in_progress" || progress.status === "available" ? (
          <button
            type="button"
            onClick={() => onAcknowledge(progress.id)}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Отметить ориентир
          </button>
        ) : null}
        {definition.optional && progress.status !== "opted_out" ? (
          <button
            type="button"
            onClick={() => onOptOut(progress.id)}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Отложить
          </button>
        ) : null}
        {progress.status === "opted_out" ? (
          <button
            type="button"
            onClick={() => onOptIn(progress.id)}
            className="rounded-xl border border-indigo-200 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            Вернуть в путь
          </button>
        ) : null}
      </div>
    </article>
  );
}
