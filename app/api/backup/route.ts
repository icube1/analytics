import { NextResponse } from "next/server";
import { saveServerBackup } from "@/lib/backup-server";
import { isAnalyticsBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!isAnalyticsBackup(body)) {
      return NextResponse.json(
        { error: "Неверный формат бэкапа" },
        { status: 400 },
      );
    }

    const filePath = saveServerBackup(body);

    return NextResponse.json({
      ok: true,
      filePath,
      exportedAt: body.exportedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось сохранить бэкап";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
