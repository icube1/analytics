"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartMoneyTooltip, ChartPercentTooltip } from "@/components/chart-money-tooltip";
import type { PortfolioAnalytics } from "@/lib/portfolio-analytics";
import { StatCard } from "@/components/stat-card";
import { formatMoney } from "@/lib/portfolio-wealth";
import { CHART_COLORS } from "@/lib/stats";
import type { BrokerReport } from "@/lib/portfolio-types";

interface SummaryTabProps {
  analytics: PortfolioAnalytics;
  report: BrokerReport | null;
}

export function SummaryTab({ analytics, report }: SummaryTabProps) {
  const pieData = analytics.slices.map((s) => ({
    name: s.label,
    value: s.value,
  }));

  const returnData = analytics.slices.map((s) => ({
    name: s.label.length > 22 ? `${s.label.slice(0, 22)}…` : s.label,
    fullName: s.label,
    returnPct: s.assumedReturn,
    contribution: s.weight * s.assumedReturn,
  }));

  const topStocks = analytics.stockSlices.slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11.5rem,1fr))]">
        <StatCard
          label="Общий капитал"
          value={formatMoney(analytics.grandTotal)}
          tone="accent"
        />
        <StatCard
          label="Прогноз доходности"
          value={`${analytics.weightedReturn.toFixed(1)}%`}
          hint="Взвешенная по классам активов"
          tone="income"
        />
        <StatCard
          label="Ожидаемый доход / год"
          value={formatMoney(analytics.expectedAnnualIncome)}
          hint={
            analytics.customMonthlyIncome > 0
              ? `В т.ч. ${formatMoney(analytics.customMonthlyIncome)}/мес от активов`
              : "По индивидуальным настройкам"
          }
          tone="income"
        />
        <StatCard
          label="Диверсификация"
          value={`${analytics.diversificationScore}/100`}
          hint={analytics.diversificationLabel}
        />
        <StatCard
          label="Прогноз через 1 год"
          value={formatMoney(analytics.projectedValue1Y)}
          hint="Без реинвестирования"
        />
        <StatCard
          label="Прогноз через 5 лет"
          value={formatMoney(analytics.projectedValue5Y)}
          hint="Сложный рост по классам"
        />
      </section>

      {report && analytics.brokerPeriodChange !== null && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          Брокерский счёт за период {report.periodStart} — {report.periodEnd}:{" "}
          <span
            className={
              analytics.brokerPeriodChange < 0
                ? "font-medium text-rose-600 dark:text-rose-400"
                : "font-medium text-emerald-600 dark:text-emerald-400"
            }
          >
            {formatMoney(analytics.brokerPeriodChange)}
            {analytics.brokerPeriodChangePct !== null &&
              ` (${analytics.brokerPeriodChangePct.toFixed(2)}%)`}
          </span>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">
            Распределение капитала
          </h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={48}
                  paddingAngle={2}
                  stroke="none"
                  activeShape={false}
                >
                  {pieData.map((item, index) => (
                    <Cell
                      key={item.name}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="none"
                    />
                  ))}
                </Pie>
                <Tooltip cursor={false} content={<ChartMoneyTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-zinc-500">Нет данных для диаграммы</p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">
            Вклад классов в доходность портфеля
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={returnData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={70}
              />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                cursor={false}
                content={
                  <ChartPercentTooltip
                    labelFormatter={(_, payload) =>
                      String(payload?.[0]?.payload?.fullName ?? "")
                    }
                    formatter={(value, name) =>
                      name === "contribution"
                        ? [`${value.toFixed(2)} п.п.`, "Вклад в портфель"]
                        : [`${value}%`, "Доходность класса"]
                    }
                  />
                }
              />
              <Legend />
              <Bar
                dataKey="returnPct"
                name="Доходность класса"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                activeBar={false}
              />
              <Bar
                dataKey="contribution"
                name="Вклад в портфель"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                activeBar={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h3 className="font-semibold">Классы активов и допущения</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Класс</th>
                <th className="px-4 py-3 text-right">Сумма</th>
                <th className="px-4 py-3 text-right">Доля</th>
                <th className="px-4 py-3 text-right">Рост</th>
                <th className="px-4 py-3 text-right">Доход</th>
                <th className="px-4 py-3 text-right">Итого</th>
                <th className="px-4 py-3 text-right">Ожид. доход/год</th>
                <th className="px-4 py-3">Комментарий</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {analytics.slices.map((slice) => (
                <tr key={slice.id}>
                  <td className="px-4 py-3 font-medium">{slice.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(slice.value)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {(slice.weight * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {slice.capitalReturn > 0
                      ? `${slice.capitalReturn.toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {slice.incomeReturn > 0
                      ? `${slice.incomeReturn.toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {slice.assumedReturn.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatMoney(slice.expectedReturnRub)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{slice.note}</td>
                </tr>
              ))}
              <tr className="bg-zinc-50 font-semibold dark:bg-zinc-950">
                <td className="px-4 py-3">Итого</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatMoney(analytics.grandTotal)}
                </td>
                <td className="px-4 py-3 text-right">100%</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">
                  {analytics.weightedReturn.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatMoney(analytics.expectedAnnualIncome)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {topStocks.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h3 className="font-semibold">
              Диверсификация акций (топ позиций)
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Макс. доля одного класса:{" "}
              {(analytics.maxClassWeight * 100).toFixed(1)}% · HHI:{" "}
              {analytics.hhi.toFixed(3)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-3">Бумага</th>
                  <th className="px-4 py-3 text-right">Стоимость</th>
                  <th className="px-4 py-3 text-right">% портфеля</th>
                  <th className="px-4 py-3 text-right">% акций</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {topStocks.map((stock) => (
                  <tr key={stock.id}>
                    <td className="px-4 py-3 font-medium">{stock.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(stock.value)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(stock.weightInPortfolio * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(stock.weightInStocks * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        <h3 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">
          Методология прогноза
        </h3>
        <p>
          Доходность считается по каждому активу отдельно: для пользовательских
          активов — из вкладки «Другие активы» (рост по инфляции, % годовых или
          аренда), для брокерского счёта — по историческим ориентирам.
        </p>
        <p className="mt-2">
          Прогноз на 1 и 5 лет — сложный рост каждого класса по его ставке, а
          не одной средней по портфелю.
        </p>
        <p className="mt-3 text-xs">
          Прогноз не является инвестиционной рекомендацией. Фактическая
          доходность может существенно отличаться.
        </p>
      </section>
    </div>
  );
}
