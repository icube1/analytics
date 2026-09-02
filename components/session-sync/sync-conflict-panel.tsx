"use client";

import { useSessionSync } from "./session-sync-provider";

export function SyncConflictPanel() {
  const { conflict, dismissConflict } = useSessionSync();
  if (!conflict) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Конфликт синхронизации портфеля</p>
          <p>
            Локальная ревизия {conflict.localRevision}, на сервере{" "}
            {conflict.remoteRevision}. {conflict.message}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-amber-300 px-3 py-1.5 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/50"
            onClick={dismissConflict}
          >
            Оставить локальную копию
          </button>
          <button
            type="button"
            className="rounded-lg bg-amber-700 px-3 py-1.5 text-white hover:bg-amber-600"
            onClick={() => window.location.reload()}
          >
            Перезагрузить с сервера
          </button>
        </div>
      </div>
    </div>
  );
}
