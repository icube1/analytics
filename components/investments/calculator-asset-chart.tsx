"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
} from "recharts";
import { ChartMoneyTooltip } from "@/components/chart-money-tooltip";
import { ChartToggleLegend } from "@/components/chart-toggle-legend";
import type { AssetBreakdownEntry, CompoundPoint } from "@/lib/compound-interest";

const ASSET_CHART_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
];

function pickAssetSeries(points: CompoundPoint[]): AssetBreakdownEntry[] {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i].assetBreakdown.length > 0) {
      return points[i].assetBreakdown;
    }
  }
  return [];
}

interface CalculatorAssetChartProps {
  points: CompoundPoint[];
}

export function CalculatorAssetChart({ points }: CalculatorAssetChartProps) {
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(() => new Set());

  const assetSeries = useMemo(() => pickAssetSeries(points), [points]);

  const chartData = useMemo(
    () =>
      points.map((point) => {
        const row: Record<string, string | number> = { label: point.label };
        for (const asset of point.assetBreakdown) {
          row[asset.id] = asset.netEquity;
        }
        return row;
      }),
    [points],
  );

  const toggleLine = useCallback((dataKey: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  }, []);

  const isHidden = (dataKey: string) => hiddenLines.has(dataKey);

  if (assetSeries.length <= 1) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Структура портфеля</h3>
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
            Номинал · чистая стоимость по активам · долги не включены в слои
          </p>
        </div>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
          Легенда — вкл/выкл слой
        </p>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData}>
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
                hidden={hiddenLines}
                onToggle={toggleLine}
              />
            )}
          />
          {assetSeries.map((asset, index) => (
            <Area
              key={asset.id}
              type="monotone"
              dataKey={asset.id}
              name={asset.label}
              stackId="assets"
              stroke={ASSET_CHART_COLORS[index % ASSET_CHART_COLORS.length]}
              fill={ASSET_CHART_COLORS[index % ASSET_CHART_COLORS.length]}
              fillOpacity={0.75}
              hide={isHidden(asset.id)}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
