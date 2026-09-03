"use client";

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
import type { SavedForecastPlan } from "@/lib/portfolio-types";

type TrackingChartRow = Record<string, string | number | null>;

export function TrackingForecastCharts({
  chartData,
  visibleChartData,
  yDomain,
  showLiveForecast,
  liveForecast,
  activePlanIds,
  forecastPlans,
  planColors,
  brushRange,
  onBrushChange,
}: {
  chartData: TrackingChartRow[];
  visibleChartData: TrackingChartRow[];
  yDomain: [number, number] | undefined;
  showLiveForecast: boolean;
  liveForecast: object | null;
  activePlanIds: string[];
  forecastPlans: SavedForecastPlan[];
  planColors: Map<string, string>;
  brushRange: { startIndex: number; endIndex: number };
  onBrushChange: (range: { startIndex: number; endIndex: number }) => void;
}) {
  return (
    <>
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
            {showLiveForecast && liveForecast && (
              <Line
                type="monotone"
                dataKey="liveForecast"
                name="Прогноз"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                strokeDasharray="4 3"
                isAnimationActive={false}
              />
            )}
            {activePlanIds.map((planId) => {
              const plan = forecastPlans.find((item) => item.id === planId);
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
                startIndex={brushRange.startIndex}
                endIndex={brushRange.endIndex}
                onChange={(range) => {
                  if (range.startIndex == null || range.endIndex == null) {
                    return;
                  }
                  onBrushChange({
                    startIndex: range.startIndex,
                    endIndex: range.endIndex,
                  });
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
