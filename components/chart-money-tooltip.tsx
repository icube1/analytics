"use client";

import { formatMoney } from "@/lib/portfolio-wealth";

type TooltipPayloadItem = {
  value?: number | string;
  name?: string;
  color?: string;
  payload?: Record<string, unknown>;
};

export function ChartMoneyTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  labelFormatter?: (label: string, payload: TooltipPayloadItem[]) => string;
}) {
  if (!active || !payload?.length) return null;

  const title = labelFormatter
    ? labelFormatter(String(label ?? ""), payload)
    : label;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      {title ? (
        <p className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      ) : null}
      {payload.map((entry, index) => (
        <p
          key={`${entry.name ?? "value"}-${index}`}
          className="text-zinc-700 dark:text-zinc-300"
          style={entry.color ? { color: entry.color } : undefined}
        >
          {entry.name}: {formatMoney(Number(entry.value))}
        </p>
      ))}
    </div>
  );
}

export function ChartPercentTooltip({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  labelFormatter?: (label: string, payload: TooltipPayloadItem[]) => string;
  formatter?: (
    value: number,
    name: string,
    entry: TooltipPayloadItem,
  ) => [string, string];
}) {
  if (!active || !payload?.length) return null;

  const title = labelFormatter
    ? labelFormatter(String(label ?? ""), payload)
    : label;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      {title ? (
        <p className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      ) : null}
      {payload.map((entry, index) => {
        const value = Number(entry.value);
        const [formattedValue, formattedName] = formatter
          ? formatter(value, String(entry.name ?? ""), entry)
          : [`${value}`, String(entry.name ?? "")];
        return (
          <p
            key={`${entry.name ?? "value"}-${index}`}
            className="text-zinc-700 dark:text-zinc-300"
            style={entry.color ? { color: entry.color } : undefined}
          >
            {formattedName}: {formattedValue}
          </p>
        );
      })}
    </div>
  );
}
