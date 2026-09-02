"use client";

import { StatCard } from "@/components/stat-card";
import type { ResiliencePlan } from "@/lib/resilience-plan";
import {
  formatCoveragePercent,
  formatMonths,
  formatRub,
} from "@/lib/resilience-format";
import {
  RESILIENCE_LAYERS,
  layerCoveragePercent,
  layerStatusLabel,
} from "@/lib/resilience-layers";
import type { ResilienceEngine } from "@/lib/finance-worker/resilience-contract";

interface ResilienceResultsPanelProps {
  plan: ResiliencePlan | null;
  engine: ResilienceEngine | null;
  parityVerified: boolean | null;
  isLoading: boolean;
  isStale: boolean;
  error: string | null;
}

function EngineBadge({
  engine,
  parityVerified,
  isStale,
}: {
  engine: ResilienceEngine | null;
  parityVerified: boolean | null;
  isStale: boolean;
}) {
  if (!engine) return null;

  const label =
    engine === "wasm"
      ? "Расчёт: Rust WASM"
      : "Расчёт: TypeScript (fallback)";

  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400"
      aria-live="polite"
    >
      <span className="rounded-full border border-zinc-200 px-2 py-1 dark:border-zinc-700">
        {label}
        {isStale ? " · обновление…" : ""}
      </span>
      {parityVerified === true ? (
        <span className="rounded-full border border-emerald-200 px-2 py-1 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
          TS/WASM parity OK
        </span>
      ) : null}
      {parityVerified === false ? (
        <span className="rounded-full border border-amber-200 px-2 py-1 text-amber-700 dark:border-amber-900 dark:text-amber-300">
          Parity mismatch
        </span>
      ) : null}
    </div>
  );
}

function LayerProgress({
  title,
  description,
  recommended,
  percent,
  optional,
}: {
  title: string;
  description: string;
  recommended: number;
  percent: number;
  optional?: boolean;
}) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const status = layerStatusLabel(percent, recommended);

  return (
    <article
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      aria-label={`${title}: ${status}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
            {optional ? (
              <span className="ml-2 text-xs font-normal text-zinc-400">
                опционально
              </span>
            ) : null}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
            {formatRub(recommended)}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatCoveragePercent(percent)} покрытия
          </p>
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={`${title}: ${formatCoveragePercent(percent)}`}
      >
        <div
          className="h-full rounded-full bg-indigo-500 transition-[width] duration-300 ease-out dark:bg-indigo-400"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{status}</p>
    </article>
  );
}

export function ResilienceResultsPanel({
  plan,
  engine,
  parityVerified,
  isLoading,
  isStale,
  error,
}: ResilienceResultsPanelProps) {
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
      >
        {error}
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {isLoading
          ? "Считаем слои резервов и сценарии…"
          : "Заполните базовый снимок, чтобы увидеть карту устойчивости."}
      </div>
    );
  }

  const coverageRecord = plan.coverage as unknown as Record<string, number>;

  return (
    <div className="space-y-4" aria-busy={isLoading || isStale}>
      <EngineBadge
        engine={engine}
        parityVerified={parityVerified}
        isStale={isStale}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Месяцев обязательных расходов"
          value={formatMonths(plan.totals.monthsOfMandatoryExpensesCovered)}
          hint="Сколько месяцев mandatory burn покрывает текущая ликвидность."
        />
        <StatCard
          label="До полного ориентира"
          value={formatRub(plan.totals.currentGapToRecommended)}
          hint="Разница между рекомендованной суммой всех слоёв и ликвидностью."
          tone={plan.totals.currentGapToRecommended <= 0 ? "income" : "default"}
        />
        <StatCard
          label="Риск-профиль"
          value={`${plan.risk.score} баллов`}
          hint={
            plan.risk.recommendsExtendedReserve
              ? "Рекомендуется расширенный резерв."
              : "Расширенный резерв не обязателен."
          }
        />
      </div>

      <section aria-labelledby="resilience-layers-heading">
        <h2
          id="resilience-layers-heading"
          className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Слои резервов
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {RESILIENCE_LAYERS.map((layer) => {
            const range = plan.layers[layer.id];
            return (
              <LayerProgress
                key={layer.id}
                title={layer.title}
                description={layer.description}
                recommended={range.recommended}
                percent={layerCoveragePercent(layer.id, coverageRecord)}
                optional={layer.optional}
              />
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="resilience-stress-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
      >
        <h2
          id="resilience-stress-heading"
          className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Стресс-сценарии
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Детерминированные проверки: потеря дохода, неожиданный расход и долг
          без новых заимствований.
        </p>
        <ul className="mt-4 space-y-3">
          {plan.stress.map((scenario) => (
            <li
              key={scenario.id}
              className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {scenario.label}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    scenario.survivable
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  }`}
                >
                  {scenario.survivable ? "Выдерживается" : "Нужен запас"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                {scenario.summary}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="resilience-explain-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
      >
        <h2
          id="resilience-explain-heading"
          className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Почему такие ориентиры
        </h2>
        <ul className="mt-3 space-y-2">
          {plan.explanations.map((item) => (
            <li
              key={item.factor}
              className="rounded-lg bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300"
            >
              {item.effect}
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          {plan.notes.map((note) => (
            <p
              key={note.topic}
              className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"
            >
              {note.text}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
