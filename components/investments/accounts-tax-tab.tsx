"use client";

import { useEffect, useMemo, useState } from "react";
import {
  summarizePortfolio,
  type AccountSummary,
  type PortfolioSummaryTotals,
} from "@/lib/account-summary";
import { ndflBroker, netBrokerResult } from "@/lib/tax";
import { iisScenario } from "@/lib/personal-tax";
import type { BrokerAccountSource, PortfolioDocument } from "@/lib/portfolio-types";

const KIND_LABEL: Record<string, string> = {
  broker: "Брокерский",
  iis1: "ИИС-1",
  iis2: "ИИС-2",
  iis3: "ИИС-3",
};

const KIND_STYLE: Record<string, string> = {
  broker: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  iis1: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  iis2: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  iis3: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
};

interface PortfolioListItem {
  id: string;
  title?: string;
  groupId?: string;
  updatedAt: string;
  accounts: number;
}

function money(value: number, digits = 2): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function percent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function isIis(summary: AccountSummary): boolean {
  return summary.kind !== "broker";
}

function Card({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "up" | "down" | "neutral";
}) {
  const color =
    accent === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
      {hint && (
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>
      )}
    </div>
  );
}

export function AccountsTaxTab() {
  const [portfolios, setPortfolios] = useState<PortfolioListItem[]>([]);
  const [summaryDoc, setSummaryDoc] = useState<PortfolioDocument | null>(null);
  const [annualIncome, setAnnualIncome] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [listRes, summaryRes] = await Promise.all([
          fetch("/api/portfolio/list", { cache: "no-store" }),
          fetch("/api/portfolio/summary", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (!listRes.ok || !summaryRes.ok) {
          throw new Error(`HTTP ${listRes.status}/${summaryRes.status}`);
        }
        const listPayload = (await listRes.json()) as {
          portfolios: PortfolioListItem[];
        };
        const summaryPayload = (await summaryRes.json()) as {
          summary: PortfolioDocument;
        };
        if (cancelled) return;
        setPortfolios(listPayload.portfolios ?? []);
        setSummaryDoc(summaryPayload.summary ?? null);
        setAnnualIncome(
          summaryPayload.summary?.taxProfile?.annualIncome ?? 0,
        );
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "Не удалось загрузить счета",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const accounts: BrokerAccountSource[] = useMemo(
    () => summaryDoc?.brokerAccounts ?? [],
    [summaryDoc],
  );

  const totals: PortfolioSummaryTotals | null = useMemo(
    () => (accounts.length ? summarizePortfolio(accounts) : null),
    [accounts],
  );

  const tax = useMemo(() => {
    if (!totals) return null;
    const broker = totals.accounts.filter((account) => !isIis(account));
    const iis = totals.accounts.filter(isIis);

    const brokerRealized = netBrokerResult(broker.map((account) => account.realized));
    const iisRealized = iis.reduce((sum, account) => sum + account.realized, 0);
    const ndfl = ndflBroker(brokerRealized);

    const deposits = iis.reduce((sum, account) => sum + account.invested, 0);
    const scenario = iisScenario({ annualIncome, deposits });

    const lossCarry = broker
      .map((account) => account.realized)
      .filter((value) => value < 0)
      .reduce((sum, value) => sum + Math.abs(value), 0);

    return { brokerRealized, iisRealized, ndfl, deposits, scenario, lossCarry };
  }, [totals, annualIncome]);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Считаю счета и налоги…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        {error}
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="ml-3 underline"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!accounts.length) {
    return (
      <div className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Пока нет загруженных отчётов. Загрузи HTML-отчёт Сбера на вкладке
        «Портфель Сбера» — каждый счёт станет отдельной строкой здесь.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Стоимость"
          value={`${money(totals?.marketValue ?? 0)} ₽`}
          hint={`${totals?.accounts.length ?? 0} счёта(ов) в ${portfolios.length} портфеле(ях)`}
        />
        <Card label="Вложено" value={`${money(totals?.invested ?? 0)} ₽`} />
        <Card
          label="P&L"
          value={`${money(totals?.pnl ?? 0)} ₽`}
          accent={(totals?.pnl ?? 0) >= 0 ? "up" : "down"}
          hint={
            (totals?.pnlUnknownAccounts ?? 0) > 0
              ? `без ${totals?.pnlUnknownAccounts} счёта(ов) с неизвестными пополнениями`
              : `Реализовано ${money(totals?.realized ?? 0)} ₽`
          }
        />
        <Card
          label="XIRR"
          value={percent(totals?.xirr ?? null)}
          accent={(totals?.xirr ?? 0) >= 0 ? "up" : "down"}
          hint={
            totals?.xirrReliable
              ? "деньги-взвешенная доходность"
              : "оценка: короткая история — цифра нестабильна"
          }
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">Счёт</th>
              <th className="px-4 py-2">Тип</th>
              <th className="px-4 py-2 text-right">Стоимость</th>
              <th className="px-4 py-2 text-right">Вложено</th>
              <th className="px-4 py-2 text-right">P&L</th>
              <th className="px-4 py-2 text-right">XIRR</th>
              <th className="px-4 py-2 text-right">Доля</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {totals?.accounts.map((account) => {
              const share = totals.allocationByAccount.find(
                (item) => item.id === account.id,
              );
              return (
                <tr key={account.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {account.label || account.contract || account.id}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {account.contract || "—"}
                      {account.investedKnown
                        ? account.depositsFromReport
                          ? " · пополнения из отчёта"
                          : " · пополнения из ДДС"
                        : " · пополнения неизвестны"}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        KIND_STYLE[account.kind] ?? KIND_STYLE.broker
                      }`}
                    >
                      {KIND_LABEL[account.kind] ?? account.kind}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{money(account.marketValue)} ₽</td>
                  <td className="px-4 py-2 text-right">{money(account.invested)} ₽</td>
                  <td
                    className={`px-4 py-2 text-right ${
                      account.pnl >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {account.investedKnown ? `${money(account.pnl)} ₽` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {percent(account.xirr)}
                    {account.xirr !== null && !account.xirrReliable && (
                      <span title="Короткая история — оценка нестабильна"> *</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {percent(share?.share ?? null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tax && (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Налоги (оценка, не декларация)
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              label="Реализовано по брокерским"
              value={`${money(tax.brokerRealized)} ₽`}
              accent={tax.brokerRealized >= 0 ? "up" : "down"}
              hint="счета одного брокера сальдируются"
            />
            <Card
              label="НДФЛ с брокерских"
              value={`${money(tax.ndfl.total, 0)} ₽`}
              hint="13% до 2,4 млн ₽, дальше 15%"
            />
            <Card
              label="Убыток к переносу"
              value={`${money(tax.lossCarry)} ₽`}
              hint="10 лет, только через 3-НДФЛ"
            />
            <Card
              label="Реализовано по ИИС"
              value={`${money(tax.iisRealized)} ₽`}
              hint="не сальдируется с брокерским"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-zinc-600 dark:text-zinc-300">
              Годовой доход (зарплата и прочее), ₽
              <input
                type="number"
                min={0}
                step={10_000}
                value={annualIncome || ""}
                placeholder="например 1 200 000"
                onChange={(event) => {
                  const value = Number(event.target.value) || 0;
                  setAnnualIncome(value);
                  void fetch("/api/portfolio", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      taxProfile: { annualIncome: value },
                    }),
                  });
                }}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                Ставка считается сама по шкале 13 / 15 / 18 / 20 / 22%.
                Сейчас: <strong>{Math.round(tax.scenario.rate * 100)}%</strong>,
                НДФЛ за год ≈ <strong>{money(tax.scenario.ndflTotal, 0)} ₽</strong>.
              </span>
            </label>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Взносы на ИИС: <strong>{money(tax.deposits, 0)} ₽</strong>
              <br />
              Вычет за год: <strong>{money(tax.scenario.refund, 0)} ₽</strong>
              {tax.scenario.limitReason === "paid-tax" && " — ограничен уплаченным НДФЛ"}
              {tax.scenario.limitReason === "limit" && " — упёрлись в лимит 400 000 ₽ взносов"}
              <br />
              <span className="text-xs opacity-80">
                Вычет — возврат уже уплаченного НДФЛ, а не доход. В «Ожид. доход/год»
                он не входит.
              </span>
            </div>
          </div>

          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Налоговый агент считает базу по каждому брокеру отдельно; если суммарный
            доход по ценным бумагам превысил 2,4 млн ₽ за год, разницу доначислит ФНС.
            Убыток ИИС не уменьшает прибыль брокерского счёта.
          </p>
        </div>
      )}
    </div>
  );
}
