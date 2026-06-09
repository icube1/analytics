"use client";

import type { Filters } from "@/lib/types";

interface FiltersPanelProps {
  filters: Filters;
  options: {
    categories: string[];
    statuses: string[];
    types: string[];
    cards: string[];
  };
  dateBounds: { min: string; max: string };
  filteredCount: number;
  totalCount: number;
  onChange: (filters: Filters) => void;
  onReset: () => void;
}

function MultiSelect({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-950">
        {values.map((value) => {
          const active = selected.includes(value);
          return (
            <button
              key={`${label}-${value}`}
              type="button"
              onClick={() => onToggle(value)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
              }`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const inputClass =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function FiltersPanel({
  filters,
  options,
  dateBounds,
  filteredCount,
  totalCount,
  onChange,
  onReset,
}: FiltersPanelProps) {
  const toggle = (key: keyof Filters, value: string) => {
    const current = filters[key] as string[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Фильтры
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Показано {filteredCount} из {totalCount} операций
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          Сбросить
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Дата с
          </span>
          <input
            type="date"
            value={filters.dateFrom}
            min={dateBounds.min}
            max={dateBounds.max}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Дата по
          </span>
          <input
            type="date"
            value={filters.dateTo}
            min={dateBounds.min}
            max={dateBounds.max}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Поиск по всем полям операции
          </span>
          <input
            type="search"
            placeholder="Получатель, категория, сумма, комментарий..."
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Сумма от
          </span>
          <input
            type="number"
            min={0}
            placeholder="0"
            value={filters.amountMin}
            onChange={(e) => onChange({ ...filters, amountMin: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Сумма до
          </span>
          <input
            type="number"
            min={0}
            placeholder="∞"
            value={filters.amountMax}
            onChange={(e) => onChange({ ...filters, amountMax: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className="flex items-center gap-2 self-end rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
          <input
            type="checkbox"
            checked={filters.excludeInternalTransfers}
            onChange={(e) =>
              onChange({
                ...filters,
                excludeInternalTransfers: e.target.checked,
              })
            }
            className="size-4 rounded border-zinc-300 text-indigo-600"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            Скрыть переводы себе
          </span>
        </label>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <MultiSelect
          label="Категории"
          values={options.categories}
          selected={filters.categories}
          onToggle={(v) => toggle("categories", v)}
        />
        <MultiSelect
          label="Статус"
          values={options.statuses}
          selected={filters.statuses}
          onToggle={(v) => toggle("statuses", v)}
        />
        <MultiSelect
          label="Тип операции"
          values={options.types}
          selected={filters.types}
          onToggle={(v) => toggle("types", v)}
        />
        <MultiSelect
          label="Карта"
          values={options.cards}
          selected={filters.cards}
          onToggle={(v) => toggle("cards", v)}
        />
      </div>
    </section>
  );
}
