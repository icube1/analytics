"use client";

import { formatMoney } from "@/lib/portfolio-wealth";
import {
  assessBrokerImportCompleteness,
  type BrokerImportCoverage,
  type BrokerImportProvenance,
  type BrokerImportReconciliation,
  type BrokerImportWarning,
} from "@/lib/broker-adapters";

export interface BrokerImportSummaryProps {
  provenance: BrokerImportProvenance;
  warnings: BrokerImportWarning[];
  reconciliation: BrokerImportReconciliation | null;
  coverage?: BrokerImportCoverage | null;
  pendingConfirmation?: boolean;
  onConfirmIncomplete?: () => void;
  onDiscardIncomplete?: () => void;
}

function formatDelta(value: number | null): string {
  if (value == null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMoney(value)}`;
}

function formatAmount(value: number | null): string {
  if (value == null) return "—";
  return formatMoney(value);
}

function CoverageChip({
  label,
  present,
  count,
}: {
  label: string;
  present: boolean;
  count?: number;
}) {
  return (
    <li
      className={`rounded-lg px-2 py-1 text-xs ${
        present
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {label}
      {present && count != null ? ` · ${count}` : present ? "" : " · нет"}
    </li>
  );
}

export function BrokerImportSummary({
  provenance,
  warnings,
  reconciliation,
  coverage = null,
  pendingConfirmation = false,
  onConfirmIncomplete,
  onDiscardIncomplete,
}: BrokerImportSummaryProps) {
  const completeness = assessBrokerImportCompleteness({
    coverage,
    reconciliation,
    warnings,
  });
  const reconClass = reconciliation?.withinTolerance
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-amber-800 dark:text-amber-200";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
          Сверка импорта
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {provenance.adapterLabel} · {provenance.adapterId} v{provenance.adapterVersion}
          {provenance.fileName ? ` · ${provenance.fileName}` : ""}
          {provenance.sanitized ? " · обезличено" : ""}
        </p>
      </div>

      {coverage ? (
        <ul className="flex flex-wrap gap-2 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <CoverageChip label="Период" present={coverage.meta} />
          <CoverageChip
            label="Бумаги"
            present={coverage.securities}
            count={coverage.securitiesCount}
          />
          <CoverageChip
            label="Деньги"
            present={coverage.cash}
            count={coverage.cashCount}
          />
          <CoverageChip
            label="Сделки"
            present={coverage.trades}
            count={coverage.tradeCount}
          />
          <CoverageChip
            label="Движения"
            present={coverage.cashFlows}
            count={coverage.cashFlowCount}
          />
        </ul>
      ) : null}

      {reconciliation && (
        <div className="overflow-x-auto px-5 py-4">
          <p className={`mb-3 text-sm font-medium ${reconClass}`}>
            {reconciliation.withinTolerance
              ? "Итоги совпадают в пределах ±1 ₽"
              : "Расхождение сверх допуска ±1 ₽"}
          </p>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-1 pr-4">Раздел</th>
                <th className="py-1 pr-4 text-right">Брокер</th>
                <th className="py-1 pr-4 text-right">Расчёт</th>
                <th className="py-1 text-right">Δ</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-zinc-800 dark:text-zinc-100">
              <tr>
                <td className="py-1 pr-4">Активы</td>
                <td className="py-1 pr-4 text-right">
                  {formatAmount(reconciliation.assetsEndReported)}
                </td>
                <td className="py-1 pr-4 text-right">
                  {formatAmount(reconciliation.assetsEndComputed)}
                </td>
                <td className="py-1 text-right">
                  {formatDelta(reconciliation.assetsDelta)}
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-4">Ценные бумаги</td>
                <td className="py-1 pr-4 text-right">
                  {formatAmount(reconciliation.securitiesEndReported)}
                </td>
                <td className="py-1 pr-4 text-right">
                  {formatAmount(reconciliation.securitiesEndComputed)}
                </td>
                <td className="py-1 text-right">
                  {formatDelta(reconciliation.securitiesDelta)}
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-4">Денежные средства</td>
                <td className="py-1 pr-4 text-right">
                  {formatAmount(reconciliation.cashEndReported)}
                </td>
                <td className="py-1 pr-4 text-right">
                  {formatAmount(reconciliation.cashEndComputed)}
                </td>
                <td className="py-1 text-right">
                  {formatDelta(reconciliation.cashDelta)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {completeness.gaps.length > 0 ? (
        <ul className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {completeness.gaps.map((gap) => (
            <li key={gap.code}>{gap.message}</li>
          ))}
        </ul>
      ) : null}

      {warnings.length > 0 && (
        <ul className="border-t border-zinc-200 px-5 py-3 text-xs text-amber-800 dark:border-zinc-800 dark:text-amber-200">
          {warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`}>
              {warning.code}: {warning.message}
            </li>
          ))}
        </ul>
      )}

      {pendingConfirmation ? (
        <div className="flex flex-wrap gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <p className="w-full text-xs text-zinc-600 dark:text-zinc-300">
            Импорт неполный. Подтвердите, если хотите сохранить его как есть.
          </p>
          <button
            type="button"
            onClick={onConfirmIncomplete}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500"
          >
            Подтвердить неполный импорт
          </button>
          <button
            type="button"
            onClick={onDiscardIncomplete}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Отменить
          </button>
        </div>
      ) : null}
    </section>
  );
}
