"use client";

import { useEffect } from "react";

interface CalculatorChartsHelpProps {
  open: boolean;
  onClose: () => void;
}

const chartLines = [
  {
    name: "Портфель (номинал)",
    color: "bg-indigo-500",
    text: "Сколько денег на счёте в рублях того момента времени. Цифра растёт и от взносов, и от доходности, но номинал не учитывает, что сами рубли со временем дешевеют.",
  },
  {
    name: "Бенчмарк инфляции (номинал)",
    color: "bg-amber-500",
    text: "Ориентир: сколько было бы в номинале, если бы капитал рос только на уровне инфляции плюс ваши пополнения. Если синяя линия выше оранжевой — портфель обгоняет инфляцию.",
  },
  {
    name: "Портфель (сегодняшние ₽)",
    color: "bg-emerald-500",
    text: "Покупательная способность портфеля в ценах сегодня. Номинальный баланс делится на накопленную инфляцию с начала расчёта. Сравнивайте со серой линией «Внесено», а не с оранжевым бенчмарком.",
  },
  {
    name: "Внесено (реальные ₽)",
    color: "bg-zinc-400",
    text: "Все пополнения, приведённые к рублям сегодня. Каждый взнос учитывается с датой, когда он был сделан. Сравнивайте с зелёной линией, чтобы увидеть реальный прирост сверх вложений.",
  },
  {
    name: "Долг (остаток)",
    color: "bg-rose-500",
    text: "Совокупный остаток по ипотеке и прочим долгам. Уменьшается по мере выплат, если указаны ежемесячные платежи и ставки.",
  },
  {
    name: "Структура портфеля (отдельный график)",
    color: "bg-indigo-400",
    text: "Появляется, если в портфеле есть кастомные активы. Слои — чистая стоимость каждого актива (стоимость минус долг) плюс брокерская ликвидная часть. Высота стека показывает, где лежит капитал и как каждый слой растёт во времени.",
  },
];

export function CalculatorChartsHelp({
  open,
  onClose,
}: CalculatorChartsHelpProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="charts-help-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="charts-help-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Линии на графике
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Краткий словарь для прогноза накоплений
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        <ul className="flex flex-col gap-4">
          {chartLines.map((line) => (
            <li key={line.name} className="flex gap-3">
              <span
                className={`mt-1.5 size-3 shrink-0 rounded-full ${line.color}`}
              />
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {line.name}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {line.text}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 space-y-4 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
          <div>
            <p className="font-medium text-zinc-800 dark:text-zinc-200">
              Как считается портфель
            </p>
            <ul className="mt-1 list-inside list-disc space-y-1 leading-relaxed">
              <li>
                Пополнения вносятся в <strong>начале</strong> месяца до старта
                вывода; после — сценарий ранней пенсии без взносов
              </li>
              <li>
                Доходность капитализируется с выбранной частотой (месяц,
                квартал, полгода, год)
              </li>
              <li>
                «Эффективная» ставка — точная; «Упрощённая» — годовая ÷ 12, как
                в банковских калькуляторах
              </li>
              <li>
                Опционально: после погашения долгов платежи по ним можно
                направлять в инвестиции
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-zinc-800 dark:text-zinc-200">
              Ежемесячный вывод
            </p>
            <ul className="mt-1 list-inside list-disc space-y-1 leading-relaxed">
              <li>
                <strong>Фикс. сумма</strong> — в ценах сегодня; номинал на руки
                растёт с инфляцией
              </li>
              <li>
                <strong>% портфеля</strong> — доля в год (в месяц =
                годовой ÷ 12); номинал зависит от размера портфеля
              </li>
              <li>
                В таблице и мини-блоках — выплата в номинале и в сегодняшних ₽
              </li>
            </ul>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
