"use client";

import { useState, type FormEvent } from "react";
import {
  isBrokerConnectorEnabled,
  redactSecrets,
  syncBrokerConnector,
  type BrokerConnectorSyncResult,
} from "@/lib/broker-connectors";
import { formatMoney } from "@/lib/portfolio-wealth";

interface TbankConnectorPanelProps {
  onSynced: (result: BrokerConnectorSyncResult) => Promise<void>;
}

export function TbankConnectorPanel({ onSynced }: TbankConnectorPanelProps) {
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BrokerConnectorSyncResult | null>(
    null,
  );

  if (!isBrokerConnectorEnabled("tbank-invest-api-v1")) {
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const runtimeToken = token.trim();
    if (!runtimeToken) {
      setMessage("Вставьте read-only токен Т‑Инвест API. Он не сохраняется.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await syncBrokerConnector({
        connectorId: "tbank-invest-api-v1",
        credentials: { token: runtimeToken },
        accountId: accountId.trim() || undefined,
        environment: sandbox ? "sandbox" : "production",
      });
      setToken("");
      setLastResult(result);
      if (!result.ok || !result.report) {
        const raw =
          result.errors[0]?.message ?? "Синхронизация Т‑Банка не удалась";
        setMessage(redactSecrets(raw, runtimeToken));
        return;
      }
      await onSynced(result);
      setMessage("Снимок портфеля обновлён. Токен в хранилище не записывался.");
    } catch (error) {
      const raw =
        error instanceof Error ? error.message : "Синхронизация Т‑Банка не удалась";
      setMessage(redactSecrets(raw, runtimeToken));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30"
      aria-labelledby="tbank-connector-title"
    >
      <h3
        id="tbank-connector-title"
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
      >
        Т‑Банк Invest API (эксперимент)
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
        Только чтение. Токен живёт в этом запросе и сразу очищается — его нет в
        бэкапе, sync и provenance. По умолчанию sandbox.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Токен Т‑Инвест API
          </span>
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Счёт (необязательно)
          </span>
          <input
            type="text"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input
            type="checkbox"
            checked={sandbox}
            onChange={(event) => setSandbox(event.target.checked)}
          />
          Sandbox
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 sm:col-span-2"
        >
          {busy ? "Запрос…" : "Синхронизировать счёт"}
        </button>
      </form>
      {message ? (
        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300" aria-live="polite">
          {message}
        </p>
      ) : null}
      {lastResult?.reconciliation ? (
        <p className="mt-2 text-xs tabular-nums text-zinc-500">
          Сверка:{" "}
          {lastResult.reconciliation.withinTolerance
            ? "в пределах допуска"
            : "есть расхождение"}
          {lastResult.reconciliation.assetsEndComputed != null
            ? ` · активы ${formatMoney(lastResult.reconciliation.assetsEndComputed)}`
            : ""}
        </p>
      ) : null}
    </section>
  );
}
