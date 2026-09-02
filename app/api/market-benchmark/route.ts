import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fromDate = url.searchParams.get("from");
    const toDate = url.searchParams.get("to");

    if (!fromDate || !toDate) {
      return NextResponse.json(
        { error: "Укажите параметры from и to (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return NextResponse.json(
        { error: "Неверный формат даты" },
        { status: 400 },
      );
    }

    const { getMarketBenchmarkReturns } = await import("@/lib/market-data/service");
    const data = await getMarketBenchmarkReturns(fromDate, toDate);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось загрузить бенчмарки";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
