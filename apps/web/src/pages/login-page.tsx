import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginWithPassword } from "@/lib/session-sync";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@gala-soft.ru");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await loginWithPassword(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось войти. Локальный режим доступен без облака.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <p className="text-sm font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
          Облачная сессия
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Вход в аналитику
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Локальные данные остаются на устройстве. Облако нужно только для
          синхронизации между устройствами.
        </p>

        <label className="mt-8 block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </span>
          <input
            type="email"
            name="username"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 outline-none ring-indigo-500 focus:border-indigo-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>

        <label className="mt-4 block text-sm">
          <span className="mb-1.5 block font-medium text-zinc-700 dark:text-zinc-300">
            Пароль
          </span>
          <span className="relative block">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 pr-24 text-zinc-900 outline-none ring-indigo-500 focus:border-indigo-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-2 my-auto rounded-lg px-2 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              {showPassword ? "Скрыть" : "Показать"}
            </button>
          </span>
        </label>

        {error ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={working || !password}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {working ? "Входим…" : "Войти"}
        </button>

        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link to="/" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Продолжить локально без входа
          </Link>
        </p>
      </form>
    </main>
  );
}
