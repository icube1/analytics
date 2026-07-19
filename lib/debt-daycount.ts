/**
 * Проценты как в графике Альфа-Банка: остаток × ставка × дни / 365.
 * День платежа задаёт границы периода между ежемесячными платежами.
 */

const MS_PER_DAY = 86_400_000;

/** День месяца с учётом коротких месяцев */
export function clampPaymentDay(year: number, monthIndex0: number, paymentDay: number): number {
  const day = Math.min(28, Math.max(1, Math.round(paymentDay) || 1));
  const dim = new Date(year, monthIndex0 + 1, 0).getDate();
  return Math.min(day, dim);
}

export function paymentDateLocal(
  year: number,
  monthIndex0: number,
  paymentDay: number,
): Date {
  const day = clampPaymentDay(year, monthIndex0, paymentDay);
  return new Date(year, monthIndex0, day);
}

export function diffLocalDays(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/** Предыдущая и следующая даты платежа относительно asOf */
export function surroundingPaymentDates(
  asOf: Date,
  paymentDay: number,
): { previous: Date; next: Date } {
  const y = asOf.getFullYear();
  const m = asOf.getMonth();
  const d = asOf.getDate();
  const thisMonthPay = paymentDateLocal(y, m, paymentDay);

  if (d < thisMonthPay.getDate()) {
    const prevMonth = m === 0 ? 11 : m - 1;
    const prevYear = m === 0 ? y - 1 : y;
    return {
      previous: paymentDateLocal(prevYear, prevMonth, paymentDay),
      next: thisMonthPay,
    };
  }

  const nextMonth = m === 11 ? 0 : m + 1;
  const nextYear = m === 11 ? y + 1 : y;
  return {
    previous: thisMonthPay,
    next: paymentDateLocal(nextYear, nextMonth, paymentDay),
  };
}

/** Число дней в текущем платёжном периоде (от прошлого платежа до следующего) */
export function currentPaymentPeriodDays(
  paymentDay: number,
  asOf: Date = new Date(),
): number {
  const { previous, next } = surroundingPaymentDates(asOf, paymentDay);
  return Math.max(1, diffLocalDays(previous, next));
}

export function addMonthsPaymentDate(
  base: Date,
  deltaMonths: number,
  paymentDay: number,
): Date {
  const y = base.getFullYear();
  const m = base.getMonth() + deltaMonths;
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return paymentDateLocal(year, month, paymentDay);
}

/**
 * Дни периода для N-го платежа симуляции (1-based),
 * первый платёж — ближайший после asOfStart (или в день asOf, если совпал).
 */
export function simulationPaymentPeriodDays(
  asOfStart: Date,
  paymentMonthIndex: number,
  paymentDay: number,
): number {
  const { next: firstPay } = surroundingPaymentDates(asOfStart, paymentDay);
  const end = addMonthsPaymentDate(firstPay, paymentMonthIndex - 1, paymentDay);
  const start = addMonthsPaymentDate(firstPay, paymentMonthIndex - 2, paymentDay);
  return Math.max(1, diffLocalDays(start, end));
}

export function interestForPeriod(
  balance: number,
  annualInterestRate: number,
  periodDays: number,
): number {
  if (balance <= 0 || annualInterestRate <= 0 || periodDays <= 0) return 0;
  return (balance * annualInterestRate) / 100 * (periodDays / 365);
}
