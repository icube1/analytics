import { estimatePayoffMonths, getEnabledDebts } from "./debt-amortization";
import { getEnabledItems } from "./custom-assets";
import {
  estimateDepositMaturityValue,
  formatDepositMaturityDate,
  getDepositMonthsRemaining,
  isDepositActive,
  isDepositItem,
} from "./term-deposits";
import type { CustomAssets } from "./portfolio-types";
import { formatMoney } from "./portfolio-wealth";

export type UpcomingEventKind = "debt_payoff" | "deposit_maturity";
export type UpcomingEventUrgency = "later" | "medium" | "soon";

export interface UpcomingEvent {
  id: string;
  kind: UpcomingEventKind;
  label: string;
  /** YYYY-MM-DD для сортировки */
  dateIso: string;
  monthsRemaining: number;
  paymentsRemaining: number | null;
  monthlyAmount: number | null;
  payoutAmount: number | null;
  urgency: UpcomingEventUrgency;
  detail: string;
}

function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatRuDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

function urgencyFromMonths(months: number): UpcomingEventUrgency {
  if (months <= 1) return "soon";
  if (months <= 6) return "medium";
  return "later";
}

function pushDebtEvent(
  events: UpcomingEvent[],
  id: string,
  label: string,
  balance: number,
  monthlyPayment: number,
  annualRate: number,
  paymentDay: number | undefined,
  asOf: Date,
): void {
  if (balance <= 0 || monthlyPayment <= 0) return;

  const months = estimatePayoffMonths(
    balance,
    monthlyPayment,
    annualRate,
    paymentDay ?? 6,
    asOf,
  );
  if (months === null || months <= 0) return;

  const payoffDate = addCalendarMonths(asOf, months);
  const dateIso = formatIsoDate(payoffDate);

  events.push({
    id,
    kind: "debt_payoff",
    label,
    dateIso,
    monthsRemaining: months,
    paymentsRemaining: months,
    monthlyAmount: monthlyPayment,
    payoutAmount: null,
    urgency: urgencyFromMonths(months),
    detail: `Последний платёж ~${formatRuDate(dateIso)} · освободится ${formatMoney(monthlyPayment)}/мес`,
  });
}

export function collectUpcomingEvents(
  assets: CustomAssets,
  asOf: Date = new Date(),
): UpcomingEvent[] {
  const events: UpcomingEvent[] = [];

  for (const item of getEnabledItems(assets)) {
    if (isDepositItem(item) && isDepositActive(item, asOf)) {
      const monthsLeft = getDepositMonthsRemaining(item, asOf) ?? 0;
      const maturityIso = formatDepositMaturityDate(item);
      if (!maturityIso || monthsLeft <= 0) continue;

      const termMonths = item.depositTermMonths ?? 0;
      const payout =
        termMonths > 0
          ? estimateDepositMaturityValue(
              item.value,
              item.annualReturnPercent,
              termMonths,
              item.depositInterestMode ?? "at_maturity",
            )
          : item.value;

      events.push({
        id: `deposit-${item.id}`,
        kind: "deposit_maturity",
        label: item.label,
        dateIso: maturityIso,
        monthsRemaining: monthsLeft,
        paymentsRemaining: null,
        monthlyAmount: null,
        payoutAmount: payout,
        urgency: urgencyFromMonths(monthsLeft),
        detail: `Закрытие ${formatRuDate(maturityIso)} · выплата ~${formatMoney(payout)}`,
      });
      continue;
    }

    if (item.debt > 0 && item.monthlyDebtPayment > 0) {
      pushDebtEvent(
        events,
        `asset-debt-${item.id}`,
        `${item.label} (долг)`,
        item.debt,
        item.monthlyDebtPayment,
        item.debtAnnualRate,
        item.debtPaymentDay,
        asOf,
      );
    }
  }

  for (const debt of getEnabledDebts(assets)) {
    pushDebtEvent(
      events,
      `debt-${debt.id}`,
      debt.label,
      debt.balance,
      debt.monthlyPayment,
      debt.annualInterestRate,
      debt.paymentDay,
      asOf,
    );
  }

  return events.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}
