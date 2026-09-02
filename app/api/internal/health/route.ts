import { NextResponse } from "next/server";

import { requireInternalObservabilityAuth } from "@/lib/observability/internal-auth";
import { buildNodeHealthSnapshot } from "@/lib/observability/runtime-metrics";
import { OBSERVABILITY_SCHEMA_VERSION } from "@/lib/observability/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = requireInternalObservabilityAuth(request);
  if (rejected) return rejected;
  const snapshot = buildNodeHealthSnapshot();
  return NextResponse.json({
    schemaVersion: OBSERVABILITY_SCHEMA_VERSION,
    collectedAt: new Date().toISOString(),
    service: "analytics-node",
    ...snapshot,
  });
}
