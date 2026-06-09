import { NextResponse } from "next/server";
import { parsePortfolioHtml } from "@/lib/parse-portfolio-html";
import {
  readPortfolioDocument,
  writeBrokerHtml,
  writePortfolioDocument,
} from "@/lib/persist-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    const report = parsePortfolioHtml(html);
    if (report.securities.length === 0 && report.assetsEnd === 0) {
      return NextResponse.json(
        { error: "Не удалось распознать данные в отчёте" },
        { status: 422 },
      );
    }

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
      savedTo: ["data/portfolio.json", "data/broker-report.html"],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось сохранить отчёт";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
