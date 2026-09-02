"use client";

import { useMemo } from "react";
import {
  findLatestBrokerReportDiff,
  formatDiffDelta,
} from "@/lib/broker-report-diff";
import { formatMoney } from "@/lib/portfolio-wealth";
import type { BrokerBalanceSnapshot } from "@/lib/portfolio-types";

interface BrokerReportDiffPanelProps {
  snapshots: BrokerBalanceSnapshot[];
}

function deltaClass(value: number): string {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-rose-600 dark:text-rose-400";
  return "text-zinc-500";
}

export function BrokerReportDiffPanel({ snapshots }: BrokerReportDiffPanelProps) {
  const diff = useMemo(
    () => findLatestBrokerReportDiff(snapshots),
    [snapshots],
  );

  if (!diff) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
          Изменения с прошлого отчёта
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {diff.previousPeriodEnd} → {diff.currentPeriodEnd}
        </p>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Брокер всего",
            value: diff.brokerTotalDelta,
          },
          {
            label: "Ценные бумаги",
            value: diff.securitiesValueDelta,
          },
          {
            label: "Денежные средства",
            value: diff.cashDelta,
          },
          {
            label: "Пополнения",
            value: diff.depositsInPeriod,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60"
          >
            <p className="text-xs text-zinc-500">{item.label}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${deltaClass(item.value)}`}>
              {formatDiffDelta(item.value)}
            </p>
          </div>
        ))}
      </div>

      {diff.positionChanges.length > 0 && (
        <div className="overflow-x-auto border-t border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Бумага</th>
                <th className="px-4 py-3 text-right">Δ кол-во</th>
                <th className="px-4 py-3 text-right">Было → стало</th>
                <th className="px-4 py-3 text-right">Δ стоимость</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {diff.positionChanges.map((change) => (
                <tr key={change.isin}>
                  <td className="px-4 py-3 font-medium">{change.name}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${deltaClass(change.quantityDelta)}`}
                  >
                    {change.quantityDelta > 0 ? "+" : ""}
                    {change.quantityDelta}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                    {change.quantityBefore} → {change.quantityAfter}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${deltaClass(change.valueDelta)}`}
                  >
                    {formatDiffDelta(change.valueDelta)}
                    <span className="ml-2 text-xs text-zinc-400">
                      ({formatMoney(change.valueBefore)} → {formatMoney(change.valueAfter)})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
