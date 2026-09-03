"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type OwnerUser = {
  login: string;
  role: "admin";
  displayName: string;
};

function safeNext(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  if (value === "/login" || value.startsWith("/login?")) return "/";
  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { credentials: "same-origin" })
      .then((response) => {
        if (!cancelled && response.ok) router.replace(nextPath);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [nextPath, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; user?: OwnerUser }
        | null;
      if (!response.ok) {
        setError(body?.error ?? "Не удалось войти");
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Не удалось войти");
    } finally {
      setWorking(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
        Администратор
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Вход в аналитику
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Форма приложения, без системного окна браузера. Сессия хранится в
        httpOnly cookie.
      </p>

      <label className="mt-6 block text-sm">
        <span className="mb-1 block text-zinc-700 dark:text-zinc-300">Логин</span>
        <input
          type="text"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-zinc-700 dark:text-zinc-300">Пароль</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>

      {error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={working}
        className="mt-6 w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
      >
        {working ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
