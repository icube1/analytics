"use client";

import { useRef } from "react";
import type { JourneyStorageDocument } from "@/lib/journey-storage";
import {
  clearJourneyDocument,
  downloadJourneyExport,
  importJourneyBundle,
  resetJourney,
} from "@/lib/journey-storage";

interface JourneySettingsPanelProps {
  document: JourneyStorageDocument;
  onChange: (next: JourneyStorageDocument) => void;
  onOptOutJourney: () => void;
}

export function JourneySettingsPanel({
  document,
  onChange,
  onOptOutJourney,
}: JourneySettingsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleReset() {
    if (
      !window.confirm(
        "Сбросить прогресс пути? Ориентиры и отметки шагов будут удалены.",
      )
    ) {
      return;
    }
    onChange(resetJourney(document));
  }

  function handleClear() {
    if (
      !window.confirm(
        "Полностью удалить данные пути из браузера? Это действие необратимо.",
      )
    ) {
      return;
    }
    clearJourneyDocument();
    onOptOutJourney();
  }

  function handleImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const imported = importJourneyBundle(parsed);
        if (!imported) {
          window.alert("Не удалось импортировать файл — проверьте формат.");
          return;
        }
        onChange(imported);
      } catch {
        window.alert("Не удалось прочитать файл.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
      aria-labelledby="journey-settings-title"
    >
      <h2
        id="journey-settings-title"
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
      >
        Управление путём
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Данные хранятся только в браузере. События продукта содержат идентификаторы
        ориентиров и время — без сумм и персональных финансовых значений.
        Телеметрия по умолчанию отключена.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => downloadJourneyExport(document)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Экспорт JSON
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Импорт
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleImport(file);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={handleReset}
          className="rounded-xl border border-amber-200 px-3 py-2 text-sm text-amber-800 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950"
        >
          Сбросить прогресс
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
        >
          Выйти и удалить
        </button>
      </div>
    </section>
  );
}
