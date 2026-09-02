"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/portfolio-wealth";
import {
  collectUpcomingEvents,
  type UpcomingEvent,
  type UpcomingEventUrgency,
} from "@/lib/upcoming-events";
import type { CustomAssets } from "@/lib/portfolio-types";

interface UpcomingEventsPanelProps {
  assets: CustomAssets;
}

function urgencyStyles(urgency: UpcomingEventUrgency): string {
  switch (urgency) {
    case "soon":
      return "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40";
    case "medium":
      return "border-indigo-200 bg-indigo-50/80 dark:border-indigo-900 dark:bg-indigo-950/30";
    default:
      return "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/60";
  }
}

function eventIcon(kind: UpcomingEvent["kind"]): string {
  return kind === "deposit_maturity" ? "🏦" : "📉";
}

function EventRow({ event }: { event: UpcomingEvent }) {
  const countdown =
    event.paymentsRemaining != null
      ? `~${event.paymentsRemaining} платежей · ${event.monthsRemaining} мес.`
      : `~${event.monthsRemaining} мес.`;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${urgencyStyles(event.urgency)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            <span className="mr-1.5">{eventIcon(event.kind)}</span>
            {event.label}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {event.detail}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
            {countdown}
          </p>
          {event.monthlyAmount != null && event.monthlyAmount > 0 && (
            <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
              +{formatMoney(event.monthlyAmount)}/мес после
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function UpcomingEventsPanel({ assets }: UpcomingEventsPanelProps) {
  const events = useMemo(() => collectUpcomingEvents(assets), [assets]);

  if (events.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
          Ближайшие события
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Закрытие вкладов и последние платежи по кредитам
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
