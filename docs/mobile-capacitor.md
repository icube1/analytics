# Capacitor mobile shell

Parallel iOS/Android wrapper around the Vite SPA (`apps/web`). This is a **development shell only** — no App Store / Play Store publication or production cutover is included in this branch.

## Architecture

```text
apps/web (Vite SPA + shared lib/)
        │
        ▼ build → apps/web/dist
apps/mobile (Capacitor config + prepare scripts)
        │
        ▼ cap sync (local only)
ios/ android/ native projects (generated locally, not committed)
```

The WebView loads the same bundle as the browser SPA. Offline IndexedDB/localStorage, finance Web Worker, WASM fallback, `/resilience` route, and file-import flows are unchanged.

## Supported flows (mobile shell)

| Flow | Status | Notes |
| --- | --- | --- |
| `/`, `/resilience`, `/investments` routes | ✅ | `HashRouter` in native WebView |
| Resilience localStorage persistence | ✅ | Same `lib/resilience-storage.ts` |
| IndexedDB portfolio / statements | ✅ | WebView storage APIs |
| Finance worker + WASM fallback | ✅ | See limitations below |
| HTML/CSV file import (picker) | ✅ | `<input type="file">` in WebView |
| Drag-and-drop import | ⚠️ | Desktop-oriented; use file picker on mobile |
| API fetch via `lib/api-base.ts` | ✅ | `MOBILE_API_BASE` injection |
| Offline indicator | ✅ | `@capacitor/network` + `navigator.onLine` |
| External links | ✅ | `@capacitor/browser` in-app browser |
| Auth callback deep link | ✅ design | `analytics://app/auth/callback` + `/auth/callback` route |
| Background sync | ❌ | Not implemented (see limitations) |
| Push notifications | ❌ | Out of scope |

## Quick start (local)

```bash
npm install
cp apps/mobile/.env.example apps/mobile/.env.local
# Set MOBILE_API_BASE when API is not same-origin with the WebView host.

npm run build:mobile          # build web + inject mobile runtime config
cd apps/mobile
npx cap add ios               # once, requires Xcode
npx cap add android           # once, requires Android Studio + SDK
npm run cap:sync
npm run cap:open:ios          # or cap:open:android
```

CI runs `prepare:mobile` + `verify:mobile` without generating native projects.

## Secure API base injection

1. Set `MOBILE_API_BASE` in `apps/mobile/.env.local` (never commit).
2. `scripts/prepare-mobile-bundle.mjs` injects `window.__ANALYTICS_MOBILE_CONFIG__` and `window.__ANALYTICS_API_BASE__` into `apps/web/dist/index.html`.
3. Runtime resolution order matches `lib/api-base.ts`: runtime override → build-time `VITE_API_BASE`.

Capacitor `server.hostname` is `app.gala-soft.ru` so relative `/api` calls target that virtual origin unless `MOBILE_API_BASE` overrides the fetch base.

## Deep links and auth callbacks

| Mechanism | Example |
| --- | --- |
| Custom URL scheme | `analytics://app/auth/callback?access_token=…&state=/resilience` |
| Universal / App Link (manual setup) | `https://app.gala-soft.ru/auth/callback?...` |
| In-app route | `/auth/callback` → stores token in `sessionStorage`, redirects |

Native intent-filter / URL-type snippets live in `apps/mobile/native-config/` — merge after `cap add`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run build:mobile` | Web production build + mobile config injection |
| `npm run prepare:mobile` | Inject runtime config into existing `apps/web/dist` |
| `npm run verify:mobile` | Validate dist, WASM, injection marker, report size |
| `npm run test:mobile` | Mobile config / env unit tests |
| `npm run cap:sync` (in `apps/mobile`) | Copy web dist into native projects |

## WebView / WASM / background sync limitations

### WebView

- iOS WKWebView and Android WebView lag desktop Chrome for some APIs (File System Access, shared workers).
- Long-running workers may be throttled when the app is backgrounded.
- `window.open` is replaced by Capacitor Browser for external origins.

### WASM / finance worker

- WASM loads from `public/wasm/finance-wasm` inside the WebView — no separate native module.
- JIT restrictions on older iOS versions can affect WASM performance; TS fallback remains available.
- Worker module URLs must stay relative to the Vite bundle (`worker.format: "es"`).

### Background sync

- No Service Worker background sync in Capacitor shell.
- Offline edits stay in IndexedDB/localStorage until the user returns online and triggers a fetch.
- Future: Capacitor Background Runner or native sync via Rust FFI (below).

## Path to native Rust bindings

Current stack: **TypeScript worker → optional WASM (`finance-wasm`) → TS fallback**.

Recommended native path (not implemented here):

1. Expose `finance-core` via `uniffi` / `cbindgen` as an iOS `.xcframework` and Android `.so`.
2. Add a Capacitor plugin (`@analytics/finance-native`) that mirrors `lib/finance-worker/resilience-contract.ts`.
3. Switch `initCapacitorShell()` to register a native compute bridge when `Capacitor.getPlatform()` is `ios`/`android` and the plugin is present.
4. Keep WASM/TS paths for parity tests (`npm run compare:finance-core:resilience`).

See `docs/rust-finance-core.md` for the shared Rust crate layout.

## What is not committed

Per `.gitignore`:

- `apps/mobile/ios/`, `apps/mobile/android/` (generated by `cap add`)
- Native build artifacts (`DerivedData`, `build/`, `.gradle`, `*.apk`, `*.ipa`)
- `.env.local`, signing keys, provisioning profiles

## Required external accounts (for store-ready builds)

| Account | Purpose |
| --- | --- |
| Apple Developer Program | iOS signing, universal links, TestFlight |
| Google Play Console | Android signing, app links |
| (optional) Firebase / push provider | Future notifications |
| DNS + HTTPS host | `app.gala-soft.ru` universal links |

None are required to build and run the shell locally in simulators/emulators.
