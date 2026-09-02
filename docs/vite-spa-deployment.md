# Vite SPA deployment

Parallel React SPA lives in `apps/web/`. The production Next.js app under `app/` is unchanged.

## Build

```bash
npm install
npm run build:web          # typecheck + Vite production build → apps/web/dist
npm run measure:bundles    # compare Next vs Vite bundle sizes
```

## Local development

Terminal 1 — API backend (Next.js today):

```bash
npm run dev
```

Terminal 2 — Vite SPA:

```bash
npm run dev:web
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api/*` to `http://127.0.0.1:3000` by default (`VITE_API_PROXY_TARGET`).

## API base contract

Browser code resolves API URLs via `lib/api-base.ts`:

| Environment | Base URL | Mechanism |
|-------------|----------|-----------|
| Next.js (current prod) | `""` (same origin) | default |
| Vite dev | `""` | Vite dev-server proxy |
| Vite prod (same host) | `""` | nginx serves SPA + proxies `/api` |
| Vite prod (split host) | `https://api.example.com` | `VITE_API_BASE` at build time |
| Runtime override | any | `window.__ANALYTICS_API_BASE__` in `index.html` |

All fetches use relative paths (`/api/portfolio`, `/api/backup`, `/api/market-benchmark`).

## SPA fallback (nginx)

When static files are served from `apps/web/dist`, client-side routes (`/investments`) need a fallback to `index.html`:

```nginx
root /opt/analytics-web/dist;
index index.html;

location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

### Subpath deployment

If the SPA is hosted at `https://example.com/app/`:

1. Set `base: '/app/'` in `apps/web/vite.config.ts`.
2. Use `BrowserRouter basename="/app"` in `apps/web/src/main.tsx`.
3. Configure nginx `location /app/` with the same `try_files` fallback.

## Web Worker

`lib/finance-worker/browser-worker.ts` uses `new URL("./finance.worker.ts", import.meta.url)`. Vite bundles this as an ES module worker automatically (`worker.format: "es"`).

## Parity notes

| Area | Status |
|------|--------|
| Routes `/`, `/investments` | ✅ |
| IndexedDB + file drop workflows | ✅ (shared `lib/`) |
| Tailwind v4 styling | ✅ |
| Finance Web Worker | ✅ |
| Lazy investment tabs | ✅ (`React.lazy` in shared dashboard) |
| Server API routes | Proxied, not removed |
| Next.js `app/` production | Unchanged |
| SSR / metadata | ❌ SPA only (client render) |
| `next/font` Geist | System font stack in Vite shell |
| Auth (HTTP Basic on nginx) | Works when API and SPA share origin |

## Future cutover

1. Build and deploy `apps/web/dist` to `app.gala-soft.ru` (per architecture roadmap).
2. Point `/api` to Rust/Axum when ready; update `VITE_API_BASE` only if API moves to another host.
3. Retire Next.js UI after parity validation; keep or migrate API routes separately.

## Mobile shell (Capacitor)

A parallel iOS/Android wrapper lives in `apps/mobile/`. See [mobile-capacitor.md](./mobile-capacitor.md) for build/sync commands, deep-link auth design, WebView limitations, and the path to native Rust bindings. No production cutover is included on that track.
