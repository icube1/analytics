"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  downloadAnalyticsBackup,
  exportAnalyticsBackup,
  importAnalyticsBackup,
  parseBackupFile,
  readLastBackupAt,
  markBackupCompleted,
} from "@/lib/backup";
import { syncBackupToServer } from "@/lib/backup-sync";

type BackupStatus = "idle" | "working" | "success" | "error";

export function DataBackupMenu() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<BackupStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLastBackupAt(readLastBackupAt());
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const handleExport = useCallback(async () => {
    setStatus("working");
    setMessage(null);
    try {
      const backup = await exportAnalyticsBackup();
      downloadAnalyticsBackup(backup);
      markBackupCompleted(backup.exportedAt);
      setLastBackupAt(backup.exportedAt);
      void syncBackupToServer();
      setStatus("success");
      setMessage("Файл бэкапа скачан");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать бэкап",
      );
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    const confirmed = window.confirm(
      "Восстановить данные из бэкапа? Текущие данные в браузере будут заменены.",
    );
    if (!confirmed) return;

    setStatus("working");
    setMessage(null);
    try {
      const backup = await parseBackupFile(file);
      await importAnalyticsBackup(backup);
      markBackupCompleted(backup.exportedAt);
      await syncBackupToServer();
      window.location.reload();
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Не удалось восстановить бэкап",
      );
    }
  }, []);

  const lastBackupLabel = lastBackupAt
    ? new Date(lastBackupAt).toLocaleString("ru-RU")
    : "ещё не делали";

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Бэкап
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Резервная копия
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Сохраняет инвестиции, сценарии, трекинг и выписки в один JSON-файл.
            При локальном запуске копия также пишется в{" "}
            <span className="font-mono">data/backups/</span>.
          </p>

          <p className="mt-3 text-[11px] text-zinc-400">
            Последний бэкап: {lastBackupLabel}
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={status === "working"}
              onClick={() => void handleExport()}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              Скачать бэкап
            </button>
            <button
              type="button"
              disabled={status === "working"}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Восстановить из файла
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleImport(file);
              }}
            />
          </div>

          {message && (
            <p
              className={`mt-3 text-xs ${
                status === "error"
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
