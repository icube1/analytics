import { NextResponse } from "next/server";
import { mergePortfolioStorage } from "@/lib/merge-portfolio-storage";
import {
  deletePortfolioDocument,
  getPortfolioPath,
  readPortfolioDocument,
  sanitizePortfolioId,
  writePortfolioDocument,
} from "@/lib/persist-server";
import type { PortfolioDocument } from "@/lib/portfolio-types";
import {
  rejectOversizedPrivateRequest,
  requireServerAuth,
} from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * Идентификатор портфеля из `?portfolio=<id>`. Без параметра — "default",
 * чтобы старые клиенты продолжали работать с единственным портфелем.
 */
function portfolioIdFrom(request: Request): string {
  const raw = new URL(request.url).searchParams.get("portfolio");
  return sanitizePortfolioId(raw?.trim() || "default");
}

function dataPathFor(id: string): string {
  return id === "default" ? "data/portfolio.json" : getPortfolioPath(id);
}

/**
 * Счета объединяются, а не заменяются: клиент с чистым локальным состоянием
 * не должен стереть загруженные отчёты. Удаление — только явное, через
 * `removedAccountIds` (его присылает кнопка «Убрать»).
 */
function mergeAccounts(
  stored: PortfolioDocument["brokerAccounts"],
  incoming: PortfolioDocument["brokerAccounts"] | undefined,
  removedIds: string[],
): PortfolioDocument["brokerAccounts"] {
  const removed = new Set(removedIds);
  const keyOf = (account: PortfolioDocument["brokerAccounts"][number]) =>
    (account.contract || account.report?.contract || account.id || "").trim().toLowerCase();

  const byKey = new Map<string, PortfolioDocument["brokerAccounts"][number]>();
  for (const account of stored ?? []) {
    if (removed.has(account.id) || removed.has(keyOf(account))) continue;
    byKey.set(keyOf(account), account);
  }
  for (const account of incoming ?? []) {
    if (!account) continue;
    byKey.set(keyOf(account), account);
  }
  return [...byKey.values()];
}

/**
 * Клиент с чистым локальным состоянием (новый браузер, очищенный IndexedDB)
 * присылает пустой customAssets — это не должно стирать сохранённые активы.
 * Пустой набор принимается только если сохранённых активов тоже нет.
 */
function pickCustomAssets(
  incoming: PortfolioDocument["customAssets"] | undefined,
  stored: PortfolioDocument["customAssets"],
): PortfolioDocument["customAssets"] {
  if (!incoming) return stored;
  const incomingCount =
    (incoming.items?.length ?? 0) + (incoming.otherDebts?.length ?? 0);
  const storedCount =
    (stored.items?.length ?? 0) + (stored.otherDebts?.length ?? 0);
  if (incomingCount === 0 && storedCount > 0) return stored;
  return incoming;
}

export async function GET(request: Request) {
  const rejected = requireServerAuth(request);
  if (rejected) return rejected;

  try {
    const id = portfolioIdFrom(request);
    const doc = readPortfolioDocument(id);
    return NextResponse.json({
      ...doc,
      dataPath: dataPathFor(id),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось прочитать данные";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const rejected =
    requireServerAuth(request) ?? rejectOversizedPrivateRequest(request);
  if (rejected) return rejected;

  try {
    const id = portfolioIdFrom(request);
    const body = (await request.json()) as Partial<PortfolioDocument>;
    const current = readPortfolioDocument(id);
    const next: PortfolioDocument = {
      ...mergePortfolioStorage({
        ...current,
        customAssets: pickCustomAssets(body.customAssets, current.customAssets),
        compoundParams: body.compoundParams ?? current.compoundParams,
        lastBrokerFileName:
          body.lastBrokerFileName ?? current.lastBrokerFileName,
      }),
      // id всегда берём из query: тело не может переписать чужой портфель
      id,
      title: body.title ?? current.title,
      groupId: body.groupId ?? current.groupId,
      taxProfile: body.taxProfile ?? current.taxProfile,
      brokerReport:
        body.brokerReport !== undefined ? body.brokerReport : current.brokerReport,
      brokerAccounts: mergeAccounts(
        current.brokerAccounts,
        body.brokerAccounts,
        Array.isArray((body as { removedAccountIds?: string[] }).removedAccountIds)
          ? ((body as { removedAccountIds?: string[] }).removedAccountIds ?? [])
          : [],
      ),
      brokerSnapshots:
        body.brokerSnapshots !== undefined
          ? body.brokerSnapshots
          : current.brokerSnapshots,
      debtBalanceHistory:
        body.debtBalanceHistory !== undefined
          ? body.debtBalanceHistory
          : current.debtBalanceHistory,
      forecastPlans:
        body.forecastPlans !== undefined
          ? body.forecastPlans
          : current.forecastPlans,
    };

    writePortfolioDocument(next);

    return NextResponse.json(readPortfolioDocument(id));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось сохранить данные";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const rejected =
    requireServerAuth(request) ?? rejectOversizedPrivateRequest(request);
  if (rejected) return rejected;

  try {
    const id = portfolioIdFrom(request);
    const deleted = deletePortfolioDocument(id);

    if (!deleted) {
      return NextResponse.json(
        { error: `Портфель не найден: ${id}`, id },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, id, deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось удалить портфель";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
