"use client";

import { Suspense, lazy, type ReactNode } from "react";
import { BrokerImportSummary } from "@/components/investments/broker-import-summary";
import { BrokerReportDiffPanel } from "@/components/investments/broker-report-diff-panel";
import { BROKER_TEXT_UPLOAD_ACCEPT } from "@/lib/broker-adapters";
import { getEffectivePortfolioTotals, resolveCashPosition, resolveSecurityPosition } from "@/lib/broker-positions";
import { formatMoney } from "@/lib/portfolio-wealth";
import type { BrokerBalanceSnapshot, BrokerReport } from "@/lib/portfolio-types";
import type { BrokerUploadResult } from "@/lib/portfolio-storage";

const PortfolioAllocationChart = lazy(() =>
  import("./portfolio-allocation-chart").then((module) => ({
    default: module.PortfolioAllocationChart,
  })),
);

function ChartLoadingFallback() {
  return (
    <div className="flex min-h-[17.5rem] items-center justify-center rounded-2xl border border-zinc-200 bg-white text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      Загрузка графика...
    </div>
  );
}

interface PortfolioTabProps {
  report: BrokerReport | null;
  onUpload: (file: File) => void;
  fileName: string;
  brokerSnapshots: BrokerBalanceSnapshot[];
  lastImport?: BrokerUploadResult | null;
  pendingConfirmation?: boolean;
  onConfirmIncomplete?: () => void;
  onDiscardIncomplete?: () => void;
  connectorPanel?: ReactNode;
}

export function PortfolioTab({
  report,
  onUpload,
  fileName,
  brokerSnapshots,
  lastImport,
  pendingConfirmation = false,
  onConfirmIncomplete,
  onDiscardIncomplete,
  connectorPanel,
}: PortfolioTabProps) {
  if (!report) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
        <p className="text-zinc-500 dark:text-zinc-400">
          Загрузите отчёт брокера: HTML Сбера, CSV/TSV или XML
        </p>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          Т‑Банк, ВТБ, БКС, Газпромбанк, Открытие — текстовый CSV; Альфа и Финам — XML. Двоичный Excel пока
          не читается.
        </p>
        <label className="mt-4 inline-flex cursor-pointer rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
          <input
            type="file"
            accept={BROKER_TEXT_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          Выбрать файл
        </label>
        </div>
        {connectorPanel}
      </div>
    );
  }

  const allocation = report.securities
    .map((s) => {
      const resolved = resolveSecurityPosition(s);
      return {
        id: s.id,
        name: s.name,
        value: resolved.value,
      };
    })
    .filter((item) => item.value > 0);

  const pieTotal = allocation.reduce((sum, item) => sum + item.value, 0);
  const totals = getEffectivePortfolioTotals(report);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {report.investor} · договор {report.contract}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Период {report.periodStart} — {report.periodEnd} · файл: {fileName}
          </p>
        </div>
        <label className="inline-flex cursor-pointer rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="file"
            accept={BROKER_TEXT_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          Загрузить отчёт
        </label>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Активы на конец", value: totals.assetsEnd },
          { label: "Изменение", value: report.assetsChange },
          { label: "Ценные бумаги", value: totals.securitiesEnd },
          { label: "Денежные средства", value: totals.cashEnd },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.label}</p>
            <p
              className={`mt-1 text-xl font-semibold tabular-nums ${
                item.label === "Изменение" && item.value < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-zinc-900 dark:text-zinc-100"
              }`}
            >
              {formatMoney(item.value)}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Suspense fallback={<ChartLoadingFallback />}>
          <PortfolioAllocationChart allocation={allocation} />
        </Suspense>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">
            Денежные остатки
          </h3>
          <div className="space-y-2">
            {report.cash.map((c) => {
              const cashResolved = resolveCashPosition(c);
              return (
                <div
                  key={`${c.platform}-${c.currency}`}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950"
                >
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {c.currency}
                    {c.rateEnd > 0 && ` · курс ${c.rateEnd.toLocaleString("ru-RU")}`}
                  </span>
                  <span className="font-medium tabular-nums">
                    {cashResolved.balance.toLocaleString("ru-RU")} {c.currency}
                    {c.currency === "GLD" && c.rateEnd > 0 && (
                      <span className="ml-2 text-zinc-500">
                        ≈ {formatMoney(cashResolved.balance * c.rateEnd)}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {lastImport && (
        <BrokerImportSummary
          provenance={lastImport.provenance}
          warnings={lastImport.warnings}
          reconciliation={lastImport.reconciliation}
          coverage={lastImport.coverage}
          pendingConfirmation={pendingConfirmation}
          onConfirmIncomplete={onConfirmIncomplete}
          onDiscardIncomplete={onDiscardIncomplete}
        />
      )}
      {connectorPanel}
      <BrokerReportDiffPanel snapshots={brokerSnapshots} />

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h3 className="font-semibold">Позиции</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Бумага</th>
                <th className="px-4 py-3">ISIN</th>
                <th className="px-4 py-3 text-right">Кол-во</th>
                <th className="px-4 py-3 text-right">Цена</th>
                <th className="px-4 py-3 text-right">Стоимость</th>
                <th className="px-4 py-3 text-right">Доля</th>
                <th className="px-4 py-3 text-right">Изменение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {report.securities.map((s) => {
                const resolved = resolveSecurityPosition(s);
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-zinc-500">{s.isin}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {resolved.quantity}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(s.priceEnd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(resolved.value)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {pieTotal > 0
                        ? `${((resolved.value / pieTotal) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        s.valueChange < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {formatMoney(s.valueChange)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {report.trades.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h3 className="font-semibold">Сделки за период</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3">Бумага</th>
                  <th className="px-4 py-3">Вид</th>
                  <th className="px-4 py-3 text-right">Кол-во</th>
                  <th className="px-4 py-3 text-right">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {report.trades.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">{t.date}</td>
                    <td className="px-4 py-3">
                      {t.name}{" "}
                      <span className="text-zinc-500">({t.ticker})</span>
                    </td>
                    <td className="px-4 py-3">{t.side}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
