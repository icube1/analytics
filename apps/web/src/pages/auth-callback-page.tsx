import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  buildAuthRedirectTarget,
  parseAuthCallbackPayload,
} from "@/lib/mobile/auth-callback";

export function AuthCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const payload = parseAuthCallbackPayload(
      location.search,
      location.hash,
    );
    const target = buildAuthRedirectTarget(payload);
    navigate(target, { replace: true });
  }, [location.hash, location.search, navigate]);

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-zinc-600 dark:text-zinc-300">
      <p>Завершаем вход…</p>
    </main>
  );
}
