#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_ROOT="${PLATFORM_APP_ROOT:-/opt/analytics-platform}"
STAGING_LINK="$APP_ROOT/staging/current"
DATA_DIR="${PLATFORM_DATA_DIR:-$APP_ROOT/data}"
FINANCE_API_BIND="${FINANCE_API_BIND:-127.0.0.1:8080}"
SERVICE_NAME="${PLATFORM_FINANCE_API_SERVICE:-finance-api}"
TIMEOUT_SECS="${PLATFORM_SMOKE_TIMEOUT_SECS:-30}"
REPORT_DIR="${CI_REPORT_DIR:-$ROOT/ci-reports}"
LOCAL_PID=""
STATIC_PIDS=()

cleanup_local() {
  if [[ -n "$LOCAL_PID" ]] && kill -0 "$LOCAL_PID" 2>/dev/null; then
    kill "$LOCAL_PID" 2>/dev/null || true
    wait "$LOCAL_PID" 2>/dev/null || true
  fi
  local pid
  for pid in "${STATIC_PIDS[@]:-}"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup_local EXIT

human_bytes() {
  numfmt --to=iec-i --suffix=B "$1" 2>/dev/null || echo "${1} bytes"
}

service_rss_kb() {
  local pid="$1"
  if [[ -n "$pid" && "$pid" != "0" && -r "/proc/$pid/status" ]]; then
    awk '/VmRSS:/ {print $2}' "/proc/$pid/status"
  else
    echo 0
  fi
}

wait_for_health() {
  local url="$1"
  local deadline=$((SECONDS + TIMEOUT_SECS))
  while ((SECONDS < deadline)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

[[ -L "$STAGING_LINK" ]] || { echo "Missing staging release symlink: $STAGING_LINK" >&2; exit 1; }
RELEASE_DIR="$(readlink -f "$STAGING_LINK")"
MANIFEST="$RELEASE_DIR/manifest.json"
[[ -f "$MANIFEST" ]] || { echo "Missing manifest: $MANIFEST" >&2; exit 1; }

echo "=== Platform release smoke ($RELEASE_DIR) ==="

for path in \
  "$RELEASE_DIR/finance-api/bin/finance-api" \
  "$RELEASE_DIR/finance-api/bin/finance-api-migrate" \
  "$RELEASE_DIR/web/dist/index.html" \
  "$RELEASE_DIR/site/dist/index.html" \
  "$RELEASE_DIR/metrics-dashboard/dist/index.html" \
  "$RELEASE_DIR/next/server.js"; do
  [[ -e "$path" ]] || { echo "Missing artifact: $path" >&2; exit 1; }
done

[[ -d "$DATA_DIR" ]] || install -d -m 700 "$DATA_DIR"

HEALTH_URL="http://${FINANCE_API_BIND}/health"
rss_kb=0

if [[ "${PLATFORM_SMOKE_LOCAL:-0}" == "1" ]]; then
  export FINANCE_API_ENV=production
  export FINANCE_API_BIND
  export FINANCE_API_DATA_DIR="$DATA_DIR"
  "$RELEASE_DIR/finance-api/bin/finance-api" >/dev/null 2>&1 &
  LOCAL_PID="$!"
  sleep 1
  rss_kb="$(service_rss_kb "$LOCAL_PID")"
elif systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  rss_kb="$(service_rss_kb "$(systemctl show -p MainPID --value "$SERVICE_NAME")")"
else
  echo "Starting $SERVICE_NAME for smoke"
  systemctl start "$SERVICE_NAME"
  rss_kb="$(service_rss_kb "$(systemctl show -p MainPID --value "$SERVICE_NAME")")"
fi

if ! wait_for_health "$HEALTH_URL"; then
  echo "Health check timed out: $HEALTH_URL" >&2
  systemctl status "$SERVICE_NAME" --no-pager 2>/dev/null || true
  exit 1
fi

health_json="$(curl -fsS "$HEALTH_URL")"
echo "$health_json" | jq -e '.database == "ok"' >/dev/null || {
  echo "Migration/DB check failed: $health_json" >&2
  exit 1
}

BACKUP_FIXTURE="$ROOT/fixtures/finance-api/backup-v1-minimal.json"
if [[ -f "$RELEASE_DIR/finance-api/bin/finance-api-migrate" && -f "$BACKUP_FIXTURE" ]]; then
  MIGRATE_DATA="$(mktemp -d)"
  FINANCE_API_DATA_DIR="$MIGRATE_DATA" \
    "$RELEASE_DIR/finance-api/bin/finance-api-migrate" checksum \
      --backup "$BACKUP_FIXTURE" \
    | jq -e '.sourceFingerprint != null and .sourceFingerprint != ""' >/dev/null
  rm -rf "$MIGRATE_DATA"
fi

pick_loopback_port() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

assert_http_ok() {
  local url="$1"
  local needle="$2"
  local body
  body="$(curl -fsS "$url")"
  grep -q "$needle" <<<"$body"
}

if grep -R --include='*.js' -l 'linkedom' "$RELEASE_DIR/web/dist" >/dev/null 2>&1; then
  echo "linkedom leaked into staged Vite JS" >&2
  exit 1
fi

web_port="$(pick_loopback_port)"
python3 -m http.server --bind 127.0.0.1 "$web_port" --directory "$RELEASE_DIR/web/dist" >/dev/null 2>&1 &
STATIC_PIDS+=("$!")
site_port="$(pick_loopback_port)"
python3 -m http.server --bind 127.0.0.1 "$site_port" --directory "$RELEASE_DIR/site/dist" >/dev/null 2>&1 &
STATIC_PIDS+=("$!")
metrics_port="$(pick_loopback_port)"
python3 -m http.server --bind 127.0.0.1 "$metrics_port" --directory "$RELEASE_DIR/metrics-dashboard/dist" >/dev/null 2>&1 &
STATIC_PIDS+=("$!")
sleep 0.4

assert_http_ok "http://127.0.0.1:${web_port}/" "<div id=\"root\""
assert_http_ok "http://127.0.0.1:${site_port}/" "lang=\"ru\""
assert_http_ok "http://127.0.0.1:${metrics_port}/" "<html"

loopback_web="skipped"
loopback_api="skipped"
if curl -fsS "http://127.0.0.1:9081/" >/dev/null 2>&1; then
  assert_http_ok "http://127.0.0.1:9081/" "<div id=\"root\""
  loopback_web="ok"
fi
if curl -fsS "http://127.0.0.1:9082/health" >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:9082/health" | jq -e '.database == "ok"' >/dev/null
  loopback_api="ok"
fi

finance_api_bytes="$(jq -r '.components.financeApiBytes // 0' "$MANIFEST")"
migrate_bytes="$(jq -r '.components.financeApiMigrateBytes // 0' "$MANIFEST")"
web_bytes="$(jq -r '.components.webDistBytes // 0' "$MANIFEST")"
site_bytes="$(jq -r '.components.siteDistBytes // 0' "$MANIFEST")"
metrics_bytes="$(jq -r '.components.metricsDistBytes // 0' "$MANIFEST")"
next_bytes="$(jq -r '.components.nextFallbackBytes // 0' "$MANIFEST")"

mkdir -p "$REPORT_DIR"
cat >"$REPORT_DIR/platform-smoke.json" <<EOF
{
  "releaseDir": "$RELEASE_DIR",
  "health": $health_json,
  "financeApiRssKb": $rss_kb,
  "loopback": {
    "pythonWeb": "http://127.0.0.1:${web_port}/",
    "pythonSite": "http://127.0.0.1:${site_port}/",
    "pythonMetrics": "http://127.0.0.1:${metrics_port}/",
    "nginxWeb": "$loopback_web",
    "nginxApi": "$loopback_api"
  },
  "viteLinkedomFree": true,
  "artifactBytes": {
    "financeApi": $finance_api_bytes,
    "financeApiMigrate": $migrate_bytes,
    "web": $web_bytes,
    "site": $site_bytes,
    "metrics": $metrics_bytes,
    "nextFallback": $next_bytes
  }
}
EOF

echo "Health OK: $health_json"
echo "finance-api RSS: ${rss_kb} KiB"
echo "Artifacts:"
echo "  finance-api: $(human_bytes "$finance_api_bytes")"
echo "  migrate:     $(human_bytes "$migrate_bytes")"
echo "  web:         $(human_bytes "$web_bytes")"
echo "  site:        $(human_bytes "$site_bytes")"
echo "  metrics:     $(human_bytes "$metrics_bytes")"
echo "  next:        $(human_bytes "$next_bytes")"
echo "Loopback static: web=:$web_port site=:$site_port metrics=:$metrics_port"
echo "Nginx loopback: web=$loopback_web api=$loopback_api"
echo "Smoke passed"
