import { NextResponse } from "next/server";
import { combinedReportFromAccounts } from "@/lib/merge-broker-reports";
import {
  readPortfolioDocument,
  sanitizePortfolioId,
  writePortfolioDocument,
} from "@/lib/persist-server";
import {
  rejectOversizedPrivateRequest,
  requireServerAuth,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * Явное удаление счёта из портфеля: DELETE `?portfolio=<id>&account=<id|contract>`.
 * Нужно отдельным эндпоинтом, потому что сохранение документа объединяет счета
 * (защита от клиента с чистым локальным состоянием) и само по себе удаление
 * не пробьёт.
 */
export async function DELETE(request: Request) {
  const rejected =
    requireServerAuth(request) ?? rejectOversizedPrivateRequest(request);
  if (rejected) return rejected;

  try {
    const url = new URL(request.url);
    const portfolioId = sanitizePortfolioId(
      url.searchParams.get("portfolio")?.trim() || "default",
    );
    const accountKey = (url.searchParams.get("account") ?? "").trim().toLowerCase();
    if (!accountKey) {
      return NextResponse.json({ error: "Не указан счёт" }, { status: 400 });
    }

    const current = readPortfolioDocument(portfolioId);
    const accounts = current.brokerAccounts ?? [];
    const remaining = accounts.filter((account) => {
      const byId = (account.id ?? "").toLowerCase();
      const byContract = (
        account.contract ??
        account.report?.contract ??
        ""
      ).toLowerCase();
      return byId !== accountKey && byContract !== accountKey;
    });

    if (remaining.length === accounts.length) {
      return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
    }

    writePortfolioDocument({
      ...current,
      id: portfolioId,
      brokerAccounts: remaining,
      brokerReport: combinedReportFromAccounts(remaining),
    });

    return NextResponse.json({
      ok: true,
      portfolioId,
      removed: accounts.length - remaining.length,
      accounts: remaining.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось удалить счёт";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
