"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type OwnerUser = {
  login: string;
  role: "admin";
  displayName: string;
};

export function OwnerAccountMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<OwnerUser | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { user?: OwnerUser };
        return body.user ?? null;
      })
      .then((nextUser) => {
        if (!cancelled) setUser(nextUser);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const handleLogout = useCallback(async () => {
    setWorking(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      router.replace("/login");
      router.refresh();
    } finally {
      setWorking(false);
    }
  }, [router]);

  if (pathname === "/login" || !user) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {user.displayName}
        </p>
        <p className="text-xs text-zinc-500">{user.login} · admin</p>
      </div>
      <button
        type="button"
        disabled={working}
        onClick={() => void handleLogout()}
        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {working ? "Выходим…" : "Выйти"}
      </button>
    </div>
  );
}
