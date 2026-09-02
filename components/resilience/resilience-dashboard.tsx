"use client";

import { useEffect, useState } from "react";
import { ResilienceInputsPanel } from "@/components/resilience/resilience-inputs-panel";
import { ResilienceResultsPanel } from "@/components/resilience/resilience-results-panel";
import {
  createDefaultResilienceDocument,
  readResilienceDocument,
  writeResilienceDocument,
} from "@/lib/resilience-storage";
import type { ResilienceInput } from "@/lib/resilience-plan";
import { useResiliencePlan } from "@/lib/finance-worker/use-resilience-plan";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export function ResilienceDashboard() {
  const [input, setInput] = useState<ResilienceInput>(
    () => createDefaultResilienceDocument().input,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = readResilienceDocument();
      if (stored) {
        setInput(stored.input);
      }
      setHydrated(true);
    });
  }, []);

  const { debounced: debouncedInput, isPending } = useDebouncedValue(input, 300);

  useEffect(() => {
    if (!hydrated) return;
    writeResilienceDocument({
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      input,
    });
  }, [hydrated, input]);

  const { result, isLoading, error, isStale } = useResiliencePlan({
    input: debouncedInput,
    enabled: hydrated,
    preferWasm: true,
    useWorker: true,
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
          Baby steps · финансовая устойчивость
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Карта резервов и сценариев
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          Пошаговая оценка ликвидности: от операционного буфера до целевых
          накоплений. Прогресс описывает ориентиры, а не «долг» перед системой.
          Суммы не отправляются в аналитику — только локальное хранение в
          браузере.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <ResilienceInputsPanel input={input} onChange={setInput} />
        </div>
        <ResilienceResultsPanel
          plan={result?.plan ?? null}
          engine={result?.engine ?? null}
          parityVerified={result?.parityVerified ?? null}
          isLoading={isLoading || isPending}
          isStale={isStale}
          error={error}
        />
      </div>
    </main>
  );
}
