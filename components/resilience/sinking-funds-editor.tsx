"use client";

import { createSinkingFundGoal } from "@/lib/resilience-defaults";
import type { SinkingFundGoal } from "@/lib/resilience-plan";

interface SinkingFundsEditorProps {
  funds: SinkingFundGoal[];
  onChange: (funds: SinkingFundGoal[]) => void;
  createGoal?: () => SinkingFundGoal;
}

function NumberField({
  id,
  label,
  value,
  step = 1000,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {label}
      </span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums text-zinc-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
    </label>
  );
}

export function SinkingFundsEditor({
  funds,
  onChange,
  createGoal = createSinkingFundGoal,
}: SinkingFundsEditorProps) {
  return (
    <div className="space-y-3 sm:col-span-2">
      {funds.map((fund, index) => (
        <div
          key={fund.id}
          className="grid gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Название цели
            </span>
            <input
              type="text"
              value={fund.label}
              onChange={(event) => {
                const next = [...funds];
                next[index] = { ...fund, label: event.target.value };
                onChange(next);
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <NumberField
            id={`sinking-target-${fund.id}`}
            label="Цель"
            value={fund.targetAmount}
            onChange={(value) => {
              const next = [...funds];
              next[index] = { ...fund, targetAmount: value };
              onChange(next);
            }}
          />
          <NumberField
            id={`sinking-current-${fund.id}`}
            label="Уже накоплено"
            value={fund.currentAmount}
            onChange={(value) => {
              const next = [...funds];
              next[index] = { ...fund, currentAmount: value };
              onChange(next);
            }}
          />
          <NumberField
            id={`sinking-months-${fund.id}`}
            label="Месяцев до срока"
            value={fund.monthsUntilDue}
            step={1}
            onChange={(value) => {
              const next = [...funds];
              next[index] = { ...fund, monthsUntilDue: Math.max(0, value) };
              onChange(next);
            }}
          />
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => onChange(funds.filter((item) => item.id !== fund.id))}
              className="rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-200/70 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              Удалить
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...funds, createGoal()])}
        className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-zinc-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
      >
        Добавить целевое накопление
      </button>
    </div>
  );
}
