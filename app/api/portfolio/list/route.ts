import fs from "node:fs";
import { NextResponse } from "next/server";
import {
  createPortfolioDocument,
  getPortfolioPath,
  listPortfolioSummaries,
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

/** GET /api/portfolio/list — компактный список портфелей для селектора. */
export async function GET(request: Request) {
  const rejected = requireServerAuth(request);
  if (rejected) return rejected;

  try {
    return NextResponse.json({ portfolios: listPortfolioSummaries() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось получить список";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CreateBody = {
  id?: string;
  title?: string;
  groupId?: string;
};

/** POST /api/portfolio/list — создать портфель. */
export async function POST(request: Request) {
  const rejected =
    requireServerAuth(request) ?? rejectOversizedPrivateRequest(request);
  if (rejected) return rejected;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body: CreateBody = contentType.includes("application/json")
      ? ((await request.json().catch(() => ({}))) as CreateBody)
      : {};

    const requestedId =
      typeof body.id === "string" && body.id.trim()
        ? sanitizePortfolioId(body.id.trim())
        : undefined;

    if (requestedId && fs.existsSync(getPortfolioPath(requestedId))) {
      return NextResponse.json(
        { error: `Портфель уже существует: ${requestedId}`, id: requestedId },
        { status: 409 },
      );
    }

    const created = createPortfolioDocument(requestedId, body.groupId);
    const doc: PortfolioDocument = {
      ...created,
      title:
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : created.title,
      groupId: body.groupId ?? created.groupId,
      id: created.id,
    };

    writePortfolioDocument(doc);

    return NextResponse.json(readPortfolioDocument(doc.id), { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось создать портфель";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
