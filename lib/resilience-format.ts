const currencyFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("ru-RU", {
  style: "percent",
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});

export function formatRub(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return currencyFormatter.format(amount);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return percentFormatter.format(value / 100);
}

export function formatMonths(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (value === Number.POSITIVE_INFINITY) {
    return "не ограничено";
  }
  return `${decimalFormatter.format(value)} мес.`;
}

export function formatCoveragePercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (value >= 999) {
    return "100%+";
  }
  return `${Math.round(value)}%`;
}
