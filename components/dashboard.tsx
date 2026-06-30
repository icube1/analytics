"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartsSection } from "@/components/charts-section";
import { FiltersPanel } from "@/components/filters-panel";
import { SummaryStatsCards } from "@/components/summary-stats";
import { TransactionsTable } from "@/components/transactions-table";
import {
  applyFilters,
  getDateBounds,
  getUniqueValues,
} from "@/lib/filters";
import {
  deleteStatementFile,
  fetchStatements,
  uploadStatementFiles,
} from "@/lib/statements-storage";
import { FileDropOverlay } from "@/components/file-drop-overlay";
import { usePageFileDrop } from "@/lib/use-page-file-drop";
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
  fileNames?: string[];
  directories: string[];
  totalRaw: number;
  totalUnique: number;
  duplicatesRemoved: number;
}

function fileLabel(sourcePath: string): string {
  const parts = sourcePath.split("/");
  return parts[parts.length - 1] ?? sourcePath;
}

const CSV_ACCEPT = [".csv"];

export function Dashboard() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [meta, setMeta] = useState<LoadMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const applyLoadedData = useCallback(
    (transactions: Transaction[], nextMeta: LoadMeta) => {
      setMeta(nextMeta);
      setAllTransactions(transactions);
      if (transactions.length > 0) {
        const bounds = getDateBounds(transactions);
        setFilters({
          ...EMPTY_FILTERS,
          dateFrom: bounds.min,
          dateTo: bounds.max,
        });
      }
    },
    [],
  );

  const loadStatements = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchStatements();
      const transactions = (data.transactions as SerializedTransaction[]).map(
        deserializeTransaction,
      );
      applyLoadedData(transactions, data.meta as LoadMeta);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить выписки",
      );
    } finally {
      setLoading(false);
    }
  }, [applyLoadedData]);

  useEffect(() => {
    loadStatements();
  }, [loadStatements]);

  const handleFilesUpload = useCallback(async (fileList: FileList | File[] | null) => {
    if (!fileList?.length) return;

    setUploading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const data = await uploadStatementFiles(fileList);
      const transactions = (data.transactions as SerializedTransaction[]).map(
        deserializeTransaction,
      );
      applyLoadedData(transactions, data.meta as LoadMeta);
      setStatusMessage(
        data.savedFiles?.length
          ? `Сохранено файлов: ${data.savedFiles.join(", ")}`
          : "Выписки сохранены",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить выписки",
      );
    } finally {
      setUploading(false);
    }
  }, [applyLoadedData]);

  const { isDragging } = usePageFileDrop({
    enabled: !loading && !uploading,
    accept: CSV_ACCEPT,
    multiple: true,
    onDrop: handleFilesUpload,
    onReject: (reason) => setError(reason),
  });

  const handleDeleteFile = async (fileName: string) => {
    if (!window.confirm(`Удалить ${fileName} из statements/?`)) return;

    setUploading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const data = await deleteStatementFile(fileName);
      const transactions = (data.transactions as SerializedTransaction[]).map(
        deserializeTransaction,
      );
      applyLoadedData(transactions, data.meta as LoadMeta);
      setStatusMessage(`Файл ${fileName} удалён`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось удалить файл",
      );
    } finally {
      setUploading(false);
    }
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

  const savedFileNames =
    meta?.fileNames ??
    [...new Set(meta?.files.map(fileLabel) ?? [])];

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-500 dark:text-zinc-400">
        Загрузка сохранённых выписок...
      </div>
    );
  }

  const isEmpty = allTransactions.length === 0;

  return (
    <>
      <FileDropOverlay
        visible={isDragging}
        title="Импорт выписки"
        acceptLabel="CSV-файлы Сбера"
        hint="Файлы сохранятся в statements/"
      />
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
            {isEmpty
              ? "Нет сохранённых выписок"
              : `${allTransactions.length} уникальных операций`}
            {meta && meta.duplicatesRemoved > 0 && (
              <> · дублей убрано: {meta.duplicatesRemoved}</>
            )}
          </p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Хранение: <code>statements/</code> · можно перетащить CSV в окно
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadStatements}
            disabled={uploading}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Обновить
          </button>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50">
            <input
              type="file"
              accept=".csv,.CSV"
              multiple
              disabled={uploading}
              className="hidden"
              onChange={(e) => {
                handleFilesUpload(e.target.files);
                e.target.value = "";
              }}
            />
            {uploading ? "Сохранение..." : "Импорт CSV"}
          </label>
        </div>
      </header>

      {statusMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {statusMessage}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      {savedFileNames.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Сохранённые файлы
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {savedFileNames.map((fileName) => (
              <li
                key={fileName}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950"
              >
                <span className="font-mono text-zinc-700 dark:text-zinc-300">
                  {fileName}
                </span>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => handleDeleteFile(fileName)}
                  className="text-xs text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            Импортируйте выписку Сбера
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Загрузите CSV через кнопку или перетащите файл в окно браузера — он
            сохранится в <code>statements/</code> и подгрузится при следующем
            открытии.
          </p>
          <label className="mt-6 inline-flex cursor-pointer rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
            <input
              type="file"
              accept=".csv,.CSV"
              multiple
              disabled={uploading}
              className="hidden"
              onChange={(e) => {
                handleFilesUpload(e.target.files);
                e.target.value = "";
              }}
            />
            Выбрать CSV
          </label>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
    </>
  );
}
