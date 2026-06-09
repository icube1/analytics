"use client";

type StatCardTone = "default" | "accent" | "income" | "expense" | "warning";

const toneClasses: Record<StatCardTone, string> = {
  default: "text-zinc-900 dark:text-zinc-100",
  accent: "text-indigo-600 dark:text-indigo-400",
  income: "text-emerald-600 dark:text-emerald-400",
  expense: "text-rose-600 dark:text-rose-400",
  warning: "text-amber-600 dark:text-amber-400",
};

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: StatCardTone;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: StatCardProps) {
  return (
    <div className="min-w-[10.5rem] rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase leading-snug tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1.5 font-semibold tabular-nums leading-snug tracking-tight text-[clamp(0.875rem,1.1vw+0.55rem,1.125rem)] ${toneClasses[tone]}`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs leading-snug text-zinc-400 dark:text-zinc-500">
          {hint}
        </p>
      )}
    </div>
  );
}
