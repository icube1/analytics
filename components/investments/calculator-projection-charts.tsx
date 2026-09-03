"use client";

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

type ChartRow = Record<string, number | string | undefined>;

export default function CalculatorProjectionCharts({
  chartData,
  hiddenChartLines,
  onToggleChartLine,
  showDebtLine,
  showLiquidityLine,
  showMonteCarlo,
  hasMonteCarlo,
  withdrawalEndedEarly,
  withdrawalDepletionMarker,
  isPercentWithdrawal,
}: {
  chartData: ChartRow[];
  hiddenChartLines: Set<string>;
  onToggleChartLine: (dataKey: string) => void;
  showDebtLine: boolean;
  showLiquidityLine: boolean;
  showMonteCarlo: boolean;
  hasMonteCarlo: boolean;
  withdrawalEndedEarly: boolean;
  withdrawalDepletionMarker: string | null | undefined;
  isPercentWithdrawal: boolean;
}) {
  const isHidden = (dataKey: string) => hiddenChartLines.has(dataKey);

  return (
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
              onToggle={onToggleChartLine}
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
          hide={isHidden("nominal")}
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
          hide={isHidden("inflationHurdle")}
        />
        <Line
          type="monotone"
          dataKey="realPortfolio"
          name="Портфель (сегодняшние ₽)"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          activeDot={false}
          hide={isHidden("realPortfolio")}
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
          hide={isHidden("realContributed")}
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
            hide={isHidden("totalDebt")}
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
            hide={isHidden("liquidityBalance")}
          />
        )}
        {showMonteCarlo && hasMonteCarlo && (
          <>
            <Line
              type="monotone"
              dataKey="mcP90"
              name="MC P90"
              stroke="#a5b4fc"
              strokeWidth={1.5}
              strokeDasharray="2 4"
              dot={false}
              activeDot={false}
              hide={isHidden("mcP90")}
            />
            <Line
              type="monotone"
              dataKey="mcP50"
              name="MC медиана"
              stroke="#c084fc"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              hide={isHidden("mcP50")}
            />
            <Line
              type="monotone"
              dataKey="mcP10"
              name="MC P10"
              stroke="#a5b4fc"
              strokeWidth={1.5}
              strokeDasharray="2 4"
              dot={false}
              activeDot={false}
              hide={isHidden("mcP10")}
            />
          </>
        )}
        {withdrawalEndedEarly && withdrawalDepletionMarker && (
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
  );
}
