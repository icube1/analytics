"use client";

import { FieldHelp } from "@/components/field-help";
import type {
  HouseholdRiskInput,
  ResilienceInput,
  SinkingFundGoal,
} from "@/lib/resilience-plan";
import { createSinkingFundGoal } from "@/lib/resilience-defaults";

interface ResilienceInputsPanelProps {
  input: ResilienceInput;
  onChange: (next: ResilienceInput) => void;
}

function NumberField({
  id,
  label,
  help,
  value,
  min = 0,
  step = 1000,
  onChange,
}: {
  id: string;
  label: string;
  help?: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {label}
        {help ? <FieldHelp text={help} /> : null}
      </span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums text-zinc-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900"
      />
    </label>
  );
}

function SelectField<T extends string>({
  id,
  label,
  help,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  help?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {label}
        {help ? <FieldHelp text={help} /> : null}
      </span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-900"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function updateHousehold(
  input: ResilienceInput,
  patch: Partial<HouseholdRiskInput>,
): ResilienceInput {
  return {
    ...input,
    household: { ...input.household, ...patch },
  };
}

function SinkingFundsEditor({
  funds,
  onChange,
}: {
  funds: SinkingFundGoal[];
  onChange: (funds: SinkingFundGoal[]) => void;
}) {
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
        onClick={() => onChange([...funds, createSinkingFundGoal()])}
        className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-zinc-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
      >
        Добавить целевое накопление
      </button>
    </div>
  );
}

export function ResilienceInputsPanel({
  input,
  onChange,
}: ResilienceInputsPanelProps) {
  return (
    <div className="space-y-4">
      <Section
        title="Базовый снимок"
        description="Минимальный набор для оценки ликвидности. Данные остаются только в этом браузере."
      >
        <NumberField
          id="mandatory-expenses"
          label="Обязательные расходы в месяц"
          help="Аренда, коммунальные, питание, транспорт, минимальные долговые платежи."
          value={input.mandatoryMonthlyExpenses}
          onChange={(value) =>
            onChange({ ...input, mandatoryMonthlyExpenses: value })
          }
        />
        <NumberField
          id="discretionary-expenses"
          label="Дискреционные расходы"
          help="Расходы, которые можно сократить при шоке. Используются в пояснениях, не в базовом burn-rate."
          value={input.discretionaryMonthlyExpenses}
          onChange={(value) =>
            onChange({ ...input, discretionaryMonthlyExpenses: value })
          }
        />
        <NumberField
          id="liquid-assets"
          label="Ликвидные активы"
          help="Деньги и инструменты, которые можно быстро превратить в cash без штрафов."
          value={input.liquidAssets}
          onChange={(value) => onChange({ ...input, liquidAssets: value })}
        />
        <NumberField
          id="monthly-surplus"
          label="Свободный остаток в месяц"
          help="Сколько остаётся после обязательных расходов и плановых взносов."
          value={input.monthlySurplus}
          onChange={(value) => onChange({ ...input, monthlySurplus: value })}
        />
        <NumberField
          id="pay-cycle-days"
          label="Дней между поступлениями дохода"
          value={input.payCycleDays}
          step={1}
          onChange={(value) =>
            onChange({ ...input, payCycleDays: Math.max(1, value) })
          }
        />
      </Section>

      <Section
        title="Домохозяйство"
        description="Факторы, влияющие на глубину резервов без оценочных суждений о ваших решениях."
      >
        <SelectField
          id="income-stability"
          label="Стабильность дохода"
          value={input.household.incomeStability}
          options={[
            { value: "stable", label: "Стабильный" },
            { value: "variable", label: "Переменный" },
            { value: "seasonal", label: "Сезонный" },
          ]}
          onChange={(value) =>
            onChange(updateHousehold(input, { incomeStability: value }))
          }
        />
        <NumberField
          id="income-sources"
          label="Источников дохода"
          value={input.household.incomeSourceCount}
          step={1}
          onChange={(value) =>
            onChange(
              updateHousehold(input, {
                incomeSourceCount: Math.max(1, Math.round(value)),
              }),
            )
          }
        />
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={input.household.hasSecondaryHouseholdIncome}
            onChange={(event) =>
              onChange(
                updateHousehold(input, {
                  hasSecondaryHouseholdIncome: event.target.checked,
                }),
              )
            }
            className="size-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-200">
            В домохозяйстве есть второй доход
          </span>
        </label>
        <NumberField
          id="dependents"
          label="Иждивенцев"
          value={input.household.dependentCount}
          step={1}
          onChange={(value) =>
            onChange(
              updateHousehold(input, {
                dependentCount: Math.max(0, Math.round(value)),
              }),
            )
          }
        />
        <NumberField
          id="job-search-months"
          label="Ожидаемый поиск работы (мес.)"
          value={input.household.jobSearchMonths}
          step={1}
          onChange={(value) =>
            onChange(
              updateHousehold(input, {
                jobSearchMonths: Math.max(0, Math.round(value)),
              }),
            )
          }
        />
        <SelectField
          id="insurance"
          label="Страховое покрытие"
          value={input.household.insuranceCoverage}
          options={[
            { value: "low", label: "Минимальное" },
            { value: "medium", label: "Среднее" },
            { value: "high", label: "Высокое" },
          ]}
          onChange={(value) =>
            onChange(updateHousehold(input, { insuranceCoverage: value }))
          }
        />
        <SelectField
          id="risk-tolerance"
          label="Толерантность к риску"
          help="Влияет на ширину базового резерва. Стресс-сценарии показывают downside в любом случае."
          value={input.household.riskTolerance}
          options={[
            { value: "conservative", label: "Консервативная" },
            { value: "moderate", label: "Умеренная" },
            { value: "aggressive", label: "Высокая" },
          ]}
          onChange={(value) =>
            onChange(updateHousehold(input, { riskTolerance: value }))
          }
        />
      </Section>

      <Section
        title="Долговая нагрузка"
        description="Долг учитывается в операционном буфере, стресс-сценариях и пояснениях."
      >
        <NumberField
          id="debt-balance"
          label="Суммарный остаток долга"
          value={input.debt.totalBalance}
          onChange={(value) =>
            onChange({
              ...input,
              debt: { ...input.debt, totalBalance: value },
            })
          }
        />
        <NumberField
          id="debt-payments"
          label="Ежемесячные платежи по долгу"
          value={input.debt.monthlyPayments}
          onChange={(value) =>
            onChange({
              ...input,
              debt: { ...input.debt, monthlyPayments: value },
            })
          }
        />
        <NumberField
          id="debt-rate"
          label="Средневзвешенная ставка, % годовых"
          value={input.debt.weightedAnnualRate}
          step={0.1}
          onChange={(value) =>
            onChange({
              ...input,
              debt: { ...input.debt, weightedAnnualRate: value },
            })
          }
        />
        <NumberField
          id="high-interest-balance"
          label="Высокопроцентный остаток"
          help="Остаток по дорогим кредитам/картам — для описательных заметок о trade-off."
          value={input.debt.highInterestBalance}
          onChange={(value) =>
            onChange({
              ...input,
              debt: { ...input.debt, highInterestBalance: value },
            })
          }
        />
      </Section>

      <Section
        title="Целевые накопления и впечатления"
        description="Планируемые расходы и качество жизни считаются отдельными слоями."
      >
        <SinkingFundsEditor
          funds={input.sinkingFunds}
          onChange={(sinkingFunds) => onChange({ ...input, sinkingFunds })}
        />
        <NumberField
          id="experiences-target"
          label="Годовая цель фонда впечатлений"
          value={input.experiences.annualTarget}
          onChange={(value) =>
            onChange({
              ...input,
              experiences: { ...input.experiences, annualTarget: value },
            })
          }
        />
        <NumberField
          id="experiences-current"
          label="Уже отложено на впечатления"
          value={input.experiences.currentAmount}
          onChange={(value) =>
            onChange({
              ...input,
              experiences: { ...input.experiences, currentAmount: value },
            })
          }
        />
      </Section>
    </div>
  );
}
