export interface CbrDailyRates {
  date: string;
  rates: Record<string, number>;
}

interface CbrJson {
  Date?: string;
  Valute?: Record<
    string,
    {
      CharCode: string;
      Value: number;
      Nominal: number;
    }
  >;
}

function formatArchivePath(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

export async function fetchCbrRatesOnDate(date: Date): Promise<CbrDailyRates | null> {
  for (let offset = 0; offset < 7; offset += 1) {
    const probe = new Date(date);
    probe.setDate(probe.getDate() - offset);
    const url = `https://www.cbr-xml-daily.ru/archive/${formatArchivePath(probe)}/daily_json.js`;
    try {
      const response = await fetch(url, { next: { revalidate: 86_400 } });
      if (!response.ok) continue;

      const json = (await response.json()) as CbrJson;
      const rates: Record<string, number> = {};
      for (const item of Object.values(json.Valute ?? {})) {
        rates[item.CharCode] = item.Value / item.Nominal;
      }

      return {
        date: json.Date?.slice(0, 10) ?? probe.toISOString().slice(0, 10),
        rates,
      };
    } catch {
      continue;
    }
  }

  return null;
}

export function fxReturnPct(
  startRate: number | undefined,
  endRate: number | undefined,
): number | null {
  if (!startRate || !endRate || startRate <= 0) return null;
  return ((endRate / startRate - 1) * 100);
}
