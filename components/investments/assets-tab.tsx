"use client";

import { useEffect, useState } from "react";
import { createCustomAsset, getAssetNetValue } from "@/lib/custom-assets";
import { amortizeDebtMonth, estimatePayoffMonths, getMonthlyDebtService } from "@/lib/debt-amortization";
import { currentPaymentPeriodDays } from "@/lib/debt-daycount";
import { formatMoney, getTotalWealth } from "@/lib/portfolio-wealth";
import type {
  AssetIncomePeriod,
  AssetReturnMode,
  BrokerReport,
  CustomAssetItem,
  CustomAssets,
  DebtObligation,
} from "@/lib/portfolio-types";

interface AssetsTabProps {
  assets: CustomAssets;
  report: BrokerReport | null;
  onChange: (assets: CustomAssets) => void;
}

const HIGHLIGHT_MS = 2200;

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

function cardClass(highlighted: boolean): string {
  const base =
    "rounded-2xl border bg-white p-5 transition-[box-shadow,background-color,border-color] duration-700 dark:bg-zinc-900";
  if (highlighted) {
    return `${base} border-indigo-300 bg-indigo-50/80 shadow-[0_0_0_3px_rgba(99,102,241,0.35)] dark:border-indigo-700 dark:bg-indigo-950/40 dark:shadow-[0_0_0_3px_rgba(99,102,241,0.25)]`;
  }
  return `${base} border-zinc-200 dark:border-zinc-800`;
}

function debtCardClass(highlighted: boolean): string {
  const base =
    "rounded-xl border p-4 transition-[box-shadow,background-color,border-color] duration-700";
  if (highlighted) {
    return `${base} border-indigo-300 bg-indigo-50/80 shadow-[0_0_0_3px_rgba(99,102,241,0.35)] dark:border-indigo-700 dark:bg-indigo-950/40 dark:shadow-[0_0_0_3px_rgba(99,102,241,0.25)]`;
  }
  return `${base} border-zinc-200 dark:border-zinc-700`;
}

function formatPayoff(months: number | null): string {
  if (months === null) return "не погасится при текущем платеже";
  if (months === 0) return "погашено";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} мес.`;
  if (rest === 0) return `${years} г.`;
  return `${years} г. ${rest} мес.`;
}

function newDebt(): DebtObligation {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    label: "Кредит",
    balance: 0,
    monthlyPayment: 0,
    annualInterestRate: 0,
    paymentDay: 6,
  };
}

function AssetCard({
  item,
  netValue,
  highlighted,
  onUpdate,
  onRemove,
}: {
  item: CustomAssetItem;
  netValue: number;
  highlighted: boolean;
  onUpdate: (patch: Partial<CustomAssetItem>) => void;
  onRemove: () => void;
}) {
  const paymentDay = item.debtPaymentDay ?? 6;
  const periodDays = currentPaymentPeriodDays(paymentDay);
  const debtPayoff =
    item.debt > 0
      ? estimatePayoffMonths(
          item.debt,
          item.monthlyDebtPayment,
          item.debtAnnualRate,
          paymentDay,
        )
      : null;
  const debtPaymentSplit =
    item.debt > 0 && item.monthlyDebtPayment > 0
      ? amortizeDebtMonth(item.debt, item.monthlyDebtPayment, item.debtAnnualRate, {
          periodDays,
        })
      : null;

  return (
    <section id={`asset-${item.id}`} className={cardClass(highlighted)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
            className="size-4 rounded text-indigo-600"
          />
          <input
            type="text"
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm font-semibold dark:border-zinc-700 dark:bg-zinc-950"
            value={item.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
          />
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium tabular-nums text-indigo-600 dark:text-indigo-400">
            {formatMoney(netValue)}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-rose-600 hover:underline dark:text-rose-400"
          >
            Удалить
          </button>
        </div>
      </div>

      {item.enabled && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Стоимость, ₽</span>
              <input
                type="number"
                className={inputClass}
                value={item.value || ""}
                onChange={(e) =>
                  onUpdate({ value: Number.parseFloat(e.target.value) || 0 })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Привязанный долг, ₽</span>
              <input
                type="number"
                className={inputClass}
                value={item.debt || ""}
                onChange={(e) =>
                  onUpdate({ debt: Number.parseFloat(e.target.value) || 0 })
                }
                placeholder="Ипотека, залог..."
              />
            </label>
          </div>

          {item.debt > 0 && (
            <div className="grid gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-950/50">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Платёж в месяц, ₽</span>
                <input
                  type="number"
                  className={inputClass}
                  value={item.monthlyDebtPayment || ""}
                  onChange={(e) =>
                    onUpdate({
                      monthlyDebtPayment: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Ставка по долгу, % годовых</span>
                <input
                  type="number"
                  step={0.1}
                  className={inputClass}
                  value={item.debtAnnualRate || ""}
                  onChange={(e) =>
                    onUpdate({
                      debtAnnualRate: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">День платежа</span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  className={inputClass}
                  value={item.debtPaymentDay ?? 6}
                  onChange={(e) =>
                    onUpdate({
                      debtPaymentDay: Math.min(
                        28,
                        Math.max(1, Number.parseInt(e.target.value, 10) || 6),
                      ),
                    })
                  }
                />
              </label>
              <p className="text-xs text-zinc-500 sm:col-span-2">
                Погашение при текущем платеже:{" "}
                <strong>{formatPayoff(debtPayoff)}</strong>
                {debtPaymentSplit && (
                  <>
                    {" "}
                    · из платежа ({periodDays} дн.): тело{" "}
                    <strong>{formatMoney(debtPaymentSplit.principal)}</strong>, проценты{" "}
                    <strong>{formatMoney(debtPaymentSplit.interest)}</strong>
                  </>
                )}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={item.growsWithInflation}
                onChange={(e) => onUpdate({ growsWithInflation: e.target.checked })}
                className="size-4 rounded text-indigo-600"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Стоимость растёт вместе с инфляцией
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">Доходность актива</span>
              <select
                className={inputClass}
                value={item.returnMode}
                onChange={(e) =>
                  onUpdate({ returnMode: e.target.value as AssetReturnMode })
                }
              >
                <option value="none">Без дохода (только рост стоимости)</option>
                <option value="percent">Процент годовых</option>
                <option value="income">Денежный доход (аренда и т.п.)</option>
              </select>
            </label>

            {item.returnMode === "percent" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Доходность, % годовых</span>
                <input
                  type="number"
                  step={0.1}
                  className={inputClass}
                  value={item.annualReturnPercent || ""}
                  onChange={(e) =>
                    onUpdate({
                      annualReturnPercent: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </label>
            )}

            {item.returnMode === "income" && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">Сумма дохода, ₽</span>
                  <input
                    type="number"
                    className={inputClass}
                    value={item.incomeAmount || ""}
                    onChange={(e) =>
                      onUpdate({
                        incomeAmount: Number.parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="Напр. аренда"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">Период</span>
                  <select
                    className={inputClass}
                    value={item.incomePeriod}
                    onChange={(e) =>
                      onUpdate({
                        incomePeriod: e.target.value as AssetIncomePeriod,
                      })
                    }
                  >
                    <option value="monthly">В месяц</option>
                    <option value="yearly">В год</option>
                  </select>
                </label>
              </>
            )}

            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={item.generatesDividendTax}
                onChange={(e) =>
                  onUpdate({ generatesDividendTax: e.target.checked })
                }
                className="size-4 rounded text-indigo-600"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Облагается налогом на дивиденды (ПИФы, акции вне брокера)
              </span>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-zinc-500">Заметки</span>
              <input
                type="text"
                className={inputClass}
                value={item.notes}
                onChange={(e) => onUpdate({ notes: e.target.value })}
                placeholder="Адрес, детали..."
              />
            </label>
          </div>
        </div>
      )}
    </section>
  );
}

function DebtCard({
  debt,
  highlighted,
  onUpdate,
  onRemove,
}: {
  debt: DebtObligation;
  highlighted: boolean;
  onUpdate: (patch: Partial<DebtObligation>) => void;
  onRemove: () => void;
}) {
  const paymentDay = debt.paymentDay ?? 6;
  const periodDays = currentPaymentPeriodDays(paymentDay);
  const payoff = estimatePayoffMonths(
    debt.balance,
    debt.monthlyPayment,
    debt.annualInterestRate,
    paymentDay,
  );
  const paymentSplit =
    debt.balance > 0 && debt.monthlyPayment > 0
      ? amortizeDebtMonth(debt.balance, debt.monthlyPayment, debt.annualInterestRate, {
          periodDays,
        })
      : null;

  return (
    <div id={`debt-${debt.id}`} className={debtCardClass(highlighted)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={debt.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
            className="size-4 rounded text-indigo-600"
          />
          <input
            type="text"
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950"
            value={debt.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-rose-600 hover:underline dark:text-rose-400"
        >
          Удалить
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Остаток долга</span>
          <input
            type="number"
            className={inputClass}
            value={debt.balance || ""}
            onChange={(e) =>
              onUpdate({ balance: Number.parseFloat(e.target.value) || 0 })
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Платёж в месяц</span>
          <input
            type="number"
            className={inputClass}
            value={debt.monthlyPayment || ""}
            onChange={(e) =>
              onUpdate({
                monthlyPayment: Number.parseFloat(e.target.value) || 0,
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Ставка, % годовых</span>
          <input
            type="number"
            step={0.1}
            className={inputClass}
            value={debt.annualInterestRate || ""}
            onChange={(e) =>
              onUpdate({
                annualInterestRate: Number.parseFloat(e.target.value) || 0,
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">День платежа</span>
          <input
            type="number"
            min={1}
            max={28}
            className={inputClass}
            value={debt.paymentDay ?? 6}
            onChange={(e) =>
              onUpdate({
                paymentDay: Math.min(
                  28,
                  Math.max(1, Number.parseInt(e.target.value, 10) || 6),
                ),
              })
            }
          />
        </label>
      </div>
      {debt.balance > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          Погашение: <strong>{formatPayoff(payoff)}</strong>
          {paymentSplit && (
            <>
              {" "}
              · из платежа ({periodDays} дн.): тело{" "}
              <strong>{formatMoney(paymentSplit.principal)}</strong>, проценты{" "}
              <strong>{formatMoney(paymentSplit.interest)}</strong>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function AssetsTab({ assets, report, onChange }: AssetsTabProps) {
  const wealth = getTotalWealth(report, assets);
  const monthlyDebt = getMonthlyDebtService(assets);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId) return;

    requestAnimationFrame(() => {
      document.getElementById(highlightId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });

    const timer = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const updateItem = (id: string, patch: Partial<CustomAssetItem>) => {
    onChange({
      ...assets,
      items: assets.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  };

  const removeItem = (id: string) => {
    onChange({
      ...assets,
      items: assets.items.filter((item) => item.id !== id),
    });
  };

  const addAsset = () => {
    const item = createCustomAsset({ label: "Новый актив" });
    onChange({
      ...assets,
      items: [...assets.items, item],
    });
    setHighlightId(`asset-${item.id}`);
  };

  const updateDebt = (id: string, patch: Partial<DebtObligation>) => {
    onChange({
      ...assets,
      otherDebts: (assets.otherDebts ?? []).map((debt) =>
        debt.id === id ? { ...debt, ...patch } : debt,
      ),
    });
  };

  const removeDebt = (id: string) => {
    onChange({
      ...assets,
      otherDebts: (assets.otherDebts ?? []).filter((debt) => debt.id !== id),
    });
  };

  const addDebt = () => {
    const debt = newDebt();
    onChange({
      ...assets,
      otherDebts: [...(assets.otherDebts ?? []), debt],
    });
    setHighlightId(`debt-${debt.id}`);
  };

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div className="sticky top-3 z-20 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/90">
        <p className="hidden text-sm text-zinc-500 sm:block dark:text-zinc-400">
          Активы и долги
        </p>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <button
            type="button"
            onClick={addAsset}
            className="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 sm:flex-none dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-950/80"
          >
            + Актив
          </button>
          <button
            type="button"
            onClick={addDebt}
            className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50 sm:flex-none dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            + Долг
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Укажите стоимость, рост по инфляции и доходность — в процентах или
        денежной суммой. Изменения сохраняются в{" "}
        <code>data/portfolio.json</code>.
      </p>

      {assets.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Активов пока нет — нажмите «+ Актив» в панели сверху
        </p>
      ) : (
        assets.items.map((item) => (
          <AssetCard
            key={item.id}
            item={item}
            netValue={getAssetNetValue(item)}
            highlighted={highlightId === `asset-${item.id}`}
            onUpdate={(patch) => updateItem(item.id, patch)}
            onRemove={() => removeItem(item.id)}
          />
        ))
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Прочие долги
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Кредиты без привязки к активу (авто, потребительские и т.п.)
          </p>
        </div>

        {(assets.otherDebts ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500">
            Дополнительных долгов нет — нажмите «+ Долг» в панели сверху
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {(assets.otherDebts ?? []).map((debt) => (
              <DebtCard
                key={debt.id}
                debt={debt}
                highlighted={highlightId === `debt-${debt.id}`}
                onUpdate={(patch) => updateDebt(debt.id, patch)}
                onRemove={() => removeDebt(debt.id)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/40">
        <p className="text-sm text-indigo-800 dark:text-indigo-200">
          Итого по дополнительным активам:{" "}
          <strong>{formatMoney(wealth.customTotal)}</strong>
        </p>
        <p className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">
          Общий капитал (брокер + активы):{" "}
          <strong>{formatMoney(wealth.grandTotal)}</strong>
        </p>
        {wealth.totalDebt > 0 && (
          <>
            <p className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">
              Совокупный долг: <strong>{formatMoney(wealth.totalDebt)}</strong>
            </p>
            <p className="mt-1 text-sm text-indigo-700 dark:text-indigo-300">
              Платежи по долгам в месяц:{" "}
              <strong>{formatMoney(monthlyDebt)}</strong>
            </p>
          </>
        )}
        <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-400">
          Золото на брокерском счёте (GLD) учитывается отдельно в отчёте Сбера.
        </p>
      </div>
    </div>
  );
}
