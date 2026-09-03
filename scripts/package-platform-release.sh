#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUTPUT="platform-release.tar.gz"
SKIP_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    -h | --help)
      echo "Usage: $0 [output.tar.gz] [--skip-build]" >&2
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
    *)
      OUTPUT="$1"
      ;;
  esac
  shift
done

REPORT_DIR="${CI_REPORT_DIR:-$ROOT/ci-reports}"
STAGING_ROOT="${PLATFORM_STAGING_ROOT:-$ROOT/.platform-release-staging}"
VERSION="${PLATFORM_RELEASE_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || echo "local")-$(date -u +%Y%m%d%H%M%S)}"
RELEASE_DIR="$STAGING_ROOT/releases/$VERSION"

human_bytes() {
  local bytes="$1"
  numfmt --to=iec-i --suffix=B "$bytes" 2>/dev/null || echo "${bytes} bytes"
}

dir_bytes() {
  local path="$1"
  if [[ -d "$path" ]]; then
    du -sb "$path" | awk '{print $1}'
  else
    echo 0
  fi
}

file_bytes() {
  local path="$1"
  if [[ -f "$path" ]]; then
    wc -c <"$path" | tr -d ' '
  else
    echo 0
  fi
}

forbidden_paths=(
  .env
  .env.local
  .env.production
  analytics-auth.env
  analytics-finance-api.env
)

assert_no_secrets() {
  local base="$1"
  local rel
  for rel in "${forbidden_paths[@]}"; do
    if [[ -e "$base/$rel" ]]; then
      echo "Refusing to package secret path: $rel" >&2
      exit 1
    fi
  done
  while IFS= read -r -d '' env_file; do
    if grep -qiE '^(password|secret|private[_-]?key)[[:space:]]*=' "$env_file"; then
      echo "Refusing to package env file with inline secrets: $env_file" >&2
      exit 1
    fi
  done < <(find "$base" -maxdepth 3 \( -name '.env' -o -name '.env.*' -o -name '*auth*.env' \) -print0 2>/dev/null)
}

echo "=== Platform release package ($VERSION) ==="

if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "▶ cargo build finance-api (release)"
  cargo build --release -p finance-api

  echo "▶ npm builds (web, site, metrics, next)"
  npm run build:web
  npm run build:site
  npm run build:metrics-dashboard
  npm run build
  bash scripts/prepare-standalone.sh
fi

FINANCE_API_BIN="$ROOT/target/release/finance-api"
MIGRATE_BIN="$ROOT/target/release/finance-api-migrate"
STANDALONE="$ROOT/.next/standalone"
WEB_DIST="$ROOT/apps/web/dist"
SITE_DIST="$ROOT/apps/site/dist"
METRICS_DIST="$ROOT/apps/metrics-dashboard/dist"

for required in \
  "$FINANCE_API_BIN" \
  "$MIGRATE_BIN" \
  "$STANDALONE/server.js" \
  "$WEB_DIST/index.html" \
  "$SITE_DIST/index.html" \
  "$METRICS_DIST/index.html"; do
  if [[ ! -e "$required" ]]; then
    echo "Missing build artifact: $required" >&2
    exit 1
  fi
done

rm -rf "$RELEASE_DIR"
mkdir -p \
  "$RELEASE_DIR/finance-api/bin" \
  "$RELEASE_DIR/web" \
  "$RELEASE_DIR/site" \
  "$RELEASE_DIR/metrics-dashboard" \
  "$RELEASE_DIR/next" \
  "$RELEASE_DIR/nginx"

install -m 755 "$FINANCE_API_BIN" "$RELEASE_DIR/finance-api/bin/finance-api"
install -m 755 "$MIGRATE_BIN" "$RELEASE_DIR/finance-api/bin/finance-api-migrate"
cp -a "$WEB_DIST/." "$RELEASE_DIR/web/dist/"
cp -a "$SITE_DIST/." "$RELEASE_DIR/site/dist/"
cp -a "$METRICS_DIST/." "$RELEASE_DIR/metrics-dashboard/dist/"
install -m 644 "$ROOT/deploy/blue-green/nginx-loopback-staging.conf" \
  "$RELEASE_DIR/nginx/nginx-loopback-staging.conf"

(
  shopt -s dotglob
  for item in "$STANDALONE"/*; do
    base="$(basename "$item")"
    case "$base" in
      target | crates | apps | deploy | docs | fixtures | __tests__ | scripts | coverage)
        continue
        ;;
    esac
    cp -a "$item" "$RELEASE_DIR/next/"
  done
)

for forbidden in target crates apps docs fixtures deploy __tests__ scripts coverage; do
  if [[ -e "$RELEASE_DIR/next/$forbidden" ]]; then
    echo "Refusing to package forbidden path in next fallback: $forbidden" >&2
    exit 1
  fi
done

assert_no_secrets "$RELEASE_DIR"

finance_api_bytes="$(file_bytes "$RELEASE_DIR/finance-api/bin/finance-api")"
migrate_bytes="$(file_bytes "$RELEASE_DIR/finance-api/bin/finance-api-migrate")"
web_bytes="$(dir_bytes "$RELEASE_DIR/web/dist")"
site_bytes="$(dir_bytes "$RELEASE_DIR/site/dist")"
metrics_bytes="$(dir_bytes "$RELEASE_DIR/metrics-dashboard/dist")"
next_bytes="$(dir_bytes "$RELEASE_DIR/next")"

cat >"$RELEASE_DIR/manifest.json" <<EOF
{
  "version": "$VERSION",
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "components": {
    "financeApiBytes": $finance_api_bytes,
    "financeApiMigrateBytes": $migrate_bytes,
    "webDistBytes": $web_bytes,
    "siteDistBytes": $site_bytes,
    "metricsDistBytes": $metrics_bytes,
    "nextFallbackBytes": $next_bytes
  }
}
EOF

tar -czf "$OUTPUT" -C "$STAGING_ROOT/releases" "$VERSION"
tar_bytes="$(file_bytes "$OUTPUT")"

mkdir -p "$REPORT_DIR"
cat >"$REPORT_DIR/platform-release.json" <<EOF
{
  "version": "$VERSION",
  "tarball": "$OUTPUT",
  "tarballBytes": $tar_bytes,
  "financeApiBytes": $finance_api_bytes,
  "financeApiMigrateBytes": $migrate_bytes,
  "webDistBytes": $web_bytes,
  "siteDistBytes": $site_bytes,
  "metricsDistBytes": $metrics_bytes,
  "nextFallbackBytes": $next_bytes
}
EOF

echo ""
echo "Created $OUTPUT ($(human_bytes "$tar_bytes"))"
echo "  finance-api: $(human_bytes "$finance_api_bytes")"
echo "  web dist:    $(human_bytes "$web_bytes")"
echo "  site dist:   $(human_bytes "$site_bytes")"
echo "  metrics:     $(human_bytes "$metrics_bytes")"
echo "  next fallback: $(human_bytes "$next_bytes")"
