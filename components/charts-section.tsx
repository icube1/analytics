"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, formatMoney } from "@/lib/stats";
import type {
  CategoryBreakdown,
  DailyFlow,
  MerchantBreakdown,
} from "@/lib/types";

interface ChartsSectionProps {
  categories: CategoryBreakdown[];
  dailyFlow: DailyFlow[];
  merchants: MerchantBreakdown[];
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="select-none rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm outline-none dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      {children}
    </div>
  );
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
      {payload.map((entry, index) => (
        <p key={`${entry.name}-${index}`} style={{ color: entry.color }}>
          {entry.name}: {formatMoney(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function ChartsSection({
  categories,
  dailyFlow,
  merchants,
}: ChartsSectionProps) {
  const pieData = categories.slice(0, 8).map((item) => ({
    name: item.category,
    value: item.amount,
  }));

  const merchantData = merchants.map((item) => ({
    id: item.merchant,
    name:
      item.merchant.length > 28
        ? `${item.merchant.slice(0, 28)}…`
        : item.merchant,
    fullName: item.merchant,
    amount: item.amount,
  }));

  const sampledDaily =
    dailyFlow.length > 60
      ? dailyFlow.filter((_, i) => i % Math.ceil(dailyFlow.length / 60) === 0)
      : dailyFlow;

  if (categories.length === 0 && dailyFlow.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
        Нет данных для графиков по выбранным фильтрам
      </section>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {pieData.length > 0 && (
        <ChartCard title="Расходы по категориям">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
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
              <Tooltip cursor={false} formatter={(value) => formatMoney(Number(value))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {sampledDaily.length > 0 && (
        <ChartCard title="Динамика поступлений и расходов">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={sampledDaily}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  v >= 1000 ? `${Math.round(v / 1000)}к` : String(v)
                }
              />
              <Tooltip cursor={false} content={<MoneyTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="income"
                name="Поступления"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="expense"
                name="Расходы"
                stroke="#f43f5e"
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {merchantData.length > 0 && (
        <ChartCard title="Топ получателей по расходам">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={merchantData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  v >= 1000 ? `${Math.round(v / 1000)}к` : String(v)
                }
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                cursor={false}
                formatter={(value) => formatMoney(Number(value))}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName ?? ""
                }
              />
              <Bar
                dataKey="amount"
                name="Сумма"
                fill="#6366f1"
                radius={[0, 4, 4, 0]}
                activeBar={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {categories.length > 0 && (
        <ChartCard title="Категории — столбчатая диаграмма">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={categories.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={70}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  v >= 1000 ? `${Math.round(v / 1000)}к` : String(v)
                }
              />
              <Tooltip cursor={false} formatter={(value) => formatMoney(Number(value))} />
              <Bar dataKey="amount" name="Сумма" radius={[4, 4, 0, 0]} activeBar={false}>
                {categories.slice(0, 10).map((item, index) => (
                  <Cell
                    key={item.category}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </section>
  );
}
