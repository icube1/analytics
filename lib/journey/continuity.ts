/**
 * Forgiving continuity — engagement over rolling weeks, not daily streaks.
 */

export const CONTINUITY_WINDOW_WEEKS = 12;

export interface ContinuityEngagement {
  /** ISO week key `YYYY-Www` */
  weekKey: string;
  /** ISO timestamp of last touch in that week */
  lastEngagedAt: string;
}

export interface ContinuitySnapshot {
  engagedWeeksInWindow: number;
  windowWeeks: number;
  lastEngagedAt: string | null;
  message: string;
}

function isoWeekKey(date: Date): string {
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weeksInWindow(now: Date, windowWeeks: number): string[] {
  const keys: string[] = [];
  for (let offset = 0; offset < windowWeeks; offset += 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - offset * 7);
    keys.push(isoWeekKey(d));
  }
  return keys;
}

export function recordEngagement(
  engagements: ContinuityEngagement[],
  at: Date = new Date(),
): ContinuityEngagement[] {
  const weekKey = isoWeekKey(at);
  const lastEngagedAt = at.toISOString();
  const existing = engagements.find((e) => e.weekKey === weekKey);
  if (existing) {
    return engagements.map((e) =>
      e.weekKey === weekKey ? { ...e, lastEngagedAt } : e,
    );
  }
  return [...engagements, { weekKey, lastEngagedAt }];
}

export function computeContinuity(
  engagements: ContinuityEngagement[],
  now: Date = new Date(),
  windowWeeks: number = CONTINUITY_WINDOW_WEEKS,
): ContinuitySnapshot {
  const window = new Set(weeksInWindow(now, windowWeeks));
  const engagedInWindow = engagements.filter((e) => window.has(e.weekKey));
  const lastEngagedAt =
    engagements.length > 0
      ? engagements.reduce((latest, e) =>
          e.lastEngagedAt > latest ? e.lastEngagedAt : latest,
        engagements[0].lastEngagedAt)
      : null;

  const count = engagedInWindow.length;
  let message: string;
  if (count === 0) {
    message =
      "Начните в удобном темпе — прогресс не сгорает и не зависит от ежедневных заходов.";
  } else if (count === 1) {
    message =
      "Вы заглянули на этой неделе. Можно вернуться когда удобно — без штрафов за паузу.";
  } else if (count < 4) {
    message = `${count} недели с активностью за последние ${windowWeeks} — спокойный, устойчивый ритм.`;
  } else {
    message = `${count} из ${windowWeeks} недель с активностью — регулярный обзор без гонки за streak.`;
  }

  return {
    engagedWeeksInWindow: count,
    windowWeeks,
    lastEngagedAt,
    message,
  };
}
