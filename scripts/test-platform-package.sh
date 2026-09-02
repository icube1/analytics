#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPORT_DIR="${CI_REPORT_DIR:-$ROOT/ci-reports}"
LOCAL_ROOT="${PLATFORM_LOCAL_ROOT:-$ROOT/.platform-local}"
APP_ROOT="$LOCAL_ROOT/opt/analytics-platform"
TARBALL="$ROOT/platform-release-test.tar.gz"

echo "=== Local platform package + smoke gate ==="

if [[ "${1:-}" == --full ]]; then
  bash scripts/ci-verify.sh
  bash scripts/package-platform-release.sh "$TARBALL"
else
  if [[ -x "$ROOT/target/release/finance-api" ]] \
    && [[ -f "$ROOT/apps/web/dist/index.html" ]] \
    && [[ -f "$ROOT/.next/standalone/server.js" ]]; then
    echo "▶ Reusing existing build artifacts"
    bash scripts/package-platform-release.sh "$TARBALL" --skip-build
  else
    echo "▶ Building platform artifacts"
    cargo build --release -p finance-api
    npm run build:web
    npm run build:site
    npm run build:metrics-dashboard
    npm run build
    bash scripts/prepare-standalone.sh
    bash scripts/package-platform-release.sh "$TARBALL" --skip-build
  fi
fi

rm -rf "$LOCAL_ROOT"
install -d -m 755 "$LOCAL_ROOT"

PLATFORM_APP_ROOT="$APP_ROOT" bash "$ROOT/scripts/deploy-platform-release.sh" "$TARBALL" --local

if [[ -f "$REPORT_DIR/platform-release.json" ]]; then
  echo ""
  echo "=== Artifact report ==="
  jq . "$REPORT_DIR/platform-release.json"
fi

if [[ -f "$REPORT_DIR/platform-smoke.json" ]]; then
  echo ""
  echo "=== Smoke report ==="
  jq . "$REPORT_DIR/platform-smoke.json"
fi

echo ""
echo "Local platform package + smoke gate passed"
