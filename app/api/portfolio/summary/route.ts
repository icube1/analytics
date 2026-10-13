import { NextResponse } from "next/server";
import { listPortfolios, readPortfolioDocument } from "@/lib/persist-server";
import type { PortfolioDocument } from "@/lib/portfolio-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = requireServerAuth(request);
  if (rejected) return rejected;

  try {
    const allPortfolios = listPortfolios();

    // Сводный портфель: объединяем все активы и параметры из всех портфелей
    const summary: PortfolioDocument = {
      id: "summary",
      groupId: "all",
      version: 1,
      updatedAt: new Date().toISOString(),
      brokerReport: null,
      brokerAccounts: [],
      brokerSnapshots: [],
      debtBalanceHistory: [],
      forecastPlans: [],
      // Усреднённые параметры (можно усложнить)
      compoundParams: allPortfolios[0]?.compoundParams ?? null,
      customAssets: {
        items: allPortfolios.flatMap((p) => p.customAssets.items),
        otherDebts: allPortfolios.flatMap((p) => p.customAssets.otherDebts),
      },
    };

    return NextResponse.json({
      allPortfolios,
      summary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось получить сводку";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import {
  rejectOversizedPrivateRequest,
  requireServerAuth,
} from "@/lib/server-auth";
