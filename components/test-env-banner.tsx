"use client";

import { useEffect, useState } from "react";

type DeployMeta = {
  env?: string;
  ref?: string;
  sha?: string;
};

export function TestEnvBanner() {
  const [meta, setMeta] = useState<DeployMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/deploy-meta.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: DeployMeta | null) => {
        if (!cancelled && body?.env === "test") setMeta(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!meta) return null;

  return (
    <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-zinc-950">
      Тестовая среда
      {meta.ref ? ` · ${meta.ref}` : ""}
      {meta.sha ? ` · ${meta.sha.slice(0, 7)}` : ""}
    </div>
  );
}
