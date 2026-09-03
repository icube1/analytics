"use client";

import { SinkingFundsEditor } from "@/components/resilience/sinking-funds-editor";
import { proposeSurplusAllocation } from "@/lib/journey/surplus-allocation";
import { createSinkingFundGoal } from "@/lib/resilience-defaults";
import { formatMonths, formatRub } from "@/lib/resilience-format";
import type { ResilienceInput, ResiliencePlan } from "@/lib/resilience-plan";

interface JourneyReserveLayersPanelProps {
  input: ResilienceInput;
  plan: ResiliencePlan;
  onChange: (next: ResilienceInput) => void;
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
        {label}
      </span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={1000}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums text-zinc-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
    </label>
  );
}

export function JourneyReserveLayersPanel({
  input,
  plan,
  onChange,
}: JourneyReserveLayersPanelProps) {
  const allocation = proposeSurplusAllocation(input, plan);

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      aria-labelledby="journey-layers-title"
    >
      <h2
        id="journey-layers-title"
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
      >
        Целевые фонды и впечатления
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Планируемые траты и качество жизни — отдельные слои, не часть аварийной
        подушки. Полная карта факторов остаётся на странице устойчивости.
      </p>

      <div className="mt-4">
        <SinkingFundsEditor
          funds={input.sinkingFunds}
          onChange={(sinkingFunds) => onChange({ ...input, sinkingFunds })}
          createGoal={() =>
            createSinkingFundGoal({
              label: "Новая цель",
              targetAmount: 0,
              currentAmount: 0,
              monthsUntilDue: 12,
            })
          }
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <NumberField
          id="journey-experiences-target"
          label="Годовой ориентир впечатлений, ₽"
          value={input.experiences.annualTarget}
          onChange={(value) =>
            onChange({
              ...input,
              experiences: { ...input.experiences, annualTarget: value },
            })
          }
        />
        <NumberField
          id="journey-experiences-current"
          label="Уже отложено на впечатления, ₽"
          value={input.experiences.currentAmount}
          onChange={(value) =>
            onChange({
              ...input,
              experiences: { ...input.experiences, currentAmount: value },
            })
          }
        />
      </div>

      <div
        className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/40"
        aria-live="polite"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
          Куда направить свободный остаток
        </h3>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
          {allocation.message}
        </p>
        {allocation.buckets.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {allocation.buckets.map((bucket) => (
              <li
                key={bucket.id}
                className="rounded-lg bg-white/80 px-3 py-2 text-sm dark:bg-zinc-950/50"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">
                    {bucket.label}
                  </span>
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
                    {formatRub(bucket.monthlySuggested)}
                    /мес
                    {bucket.monthsToFill && bucket.monthsToFill > 1
                      ? ` · ${formatMonths(bucket.monthsToFill)}`
                      : ""}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {bucket.reason}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
