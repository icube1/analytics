import { NextResponse } from "next/server";
import { loadStatementsFromDisk } from "@/lib/statements-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = loadStatementsFromDisk();

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось прочитать выписки";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
