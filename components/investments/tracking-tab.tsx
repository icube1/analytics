"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartMoneyTooltip } from "@/components/chart-money-tooltip";
import { formatMoney } from "@/lib/portfolio-wealth";
import type { BrokerBalanceSnapshot, SavedForecastPlan } from "@/lib/portfolio-types";
import { CHART_COLORS } from "@/lib/stats";
import {
  buildTrackingChartData,
  buildTrackingMonths,
  getLatestSnapshot,
} from "@/lib/tracking";

interface TrackingTabProps {
  forecastPlans: SavedForecastPlan[];
  brokerSnapshots: BrokerBalanceSnapshot[];
  currentTotalDebt: number;
  currentCustomAssetsTotal: number;
}

const ZOOM_PRESETS = [
  { id: "1y", label: "1 год", months: 12 },
  { id: "3y", label: "3 года", months: 36 },
  { id: "5y", label: "5 лет", months: 60 },
  { id: "all", label: "Всё", months: null },
] as const;

const DEFAULT_FOCUS_MONTHS = 36;

function collectChartValues(
  row: Record<string, string | number | null>,
  planIds: string[],
): number[] {
  const values: number[] = [];
  if (typeof row.fact === "number") values.push(row.fact);
  for (const planId of planIds) {
    const value = row[`plan_${planId}`];
    if (typeof value === "number") values.push(value);
  }
  return values;
}

function computeYDomain(
  data: Record<string, string | number | null>[],
  planIds: string[],
): [number, number] | undefined {
  const values = data.flatMap((row) => collectChartValues(row, planIds));
  if (values.length === 0) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const padding = span > 0 ? span * 0.1 : Math.max(max * 0.05, 10_000);

  return [Math.max(0, min - padding), max + padding];
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <span className="text-zinc-400">—</span>;
  }
  const positive = delta >= 0;
  return (
    <span
      className={
        positive
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400"
      }
    >
      {positive ? "+" : ""}
      {formatMoney(delta)}
    </span>
  );
}

export function TrackingTab({
  forecastPlans,
  brokerSnapshots,
  currentTotalDebt,
  currentCustomAssetsTotal,
}: TrackingTabProps) {
  const [useRealBalance, setUseRealBalance] = useState(false);
  const [visiblePlanIds, setVisiblePlanIds] = useState<Set<string>>(() =>
    new Set(forecastPlans.map((plan) => plan.id)),
  );
  const [showDeposits, setShowDeposits] = useState(false);
  const [brushRange, setBrushRange] = useState<{
    startIndex: number;
    endIndex: number;
  } | null>(null);
  const [activePreset, setActivePreset] = useState<string>("3y");

  useEffect(() => {
    setVisiblePlanIds((prev) => {
      const next = new Set(prev);
      for (const plan of forecastPlans) {
        next.add(plan.id);
      }
      for (const id of prev) {
        if (!forecastPlans.some((plan) => plan.id === id)) {
          next.delete(id);
        }
      }
      return next;
    });
  }, [forecastPlans]);

  const rows = useMemo(
    () =>
      buildTrackingMonths(
        forecastPlans,
        brokerSnapshots,
        currentTotalDebt,
        currentCustomAssetsTotal,
      ),
    [forecastPlans, brokerSnapshots, currentTotalDebt, currentCustomAssetsTotal],
  );

  const latestSnapshot = useMemo(() => {
    const snapshot = getLatestSnapshot(brokerSnapshots);
    if (!snapshot) return null;
    return {
      ...snapshot,
      grandTotal: snapshot.brokerTotal + currentCustomAssetsTotal,
      totalDebt: currentTotalDebt,
    };
  }, [brokerSnapshots, currentCustomAssetsTotal, currentTotalDebt]);

  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const currentRow = rows.find((row) => row.calendarMonth === currentMonth);

  const activePlanIds = forecastPlans
    .map((plan) => plan.id)
    .filter((id) => visiblePlanIds.has(id));

  const chartData = useMemo(
    () => buildTrackingChartData(rows, activePlanIds, useRealBalance),
    [rows, activePlanIds, useRealBalance],
  );

  const defaultBrushRange = useMemo(() => {
    const endIndex = Math.max(0, chartData.length - 1);
    if (endIndex === 0) return { startIndex: 0, endIndex: 0 };
    const focusEnd = Math.min(DEFAULT_FOCUS_MONTHS - 1, endIndex);
    return { startIndex: 0, endIndex: focusEnd };
  }, [chartData.length]);

  const activeBrushRange = brushRange ?? defaultBrushRange;

  const visibleChartData = useMemo(() => {
    const { startIndex, endIndex } = activeBrushRange;
    return chartData.slice(startIndex, endIndex + 1);
  }, [chartData, activeBrushRange]);

  const yDomain = useMemo(
    () => computeYDomain(visibleChartData, activePlanIds),
    [visibleChartData, activePlanIds],
  );

  const applyZoomPreset = useCallback(
    (presetId: string, months: number | null) => {
      const endIndex = Math.max(0, chartData.length - 1);
      if (months == null) {
        setBrushRange({ startIndex: 0, endIndex });
      } else {
        setBrushRange({ startIndex: 0, endIndex: Math.min(months - 1, endIndex) });
      }
      setActivePreset(presetId);
    },
    [chartData.length],
  );

  useEffect(() => {
    setBrushRange(null);
    setActivePreset(chartData.length > DEFAULT_FOCUS_MONTHS ? "3y" : "all");
  }, [chartData.length, useRealBalance, activePlanIds.join(",")]);

  const planColors = useMemo(() => {
    const map = new Map<string, string>();
    forecastPlans.forEach((plan, index) => {
      map.set(plan.id, CHART_COLORS[index % CHART_COLORS.length]);
    });
    return map;
  }, [forecastPlans]);

  if (forecastPlans.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
        <p className="text-zinc-600 dark:text-zinc-300">
          Сохраните хотя бы один сценарий на вкладке «Сложный процент»
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Можно зафиксировать несколько вариантов — оптимистичный, средний,
          консервативный — и сравнить их с фактом по отчётам Сбера.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {latestSnapshot ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Актуальный срез
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-6">
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {formatMoney(latestSnapshot.grandTotal)}
              </p>
              <p className="text-xs text-zinc-500">
                капитал · брокер {formatMoney(latestSnapshot.brokerTotal)}
              </p>
            </div>
            <div>
              <p className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
                Отчёт до {latestSnapshot.periodEnd}
              </p>
              <p className="text-xs text-zinc-400">
                загружен{" "}
                {new Date(latestSnapshot.uploadedAt).toLocaleString("ru-RU")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Загрузите отчёт Сбера на вкладке «Портфель Сбера» — баланс и
          пополнения подтянутся автоматически.
        </div>
      )}

      {currentRow && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {forecastPlans.map((plan) => {
            const planData = currentRow.plans[plan.id];
            const factBalance = currentRow.fact.grandTotal;
            if (!planData || factBalance == null) {
              return (
                <div
                  key={plan.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <p className="text-xs font-medium text-zinc-500">{plan.name}</p>
                  <p className="mt-1 text-sm text-zinc-400">Нет данных за месяц</p>
                </div>
              );
            }
            const delta = factBalance - planData.balance;
            return (
              <div
                key={plan.id}
                className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <p className="text-xs font-medium text-zinc-500">{plan.name}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  <DeltaCell delta={delta} />
                </p>
                <p className="text-[10px] text-zinc-400">
                  факт {formatMoney(factBalance)} · план{" "}
                  {formatMoney(planData.balance)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Динамика капитала</h3>
            <p className="text-xs text-zinc-500">
              Масштаб по вертикали подстраивается под выбранный период
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ZOOM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyZoomPreset(preset.id, preset.months)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  activePreset === preset.id
                    ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {preset.label}
              </button>
            ))}
            <span className="hidden h-5 w-px bg-zinc-200 sm:block dark:bg-zinc-700" />
            <button
              type="button"
              onClick={() => setUseRealBalance(false)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                !useRealBalance
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              Номинал
            </button>
            <button
              type="button"
              onClick={() => setUseRealBalance(true)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                useRealBalance
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              Реально
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-500 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Факт
          </span>
          {forecastPlans.map((plan) => {
            const active = visiblePlanIds.has(plan.id);
            const color = planColors.get(plan.id) ?? CHART_COLORS[0];
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setVisiblePlanIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(plan.id)) next.delete(plan.id);
                    else next.add(plan.id);
                    return next;
                  });
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-opacity ${
                  active ? "opacity-100" : "opacity-40"
                }`}
                style={{ borderColor: color, color }}
              >
                {plan.name}
              </button>
            );
          })}
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={visibleChartData}
              margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                domain={yDomain}
                allowDataOverflow
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1000
                      ? `${Math.round(v / 1000)}k`
                      : String(v)
                }
              />
              <Tooltip content={<ChartMoneyTooltip />} />
              <Line
                type="monotone"
                dataKey="fact"
                name="Факт"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ fill: "#10b981", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              {activePlanIds.map((planId) => {
                const plan = forecastPlans.find((p) => p.id === planId);
                if (!plan) return null;
                return (
                  <Line
                    key={planId}
                    type="monotone"
                    dataKey={`plan_${planId}`}
                    name={plan.name}
                    stroke={planColors.get(planId)}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    strokeDasharray="6 4"
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {chartData.length > 1 && (
          <div className="mt-2 h-14 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
              >
                <XAxis dataKey="label" hide />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Line
                  type="monotone"
                  dataKey="fact"
                  stroke="#10b981"
                  strokeWidth={1}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Brush
                  dataKey="label"
                  height={24}
                  stroke="#6366f1"
                  fill="rgba(99, 102, 241, 0.08)"
                  travellerWidth={10}
                  startIndex={activeBrushRange.startIndex}
                  endIndex={activeBrushRange.endIndex}
                  onChange={(range) => {
                    if (range.startIndex == null || range.endIndex == null) {
                      return;
                    }
                    setBrushRange({
                      startIndex: range.startIndex,
                      endIndex: range.endIndex,
                    });
                    setActivePreset("custom");
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-[11px] text-zinc-400">
          Кнопки — быстрый период · ползунки внизу — произвольный диапазон
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Помесячная сводка</h3>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={showDeposits}
              onChange={(e) => setShowDeposits(e.target.checked)}
              className="size-3.5 rounded"
            />
            Показать взносы (рост капитала и долг)
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                <th className="px-2 py-2 font-medium">Месяц</th>
                <th className="px-2 py-2 font-medium">Факт</th>
                {forecastPlans.map((plan) => (
                  <th key={plan.id} className="px-2 py-2 font-medium">
                    {plan.name}
                  </th>
                ))}
                {showDeposits && (
                  <>
                    <th className="px-2 py-2 font-medium">В брокера факт</th>
                    <th className="px-2 py-2 font-medium">Тело долга факт</th>
                    {forecastPlans.map((plan) => (
                      <th key={`${plan.id}-dep`} className="px-2 py-2 font-medium">
                        {plan.name} (план)
                      </th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.calendarMonth}
                  className={`border-b border-zinc-100 dark:border-zinc-800 ${
                    row.calendarMonth === currentMonth
                      ? "bg-indigo-50/50 dark:bg-indigo-950/20"
                      : ""
                  }`}
                >
                  <td className="px-2 py-2 font-medium">{row.label}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {row.fact.grandTotal != null ? (
                      <span>
                        {formatMoney(row.fact.grandTotal)}
                        {row.fact.balanceSource && (
                          <span className="ml-1 text-[10px] text-zinc-400">
                            ({row.fact.balanceSource})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  {forecastPlans.map((plan) => {
                    const planData = row.plans[plan.id];
                    const fact = row.fact.grandTotal;
                    return (
                      <td key={plan.id} className="px-2 py-2 tabular-nums">
                        {planData ? (
                          <div>
                            <div>{formatMoney(planData.balance)}</div>
                            {fact != null && (
                              <div className="text-[10px]">
                                <DeltaCell delta={fact - planData.balance} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    );
                  })}
                  {showDeposits && (
                    <>
                      <td className="px-2 py-2 tabular-nums">
                        {row.fact.brokerDeposits > 0
                          ? formatMoney(row.fact.brokerDeposits)
                          : "—"}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {row.fact.debtPrincipalPaid != null &&
                        row.fact.debtPrincipalPaid > 0
                          ? formatMoney(row.fact.debtPrincipalPaid)
                          : "—"}
                      </td>
                      {forecastPlans.map((plan) => {
                        const planData = row.plans[plan.id];
                        const deposits = row.fact.brokerDeposits;
                        const wealthBuilding =
                          planData?.monthlyWealthBuilding ??
                          (planData
                            ? planData.monthlyBrokerInvest +
                              (planData.monthlyDebtPrincipal ?? 0)
                            : null);
                        return (
                          <td
                            key={`${plan.id}-dep`}
                            className="px-2 py-2 tabular-nums"
                          >
                            {planData ? (
                              <div>
                                <div>
                                  {wealthBuilding != null
                                    ? formatMoney(wealthBuilding)
                                    : formatMoney(planData.monthlyTotalContribution)}
                                </div>
                                <div className="text-[10px] text-zinc-400">
                                  бюджет {formatMoney(planData.monthlyTotalContribution)}
                                </div>
                                <div className="text-[10px] text-zinc-400">
                                  брокер {formatMoney(planData.monthlyBrokerInvest)}
                                  {planData.monthlyDebtPrincipal != null && (
                                    <>
                                      {" "}
                                      · тело долга{" "}
                                      {formatMoney(planData.monthlyDebtPrincipal)}
                                    </>
                                  )}
                                  {planData.monthlyDebtInterest != null &&
                                    planData.monthlyDebtInterest > 0 && (
                                      <>
                                        {" "}
                                        · проценты{" "}
                                        {formatMoney(planData.monthlyDebtInterest)}
                                      </>
                                    )}
                                </div>
                                {deposits > 0 && (
                                  <div className="text-[10px]">
                                    <DeltaCell
                                      delta={
                                        deposits - planData.monthlyBrokerInvest
                                      }
                                    />
                                  </div>
                                )}
                                {row.fact.debtPrincipalPaid != null &&
                                  row.fact.debtPrincipalPaid > 0 &&
                                  planData.monthlyDebtPrincipal != null && (
                                    <div className="text-[10px]">
                                      тело:{" "}
                                      <DeltaCell
                                        delta={
                                          row.fact.debtPrincipalPaid -
                                          planData.monthlyDebtPrincipal
                                        }
                                      />
                                    </div>
                                  )}
                              </div>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        <p>
          Фактический баланс берётся из последнего отчёта за месяц (или самого
          свежего для текущего месяца). Для текущего месяца капитал пересчитывается
          с актуальными «Другими активами» и долгом. Пополнения в брокера — из
          раздела «Движение денежных средств». В плане крупная цифра — реальный
          прирост капитала (брокер + тело долга), «бюджет» — ваш отток на капитал
          (115 000 ₽ при отдельном долге). Тело долга по факту — снижение остатка
          долга относительно прошлого месяца. Старые сценарии без разбивки нужно
          пересохранить на вкладке «Сложный процент».
        </p>
      </div>
    </div>
  );
}
