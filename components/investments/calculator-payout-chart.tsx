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

type PayoutRow = {
  label: string;
  payoutActual: number;
  payoutTarget: number;
};

export default function CalculatorPayoutChart({
  payoutChartData,
  hiddenPayoutChartLines,
  onTogglePayoutChartLine,
  payoutTargetLineName,
  withdrawalEndedEarly,
  withdrawalDepletionMarker,
  isPercentWithdrawal,
}: {
  payoutChartData: PayoutRow[];
  hiddenPayoutChartLines: Set<string>;
  onTogglePayoutChartLine: (dataKey: string) => void;
  payoutTargetLineName: string;
  withdrawalEndedEarly: boolean;
  withdrawalDepletionMarker: string | null | undefined;
  isPercentWithdrawal: boolean;
}) {
  const isHidden = (dataKey: string) => hiddenPayoutChartLines.has(dataKey);

  return (
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
              onToggle={onTogglePayoutChartLine}
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
          hide={isHidden("payoutTarget")}
        />
        <Line
          type="monotone"
          dataKey="payoutActual"
          name="На руки (сегодняшние ₽)"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          activeDot={false}
          hide={isHidden("payoutActual")}
        />
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
