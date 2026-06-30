export function formatMonthLabel(month: number): string {
  return `${Math.floor(month / 12)}г ${month % 12}м`;
}
