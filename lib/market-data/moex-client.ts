export interface DailyClose {
  date: string;
  close: number;
}

interface MoexCandlesResponse {
  candles?: {
    columns: string[];
    data: unknown[][];
  };
}

function parseMoexDate(value: string): string {
  return value.slice(0, 10);
}

export async function fetchMoexIndexCloses(
  secid: string,
  from: string,
  till: string,
): Promise<DailyClose[]> {
  const url = new URL(
    `https://iss.moex.com/iss/engines/stock/markets/index/securities/${secid}/candles.json`,
  );
  url.searchParams.set("from", from);
  url.searchParams.set("till", till);
  url.searchParams.set("interval", "24");

  const response = await fetch(url.toString(), {
    next: { revalidate: 86_400 },
  });
  if (!response.ok) {
    throw new Error(`MOEX ${secid}: HTTP ${response.status}`);
  }

  const json = (await response.json()) as MoexCandlesResponse;
  const columns = json.candles?.columns ?? [];
  const closeIndex = columns.indexOf("close");
  const beginIndex = columns.indexOf("begin");
  if (closeIndex < 0 || beginIndex < 0) return [];

  return (json.candles?.data ?? [])
    .map((row) => ({
      date: parseMoexDate(String(row[beginIndex])),
      close: Number(row[closeIndex]),
    }))
    .filter((point) => Number.isFinite(point.close) && point.close > 0);
}

export function returnPctFromCloses(
  closes: DailyClose[],
  fromDate: string,
  toDate: string,
): number | null {
  if (closes.length === 0) return null;

  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  const start = pickCloseOnOrBefore(sorted, fromDate);
  const end = pickCloseOnOrAfter(sorted, toDate);
  if (!start || !end || start.close <= 0) return null;
  return ((end.close / start.close - 1) * 100);
}

function pickCloseOnOrBefore(
  series: DailyClose[],
  date: string,
): DailyClose | null {
  let candidate: DailyClose | null = null;
  for (const point of series) {
    if (point.date <= date) candidate = point;
    else break;
  }
  return candidate ?? series[0] ?? null;
}

function pickCloseOnOrAfter(series: DailyClose[], date: string): DailyClose | null {
  for (const point of series) {
    if (point.date >= date) return point;
  }
  return series[series.length - 1] ?? null;
}
