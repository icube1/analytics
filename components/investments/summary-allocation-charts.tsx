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
import { CHART_COLORS } from "@/lib/stats";

export interface SummaryPieSlice {
  name: string;
  value: number;
}

export interface SummaryReturnSlice {
  name: string;
  fullName: string;
  returnPct: number;
  contribution: number;
}

export function SummaryAllocationCharts({
  pieData,
  returnData,
}: {
  pieData: SummaryPieSlice[];
  returnData: SummaryReturnSlice[];
}) {
  return (
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
  );
}
