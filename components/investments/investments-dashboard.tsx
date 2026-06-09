"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssetsTab } from "@/components/investments/assets-tab";
import { CalculatorTab } from "@/components/investments/calculator-tab";
import { PortfolioTab } from "@/components/investments/portfolio-tab";
import { SummaryTab } from "@/components/investments/summary-tab";
import { WealthSummary } from "@/components/investments/wealth-summary";
import {
  computePortfolioAnalytics,
  getCalculatorDefaultsFromPortfolio,
} from "@/lib/portfolio-analytics";
import { isEmptyDocument } from "@/lib/merge-portfolio-storage";
import {
  clearLegacyLocalStorage,
  fetchPortfolioDocument,
  readLegacyLocalStorage,
  savePortfolioDocument,
  uploadBrokerReport,
} from "@/lib/portfolio-storage";
import { getTotalWealth } from "@/lib/portfolio-wealth";
import {
  DEFAULT_COMPOUND_PARAMS,
  type BrokerReport,
  type CompoundParams,
  type CustomAssets,
} from "@/lib/portfolio-types";

type TabId = "summary" | "portfolio" | "assets" | "calculator";
type SaveState = "idle" | "saving" | "saved" | "error";

const tabs: { id: TabId; label: string }[] = [
  { id: "summary", label: "Сводка" },
  { id: "portfolio", label: "Портфель Сбера" },
  { id: "assets", label: "Другие активы" },
  { id: "calculator", label: "Сложный процент" },
];

export function InvestmentsDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [report, setReport] = useState<BrokerReport | null>(null);
  const [fileName, setFileName] = useState("portfolio.html");
  const [customAssets, setCustomAssets] = useState<CustomAssets | null>(null);
  const [compoundParams, setCompoundParams] = useState<CompoundParams | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const readyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bootstrapBrokerFromPublic = useCallback(async () => {
    const res = await fetch("/portfolio.html");
    if (!res.ok) return false;
    const html = await res.text();
    const uploadRes = await fetch("/api/portfolio/broker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, fileName: "portfolio.html" }),
    });
    if (!uploadRes.ok) return false;
    const data = await uploadRes.json();
    setReport(data.report as BrokerReport);
    setFileName(data.fileName as string);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        let doc = await fetchPortfolioDocument();

        if (isEmptyDocument(doc)) {
          const legacy = readLegacyLocalStorage();
          if (legacy) {
            doc = await savePortfolioDocument(legacy);
            clearLegacyLocalStorage();
          }
        }

        if (!doc.brokerReport) {
          await bootstrapBrokerFromPublic();
          doc = await fetchPortfolioDocument();
        }

        if (cancelled) return;

        setCustomAssets(doc.customAssets);

        const bootAnalytics = computePortfolioAnalytics(
          doc.brokerReport,
          doc.customAssets,
          doc.compoundParams.inflationPercent,
        );
        const savedMonthly = doc.compoundParams.monthlyContribution;
        setCompoundParams({
          ...doc.compoundParams,
          ...getCalculatorDefaultsFromPortfolio(
            bootAnalytics,
            doc.customAssets,
            doc.brokerReport,
            doc.compoundParams.inflationPercent,
          ),
          monthlyContribution:
            savedMonthly === 20_000
              ? DEFAULT_COMPOUND_PARAMS.monthlyContribution
              : savedMonthly,
        });
        setFileName(doc.lastBrokerFileName);
        setReport(doc.brokerReport);
        setLastSavedAt(doc.updatedAt);
        readyRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Не удалось загрузить данные",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [bootstrapBrokerFromPublic]);

  const persist = useCallback(
    (patch: {
      customAssets?: CustomAssets;
      compoundParams?: CompoundParams;
    }) => {
      if (!readyRef.current) return;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        setSaveState("saving");
        try {
          const doc = await savePortfolioDocument(patch);
          setLastSavedAt(doc.updatedAt);
          setSaveState("saved");
        } catch (err) {
          setSaveState("error");
          setError(
            err instanceof Error ? err.message : "Ошибка сохранения в файл",
          );
        }
      }, 600);
    },
    [],
  );

  const handleAssetsChange = useCallback(
    (assets: CustomAssets) => {
      setCustomAssets(assets);
      persist({ customAssets: assets });
    },
    [persist],
  );

  const handleParamsChange = useCallback(
    (params: CompoundParams) => {
      setCompoundParams(params);
      persist({ compoundParams: params });
    },
    [persist],
  );

  const handleUpload = async (file: File) => {
    setSaveState("saving");
    try {
      const data = await uploadBrokerReport(file);
      setReport(data.report);
      setFileName(data.fileName);
      const doc = await fetchPortfolioDocument();
      setLastSavedAt(doc.updatedAt);
      setSaveState("saved");
      setError(null);
    } catch (err) {
      setSaveState("error");
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить отчёт",
      );
    }
  };

  const wealth = useMemo(() => {
    if (!customAssets) return null;
    return getTotalWealth(report, customAssets);
  }, [report, customAssets]);

  const analytics = useMemo(() => {
    if (!customAssets) return null;
    return computePortfolioAnalytics(
      report,
      customAssets,
      compoundParams?.inflationPercent,
    );
  }, [report, customAssets, compoundParams?.inflationPercent]);

  const handleTabChange = useCallback(
    (tab: TabId) => {
      if (tab === "calculator" && analytics && compoundParams && customAssets) {
        setCompoundParams({
          ...compoundParams,
          ...getCalculatorDefaultsFromPortfolio(
            analytics,
            customAssets,
            report,
            compoundParams.inflationPercent,
          ),
        });
      }
      setActiveTab(tab);
    },
    [analytics, compoundParams, customAssets, report],
  );

  if (loading || !customAssets || !compoundParams || !wealth || !analytics) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500 dark:text-zinc-400">
        Загрузка данных из data/portfolio.json...
      </div>
    );
  }

  const saveLabel =
    saveState === "saving"
      ? "Сохранение..."
      : saveState === "error"
        ? "Ошибка сохранения"
        : lastSavedAt
          ? `Сохранено: ${new Date(lastSavedAt).toLocaleString("ru-RU")}`
          : "Готово";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            Инвестиции
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Капитал и прогноз
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Файл: <code>data/portfolio.json</code>
            {report && (
              <>
                {" "}
                · отчёт: <code>data/broker-report.html</code>
              </>
            )}
          </p>
        </div>
        <p
          className={`text-xs ${
            saveState === "error"
              ? "text-rose-600 dark:text-rose-400"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {saveLabel}
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </div>
      )}

      <WealthSummary wealth={wealth} />

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-1 dark:border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-indigo-600 text-white"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "summary" && (
        <SummaryTab analytics={analytics} report={report} />
      )}
      {activeTab === "portfolio" && (
        <PortfolioTab
          report={report}
          fileName={fileName}
          onUpload={handleUpload}
        />
      )}
      {activeTab === "assets" && (
        <AssetsTab
          assets={customAssets}
          report={report}
          onChange={handleAssetsChange}
        />
      )}
      {activeTab === "calculator" && (
        <CalculatorTab
          params={compoundParams}
          customAssets={customAssets}
          brokerTotal={wealth.brokerTotal}
          onChange={handleParamsChange}
        />
      )}
    </div>
  );
}
