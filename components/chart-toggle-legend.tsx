"use client";

type LegendEntry = {
  value?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
  color?: string;
};

interface ChartToggleLegendProps {
  payload?: ReadonlyArray<LegendEntry>;
  hidden: ReadonlySet<string>;
  onToggle: (dataKey: string) => void;
}

function legendEntryKey(entry: LegendEntry): string {
  const { dataKey } = entry;
  if (typeof dataKey === "string" || typeof dataKey === "number") {
    return String(dataKey);
  }
  return String(entry.value ?? "");
}

export function ChartToggleLegend({
  payload,
  hidden,
  onToggle,
}: ChartToggleLegendProps) {
  if (!payload?.length) return null;

  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-2">
      {payload.map((entry) => {
        const key = legendEntryKey(entry);
        const isHidden = hidden.has(key);
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onToggle(key)}
              className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-opacity hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                isHidden ? "opacity-40 line-through" : "opacity-100"
              }`}
              aria-pressed={!isHidden}
            >
              <span
                className="inline-block h-0.5 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span className="text-zinc-600 dark:text-zinc-400">{entry.value}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
