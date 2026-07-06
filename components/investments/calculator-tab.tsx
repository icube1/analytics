"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartMoneyTooltip } from "@/components/chart-money-tooltip";
import { ChartToggleLegend } from "@/components/chart-toggle-legend";
import { FieldHelp } from "@/components/field-help";
import { CalculatorAssetChart } from "@/components/investments/calculator-asset-chart";
import { CalculatorChartsHelp } from "@/components/investments/calculator-charts-help";
import {
  estimateCurrentDebtPaymentBreakdown,
  getMonthlyDebtService,
  getTotalDebtBalance,
} from "@/lib/debt-amortization";
import { calculateCompoundInterest } from "@/lib/compound-interest";
import { buildForecastPlan } from "@/lib/forecast-plans";
import { getCustomAssetsMonthlyIncome } from "@/lib/custom-assets";
import { formatMoney } from "@/lib/portfolio-wealth";
import { computeSafeWithdrawalAdvice } from "@/lib/safe-withdrawal";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type {
  CompoundParams,
  CustomAssets,
  SavedForecastPlan,
} from "@/lib/portfolio-types";

interface CalculatorTabProps {
  params: CompoundParams;
  customAssets: CustomAssets;
  brokerTotal: number;
  forecastPlans: SavedForecastPlan[];
  onChange: (params: CompoundParams) => void;
  onSavePlan: (plan: SavedForecastPlan) => void;
  onDeletePlan: (planId: string) => void;
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

function WithdrawalModeToggle({
  mode,
  onChange,
}: {
  mode: CompoundParams["withdrawalMode"];
  onChange: (mode: CompoundParams["withdrawalMode"]) => void;
}) {
  const options: { id: CompoundParams["withdrawalMode"]; label: string }[] = [
    { id: "fixed", label: "Фикс. сумма" },
    { id: "percent", label: "% портфеля" },
  ];

  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        <span>Режим вывода</span>
        <FieldHelp text="Фиксированная сумма — ежемесячно, в сегодняшних ₽ (удобно сравнивать с зарплатой); номинал растёт с инфляцией. Процент — доля портфеля в год; каждый месяц снимается годовой процент ÷ 12." />
      </span>
      <div className="flex rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
              mode === option.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
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

const IRR_HELP =
  "IRR (внутренняя норма доходности) — годовая доходность с учётом дат всех взносов и итогового баланса. Показывает, какой среднегодовой процент фактически получился на вложенные деньги за весь период.";

function MiniStat({
  label,
  value,
  hint,
  help,
}: {
  label: string;
  value: string;
  hint?: string;
  help?: string;
}) {
  return (
    <div className="min-w-[9.5rem] shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
        <span>{label}</span>
        {help && <FieldHelp text={help} />}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-zinc-400">{hint}</p>}
    </div>
  );
}

export function CalculatorTab({
  params: savedParams,
  customAssets,
  brokerTotal,
  forecastPlans,
  onChange,
  onSavePlan,
  onDeletePlan,
}: CalculatorTabProps) {
  const [draft, setDraft] = useState(savedParams);
  const [planName, setPlanName] = useState("");
  const [showSavePlan, setShowSavePlan] = useState(false);
  const skipPersistRef = useRef(true);
  const { debounced: simParams, isPending: isSimPending } = useDebouncedValue(
    draft,
    400,
  );

  useEffect(() => {
    setDraft(savedParams);
  }, [savedParams]);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    const id = setTimeout(() => onChange(draft), 600);
    return () => clearTimeout(id);
  }, [draft, onChange]);

  const [chartsHelpOpen, setChartsHelpOpen] = useState(false);
  const [hiddenChartLines, setHiddenChartLines] = useState<Set<string>>(
    () => new Set(),
  );
  const [hiddenPayoutChartLines, setHiddenPayoutChartLines] = useState<
    Set<string>
  >(() => new Set());

  const toggleChartLine = useCallback((dataKey: string) => {
    setHiddenChartLines((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  }, []);

  const togglePayoutChartLine = useCallback((dataKey: string) => {
    setHiddenPayoutChartLines((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  }, []);

  const hasCustomWealth = customAssets.items.some((item) => item.enabled);
  const monthlyDebtService = getMonthlyDebtService(customAssets);
  const totalDebtBalance = getTotalDebtBalance(customAssets);
  const customMonthlyIncome = getCustomAssetsMonthlyIncome(customAssets);

  const contributionSplitHint = useMemo(() => {
    const contribution = draft.monthlyContribution || 0;
    const separate = draft.debtPaymentsSeparateFromContribution ?? false;
    const debtBreakdown = estimateCurrentDebtPaymentBreakdown(customAssets);
    const retirementNote =
      draft.withdrawAfterYears != null
        ? " · после начала вывода пополнения прекращаются"
        : "";

    if (monthlyDebtService <= 0) {
      return `В брокера: ${formatMoney(contribution)}${retirementNote}`;
    }

    const debtSplitNote =
      debtBreakdown.totalPayment > 0
        ? ` (тело ${formatMoney(debtBreakdown.totalPrincipal)}, проценты ${formatMoney(debtBreakdown.totalInterest)})`
        : "";

    if (separate) {
      const total = contribution + monthlyDebtService;
      const wealthBuilding = contribution + debtBreakdown.totalPrincipal;
      let hint = `В брокера: ${formatMoney(contribution)} · Долг: ${formatMoney(monthlyDebtService)}${debtSplitNote} · Бюджет: ${formatMoney(total)} · В рост капитала: ${formatMoney(wealthBuilding)}`;
      if (totalDebtBalance <= 0 && draft.reinvestFreedDebtPayments) {
        hint = `Долги погашены · В брокера: ${formatMoney(contribution + monthlyDebtService)} (вкл. бывшие платежи)`;
      }
      return hint + retirementNote;
    }

    if (totalDebtBalance > 0) {
      const toInvest = Math.max(0, contribution - monthlyDebtService);
      const fromContributionToDebt = Math.min(contribution, monthlyDebtService);
      const wealthBuilding = toInvest + debtBreakdown.totalPrincipal;
      let hint = `По долгам: ${formatMoney(fromContributionToDebt)}${debtSplitNote} · В брокера: ${formatMoney(toInvest)} · В рост капитала: ${formatMoney(wealthBuilding)}`;
      if (monthlyDebtService > contribution) {
        hint += ` · не хватает ${formatMoney(monthlyDebtService - contribution)}`;
      }
      return hint + retirementNote;
    }

    if (draft.reinvestFreedDebtPayments) {
      return `Долги погашены · В брокера: ${formatMoney(contribution + monthlyDebtService)} (вкл. бывшие платежи)${retirementNote}`;
    }

    return `Долги погашены · В брокера: ${formatMoney(contribution)}${retirementNote}`;
  }, [
    draft.monthlyContribution,
    draft.debtPaymentsSeparateFromContribution,
    draft.reinvestFreedDebtPayments,
    draft.withdrawAfterYears,
    monthlyDebtService,
    totalDebtBalance,
    customAssets,
  ]);

  const result = useMemo(
    () =>
      calculateCompoundInterest(simParams, {
        customAssets,
        brokerTotal,
      }),
    [simParams, customAssets, brokerTotal],
  );

  const safeWithdrawalAdvice = useMemo(
    () =>
      computeSafeWithdrawalAdvice(simParams, {
        customAssets,
        brokerTotal,
      }),
    [simParams, customAssets, brokerTotal],
  );

  const withdrawalPayoutPreview = useMemo(() => {
    if (simParams.withdrawAfterYears == null) return null;
    const payoutPoints = result.points.filter((p) => p.monthlyPayoutNominal > 0);
    const withdrawalPoints = result.points.filter((p) => p.inWithdrawalPhase);
    if (payoutPoints.length === 0 && withdrawalPoints.length === 0) return null;

    const first =
      result.withdrawalStartLabel != null
        ? {
            ...(payoutPoints[0] ?? withdrawalPoints[0]),
            label: result.withdrawalStartLabel,
            monthlyPayoutNominal: result.withdrawalStartPayoutNominal,
            monthlyPayoutReal: result.withdrawalStartPayoutReal,
            month:
              payoutPoints[0]?.month ??
              withdrawalPoints[0]?.month ??
              Math.round((simParams.withdrawAfterYears ?? 0) * 12) + 1,
          }
        : payoutPoints[0] ?? withdrawalPoints[0];

    return {
      first,
      last: payoutPoints[payoutPoints.length - 1] ?? withdrawalPoints[withdrawalPoints.length - 1],
      hasPayouts: payoutPoints.length > 0 || result.withdrawalStartPayoutReal > 0,
    };
  }, [result, simParams.withdrawAfterYears]);

  const showLiquidityLine =
    hasCustomWealth ||
    result.withdrawalEndedEarly ||
    result.points.some(
      (p) => p.liquidityBalance > 0 && p.liquidityBalance < p.balance * 0.98,
    );

  const showPayoutChart =
    simParams.withdrawAfterYears != null &&
    result.points.some(
      (p) =>
        p.inWithdrawalPhase &&
        (p.monthlyPayoutTargetReal > 0 || p.monthlyPayoutReal > 0),
    );

  const isPercentWithdrawal = (draft.withdrawalMode ?? "fixed") === "percent";

  const payoutTargetLineName = isPercentWithdrawal
    ? "Доля портфеля (сегодня, до налога)"
    : "Цель (сегодняшние ₽)";

  const withdrawalDepletionMarker =
    result.withdrawalLiquidityDepletedFromLabel ??
    result.withdrawalLastPayoutLabel;

  const withdrawalDepletionMonths =
    result.withdrawalMonthsLiquidityEmpty > 0
      ? result.withdrawalMonthsLiquidityEmpty
      : result.withdrawalMonthsWithoutPayout;

  const chartData = result.points.map((p) => ({
    label: p.label,
    nominal: p.balance,
    inflationHurdle: p.inflationHurdle,
    realPortfolio: p.realBalance,
    realContributed: p.realContributed,
    totalDebt: p.totalDebt,
    liquidityBalance: p.liquidityBalance,
  }));

  const payoutChartData = result.points
    .filter((p) => p.inWithdrawalPhase && p.monthlyPayoutTargetReal > 0)
    .map((p) => ({
      label: p.label,
      payoutActual: p.monthlyPayoutReal,
      payoutTarget: p.monthlyPayoutTargetReal,
    }));

  const withdrawalPayoutHelp = useMemo(() => {
    const inflationNote =
      "i — месячная инфляция из поля «Инфляция», m — номер месяца от старта плана.";
    if ((draft.withdrawalMode ?? "fixed") === "percent") {
      return (
        "Формулы (% портфеля / год):\n\n" +
        "цель = баланс × (% / год ÷ 12 ÷ 100)\n" +
        "номинал на руки = min(цель, баланс) − налог на прибыль\n" +
        "сегодняшние ₽ = номинал ÷ (1 + i)^m\n\n" +
        "Баланс — ликвидная часть на этот месяц. Целевая доля пересчитывается каждый месяц: при росте портфеля выплата растёт.\n\n" +
        inflationNote
      );
    }
    return (
      "Формулы (фикс. сумма):\n\n" +
      "цель = S × (1 + i)^m\n" +
      "списание = min(цель, баланс ликвидной части)\n" +
      "номинал на руки = списание − налог на прибыль\n" +
      "сегодняшние ₽ = номинал ÷ (1 + i)^m\n\n" +
      "S — «Вывод / мес» в сегодняшних ₽. " +
      inflationNote +
      " Если баланса не хватает — выплата меньше цели."
    );
  }, [draft.withdrawalMode]);

  const showDebtLine = result.points.some((p) => p.totalDebt > 0);
  const isChartLineHidden = (dataKey: string) => hiddenChartLines.has(dataKey);
  const isPayoutChartLineHidden = (dataKey: string) =>
    hiddenPayoutChartLines.has(dataKey);

  const set = <K extends keyof CompoundParams>(key: K, value: CompoundParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const allStats: { label: string; value: string; help?: string }[] = [
    { label: "Итого (номинал)", value: formatMoney(result.finalBalance) },
    { label: "Итого (реальные ₽)", value: formatMoney(result.finalRealBalance) },
    { label: "Внесено (номинал)", value: formatMoney(result.totalContributed) },
    { label: "Внесено (реальные ₽)", value: formatMoney(result.finalRealContributed) },
    { label: "Выведено", value: formatMoney(result.totalWithdrawn) },
    ...(result.withdrawalEndedEarly
      ? [
          {
            label: isPercentWithdrawal ? "Ликвидность = 0" : "Выплаты прекратились",
            value:
              result.withdrawalLiquidityDepletedFromLabel ??
              result.withdrawalLastPayoutLabel ??
              "—",
            help: isPercentWithdrawal
              ? "Первый месяц, когда ликвидная часть обнулилась и снять долю портфеля стало невозможно."
              : "Последний месяц, когда ликвидная часть позволила снять деньги.",
          },
          {
            label: "Мес. без выплат",
            value: String(withdrawalDepletionMonths),
            help: "Месяцев до конца горизонта без выплат из‑за нехватки ликвидной части.",
          },
        ]
      : []),
    ...(result.withdrawalPayoutNominal > 0
      ? (draft.withdrawalMode ?? "fixed") === "percent"
        ? [
            {
              label: "Ставка вывода",
              value: `${draft.annualWithdrawalPercent}% / год`,
              help: "Годовая доля портфеля; в расчёте каждый месяц снимается годовой процент ÷ 12.",
            },
            {
              label: "Вывод / год (номинал)",
              value: formatMoney(result.withdrawalPayoutNominal * 12),
              help: "Сумма на руки за год в рублях конца горизонта (после налога), при текущем балансе.",
            },
            {
              label: "Вывод / мес (сегодня)",
              value: formatMoney(result.withdrawalPayoutReal),
              help: "Ежемесячная выплата в сегодняшних рублях — для сравнения с расходами.",
            },
          ]
        : [
            {
              label: "Вывод / мес (номинал)",
              value: formatMoney(result.withdrawalPayoutNominal),
              help: "Сколько рублей того момента вы получите на руки в конце горизонта (после налога). Номинал растёт с инфляцией.",
            },
            {
              label: "Вывод / мес (сегодня)",
              value: formatMoney(result.withdrawalPayoutReal),
              help: "Та же выплата в сегодняшних рублях — удобно сравнивать с зарплатой.",
            },
          ]
      : []),
    { label: "Долг (остаток)", value: formatMoney(result.finalTotalDebt) },
    { label: "Погашено долга", value: formatMoney(result.totalDebtPrincipalPaid) },
    { label: "Налог (дивиденды)", value: formatMoney(result.totalDividendTax) },
    { label: "Налог (при выводе)", value: formatMoney(result.totalWithdrawalTax) },
    { label: "Налог всего", value: formatMoney(result.totalTaxPaid) },
    { label: "Прибыль", value: formatMoney(result.totalProfit) },
    { label: "После налога", value: formatMoney(result.totalProfitAfterTax) },
    {
      label: "Доходность (IRR)",
      value: `${result.effectiveAnnualReturn.toFixed(1)}%`,
      help: IRR_HELP,
    },
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
              value={draft.initialCapital || ""}
              onChange={(e) =>
                set("initialCapital", Number.parseFloat(e.target.value) || 0)
              }
            />
          </Field>
          <Field
            label="Пополнение в брокера / мес, ₽"
            hint={contributionSplitHint}
            help={
              draft.debtPaymentsSeparateFromContribution
                ? "Сколько каждый месяц переводите на брокерский счёт. Платежи по долгам из «Других активов» идут сверху этой суммы и не уменьшают взнос в брокера."
                : "Сколько откладываете каждый месяц на этапе накопления. Из суммы сначала платятся долги, остаток идёт в брокера. С года начала вывода пополнения прекращаются."
            }
          >
            <input
              type="number"
              className={inputClass}
              value={draft.monthlyContribution || ""}
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
              value={draft.years || ""}
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
              value={draft.annualReturnPercent || ""}
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
              value={draft.inflationPercent || ""}
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
              value={draft.taxOnProfitPercent || ""}
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
            {draft.reinvestReturns ? " (реинвестируется)" : " (выводится)"}.
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
              value={draft.compoundFrequency}
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
              value={draft.monthlyRateMethod ?? "effective"}
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
              value={draft.contributionGrowthPercent || ""}
              onChange={(e) =>
                set(
                  "contributionGrowthPercent",
                  Number.parseFloat(e.target.value) || 0,
                )
              }
              disabled={draft.adjustContributionsForInflation}
            />
          </Field>
          <CheckboxRow
            label="Реинвестировать доход"
            help="Если включено — проценты по брокерскому счёту и денежный доход от активов (аренда и т.п.) остаются в портфеле. Если выключено — считается, что вы забираете их каждый месяц."
            checked={draft.reinvestReturns}
            onChange={(checked) => set("reinvestReturns", checked)}
          />
          <CheckboxRow
            label="Индексировать взносы по инфляции"
            help="Ежемесячное пополнение растёт вместе с инфляцией, а не по фиксированному «росту пополнений». Взаимоисключающие настройки: при включении поле «Рост пополнений» отключается."
            checked={draft.adjustContributionsForInflation}
            onChange={(checked) => set("adjustContributionsForInflation", checked)}
          />
          <CheckboxRow
            label="Налог на дивиденды (акции и ПИФ)"
            help="Учитывать НДФЛ с дивидендной доходности по акциям и ПИФам. Обычно выключают для ИИС и черновых расчётов. Потребует указать долю облагаемых активов и ожидаемую дивидендную доходность."
            checked={draft.taxDividends}
            onChange={(checked) => set("taxDividends", checked)}
          />
          {monthlyDebtService > 0 && (
            <>
              <CheckboxRow
                label="Долг платится отдельно от пополнения брокера"
                help="Включите, если ипотека и другие долги гасите сверх суммы, которую переводите на брокера. Например: 60 000 ₽ в брокера + 55 000 ₽ по ипотеке = 115 000 ₽ общий отток, а не вычет долга из одной суммы."
                checked={draft.debtPaymentsSeparateFromContribution ?? false}
                onChange={(checked) =>
                  set("debtPaymentsSeparateFromContribution", checked)
                }
                className="sm:col-span-2 lg:col-span-3"
              />
              <CheckboxRow
                label="Инвестировать платежи по долгу после погашения"
                help="Когда все долги погашены, сумма ежемесячных платежей по ним (ипотека, кредиты) автоматически добавляется к инвестируемой части пополнения — как будто вы перенаправили освободившиеся деньги в портфель."
                checked={draft.reinvestFreedDebtPayments}
                onChange={(checked) => set("reinvestFreedDebtPayments", checked)}
                className="sm:col-span-2 lg:col-span-3"
              />
            </>
          )}
          {draft.taxDividends && (
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
                  value={Math.round(draft.taxableAssetShare * 1000) / 10 || ""}
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
                  value={draft.dividendYieldPercent || ""}
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
            help="Сценарий ранней пенсии: до указанного года только накопление и пополнения, затем регулярный вывод с портфеля без новых взносов."
            checked={draft.withdrawAfterYears != null}
            onChange={(checked) =>
              set(
                "withdrawAfterYears",
                checked ? Math.min(draft.years, 10) : null,
              )
            }
            className="sm:col-span-2"
          />
          {draft.withdrawAfterYears != null && (
            <>
              <Field
                label="Вывод с года"
                help="С какого года начинается «пенсия»: пополнения прекращаются, портфель только растёт по доходности и уменьшается за счёт выплат. При сроке 20 лет и значении 10 — 10 лет копите, 10 лет живёте с выводом."
              >
                <input
                  type="number"
                  min={1}
                  max={draft.years}
                  className={inputClass}
                  value={draft.withdrawAfterYears || ""}
                  onChange={(e) =>
                    set(
                      "withdrawAfterYears",
                      Math.min(
                        draft.years,
                        Math.max(1, Number.parseFloat(e.target.value) || 1),
                      ),
                    )
                  }
                />
              </Field>
              <div className="sm:col-span-2 lg:col-span-1">
                <WithdrawalModeToggle
                  mode={draft.withdrawalMode ?? "fixed"}
                  onChange={(mode) => set("withdrawalMode", mode)}
                />
              </div>
              {(draft.withdrawalMode ?? "fixed") === "fixed" ? (
                <Field
                  label="Вывод / мес, ₽"
                  hint="В ценах сегодня"
                  help="Сумма, которую хотите получать каждый месяц после фазы накопления, в рублях сегодняшней покупательной способности. В расчёте она индексируется по инфляции — номинальная выплата на руки растёт со временем."
                >
                  <input
                    type="number"
                    className={inputClass}
                    value={draft.monthlyWithdrawal || ""}
                    onChange={(e) =>
                      set(
                        "monthlyWithdrawal",
                        Number.parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                </Field>
              ) : (
                <Field
                  label="Вывод, % портфеля / год"
                  hint={`≈ ${((draft.annualWithdrawalPercent || 0) / 12).toFixed(2)}% баланса в месяц`}
                  help="Годовая доля портфеля, которую планируете снимать (правило 4% — классический ориентир для FIRE). Каждый месяц списывается годовой процент ÷ 12 от текущего баланса; номинальная сумма на руках меняется вместе с портфелем."
                >
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    className={inputClass}
                    value={draft.annualWithdrawalPercent || ""}
                    onChange={(e) =>
                      set(
                        "annualWithdrawalPercent",
                        Number.parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                </Field>
              )}
              {withdrawalPayoutPreview && (
                <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 sm:col-span-2 lg:col-span-3 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  <p className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                    <span>
                      Выплата на руки (после налога)
                      {(draft.withdrawalMode ?? "fixed") === "percent" && (
                        <> · {draft.annualWithdrawalPercent}% / год</>
                      )}
                    </span>
                    <FieldHelp
                      text={
                        "Фактическая выплата из расчёta: после налога на прибыль, в сегодняшних ₽.\n\n" +
                        withdrawalPayoutHelp
                      }
                    />
                  </p>
                  <p className="mt-1">
                    Старт вывода ({withdrawalPayoutPreview.first.label}):{" "}
                    {(draft.withdrawalMode ?? "fixed") === "percent" ? (
                      <>
                        <strong>
                          {formatMoney(
                            withdrawalPayoutPreview.first.monthlyPayoutNominal * 12,
                          )}
                        </strong>{" "}
                        / год номинал ·{" "}
                        <strong>
                          {formatMoney(withdrawalPayoutPreview.first.monthlyPayoutReal)}
                        </strong>{" "}
                        / мес сегодняшние ₽
                      </>
                    ) : (
                      <>
                        <strong>
                          {formatMoney(withdrawalPayoutPreview.first.monthlyPayoutNominal)}
                        </strong>{" "}
                        номинал ·{" "}
                        <strong>
                          {formatMoney(withdrawalPayoutPreview.first.monthlyPayoutReal)}
                        </strong>{" "}
                        сегодняшние ₽
                      </>
                    )}
                  </p>
                  {isPercentWithdrawal &&
                    withdrawalPayoutPreview.first.month !==
                      withdrawalPayoutPreview.last.month && (
                      <p className="mt-1 text-[11px] opacity-80">
                        При {draft.annualWithdrawalPercent}% / год выплата следует за
                        ликвидной частью — на графике ниже зелёная линия растёт вместе с
                        долей портфеля.
                      </p>
                    )}
                  {withdrawalPayoutPreview.first.month !==
                    withdrawalPayoutPreview.last.month && (
                    <p className="mt-1">
                      {result.withdrawalEndedEarly
                        ? "Последняя выплата"
                        : "Конец горизонта"}{" "}
                      ({withdrawalPayoutPreview.last.label}):{" "}
                      {(draft.withdrawalMode ?? "fixed") === "percent" ? (
                        <>
                          <strong>
                            {formatMoney(
                              withdrawalPayoutPreview.last.monthlyPayoutNominal * 12,
                            )}
                          </strong>{" "}
                          / год номинал ·{" "}
                          <strong>
                            {formatMoney(withdrawalPayoutPreview.last.monthlyPayoutReal)}
                          </strong>{" "}
                          / мес сегодняшние ₽
                        </>
                      ) : (
                        <>
                          <strong>
                            {formatMoney(withdrawalPayoutPreview.last.monthlyPayoutNominal)}
                          </strong>{" "}
                          номинал ·{" "}
                          <strong>
                            {formatMoney(withdrawalPayoutPreview.last.monthlyPayoutReal)}
                          </strong>{" "}
                          сегодняшние ₽
                        </>
                      )}
                    </p>
                  )}
                  {result.withdrawalEndedEarly && (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                      {isPercentWithdrawal ? (
                        <>
                          Ликвидная часть обнулилась с{" "}
                          <strong>
                            {result.withdrawalLiquidityDepletedFromLabel ??
                              result.withdrawalLastPayoutLabel}
                          </strong>
                          . Снятие {draft.annualWithdrawalPercent}% / год с
                          брокерского счёта невозможно ещё{" "}
                          {withdrawalDepletionMonths} мес. — номинальный капитал
                          может расти за счёт активов, но не выводится.
                        </>
                      ) : (
                        <>
                          Ликвидная часть исчерпана с{" "}
                          <strong>{result.withdrawalLastPayoutLabel}</strong>. Ещё{" "}
                          {withdrawalDepletionMonths} мес. до конца горизонта без
                          выплат — рост капитала идёт только от активов (квартира,
                          паи), без продажи и без вывода.
                        </>
                      )}
                    </p>
                  )}
                  {!withdrawalPayoutPreview.hasPayouts && (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                      С начала фазы вывода ликвидной части не хватает на выплаты.
                    </p>
                  )}
                </div>
              )}
              {safeWithdrawalAdvice && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs sm:col-span-2 lg:col-span-3 ${
                    safeWithdrawalAdvice.currentIsSafe
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
                      : "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100"
                  }`}
                >
                  <p className="flex items-center gap-1 font-medium">
                    <span>Безопасный вывод</span>
                    <FieldHelp text="Два способа задать вывод нельзя напрямую сравнивать по одной цифре:\n\n· Фикс. сумма — в сегодняшних ₽ (номинал растёт с инфляцией).\n· % / год — доля номинальной ликвидной части на момент снятия.\n\nПределы подбираются перебором: ликвидность не обнуляется и не падает в сегодняшних ₽ до конца горизонта." />
                  </p>
                  <p className="mt-1 text-[11px] opacity-90">
                    Ликвидность на старте вывода:{" "}
                    <strong>
                      {formatMoney(safeWithdrawalAdvice.liquidityAtWithdrawalStart)}
                    </strong>{" "}
                    номинал ·{" "}
                    <strong>
                      {formatMoney(safeWithdrawalAdvice.liquidityAtWithdrawalStartReal)}
                    </strong>{" "}
                    сегодня
                  </p>
                  <p className="mt-1">Безопасный предел (рост ликвидности в сегодняшних ₽):</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 pl-0.5">
                    <li>
                      <strong>{safeWithdrawalAdvice.maxAnnualPercent}%</strong> / год от
                      номинала → ≈{" "}
                      <strong>
                        {formatMoney(safeWithdrawalAdvice.maxPercentAsMonthlyReal)}
                      </strong>
                      {safeWithdrawalAdvice.maxPercentAsMonthlyRealEnd >
                        safeWithdrawalAdvice.maxPercentAsMonthlyReal * 1.05 && (
                        <>
                          {" "}
                          →{" "}
                          <strong>
                            {formatMoney(safeWithdrawalAdvice.maxPercentAsMonthlyRealEnd)}
                          </strong>
                        </>
                      )}{" "}
                      / мес на руки (сегодня)
                    </li>
                    <li>
                      <strong>{formatMoney(safeWithdrawalAdvice.maxMonthlyReal)}</strong>{" "}
                      / мес на руки (сегодня) → ≈{" "}
                      <strong>{safeWithdrawalAdvice.maxMonthlyAsNominalPercent}%</strong> / год
                      от номинала
                    </li>
                  </ul>
                  {(draft.withdrawalMode ?? "fixed") === "percent" ? (
                    (draft.annualWithdrawalPercent ?? 0) > 0 && (
                      <p className="mt-2 opacity-90">
                        Ваши {draft.annualWithdrawalPercent}% / год от номинала → ≈{" "}
                        <strong>
                          {formatMoney(safeWithdrawalAdvice.currentStartPayoutReal)}
                        </strong>
                        {result.withdrawalPayoutReal >
                          safeWithdrawalAdvice.currentStartPayoutReal * 1.05 && (
                          <>
                            {" "}
                            →{" "}
                            <strong>{formatMoney(result.withdrawalPayoutReal)}</strong>
                          </>
                        )}{" "}
                        / мес на руки (сегодня)
                        {safeWithdrawalAdvice.currentIsSafe
                          ? " · в безопасном диапазоне."
                          : " · выше безопасного."}
                      </p>
                    )
                  ) : (
                    (draft.monthlyWithdrawal ?? 0) > 0 && (
                      <p className="mt-2 opacity-90">
                        Ваши {formatMoney(draft.monthlyWithdrawal)} / мес (сегодня) → ≈{" "}
                        <strong>
                          {safeWithdrawalAdvice.currentFixedAsNominalPercent}%
                        </strong>{" "}
                        / год от номинала
                        {safeWithdrawalAdvice.currentIsSafe
                          ? " · в безопасном диапазоне."
                          : " · выше безопасного."}
                      </p>
                    )
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleBlock>

      <div
        className={`flex flex-col gap-6 transition-opacity duration-150 ${isSimPending ? "opacity-60" : "opacity-100"}`}
        aria-busy={isSimPending}
      >
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Сценарии прогноза</h3>
            <p className="text-xs text-zinc-500">
              Сохраните вариант для сравнения с фактом на вкладке «Трекинг»
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPlanName(
                forecastPlans.length === 0
                  ? "Базовый"
                  : `Сценарий ${forecastPlans.length + 1}`,
              );
              setShowSavePlan(true);
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Сохранить сценарий
          </button>
        </div>
        {forecastPlans.length > 0 && (
          <ul className="flex flex-col gap-2">
            {forecastPlans.map((plan) => (
              <li
                key={plan.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <div>
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(plan.savedAt).toLocaleString("ru-RU")} · итого{" "}
                    {formatMoney(plan.summary.finalBalance)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeletePlan(plan.id)}
                  className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showSavePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold">Сохранить сценарий</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Отсчёт месяцев пойдёт от сегодняшней даты
            </p>
            <label className="mt-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500">Название</span>
              <input
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className={inputClass}
                placeholder="Оптимистичный"
                autoFocus
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSavePlan(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  const plan = buildForecastPlan(
                    planName,
                    simParams,
                    customAssets,
                    brokerTotal,
                  );
                  onSavePlan(plan);
                  setShowSavePlan(false);
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

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
          help={IRR_HELP}
        />
        {result.withdrawalPayoutNominal > 0 &&
          ((draft.withdrawalMode ?? "fixed") === "percent" ? (
            <>
              <MiniStat
                label="Ставка вывода"
                value={`${draft.annualWithdrawalPercent}% / год`}
                hint="доля портфеля"
              />
              <MiniStat
                label="Вывод / год"
                value={formatMoney(result.withdrawalPayoutNominal * 12)}
                hint="номинал · конец срока"
              />
              <MiniStat
                label="На руки / мес"
                value={formatMoney(result.withdrawalPayoutReal)}
                hint="сегодняшние ₽"
              />
            </>
          ) : (
            <>
              <MiniStat
                label="Вывод / мес"
                value={formatMoney(result.withdrawalPayoutNominal)}
                hint="номинал · конец срока"
              />
              <MiniStat
                label="На руки / мес"
                value={formatMoney(result.withdrawalPayoutReal)}
                hint="сегодняшние ₽"
              />
            </>
          ))}
        {result.withdrawalEndedEarly && (
          <MiniStat
            label="Без выплат"
            value={String(withdrawalDepletionMonths)}
            hint="мес. до конца"
          />
        )}
      </div>

      {result.withdrawalEndedEarly && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Ликвидная часть исчерпана</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
            {isPercentWithdrawal ? (
              <>
                Ликвидность обнулилась с{" "}
                <strong>
                  {result.withdrawalLiquidityDepletedFromLabel ??
                    result.withdrawalLastPayoutLabel}
                </strong>
                . Ставка {draft.annualWithdrawalPercent}% / год применяется только
                к ликвидной части — при нулевом брокерском счёте выплат нет, хотя
                синяя линия может расти за счёт квартиры и паёв. Смотрите фиолетовую
                линию «Ликвидная часть» и график выплат ниже.
              </>
            ) : (
              <>
                Последняя выплата —{" "}
                <strong>{result.withdrawalLastPayoutLabel}</strong>. Синяя линия на
                графике может снова расти за счёт недвижимости и других активов, но
                снять эти деньги модель не предполагает. Смотрите фиолетовую линию
                «Ликвидная часть» и график выплат ниже.
              </>
            )}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Прогноз накоплений</h3>
          <div className="flex flex-wrap items-center gap-2">
            {isSimPending && (
              <span className="text-[10px] font-medium text-indigo-500 dark:text-indigo-400">
                пересчёт…
              </span>
            )}
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Легенда — вкл/выкл линию
            </p>
            <button
              type="button"
              onClick={() => setChartsHelpOpen(true)}
              className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Что означают линии?
            </button>
          </div>
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
            <Tooltip cursor={false} content={<ChartMoneyTooltip />} />
            <Legend
              content={(props) => (
                <ChartToggleLegend
                  payload={props.payload}
                  hidden={hiddenChartLines}
                  onToggle={toggleChartLine}
                />
              )}
            />
            <Line
              type="monotone"
              dataKey="nominal"
              name="Портфель (номинал)"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              hide={isChartLineHidden("nominal")}
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
              hide={isChartLineHidden("inflationHurdle")}
            />
            <Line
              type="monotone"
              dataKey="realPortfolio"
              name="Портфель (сегодняшние ₽)"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              hide={isChartLineHidden("realPortfolio")}
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
              hide={isChartLineHidden("realContributed")}
            />
            {showDebtLine && (
              <Line
                type="monotone"
                dataKey="totalDebt"
                name="Долг (остаток)"
                stroke="#f43f5e"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                hide={isChartLineHidden("totalDebt")}
              />
            )}
            {showLiquidityLine && (
              <Line
                type="monotone"
                dataKey="liquidityBalance"
                name="Ликвидная часть"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={false}
                activeDot={false}
                hide={isChartLineHidden("liquidityBalance")}
              />
            )}
            {result.withdrawalEndedEarly && withdrawalDepletionMarker && (
              <ReferenceLine
                x={withdrawalDepletionMarker}
                stroke="#d97706"
                strokeDasharray="4 4"
                label={{
                  value: isPercentWithdrawal ? "ликвидность 0" : "конец выплат",
                  position: "insideTopRight",
                  fill: "#d97706",
                  fontSize: 10,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasCustomWealth && <CalculatorAssetChart points={result.points} />}

      {showPayoutChart && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Ежемесячный вывод</h3>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Сегодняшние ₽ ·{" "}
              {isPercentWithdrawal
                ? "доля портфеля vs на руки · каждый месяц"
                : "цель vs факт"}
            </p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={payoutChartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  v >= 1000 ? `${Math.round(Number(v) / 1000)}к` : String(v)
                }
              />
              <Tooltip cursor={false} content={<ChartMoneyTooltip />} />
              <Legend
                content={(props) => (
                  <ChartToggleLegend
                    payload={props.payload}
                    hidden={hiddenPayoutChartLines}
                    onToggle={togglePayoutChartLine}
                  />
                )}
              />
              <Line
                type="monotone"
                dataKey="payoutTarget"
                name={payoutTargetLineName}
                stroke="#a1a1aa"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                hide={isPayoutChartLineHidden("payoutTarget")}
              />
              <Line
                type="monotone"
                dataKey="payoutActual"
                name="На руки (сегодняшние ₽)"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                hide={isPayoutChartLineHidden("payoutActual")}
              />
              {result.withdrawalEndedEarly && withdrawalDepletionMarker && (
                <ReferenceLine
                  x={withdrawalDepletionMarker}
                  stroke="#d97706"
                  strokeDasharray="4 4"
                  label={{
                    value: isPercentWithdrawal ? "ликвидность 0" : "конец выплат",
                    position: "insideTopRight",
                    fill: "#d97706",
                    fontSize: 10,
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

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
              <p className="flex items-center gap-1 text-[10px] text-zinc-500">
                <span>{item.label}</span>
                {item.help && <FieldHelp text={item.help} />}
              </p>
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
                <th className="px-3 py-1.5 text-right">Выплата</th>
                <th className="px-3 py-1.5 text-right">Выплата (сегодня)</th>
                {showLiquidityLine && (
                  <th className="px-3 py-1.5 text-right">Ликвидная часть</th>
                )}
                <th className="px-3 py-1.5 text-right">Долг</th>
                <th className="px-3 py-1.5 text-right">Прибыль</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {result.points.map((p) => {
                const payoutDepleted =
                  p.inWithdrawalPhase &&
                  (p.liquidityBalance <= 0.01 ||
                    (p.monthlyPayoutTargetReal > 0.01 &&
                      p.monthlyPayoutReal <= 0.01));
                const payoutShort = p.inWithdrawalPhase && p.monthlyPayoutCapped;

                return (
                <tr
                  key={`compound-${p.month}`}
                  className={
                    payoutDepleted
                      ? "bg-amber-50/60 dark:bg-amber-950/20"
                      : undefined
                  }
                >
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
                    {p.monthlyPayoutNominal > 0
                      ? formatMoney(p.monthlyPayoutNominal)
                      : payoutDepleted
                        ? "0 · исчерпано"
                        : "—"}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums${
                      payoutDepleted || payoutShort
                        ? " text-amber-700 dark:text-amber-300"
                        : ""
                    }`}
                  >
                    {p.monthlyPayoutReal > 0
                      ? payoutShort
                        ? `${formatMoney(p.monthlyPayoutReal)} · цель ${formatMoney(p.monthlyPayoutTargetReal)}`
                        : formatMoney(p.monthlyPayoutReal)
                      : payoutDepleted
                        ? `0 · цель ${formatMoney(p.monthlyPayoutTargetReal)}`
                        : "—"}
                  </td>
                  {showLiquidityLine && (
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatMoney(p.liquidityBalance)}
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMoney(p.totalDebt)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatMoney(p.profitAfterTax)}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleBlock>
      </div>
    </div>
  );
}
