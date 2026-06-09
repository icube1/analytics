"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartsSection } from "@/components/charts-section";
import { FiltersPanel } from "@/components/filters-panel";
import { SummaryStatsCards } from "@/components/summary-stats";
import { TransactionsTable } from "@/components/transactions-table";
import { parseCsv } from "@/lib/csv";
import {
  applyFilters,
  getDateBounds,
  getUniqueValues,
} from "@/lib/filters";
import { mergeWithExisting } from "@/lib/merge";
import {
  deserializeTransaction,
  type SerializedTransaction,
} from "@/lib/serialize";
import {
  computeCategoryBreakdown,
  computeDailyFlow,
  computeSummary,
  computeTopMerchants,
} from "@/lib/stats";
import { EMPTY_FILTERS, type Filters, type Transaction } from "@/lib/types";

interface LoadMeta {
  files: string[];
  directories: string[];
  totalRaw: number;
  totalUnique: number;
  duplicatesRemoved: number;
}

export function Dashboard() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<LoadMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const applyLoadedTransactions = useCallback((transactions: Transaction[]) => {
    setAllTransactions(transactions);
    const bounds = getDateBounds(transactions);
    setFilters({
      ...EMPTY_FILTERS,
      dateFrom: bounds.min,
      dateTo: bounds.max,
    });
  }, []);

  const loadFromFolder = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/statements");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Не удалось загрузить выписки");
      }

      const transactions = (data.transactions as SerializedTransaction[]).map(
        deserializeTransaction,
      );
      setMeta(data.meta as LoadMeta);

      if (transactions.length === 0) {
        setError("В папке statements не найдено CSV-файлов");
        setAllTransactions([]);
        return;
      }

      applyLoadedTransactions(transactions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить выписки",
      );
    } finally {
      setLoading(false);
    }
  }, [applyLoadedTransactions]);

  useEffect(() => {
    loadFromFolder();
  }, [loadFromFolder, reloadToken]);

  const handleFilesUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;

    const batches = await Promise.all(
      [...fileList].map(
        (file) =>
          new Promise<{ sourceFile: string; transactions: Transaction[] }>(
            (resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result !== "string") {
                  reject(new Error("Не удалось прочитать файл"));
                  return;
                }
                resolve({
                  sourceFile: `upload/${file.name}`,
                  transactions: parseCsv(reader.result, `upload/${file.name}`),
                });
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsText(file, "utf-8");
            },
          ),
      ),
    );

    const { transactions, duplicatesRemoved, sourceFiles } = mergeWithExisting(
      allTransactions,
      batches,
    );

    if (transactions.length === 0) {
      setError("В загруженных файлах не найдено операций");
      return;
    }

    setError(null);
    const addedRaw = batches.reduce((sum, b) => sum + b.transactions.length, 0);
    setMeta((prev) => ({
      files: sourceFiles,
      directories: prev?.directories ?? [],
      totalRaw: (prev?.totalRaw ?? allTransactions.length) + addedRaw,
      totalUnique: transactions.length,
      duplicatesRemoved: (prev?.duplicatesRemoved ?? 0) + duplicatesRemoved,
    }));
    applyLoadedTransactions(transactions);
  };

  const options = useMemo(
    () => getUniqueValues(allTransactions),
    [allTransactions],
  );
  const dateBounds = useMemo(
    () => getDateBounds(allTransactions),
    [allTransactions],
  );

  const filtered = useMemo(
    () => applyFilters(allTransactions, filters),
    [allTransactions, filters],
  );

  const stats = useMemo(() => computeSummary(filtered), [filtered]);
  const categories = useMemo(
    () => computeCategoryBreakdown(filtered),
    [filtered],
  );
  const dailyFlow = useMemo(() => computeDailyFlow(filtered), [filtered]);
  const merchants = useMemo(() => computeTopMerchants(filtered), [filtered]);

  const resetFilters = () => {
    setFilters({
      ...EMPTY_FILTERS,
      dateFrom: dateBounds.min,
      dateTo: dateBounds.max,
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-500 dark:text-zinc-400">
        Загрузка выписок из папки statements...
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Аналитика выписки
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Расчётный счёт
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {allTransactions.length} уникальных операций
            {meta && meta.duplicatesRemoved > 0 && (
              <> · дублей убрано: {meta.duplicatesRemoved}</>
            )}
          </p>
          {meta && meta.files.length > 0 && (
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              Файлы: {meta.files.join(", ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Обновить из папки
          </button>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700">
            <input
              type="file"
              accept=".csv,.CSV"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFilesUpload(e.target.files);
                e.target.value = "";
              }}
            />
            Добавить CSV
          </label>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
          <p className="mt-1 text-xs opacity-80">
            Положите CSV-файлы в папку <code>statements/</code> рядом с проектом
          </p>
        </div>
      )}

      <FiltersPanel
        filters={filters}
        options={options}
        dateBounds={dateBounds}
        filteredCount={filtered.length}
        totalCount={allTransactions.length}
        onChange={setFilters}
        onReset={resetFilters}
      />

      <SummaryStatsCards stats={stats} />

      <ChartsSection
        categories={categories}
        dailyFlow={dailyFlow}
        merchants={merchants}
      />

      <TransactionsTable
        transactions={filtered}
        totalCount={allTransactions.length}
      />
    </div>
  );
}
