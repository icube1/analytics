"use client";

import { useCallback, useState } from "react";
import {
  CLOUD_SYNC_PRIVACY_COPY,
  isCloudSyncEnabledByUser,
  isWebSessionSyncFeatureEnabled,
  setCloudSyncEnabledByUser,
} from "@/lib/session-sync";
import { useSessionSync } from "./session-sync-provider";

export function CloudSyncPanel() {
  const featureOn = isWebSessionSyncFeatureEnabled();
  const { isAuthenticated } = useSessionSync();
  const [enabled, setEnabled] = useState(() => isCloudSyncEnabledByUser());

  const toggle = useCallback(() => {
    const next = !enabled;
    setCloudSyncEnabledByUser(next);
    setEnabled(next);
  }, [enabled]);

  if (!featureOn) return null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
            Облачная синхронизация (эксперимент)
          </h3>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">
            {CLOUD_SYNC_PRIVACY_COPY}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-600"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        {enabled
          ? isAuthenticated
            ? "Синхронизация активна для текущей сессии."
            : "Включено — войдите, чтобы начать синхронизацию."
          : "По умолчанию используется локальный бэкап через Next.js."}
      </p>
    </section>
  );
}
