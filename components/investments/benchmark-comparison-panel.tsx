"use client";

import { useEffect, useMemo, useState } from "react";
import {
  attachPortfolioDelta,
  buildBenchmarkPeriods,
  computeBrokerReturnForPeriod,
  defaultBenchmarkPeriod,
  resolveComparisonDates,
  type BenchmarkPeriod,
  type BenchmarkReturnRow,
} from "@/lib/market-benchmark";
import { BENCHMARK_GROUP_LABELS } from "@/lib/market-data/indices-catalog";
import type { BrokerBalanceSnapshot } from "@/lib/portfolio-types";

interface BenchmarkComparisonPanelProps {
  snapshots: BrokerBalanceSnapshot[];
}

interface MarketBenchmarkApiResponse {
  fromDate: string;
  toDate: string;
  cachedAt: string;
  rows: Array<{
    id: string;
    label: string;
    group: BenchmarkReturnRow["group"];
    returnPct: number | null;
  }>;
}

function formatReturn(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function returnTone(value: number | null): string {
  if (value == null || Math.abs(value) < 0.005) {
    return "text-zinc-600 dark:text-zinc-400";
  }
  return value > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
}

function deltaTone(value: number | null): string {
  if (value == null || Math.abs(value) < 0.005) {
    return "text-zinc-500 dark:text-zinc-400";
  }
  return value > 0
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-rose-700 dark:text-rose-300";
}

function formatDelta(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} п.п.`;
}

function formatPeriodRange(fromDate: string, toDate: string): string {
  const fmt = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  return `${fmt(fromDate)} — ${fmt(toDate)}`;
}

function BenchmarkRow({
  row,
  highlight,
}: {
  row: BenchmarkReturnRow;
  highlight?: boolean;
}) {
  return (
    <tr
      className={
        highlight
          ? "bg-indigo-50/80 dark:bg-indigo-950/30"
          : "hover:bg-zinc-50/80 dark:hover:bg-zinc-950/40"
      }
    >
      <td
        className={`py-1.5 pr-3 ${highlight ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}
      >
        {row.label}
      </td>
      <td
        className={`py-1.5 pr-3 text-right tabular-nums ${returnTone(row.returnPct)} ${highlight ? "font-semibold" : ""}`}
      >
        {formatReturn(row.returnPct)}
      </td>
      <td
        className={`py-1.5 text-right tabular-nums text-xs ${deltaTone(row.deltaVsPortfolio ?? null)}`}
      >
        {highlight ? "—" : formatDelta(row.deltaVsPortfolio ?? null)}
      </td>
    </tr>
  );
}

function BenchmarkTable({
  rows,
  portfolioRow,
}: {
  rows: BenchmarkReturnRow[];
  portfolioRow: BenchmarkReturnRow;
}) {
  return (
    <table className="min-w-full text-sm">
      <thead className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        <tr>
          <th className="pb-2 pr-3 font-medium">Бенчмарк</th>
          <th className="pb-2 pr-3 text-right font-medium">Доходность</th>
          <th className="pb-2 text-right font-medium">Разница</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
        <BenchmarkRow row={portfolioRow} highlight />
        {rows.map((row) => (
          <BenchmarkRow key={row.id} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function CollapsibleGroup({
  title,
  rows,
  portfolioRow,
  defaultOpen = false,
}: {
  title: string;
  rows: BenchmarkReturnRow[];
  portfolioRow: BenchmarkReturnRow;
  defaultOpen?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <details
      className="group rounded-lg border border-zinc-100 dark:border-zinc-800"
      open={defaultOpen || undefined}
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-zinc-700 marker:content-none dark:text-zinc-300">
        <span className="flex items-center justify-between gap-2">
          {title}
          <span className="font-normal text-zinc-400 group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="border-t border-zinc-100 px-3 pb-2 dark:border-zinc-800">
        <BenchmarkTable rows={rows} portfolioRow={portfolioRow} />
      </div>
    </details>
  );
}

function groupPeriodOptions(periods: BenchmarkPeriod[]) {
  const months = periods
    .filter((period) => period.kind === "month")
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate));
  const ytd = periods.filter((period) => period.kind === "ytd");
  const all = periods.filter((period) => period.kind === "all");
  return { months, ytd, all };
}

export function BenchmarkComparisonPanel({
  snapshots,
}: BenchmarkComparisonPanelProps) {
  const periods = useMemo(() => buildBenchmarkPeriods(snapshots), [snapshots]);
  const defaultPeriod = useMemo(
    () => defaultBenchmarkPeriod(periods),
    [periods],
  );
  const [periodId, setPeriodId] = useState<string | null>(null);
  const selectedPeriod =
    periods.find((period) => period.id === periodId) ?? defaultPeriod;

  useEffect(() => {
    if (defaultPeriod && periodId == null) {
      setPeriodId(defaultPeriod.id);
    }
  }, [defaultPeriod, periodId]);

  const comparisonDates = useMemo(
    () => (selectedPeriod ? resolveComparisonDates(selectedPeriod) : null),
    [selectedPeriod],
  );

  const portfolioReturn = useMemo(() => {
    if (!selectedPeriod) return null;
    return computeBrokerReturnForPeriod(snapshots, selectedPeriod);
  }, [snapshots, selectedPeriod]);

  const [marketData, setMarketData] = useState<MarketBenchmarkApiResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!comparisonDates) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      from: comparisonDates.fromDate,
      to: comparisonDates.toDate,
    });

    fetch(`/api/market-benchmark?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Не удалось загрузить индексы");
        }
        return response.json() as Promise<MarketBenchmarkApiResponse>;
      })
      .then((data) => {
        if (!cancelled) setMarketData(data);
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setMarketData(null);
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Ошибка загрузки",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [comparisonDates]);

  const portfolioRow: BenchmarkReturnRow = useMemo(
    () => ({
      id: "portfolio",
      label: "Брокерский счёт",
      group: "portfolio",
      returnPct: portfolioReturn,
      deltaVsPortfolio: null,
    }),
    [portfolioReturn],
  );

  const groupedRows = useMemo(() => {
    if (!marketData) {
      return {
        core: [] as BenchmarkReturnRow[],
        sector: [] as BenchmarkReturnRow[],
        bonds: [] as BenchmarkReturnRow[],
        fx: [] as BenchmarkReturnRow[],
      };
    }

    const withDelta = attachPortfolioDelta(
      portfolioReturn,
      marketData.rows.map((row) => ({
        id: row.id,
        label: row.label,
        group: row.group,
        returnPct: row.returnPct,
      })),
    );

    return {
      core: withDelta.filter((row) => row.group === "core"),
      sector: withDelta.filter((row) => row.group === "sector"),
      bonds: withDelta.filter((row) => row.group === "bonds"),
      fx: withDelta.filter((row) => row.group === "fx"),
    };
  }, [marketData, portfolioReturn]);

  if (snapshots.length < 2 || periods.length === 0) return null;

  const periodGroups = groupPeriodOptions(periods);
  const headlineBenchmark =
    groupedRows.core.find((row) => row.id === "IMOEX") ?? groupedRows.core[0];

  return (
    <details className="group rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer list-none px-5 py-4 marker:content-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Сравнение с рынком
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Брокерский счёт vs индексы MOEX и курсы ЦБ · обновление раз в сутки
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!loading && portfolioReturn != null && headlineBenchmark && (
              <span className="rounded-lg bg-zinc-50 px-2.5 py-1 text-xs tabular-nums text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
                Вы: {formatReturn(portfolioReturn)} · IMOEX:{" "}
                {formatReturn(headlineBenchmark.returnPct)}
              </span>
            )}
            <span className="text-xs text-zinc-400 group-open:rotate-180">▾</span>
          </div>
        </div>
      </summary>

      <div className="space-y-4 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            Период
            <select
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              value={selectedPeriod?.id ?? ""}
              onChange={(event) => setPeriodId(event.target.value)}
            >
              {periodGroups.months.length > 0 && (
                <optgroup label="По месяцам">
                  {periodGroups.months.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {periodGroups.ytd.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
              {periodGroups.all.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>

          {comparisonDates && (
            <p className="pb-2 text-xs text-zinc-500 dark:text-zinc-400">
              {formatPeriodRange(comparisonDates.fromDate, comparisonDates.toDate)}
              {selectedPeriod?.kind === "month" && (
                <span className="ml-1 text-zinc-400">
                  · от конца прошлого месяца
                </span>
              )}
            </p>
          )}
        </div>

        {loading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Загрузка индексов…
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </p>
        )}

        {!loading && !error && marketData && (
          <div className="space-y-3">
            {portfolioReturn == null && selectedPeriod?.kind === "month" && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Для сравнения за этот месяц нужны отчёты за текущий и предыдущий
                месяц. Загрузите более ранний отчёт или выберите «С начала года» /
                «С первого отчёта».
              </p>
            )}

            {portfolioReturn != null && groupedRows.core[0] && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Разница = ваша доходность минус доходность индекса.{" "}
                <span className="text-emerald-700 dark:text-emerald-300">
                  Плюс
                </span>{" "}
                — вы лучше рынка,{" "}
                <span className="text-rose-700 dark:text-rose-300">минус</span> —
                хуже. Это не означает, что вы в плюсе по деньгам.
              </p>
            )}

            <BenchmarkTable rows={groupedRows.core} portfolioRow={portfolioRow} />

            <CollapsibleGroup
              title={`${BENCHMARK_GROUP_LABELS.sector} (${groupedRows.sector.length})`}
              rows={groupedRows.sector}
              portfolioRow={portfolioRow}
            />

            <CollapsibleGroup
              title={`${BENCHMARK_GROUP_LABELS.bonds} и ${BENCHMARK_GROUP_LABELS.fx.toLowerCase()} (${groupedRows.bonds.length + groupedRows.fx.length})`}
              rows={[...groupedRows.bonds, ...groupedRows.fx]}
              portfolioRow={portfolioRow}
            />
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-zinc-400">
          Сравнивается только брокерский счёт (без других активов). Индексы MOEX —
          изменение цены, без дивидендов. Пополнения счёта вычитаются из доходности
          портфеля. Данные MOEX ISS и cbr-xml-daily.ru, кэш до конца дня.
        </p>
      </div>
    </details>
  );
}
