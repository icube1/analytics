/** Coerce an ISO timestamp or `YYYY-MM-DD` to a finance-core civil date. */
export function toCivilDateString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(-?\d+)-(\d{2})-(\d{2})/.exec(value);
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Parse `YYYY-MM-DD` as a local civil date; other strings go through `Date`. */
export function parseCivilDate(value: string): Date {
  const civil = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(value);
  if (civil) {
    return new Date(Number(civil[1]), Number(civil[2]) - 1, Number(civil[3]));
  }
  return new Date(value);
}
