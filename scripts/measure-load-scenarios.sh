#!/usr/bin/env bash
# Loopback transfer/TTFB measurements for the Vite SPA (Phase 1 load scenarios).
# Does not need public DNS. Lighthouse runs only when the binary is installed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPORT_DIR="${CI_REPORT_DIR:-$ROOT/ci-reports}"
mkdir -p "$REPORT_DIR"
REPORT_JSON="$REPORT_DIR/load-scenarios.json"

CI_MODE=0
SKIP_BUILD=0
DIST_DIR="$ROOT/apps/web/dist"
TTFB_BUDGET_MS="${LOAD_TTFB_BUDGET_MS:-5000}"
INDEX_BUDGET_BYTES="${LOAD_INDEX_BUDGET_BYTES:-81920}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ci) CI_MODE=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h | --help)
      echo "Usage: $0 [--ci] [--skip-build]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if [[ ! -d "$DIST_DIR" && $SKIP_BUILD -eq 0 ]]; then
  npm run build:web
fi

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  if [[ $CI_MODE -eq 1 ]]; then
    echo "Vite dist is missing; run build:web before load scenarios" >&2
    exit 1
  fi
  echo "Skipping load scenarios: $DIST_DIR/index.html not found"
  exit 0
fi

pick_port() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

PORT="$(pick_port)"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIST_DIR" >/tmp/analytics-load-http.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

deadline=$((SECONDS + 15))
until curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; do
  if ((SECONDS >= deadline)); then
    echo "loopback static server did not start" >&2
    exit 1
  fi
  sleep 0.1
done

measure() {
  local path="$1"
  local tmp
  tmp="$(mktemp)"
  # time_starttransfer = TTFB; time_total includes transfer
  local raw
  raw="$(curl -sS -o "$tmp" -w '%{time_starttransfer} %{time_total} %{size_download} %{http_code}' \
    "http://127.0.0.1:${PORT}${path}")"
  read -r ttfb_s total_s bytes status <<<"$raw"
  python3 - "$path" "$ttfb_s" "$total_s" "$bytes" "$status" "$tmp" <<'PY'
import json, sys
path, ttfb_s, total_s, bytes_, status, tmp = sys.argv[1:]
print(json.dumps({
    "path": path,
    "ttfbMs": round(float(ttfb_s) * 1000, 2),
    "totalMs": round(float(total_s) * 1000, 2),
    "bytes": int(bytes_),
    "status": int(status),
}))
PY
  rm -f "$tmp"
}

INDEX_JSON="$(measure /)"
ASSET_PATH="$(
  python3 - "$DIST_DIR" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
assets = sorted((root / "assets").glob("*.js")) if (root / "assets").exists() else []
print("/assets/" + assets[0].name if assets else "")
PY
)"
ASSET_JSON="{}"
if [[ -n "$ASSET_PATH" ]]; then
  ASSET_JSON="$(measure "$ASSET_PATH")"
fi

LIGHTHOUSE_JSON="null"
if command -v lighthouse >/dev/null 2>&1; then
  LH_OUT="$REPORT_DIR/lighthouse-loopback.json"
  if lighthouse "http://127.0.0.1:${PORT}/" \
    --only-categories=performance \
    --chrome-flags="--headless --no-sandbox" \
    --output=json \
    --output-path="$LH_OUT" \
    --quiet >/tmp/analytics-lighthouse.log 2>&1; then
    LIGHTHOUSE_JSON="$(python3 - "$LH_OUT" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
cats = data.get("categories", {})
audits = data.get("audits", {})
def ms(key):
    item = audits.get(key) or {}
    numeric = item.get("numericValue")
    return None if numeric is None else round(float(numeric), 2)
print(json.dumps({
    "performance": (cats.get("performance") or {}).get("score"),
    "lcpMs": ms("largest-contentful-paint"),
    "tbtMs": ms("total-blocking-time"),
    "cls": (audits.get("cumulative-layout-shift") or {}).get("numericValue"),
}))
PY
)"
  fi
fi

python3 - "$REPORT_JSON" "$INDEX_JSON" "$ASSET_JSON" "$LIGHTHOUSE_JSON" "$TTFB_BUDGET_MS" "$INDEX_BUDGET_BYTES" "$CI_MODE" <<'PY'
import json, sys
report_path, index_raw, asset_raw, lh_raw, ttfb_budget, index_budget, ci_mode = sys.argv[1:]
index = json.loads(index_raw)
asset = json.loads(asset_raw) if asset_raw not in ("", "{}") else None
lighthouse = json.loads(lh_raw)
report = {
    "generatedAt": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "index": index,
    "largestJs": asset,
    "lighthouse": lighthouse,
    "budgets": {
        "ttfbMs": int(ttfb_budget),
        "indexBytes": int(index_budget),
    },
}
open(report_path, "w").write(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if ci_mode == "1":
    failures = []
    if index.get("status") != 200:
        failures.append(f"index status {index.get('status')}")
    if index.get("ttfbMs", 0) > int(ttfb_budget):
        failures.append(f"index TTFB {index.get('ttfbMs')}ms > {ttfb_budget}ms")
    if index.get("bytes", 0) > int(index_budget):
        failures.append(f"index {index.get('bytes')} bytes > {index_budget}")
    if failures:
        raise SystemExit("load scenario budgets failed: " + "; ".join(failures))
PY
