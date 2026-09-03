"use client";

import { useState, type FormEvent } from "react";
import type { ResilienceInput } from "@/lib/resilience-plan";
import { ZERO_CAPITAL_RESILIENCE_INPUT } from "@/lib/resilience-defaults";

interface JourneyOnboardingFormProps {
  initial?: ResilienceInput;
  onSave: (input: ResilienceInput) => void;
}

export function JourneyOnboardingForm({
  initial,
  onSave,
}: JourneyOnboardingFormProps) {
  const [input, setInput] = useState<ResilienceInput>(
    () => initial ?? structuredClone(ZERO_CAPITAL_RESILIENCE_INPUT),
  );

  function update<K extends keyof ResilienceInput>(
    key: K,
    value: ResilienceInput[K],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSave(input);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/40"
      aria-labelledby="journey-onboarding-title"
    >
      <h2
        id="journey-onboarding-title"
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
      >
        Стартовая картина без капитала
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
        Можно начать с нулевых резервов. Укажите обязательные расходы и то, что
        уже есть под рукой — брокерский счёт не обязателен.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <NumberField
          id="journey-mandatory"
          label="Обязательные расходы, ₽/мес"
          value={input.mandatoryMonthlyExpenses}
          onChange={(value) => update("mandatoryMonthlyExpenses", value)}
        />
        <NumberField
          id="journey-liquid"
          label="Доступная ликвидность, ₽"
          value={input.liquidAssets}
          onChange={(value) => update("liquidAssets", value)}
        />
        <NumberField
          id="journey-surplus"
          label="Профицит после обязательных, ₽/мес"
          value={input.monthlySurplus}
          onChange={(value) => update("monthlySurplus", value)}
        />
        <NumberField
          id="journey-discretionary"
          label="Дискреционные расходы, ₽/мес"
          value={input.discretionaryMonthlyExpenses}
          onChange={(value) => update("discretionaryMonthlyExpenses", value)}
        />
        <NumberField
          id="journey-debt"
          label="Долг, ₽ (необязательно)"
          value={input.debt.totalBalance}
          onChange={(value) =>
            setInput((current) => ({
              ...current,
              debt: { ...current.debt, totalBalance: value },
            }))
          }
        />
        <NumberField
          id="journey-debt-payment"
          label="Платёж по долгу, ₽/мес"
          value={input.debt.monthlyPayments}
          onChange={(value) =>
            setInput((current) => ({
              ...current,
              debt: { ...current.debt, monthlyPayments: value },
            }))
          }
        />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200 sm:col-span-2">
          <input
            type="checkbox"
            checked={input.household.dependentCount > 0}
            onChange={(event) =>
              setInput((current) => ({
                ...current,
                household: {
                  ...current.household,
                  dependentCount: event.target.checked ? 1 : 0,
                },
              }))
            }
          />
          Есть иждивенцы
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200 sm:col-span-2">
          <input
            type="checkbox"
            checked={input.household.hasSecondaryHouseholdIncome}
            onChange={(event) =>
              setInput((current) => ({
                ...current,
                household: {
                  ...current.household,
                  hasSecondaryHouseholdIncome: event.target.checked,
                  incomeSourceCount: event.target.checked
                    ? Math.max(current.household.incomeSourceCount, 2)
                    : 1,
                },
              }))
            }
          />
          Есть второй доход в семье
        </label>
      </div>
      <button
        type="submit"
        className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        Сохранить базу и показать ориентиры
      </button>
    </form>
  );
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
