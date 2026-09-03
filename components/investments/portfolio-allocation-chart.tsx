"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChartMoneyTooltip } from "@/components/chart-money-tooltip";
import { CHART_COLORS } from "@/lib/stats";

export interface PortfolioAllocationSlice {
  id: string;
  name: string;
  value: number;
}

export function PortfolioAllocationChart({
  allocation,
}: {
  allocation: PortfolioAllocationSlice[];
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">
        Доли в портфеле
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={allocation}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={95}
            innerRadius={45}
            stroke="none"
            paddingAngle={1}
            activeShape={false}
          >
            {allocation.map((item, index) => (
              <Cell
                key={item.id}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                stroke="none"
              />
            ))}
          </Pie>
          <Tooltip cursor={false} content={<ChartMoneyTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
