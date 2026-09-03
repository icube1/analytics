"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/stat-card";
import { JourneyMilestoneCard } from "@/components/journey/journey-milestone-card";
import { JourneyOnboardingForm } from "@/components/journey/journey-onboarding-form";
import { JourneySettingsPanel } from "@/components/journey/journey-settings-panel";
import { computeContinuity } from "@/lib/journey/continuity";
import { computeJourneyProgress } from "@/lib/journey/progress";
import type { MilestoneId } from "@/lib/journey/milestones";
import {
  acknowledgeMilestone,
  completeBabyStep,
  createDefaultJourneyDocument,
  optInMilestone,
  optInToJourney,
  optOutMilestone,
  readJourneyDocument,
  recordPlanReview,
  reorderMilestones,
  writeJourneyDocument,
  type JourneyStorageDocument,
} from "@/lib/journey-storage";
import { ZERO_CAPITAL_RESILIENCE_INPUT } from "@/lib/resilience-defaults";
import {
  createZeroCapitalResilienceDocument,
  readResilienceDocument,
  writeResilienceDocument,
} from "@/lib/resilience-storage";
import { evaluateResiliencePlan } from "@/lib/resilience-plan";
import type { ResilienceInput } from "@/lib/resilience-plan";
import { formatMonths } from "@/lib/resilience-format";

export function JourneyDashboard() {
  const [journey, setJourney] = useState<JourneyStorageDocument>(
    () => readJourneyDocument() ?? createDefaultJourneyDocument(),
  );
  const [baseline, setBaseline] = useState<ResilienceInput | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = readJourneyDocument();
      if (stored) setJourney(stored);
      setBaseline(readResilienceDocument()?.input ?? null);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeJourneyDocument(journey);
  }, [hydrated, journey]);

  const resilienceInput = baseline ?? ZERO_CAPITAL_RESILIENCE_INPUT;
  const needsOnboarding = hydrated && baseline === null;

  const plan = useMemo(
    () => evaluateResiliencePlan(resilienceInput),
    [resilienceInput],
  );

  const progress = useMemo(
    () =>
      computeJourneyProgress(resilienceInput, plan, {
        milestoneOrder: journey.milestoneOrder,
        optedOutMilestones: journey.optedOutMilestones,
        completedBabySteps: journey.completedBabySteps,
        acknowledgedMilestones: journey.acknowledgedMilestones,
        lastReviewAt: journey.lastReviewAt,
      }),
    [resilienceInput, plan, journey],
  );

  const continuity = useMemo(
    () => computeContinuity(journey.engagements),
    [journey.engagements],
  );

  const updateJourney = useCallback((next: JourneyStorageDocument) => {
    setJourney(next);
  }, []);

  const moveMilestone = useCallback(
    (id: MilestoneId, direction: -1 | 1) => {
      const order = [...journey.milestoneOrder];
      const index = order.indexOf(id);
      if (index < 0) return;
      const target = index + direction;
      if (target < 0 || target >= order.length) return;
      [order[index], order[target]] = [order[target], order[index]];
      updateJourney(reorderMilestones(journey, order));
    },
    [journey, updateJourney],
  );

  if (!journey.optedIn) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            Путь к финансовой независимости
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            Спокойный старт без гонки
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            Пошаговые ориентиры на базе карты устойчивости: резервы, поток,
            долг и целевые фонды. Без лидербордов, обещаний доходности и
            ежедневных streak. Прогресс не сгорает — можно вернуться в любой
            момент.
          </p>
        </header>
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
          <li>Можно начать с нулевых резервов — брокерский счёт не нужен</li>
          <li>Версионированные ориентиры с ветвлением под ваш профиль</li>
          <li>Мгновенная обратная связь из расчёта устойчивости</li>
          <li>Локальное хранение; события — только id ориентиров и время</li>
          <li>Экспорт, сброс и отказ в один клик</li>
        </ul>
        <button
          type="button"
          onClick={() => updateJourney(optInToJourney(journey))}
          className="w-fit rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          Начать путь
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
          Путь · baby steps
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Финансовая независимость: ваш темп
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          Ориентиры строятся на{" "}
          <a
            href="/resilience"
            className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300"
          >
            карте устойчивости
          </a>
          . Обновите базовые данные там — здесь появится количественная
          обратная связь. Это не инвестиционный совет и не гарантия результата.
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400" aria-live="polite">
          {continuity.message}
        </p>
      </header>

      {needsOnboarding ? (
        <JourneyOnboardingForm
          onSave={(input) => {
            const document = {
              ...createZeroCapitalResilienceDocument(),
              input,
            };
            writeResilienceDocument(document);
            setBaseline(input);
          }}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ориентиры"
          value={`${progress.completedCount} / ${progress.milestones.length}`}
          hint="Достигнутые этапы пути"
        />
        <StatCard
          label="Покрытие расходов"
          value={formatMonths(progress.monthsCovered)}
          hint="Месяцев обязательных трат в ликвидности"
        />
        <StatCard
          label="Стресс-сценарии"
          value={`${progress.stressSurvivableCount}/${progress.stressTotalCount}`}
          hint="Сценарии без нехватки ликвидности"
        />
        <StatCard
          label="Активность"
          value={`${continuity.engagedWeeksInWindow} нед.`}
          hint={`За последние ${continuity.windowWeeks} недель`}
        />
      </div>

      <section
        className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        aria-labelledby="stress-coverage-title"
      >
        <h2
          id="stress-coverage-title"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Покрытие стресс-сценариев
        </h2>
        <ul className="mt-3 space-y-2">
          {plan.stress.map((scenario) => (
            <li
              key={scenario.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span className="font-medium text-zinc-800 dark:text-zinc-100">
                {scenario.label}
              </span>
              <span
                className={
                  scenario.survivable
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-300"
                }
              >
                {scenario.survivable ? "Покрыт" : "Есть разрыв"}
              </span>
              <p className="w-full text-xs text-zinc-500 dark:text-zinc-400">
                {scenario.summary}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <a
          href="/resilience"
          className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900"
        >
          Открыть карту устойчивости
        </a>
        <button
          type="button"
          onClick={() => updateJourney(recordPlanReview(journey))}
          className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Зафиксировать обзор план/факт
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {progress.milestones.map((milestone) => (
          <JourneyMilestoneCard
            key={milestone.id}
            progress={milestone}
            canReorder={milestone.status !== "locked"}
            onCompleteStep={(milestoneId, babyStepId) =>
              updateJourney(completeBabyStep(journey, milestoneId, babyStepId))
            }
            onAcknowledge={(milestoneId) =>
              updateJourney(acknowledgeMilestone(journey, milestoneId))
            }
            onOptOut={(milestoneId) =>
              updateJourney(optOutMilestone(journey, milestoneId))
            }
            onOptIn={(milestoneId) =>
              updateJourney(optInMilestone(journey, milestoneId))
            }
            onMoveUp={(id) => moveMilestone(id, -1)}
            onMoveDown={(id) => moveMilestone(id, 1)}
          />
        ))}
      </div>

      <JourneySettingsPanel
        document={journey}
        onChange={updateJourney}
        onOptOutJourney={() =>
          setJourney(createDefaultJourneyDocument())
        }
      />
    </main>
  );
}
