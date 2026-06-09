import { formatDate, fromInputDate } from "./csv";
import {
  getDisplayCategory,
  isSelfTransfer,
} from "./transaction-categories";
import type { Filters, Transaction } from "./types";

function matchesSearch(tx: Transaction, query: string): boolean {
  const haystack = [
    tx.merchant,
    getDisplayCategory(tx),
    tx.category,
    tx.status,
    tx.type,
    tx.comment,
    tx.cardName,
    tx.cardNumber,
    tx.accountName,
    tx.accountNumber,
    tx.bonusTitle,
    tx.bonusValue,
    tx.mcc,
    tx.currency,
    String(tx.amount),
    formatDate(tx.operationDate),
    tx.transactionDate ? formatDate(tx.transactionDate) : "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function isInternalTransfer(tx: Transaction): boolean {
  return isSelfTransfer(tx);
}

export function applyFilters(
  transactions: Transaction[],
  filters: Filters,
): Transaction[] {
  const dateFrom = fromInputDate(filters.dateFrom);
  const dateTo = fromInputDate(filters.dateTo);
  const amountMin = filters.amountMin ? Number.parseFloat(filters.amountMin) : null;
  const amountMax = filters.amountMax ? Number.parseFloat(filters.amountMax) : null;
  const search = filters.search.trim().toLowerCase();

  return transactions.filter((tx) => {
    if (dateFrom && tx.operationDate < dateFrom) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      if (tx.operationDate > end) return false;
    }
    if (
      filters.categories.length > 0 &&
      !filters.categories.includes(getDisplayCategory(tx))
    ) {
      return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(tx.status)) {
      return false;
    }
    if (filters.types.length > 0 && !filters.types.includes(tx.type)) {
      return false;
    }
    if (filters.cards.length > 0) {
      const card = tx.cardName || "Без карты";
      if (!filters.cards.includes(card)) return false;
    }
    if (search && !matchesSearch(tx, search)) {
      return false;
    }
    if (amountMin !== null && tx.amount < amountMin) return false;
    if (amountMax !== null && tx.amount > amountMax) return false;
    if (filters.excludeInternalTransfers && isInternalTransfer(tx)) return false;
    return true;
  });
}

export function getUniqueValues(transactions: Transaction[]) {
  const categories = new Set<string>();
  const statuses = new Set<string>();
  const types = new Set<string>();
  const cards = new Set<string>();

  for (const tx of transactions) {
    categories.add(getDisplayCategory(tx));
    if (tx.status) statuses.add(tx.status);
    if (tx.type) types.add(tx.type);
    cards.add(tx.cardName || "Без карты");
  }

  return {
    categories: [...categories].sort(),
    statuses: [...statuses].sort(),
    types: [...types].sort(),
    cards: [...cards].sort(),
  };
}

export function getDateBounds(transactions: Transaction[]) {
  if (transactions.length === 0) return { min: "", max: "" };
  const dates = transactions.map((tx) => tx.operationDate.getTime());
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { min: fmt(min), max: fmt(max) };
}
