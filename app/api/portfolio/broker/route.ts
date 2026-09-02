import { NextResponse } from "next/server";
import { importBrokerReport } from "@/lib/broker-adapters";
import {
  readPortfolioDocument,
  writeBrokerHtml,
  writePortfolioDocument,
} from "@/lib/persist-server";
import {
  rejectOversizedPrivateRequest,
  requireServerAuth,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected =
    requireServerAuth(request) ?? rejectOversizedPrivateRequest(request);
  if (rejected) return rejected;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let html = "";
    let fileName = "broker-report.html";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
      }
      html = await file.text();
      fileName = file.name || fileName;
    } else {
      const body = (await request.json()) as { html?: string; fileName?: string };
      if (!body.html) {
        return NextResponse.json({ error: "HTML не передан" }, { status: 400 });
      }
      html = body.html;
      fileName = body.fileName ?? fileName;
    }

    const imported = importBrokerReport({
      content: html,
      fileName,
      mimeType: contentType || undefined,
    });

    if (!imported.ok || !imported.report) {
      const message =
        imported.errors[0]?.message ?? "Не удалось распознать данные в отчёте";
      return NextResponse.json(
        {
          error: message,
          errors: imported.errors,
          warnings: imported.warnings,
          detection: imported.detection,
        },
        { status: imported.errors[0]?.code === "NO_ADAPTER_MATCH" ? 415 : 422 },
      );
    }

    const report = imported.report;

    writeBrokerHtml(html);

    const current = readPortfolioDocument();
    writePortfolioDocument({
      ...current,
      lastBrokerFileName: fileName,
      brokerReport: report,
    });

    return NextResponse.json({
      report,
      fileName,
      provenance: imported.provenance,
      warnings: imported.warnings,
      reconciliation: imported.reconciliation,
      savedTo: ["data/portfolio.json", "data/broker-report.html"],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось сохранить отчёт";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
