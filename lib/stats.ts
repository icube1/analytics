import { formatDate } from "./csv";
import { getDisplayCategory } from "./transaction-categories";
import type {
  CategoryBreakdown,
  DailyFlow,
  MerchantBreakdown,
  SummaryStats,
  Transaction,
} from "./types";

function parseBonus(value: string): number {
  if (!value) return 0;
  const num = Number.parseFloat(value.replace("+", ""));
  return Number.isFinite(num) ? num : 0;
}

export function computeSummary(transactions: Transaction[]): SummaryStats {
  let totalIncome = 0;
  let totalExpense = 0;
  let totalBonus = 0;
  let expenseCount = 0;

  for (const tx of transactions) {
    if (tx.type === "Пополнение") {
      totalIncome += tx.amount;
    } else {
      totalExpense += tx.amount;
      expenseCount++;
    }
    totalBonus += parseBonus(tx.bonusValue);
  }

  return {
    totalIncome,
    totalExpense,
    netFlow: totalIncome - totalExpense,
    transactionCount: transactions.length,
    avgExpense: expenseCount > 0 ? totalExpense / expenseCount : 0,
    totalBonus,
  };
}

export function computeCategoryBreakdown(
  transactions: Transaction[],
): CategoryBreakdown[] {
  const map = new Map<string, { amount: number; count: number }>();

  for (const tx of transactions) {
    if (tx.type !== "Списание") continue;
    const category = getDisplayCategory(tx);
    const entry = map.get(category) ?? { amount: 0, count: 0 };
    entry.amount += tx.amount;
    entry.count += 1;
    map.set(category, entry);
  }

  return [...map.entries()]
    .map(([category, { amount, count }]) => ({ category, amount, count }))
    .sort((a, b) => b.amount - a.amount);
}

export function computeDailyFlow(transactions: Transaction[]): DailyFlow[] {
  const map = new Map<string, { income: number; expense: number }>();

  for (const tx of transactions) {
    const key = formatDate(tx.operationDate);
    const entry = map.get(key) ?? { income: 0, expense: 0 };
    if (tx.type === "Пополнение") {
      entry.income += tx.amount;
    } else {
      entry.expense += tx.amount;
    }
    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([date, { income, expense }]) => ({ date, income, expense }))
    .sort((a, b) => {
      const [da, ma, ya] = a.date.split(".").map(Number);
      const [db, mb, yb] = b.date.split(".").map(Number);
      return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
    });
}

export function computeTopMerchants(
  transactions: Transaction[],
  limit = 8,
): MerchantBreakdown[] {
  const map = new Map<string, { amount: number; count: number }>();

  for (const tx of transactions) {
    if (tx.type !== "Списание") continue;
    const merchant = tx.merchant || "Без названия";
    const entry = map.get(merchant) ?? { amount: 0, count: 0 };
    entry.amount += tx.amount;
    entry.count += 1;
    map.set(merchant, entry);
  }

  return [...map.entries()]
    .map(([merchant, { amount, count }]) => ({ merchant, amount, count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function isRubles(currency: string): boolean {
  const code = currency.trim().toUpperCase();
  return code === "RUR" || code === "RUB" || code === "₽";
}

export function formatMoney(amount: number, currency = "RUR"): string {
  if (isRubles(currency)) {
    const sign = amount < 0 ? "−" : "";
    const formatted = new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
    return `${sign}${formatted} ₽`;
  }

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
];
