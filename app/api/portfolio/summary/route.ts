import { NextResponse } from "next/server";
import {
  listPortfolioSummaries,
  listPortfolios,
} from "@/lib/persist-server";
import { combineBrokerReports } from "@/lib/merge-broker-reports";
import { DEFAULT_COMPOUND_PARAMS, type PortfolioDocument } from "@/lib/portfolio-types";
import { requireServerAuth } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = requireServerAuth(request);
  if (rejected) return rejected;

  try {
    const groupId = new URL(request.url).searchParams.get("groupId");
    const portfolios = listPortfolios().filter((doc) =>
      groupId ? doc.groupId === groupId : true,
    );

    // Сводный портфель: счета всех портфелей как есть, комбинированный отчёт считается на лету
    const brokerAccounts = portfolios.flatMap((doc) => doc.brokerAccounts ?? []);
    const summary: PortfolioDocument = {
      id: "summary",
      title: groupId ? `Сводный: ${groupId}` : "Сводный по всем портфелям",
      groupId: groupId ?? "all",
      taxProfile: portfolios[0]?.taxProfile,
      version: 1,
      updatedAt: new Date().toISOString(),
      brokerReport: combineBrokerReports(brokerAccounts.map((account) => account.report)),
      brokerAccounts,
      brokerSnapshots: portfolios.flatMap((doc) => doc.brokerSnapshots ?? []),
      debtBalanceHistory: portfolios.flatMap((doc) => doc.debtBalanceHistory ?? []),
      forecastPlans: [],
      compoundParams: portfolios[0]?.compoundParams ?? DEFAULT_COMPOUND_PARAMS,
      customAssets: {
        items: portfolios.flatMap((doc) => doc.customAssets?.items ?? []),
        otherDebts: portfolios.flatMap((doc) => doc.customAssets?.otherDebts ?? []),
      },
      lastBrokerFileName: portfolios
        .map((doc) => doc.lastBrokerFileName)
        .filter(Boolean)
        .join(", "),
    };

    return NextResponse.json({
      portfolios: listPortfolioSummaries(),
      summary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось получить сводку";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
