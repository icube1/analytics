"use client";

import { formatMoney } from "@/lib/portfolio-wealth";
import type {
  BrokerImportProvenance,
  BrokerImportReconciliation,
  BrokerImportWarning,
} from "@/lib/broker-adapters";

export interface BrokerImportSummaryProps {
  provenance: BrokerImportProvenance;
  warnings: BrokerImportWarning[];
  reconciliation: BrokerImportReconciliation | null;
}

function formatDelta(value: number | null): string {
  if (value == null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMoney(value)}`;
}

export function BrokerImportSummary({
  provenance,
  warnings,
  reconciliation,
}: BrokerImportSummaryProps) {
  const reconClass = reconciliation?.withinTolerance
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-amber-800 dark:text-amber-200";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
          Результат импорта
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {provenance.adapterLabel} · {provenance.adapterId} v{provenance.adapterVersion}
          {provenance.fileName ? ` · ${provenance.fileName}` : ""}
        </p>
      </div>

      {reconciliation && (
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Сверка активов</p>
            <p className={`mt-1 text-sm font-medium ${reconClass}`}>
              {reconciliation.withinTolerance
                ? "В пределах допуска"
                : "Расхождение сверх допуска"}
            </p>
            <p className="mt-1 text-xs tabular-nums text-zinc-500">
              Δ {formatDelta(reconciliation.assetsDelta)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Ценные бумаги</p>
            <p className="mt-1 text-sm tabular-nums text-zinc-800 dark:text-zinc-100">
              Δ {formatDelta(reconciliation.securitiesDelta)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Денежные средства</p>
            <p className="mt-1 text-sm tabular-nums text-zinc-800 dark:text-zinc-100">
              Δ {formatDelta(reconciliation.cashDelta)}
            </p>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="border-t border-zinc-200 px-5 py-3 text-xs text-amber-800 dark:border-zinc-800 dark:text-amber-200">
          {warnings.slice(0, 6).map((warning, index) => (
            <li key={`${warning.code}-${index}`}>
              {warning.message}
            </li>
          ))}
          {warnings.length > 6 && (
            <li>ещё {warnings.length - 6} предупреждений</li>
          )}
        </ul>
      )}
    </section>
  );
}
