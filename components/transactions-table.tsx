"use client";

import { Fragment, useMemo, useState } from "react";
import { formatDate } from "@/lib/csv";
import { formatMoney } from "@/lib/stats";
import { getDisplayCategory } from "@/lib/transaction-categories";
import type { Transaction } from "@/lib/types";

type SortKey =
  | "operationDate"
  | "merchant"
  | "amount"
  | "category"
  | "status"
  | "type";

interface TransactionsTableProps {
  transactions: Transaction[];
  totalCount: number;
}

export function TransactionsTable({
  transactions,
  totalCount,
}: TransactionsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("operationDate");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...transactions];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "operationDate":
          cmp = a.operationDate.getTime() - b.operationDate.getTime();
          break;
        case "merchant":
          cmp = a.merchant.localeCompare(b.merchant, "ru");
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
        case "category":
          cmp = getDisplayCategory(a).localeCompare(getDisplayCategory(b), "ru");
          break;
        case "status":
          cmp = a.status.localeCompare(b.status, "ru");
          break;
        case "type":
          cmp = a.type.localeCompare(b.type, "ru");
          break;
      }
      if (cmp === 0) {
        cmp = a.id.localeCompare(b.id);
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [transactions, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === "merchant" || key === "category");
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  const headerButtonClass =
    "w-full text-left font-medium transition-colors hover:text-indigo-600 dark:hover:text-indigo-400";

  if (transactions.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
        Операции не найдены
        {totalCount > 0 && (
          <p className="mt-2 text-sm">
            Всего в базе {totalCount} — измените фильтры
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Операции ({transactions.length}
          {transactions.length !== totalCount && ` из ${totalCount}`})
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">
                <button
                  type="button"
                  className={headerButtonClass}
                  onClick={() => handleSort("operationDate")}
                >
                  Дата{sortIndicator("operationDate")}
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  className={headerButtonClass}
                  onClick={() => handleSort("merchant")}
                >
                  Получатель{sortIndicator("merchant")}
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  className={headerButtonClass}
                  onClick={() => handleSort("category")}
                >
                  Категория{sortIndicator("category")}
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  className={headerButtonClass}
                  onClick={() => handleSort("type")}
                >
                  Тип{sortIndicator("type")}
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  className={headerButtonClass}
                  onClick={() => handleSort("status")}
                >
                  Статус{sortIndicator("status")}
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  type="button"
                  className={`${headerButtonClass} text-right`}
                  onClick={() => handleSort("amount")}
                >
                  Сумма{sortIndicator("amount")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sorted.map((tx) => {
              const isExpanded = expandedId === tx.id;
              const isIncome = tx.type === "Пополнение";

              return (
                <Fragment key={tx.id}>
                  <tr
                    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                    onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDate(tx.operationDate)}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {tx.merchant}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {getDisplayCategory(tx)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isIncome
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {tx.status || "—"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${
                        isIncome
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {isIncome ? "+" : "−"}
                      {formatMoney(tx.amount, tx.currency)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-indigo-50/40 dark:bg-indigo-950/30">
                      <td colSpan={6} className="px-4 py-3">
                        <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <dt className="text-zinc-500 dark:text-zinc-400">
                              Дата транзакции
                            </dt>
                            <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                              {tx.transactionDate
                                ? formatDate(tx.transactionDate)
                                : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500 dark:text-zinc-400">Счёт</dt>
                            <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                              {tx.accountName} ···{tx.accountNumber.slice(-4)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500 dark:text-zinc-400">Карта</dt>
                            <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                              {tx.cardName
                                ? `${tx.cardName} ${tx.cardNumber}`
                                : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500 dark:text-zinc-400">MCC</dt>
                            <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                              {tx.mcc || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-zinc-500 dark:text-zinc-400">Источник</dt>
                            <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                              {tx.sourceFile}
                            </dd>
                          </div>
                          {tx.comment && (
                            <div className="sm:col-span-2 lg:col-span-4">
                              <dt className="text-zinc-500 dark:text-zinc-400">
                                Комментарий
                              </dt>
                              <dd className="font-medium text-zinc-800 dark:text-zinc-200">
                                {tx.comment}
                              </dd>
                            </div>
                          )}
                          {tx.bonusValue && (
                            <div>
                              <dt className="text-zinc-500 dark:text-zinc-400">Бонусы</dt>
                              <dd className="font-medium text-indigo-700 dark:text-indigo-400">
                                {tx.bonusValue} {tx.bonusTitle}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
