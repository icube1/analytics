"use client";

import { FormEvent, useCallback, useState } from "react";
import {
  isWebSessionSyncFeatureEnabled,
  loginWithPassword,
} from "@/lib/session-sync";
import { useSessionSync } from "./session-sync-provider";

export function SessionAuthMenu() {
  const featureOn = isWebSessionSyncFeatureEnabled();
  const { me, isAuthenticated, loading, refresh, signOut } = useSessionSync();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleLogin = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setWorking(true);
      setError(null);
      try {
        await loginWithPassword(email.trim(), password);
        setPassword("");
        await refresh();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось войти");
      } finally {
        setWorking(false);
      }
    },
    [email, password, refresh],
  );

  const handleLogout = useCallback(async () => {
    setWorking(true);
    try {
      await signOut();
      setOpen(false);
    } finally {
      setWorking(false);
    }
  }, [signOut]);

  if (!featureOn) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        aria-expanded={open}
      >
        {loading
          ? "Сессия…"
          : isAuthenticated
            ? me?.displayName ?? "Аккаунт"
            : "Войти"}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {isAuthenticated && me ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {me.displayName}
                </p>
                {me.email ? (
                  <p className="text-zinc-500 dark:text-zinc-400">{me.email}</p>
                ) : null}
              </div>
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Домохозяйство
                </p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {me.householdName}
                </p>
                <p className="text-xs text-zinc-500">
                  Роль: {me.role} · ID {me.householdId.slice(0, 8)}…
                </p>
              </div>
              <button
                type="button"
                disabled={working}
                onClick={() => void handleLogout()}
                className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Выйти
              </button>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={(event) => void handleLogin(event)}>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Вход в облачную сессию finance-api. Пароль не сохраняется.
              </p>
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-300">
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-600 dark:text-zinc-300">
                  Пароль
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
                />
              </label>
              {error ? (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              ) : null}
              <button
                type="submit"
                disabled={working}
                className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {working ? "Входим…" : "Войти"}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
