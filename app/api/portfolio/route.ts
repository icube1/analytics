import { NextResponse } from "next/server";
import { mergePortfolioStorage } from "@/lib/merge-portfolio-storage";
import {
  readPortfolioDocument,
  writePortfolioDocument,
} from "@/lib/persist-server";
import type { PortfolioDocument } from "@/lib/portfolio-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const doc = readPortfolioDocument();
    return NextResponse.json({
      ...doc,
      dataPath: "data/portfolio.json",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось прочитать данные";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<PortfolioDocument>;
    const current = readPortfolioDocument();
    const next: PortfolioDocument = {
      ...mergePortfolioStorage({
        ...current,
        customAssets: body.customAssets ?? current.customAssets,
        compoundParams: body.compoundParams ?? current.compoundParams,
        lastBrokerFileName:
          body.lastBrokerFileName ?? current.lastBrokerFileName,
      }),
      brokerReport:
        body.brokerReport !== undefined ? body.brokerReport : current.brokerReport,
    };

    writePortfolioDocument(next);

    return NextResponse.json(readPortfolioDocument());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось сохранить данные";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
