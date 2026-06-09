"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FieldHelp } from "@/components/field-help";
import { CalculatorChartsHelp } from "@/components/investments/calculator-charts-help";
import {
  getMonthlyDebtService,
  getTotalDebtBalance,
} from "@/lib/debt-amortization";
import { calculateCompoundInterest } from "@/lib/compound-interest";
import { getCustomAssetsMonthlyIncome } from "@/lib/custom-assets";
import { formatMoney } from "@/lib/portfolio-wealth";
import type { CompoundParams, CustomAssets } from "@/lib/portfolio-types";

interface CalculatorTabProps {
  params: CompoundParams;
  customAssets: CustomAssets;
  brokerTotal: number;
  onChange: (params: CompoundParams) => void;
}

const inputClass =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

function Field({
  label,
  hint,
  help,
  children,
}: {
  label: string;
  hint?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        {help && <FieldHelp text={help} />}
      </span>
      {children}
      {hint && (
        <span className="text-[10px] leading-tight text-zinc-400 dark:text-zinc-500">
          {hint}
        </span>
      )}
    </label>
  );
}

function CheckboxRow({
  label,
  help,
  checked,
  onChange,
  className,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-2 dark:border-zinc-700 ${className ?? ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 shrink-0 rounded text-indigo-600"
      />
      <span className="flex min-w-0 flex-1 items-center gap-1 text-xs leading-snug">
        <span>{label}</span>
        {help && <FieldHelp text={help} />}
      </span>
    </label>
  );
}

function CollapsibleBlock({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      open={defaultOpen || undefined}
    >
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-zinc-800 marker:content-none dark:text-zinc-100">
        <span className="flex items-center justify-between gap-2">
          {title}
          <span className="text-xs font-normal text-zinc-400 group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
        {children}
      </div>
    </details>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-[9.5rem] shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-zinc-400">{hint}</p>}
    </div>
  );
}

export function CalculatorTab({
  params,
  customAssets,
  brokerTotal,
  onChange,
}: CalculatorTabProps) {
  const [chartsHelpOpen, setChartsHelpOpen] = useState(false);
  const monthlyDebtService = getMonthlyDebtService(customAssets);
  const totalDebtBalance = getTotalDebtBalance(customAssets);
  const customMonthlyIncome = getCustomAssetsMonthlyIncome(customAssets);

  const contributionSplitHint = useMemo(() => {
    const contribution = params.monthlyContribution || 0;

    if (monthlyDebtService <= 0) {
      return `В инвестиции: ${formatMoney(contribution)}`;
    }

    if (totalDebtBalance > 0) {
      const toInvest = Math.max(0, contribution - monthlyDebtService);
      const fromContributionToDebt = Math.min(contribution, monthlyDebtService);
      let hint = `По долгам: ${formatMoney(fromContributionToDebt)} · В инвестиции: ${formatMoney(toInvest)}`;
      if (monthlyDebtService > contribution) {
        hint += ` · не хватает ${formatMoney(monthlyDebtService - contribution)}`;
      }
      return hint;
    }

    if (params.reinvestFreedDebtPayments) {
      return `Долги погашены · В инвестиции: ${formatMoney(contribution + monthlyDebtService)} (вкл. бывшие платежи)`;
    }

    return `Долги погашены · В инвестиции: ${formatMoney(contribution)}`;
  }, [
    params.monthlyContribution,
    params.reinvestFreedDebtPayments,
    monthlyDebtService,
    totalDebtBalance,
  ]);

  const result = useMemo(
    () =>
      calculateCompoundInterest(params, {
        customAssets,
        brokerTotal,
      }),
    [params, customAssets, brokerTotal],
  );

  const chartData = result.points.map((p) => ({
    label: p.label,
    nominal: p.balance,
    inflationHurdle: p.inflationHurdle,
    realPortfolio: p.realBalance,
    realContributed: p.realContributed,
    totalDebt: p.totalDebt,
  }));

  const set = <K extends keyof CompoundParams>(key: K, value: CompoundParams[K]) =>
    onChange({ ...params, [key]: value });

  const allStats = [
    { label: "Итого (номинал)", value: formatMoney(result.finalBalance) },
    { label: "Итого (реальные ₽)", value: formatMoney(result.finalRealBalance) },
    { label: "Внесено (номинал)", value: formatMoney(result.totalContributed) },
    { label: "Внесено (реальные ₽)", value: formatMoney(result.finalRealContributed) },
    { label: "Выведено", value: formatMoney(result.totalWithdrawn) },
    { label: "Долг (остаток)", value: formatMoney(result.finalTotalDebt) },
    { label: "Погашено долга", value: formatMoney(result.totalDebtPrincipalPaid) },
    { label: "Налог (дивиденды)", value: formatMoney(result.totalDividendTax) },
    { label: "Налог (при выводе)", value: formatMoney(result.totalWithdrawalTax) },
    { label: "Налог всего", value: formatMoney(result.totalTaxPaid) },
    { label: "Прибыль", value: formatMoney(result.totalProfit) },
    { label: "После налога", value: formatMoney(result.totalProfitAfterTax) },
    { label: "Доходность (IRR)", value: `${result.effectiveAnnualReturn.toFixed(1)}%` },
    { label: "Реальная доходность", value: `${result.realAnnualReturn.toFixed(1)}%` },
    {
      label: "Доход / мес (номинал)",
      value: `${result.monthlyReturnPercent.toFixed(2)}% · ${formatMoney(result.monthlyIncomeAtEnd)}`,
    },
    {
      label: "Доход / мес (реальный)",
      value: `${result.monthlyReturnPercentReal.toFixed(2)}% · ${formatMoney(result.monthlyIncomeRealAtEnd)}`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field
            label="Начальный капитал, ₽"
            help="Сколько у вас уже есть на старте: брокерский счёт плюс все активы из вкладки «Другие активы» (за вычетом долгов). Подставляется из портфеля, но можно изменить вручную."
          >
            <input
              type="number"
              className={inputClass}
              value={params.initialCapital || ""}
              onChange={(e) =>
                set("initialCapital", Number.parseFloat(e.target.value) || 0)
              }
            />
          </Field>
          <Field
            label="Пополнение / мес, ₽"
            hint={contributionSplitHint}
            help="Сколько вы планируете откладывать каждый месяц. Сначала из этой суммы оплачиваются долги (ипотека, кредиты), остаток идёт в инвестиции. Взнос добавляется в начале месяца."
          >
            <input
              type="number"
              className={inputClass}
              value={params.monthlyContribution || ""}
              onChange={(e) =>
                set("monthlyContribution", Number.parseFloat(e.target.value) || 0)
              }
            />
          </Field>
          <Field
            label="Срок, лет"
            help="Горизонт расчёта в полных годах. На графике и в таблице показываются ключевые точки за весь период — обычно не больше ~50 шагов для наглядности."
          >
            <input
              type="number"
              min={1}
              max={50}
              className={inputClass}
              value={params.years || ""}
              onChange={(e) =>
                set("years", Number.parseFloat(e.target.value) || 1)
              }
            />
          </Field>
          <Field
            label="Доходность брокера, %"
            hint="Взносы и брокерский счёт. Другие активы — по своим настройкам"
            help="Ожидаемая годовая доходность брокерского счёта и новых взносов (акции, золото GLD, кэш). Активы из «Других активов» растут по своим настройкам — инфляция, % или аренда."
          >
            <input
              type="number"
              step={0.1}
              className={inputClass}
              value={params.annualReturnPercent || ""}
              onChange={(e) =>
                set(
                  "annualReturnPercent",
                  Number.parseFloat(e.target.value) || 0,
                )
              }
            />
          </Field>
          <Field
            label="Инфляция, %"
            hint="Рост стоимости активов с галочкой «вместе с инфляцией»"
            help="Годовая инфляция для расчётов. Влияет на линию «бенчмарк инфляции», реальную покупательную способность портфеля и рост стоимости активов с галочкой «растёт вместе с инфляцией»."
          >
            <input
              type="number"
              step={0.1}
              className={inputClass}
              value={params.inflationPercent || ""}
              onChange={(e) =>
                set("inflationPercent", Number.parseFloat(e.target.value) || 0)
              }
            />
          </Field>
          <Field
            label="Налог, %"
            help="Ставка налога на прибыль при выводе средств (НДФЛ). Налог на нереализованный рост в портфеле не берётся, пока вы не выводите деньги. Отдельно можно включить налог на дивиденды в расширенных настройках."
          >
            <input
              type="number"
              step={0.1}
              className={inputClass}
              value={params.taxOnProfitPercent || ""}
              onChange={(e) =>
                set("taxOnProfitPercent", Number.parseFloat(e.target.value) || 0)
              }
            />
          </Field>
        </div>
        {customMonthlyIncome > 0 && (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Доход от активов:{" "}
            <strong>{formatMoney(customMonthlyIncome)}/мес</strong> — учитывается
            по настройкам каждого актива
            {params.reinvestReturns ? " (реинвестируется)" : " (выводится)"}.
          </p>
        )}
      </section>

      <CollapsibleBlock title="Расширенные настройки">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Капитализация дохода"
            help="Как часто проценты по брокерскому счёту прибавляются к капиталу: каждый месяц, квартал, полгода или год. Чем чаще капитализация при той же ставке, тем чуть выше итог (эффект сложного процента)."
          >
            <select
              className={inputClass}
              value={params.compoundFrequency}
              onChange={(e) =>
                set(
                  "compoundFrequency",
                  e.target.value as CompoundParams["compoundFrequency"],
                )
              }
            >
              <option value="monthly">Ежемесячно</option>
              <option value="quarterly">Ежеквартально</option>
              <option value="semiannual">Раз в полгода</option>
              <option value="yearly">Ежегодно</option>
            </select>
          </Field>
          <Field
            label="Месячная ставка"
            hint="Упрощённая = годовая ÷ 12"
            help="Способ перевода годовой ставки в месячную. Эффективная: (1 + годовая)^(1/12) − 1 — математически точнее. Упрощённая: годовая ÷ 12 — как во многих банковских калькуляторах."
          >
            <select
              className={inputClass}
              value={params.monthlyRateMethod ?? "effective"}
              onChange={(e) =>
                set(
                  "monthlyRateMethod",
                  e.target.value as CompoundParams["monthlyRateMethod"],
                )
              }
            >
              <option value="effective">Эффективная</option>
              <option value="simple">Упрощённая</option>
            </select>
          </Field>
          <Field
            label="Рост пополнений, %"
            hint="Если взносы не индексируются"
            help="На сколько процентов в год увеличивается ежемесячное пополнение. Применяется раз в год, если не включена индексация взносов по инфляции."
          >
            <input
              type="number"
              step={0.1}
              className={inputClass}
              value={params.contributionGrowthPercent || ""}
              onChange={(e) =>
                set(
                  "contributionGrowthPercent",
                  Number.parseFloat(e.target.value) || 0,
                )
              }
              disabled={params.adjustContributionsForInflation}
            />
          </Field>
          <CheckboxRow
            label="Реинвестировать доход"
            help="Если включено — проценты по брокерскому счёту и денежный доход от активов (аренда и т.п.) остаются в портфеле. Если выключено — считается, что вы забираете их каждый месяц."
            checked={params.reinvestReturns}
            onChange={(checked) => set("reinvestReturns", checked)}
          />
          <CheckboxRow
            label="Индексировать взносы по инфляции"
            help="Ежемесячное пополнение растёт вместе с инфляцией, а не по фиксированному «росту пополнений». Взаимоисключающие настройки: при включении поле «Рост пополнений» отключается."
            checked={params.adjustContributionsForInflation}
            onChange={(checked) => set("adjustContributionsForInflation", checked)}
          />
          <CheckboxRow
            label="Налог на дивиденды (акции и ПИФ)"
            help="Учитывать НДФЛ с дивидендной доходности по акциям и ПИФам. Обычно выключают для ИИС и черновых расчётов. Потребует указать долю облагаемых активов и ожидаемую дивидендную доходность."
            checked={params.taxDividends}
            onChange={(checked) => set("taxDividends", checked)}
          />
          {monthlyDebtService > 0 && (
            <CheckboxRow
              label="Инвестировать платежи по долгу после погашения"
              help="Когда все долги погашены, сумма ежемесячных платежей по ним (ипотека, кредиты) автоматически добавляется к инвестируемой части пополнения — как будто вы перенаправили освободившиеся деньги в портфель."
              checked={params.reinvestFreedDebtPayments}
              onChange={(checked) => set("reinvestFreedDebtPayments", checked)}
              className="sm:col-span-2 lg:col-span-3"
            />
          )}
          {params.taxDividends && (
            <>
              <Field
                label="Доля акций и ПИФ, %"
                help="Какая часть портфеля облагается налогом на дивиденды. Обычно подставляется из доли акций на брокере и ПИФов в «Других активах». 100% — весь портфель, 0% — налог не считается."
              >
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className={inputClass}
                  value={Math.round(params.taxableAssetShare * 1000) / 10 || ""}
                  onChange={(e) =>
                    set(
                      "taxableAssetShare",
                      Math.min(
                        1,
                        Math.max(0, (Number.parseFloat(e.target.value) || 0) / 100),
                      ),
                    )
                  }
                />
              </Field>
              <Field
                label="Дивидендная доходность, %"
                help="Ожидаемые дивиденды и выплаты по ПИФам в процентах годовых от стоимости облагаемой части. Налог считается на эту сумму при каждой капитализации дохода."
              >
                <input
                  type="number"
                  step={0.1}
                  className={inputClass}
                  value={params.dividendYieldPercent || ""}
                  onChange={(e) =>
                    set(
                      "dividendYieldPercent",
                      Number.parseFloat(e.target.value) || 0,
                    )
                  }
                />
              </Field>
            </>
          )}
          <CheckboxRow
            label="Вывод после горизонта накопления"
            help="Включите, если после периода накопления планируете регулярно снимать фиксированную сумму с портфеля. До указанного года деньги только копятся."
            checked={params.withdrawAfterYears != null}
            onChange={(checked) =>
              set(
                "withdrawAfterYears",
                checked ? Math.min(params.years, 10) : null,
              )
            }
            className="sm:col-span-2"
          />
          {params.withdrawAfterYears != null && (
            <>
              <Field
                label="Вывод с года"
                help="С какого года симуляции начинается ежемесячный вывод. Например, при сроке 20 лет и значении 10 — первые 10 лет только накопление, затем вывод."
              >
                <input
                  type="number"
                  min={1}
                  max={params.years}
                  className={inputClass}
                  value={params.withdrawAfterYears || ""}
                  onChange={(e) =>
                    set(
                      "withdrawAfterYears",
                      Math.min(
                        params.years,
                        Math.max(1, Number.parseFloat(e.target.value) || 1),
                      ),
                    )
                  }
                />
              </Field>
              <Field
                label="Вывод / мес, ₽"
                hint="В ценах сегодня"
                help="Сумма, которую хотите получать каждый месяц после фазы накопления, в рублях сегодняшней покупательной способности. В расчёте она индексируется по инфляции — номинальная выплата растёт со временем."
              >
                <input
                  type="number"
                  className={inputClass}
                  value={params.monthlyWithdrawal || ""}
                  onChange={(e) =>
                    set(
                      "monthlyWithdrawal",
                      Number.parseFloat(e.target.value) || 0,
                    )
                  }
                />
              </Field>
            </>
          )}
        </div>
      </CollapsibleBlock>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <MiniStat
          label="Итого"
          value={formatMoney(result.finalBalance)}
          hint="номинал"
        />
        <MiniStat
          label="Реально"
          value={formatMoney(result.finalRealBalance)}
          hint="в ценах сегодня"
        />
        <MiniStat
          label="Долг"
          value={formatMoney(result.finalTotalDebt)}
        />
        <MiniStat
          label="IRR"
          value={`${result.effectiveAnnualReturn.toFixed(1)}%`}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Прогноз накоплений</h3>
          <button
            type="button"
            onClick={() => setChartsHelpOpen(true)}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Что означают линии?
          </button>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000
                    ? `${Math.round(v / 1000)}к`
                    : String(v)
              }
            />
            <Tooltip cursor={false} formatter={(v) => formatMoney(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="nominal"
              name="Портфель (номинал)"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="inflationHurdle"
              name="Бенчмарк инфляции"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="realPortfolio"
              name="Портфель (реальные ₽)"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="realContributed"
              name="Внесено (реальные ₽)"
              stroke="#a1a1aa"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={false}
            />
            {result.points.some((p) => p.totalDebt > 0) && (
              <Line
                type="monotone"
                dataKey="totalDebt"
                name="Долг (остаток)"
                stroke="#f43f5e"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <CalculatorChartsHelp
        open={chartsHelpOpen}
        onClose={() => setChartsHelpOpen(false)}
      />

      <CollapsibleBlock title="Все показатели">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {allStats.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
            >
              <p className="text-[10px] text-zinc-500">{item.label}</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </CollapsibleBlock>

      <CollapsibleBlock title="Помесячная динамика">
        <div className="max-h-72 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950">
              <tr>
                <th className="px-3 py-1.5">Период</th>
                <th className="px-3 py-1.5 text-right">Номинал</th>
                <th className="px-3 py-1.5 text-right">Реально</th>
                <th className="px-3 py-1.5 text-right">Внесено</th>
                <th className="px-3 py-1.5 text-right">Выведено</th>
                <th className="px-3 py-1.5 text-right">Долг</th>
                <th className="px-3 py-1.5 text-right">Прибыль</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {result.points.map((p) => (
                <tr key={`compound-${p.month}`}>
                  <td className="px-3 py-1.5">{p.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMoney(p.balance)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMoney(p.realBalance)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMoney(p.contributed)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMoney(p.withdrawn)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMoney(p.totalDebt)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMoney(p.profitAfterTax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleBlock>
    </div>
  );
}
