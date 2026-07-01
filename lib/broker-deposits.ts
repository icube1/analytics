import type { BrokerReport, CashFlow } from "./portfolio-types";

const DEPOSIT_PATTERNS = [
  /пополнен/i,
  /зачислен/i,
  /ввод\s+денеж/i,
  /ввод\s+средств/i,
  /перевод\s+с/i,
  /поступлен/i,
];

const EXCLUDE_PATTERNS = [
  /дивиденд/i,
  /купон/i,
  /выплат/i,
  /сделк/i,
  /комисси/i,
  /налог/i,
  /возврат\s+средств/i,
  /cash\s*back/i,
  /кэшбэк/i,
];

export function parseRuDate(date: string): Date | null {
  const match = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10) - 1;
  const year = Number.parseInt(match[3], 10);
  const parsed = new Date(year, month, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function calendarMonthFromRuDate(date: string): string | null {
  const parsed = parseRuDate(date);
  if (!parsed) return null;
  return formatCalendarMonth(parsed);
}

export function formatCalendarMonth(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function calendarMonthFromIso(iso: string): string {
  const date = new Date(iso);
  return formatCalendarMonth(date);
}

export function calendarMonthFromPlanMonth(
  savedAtIso: string,
  planMonth: number,
): string {
  const start = new Date(savedAtIso);
  const totalMonths = start.getFullYear() * 12 + start.getMonth() + planMonth;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  return formatCalendarMonth(new Date(year, month, 1));
}

export function formatCalendarMonthLabel(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

export function isBrokerDepositFlow(flow: CashFlow): boolean {
  if (flow.credit <= 0 || flow.currency !== "RUB") return false;
  const text = flow.description.trim();
  if (!text) return false;
  if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  return DEPOSIT_PATTERNS.some((pattern) => pattern.test(text));
}

export function extractBrokerDeposits(report: BrokerReport) {
  return report.cashFlows
    .filter(isBrokerDepositFlow)
    .map((flow) => ({
      id: flow.id,
      date: flow.date,
      amount: flow.credit,
      description: flow.description,
    }));
}
