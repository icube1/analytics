#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPORT_DIR="${CI_REPORT_DIR:-$ROOT/ci-reports}"
mkdir -p "$REPORT_DIR"
TIMING_JSON="$REPORT_DIR/timings.json"

SKIP_INSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) SKIP_INSTALL=1 ;;
    -h | --help) exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

declare -A STEP_MS=()
declare -a STEP_ORDER=()

step() {
  local name="$1"
  shift
  local start_ms end_ms elapsed_ms
  start_ms="$(date +%s%3N)"
  echo ""; echo "▶ ${name}"
  "$@"
  end_ms="$(date +%s%3N)"
  elapsed_ms=$((end_ms - start_ms))
  STEP_MS["$name"]=$elapsed_ms
  STEP_ORDER+=("$name")
  printf "  ✓ %s (%s ms)\n" "$name" "$elapsed_ms"
}

write_timings() {
  {
    echo "{"
    echo '  "generatedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",'
    echo '  "steps": ['
    local first=1
    for name in "${STEP_ORDER[@]}"; do
      [[ $first -eq 1 ]] || echo ","
      first=0
      printf '    {"name": "%s", "durationMs": %s}' "$name" "${STEP_MS[$name]}"
    done
    echo ""; echo "  ]"; echo "}"
  } >"$TIMING_JSON"
}

echo "=== Monorepo CI verify ==="

if [[ $SKIP_INSTALL -eq 0 ]]; then
  step "npm ci" npm ci
fi

step "rustc version" rustc --version
step "cargo fmt --check" cargo fmt --all -- --check
step "cargo clippy" cargo clippy --workspace --all-targets -- -D warnings
step "cargo test" cargo test --workspace
step "finance-core differential" npm run compare:finance-core
step "finance-core resilience differential" npm run compare:finance-core:resilience
step "finance-core money differential" npm run compare:finance-core:money
step "jest" npm test
step "root typecheck" npx tsc --noEmit
step "broker fixture privacy (sanitizer --check)" npm run sanitize:broker-fixtures -- --check
step "vite typecheck" npm run typecheck:web
step "vite tests" npm run test:web
step "vite build" npm run build:web
step "mobile runtime tests" npm run test:mobile
step "mobile bundle prepare and verify" bash -c "npm run prepare:mobile && npm run verify:mobile"
step "astro typecheck" npm run typecheck:site
step "astro build and static checks" npm run test:site
step "astro accessibility checks" npm run test:site:a11y
step "next build" npm run build
step "prepare standalone" bash scripts/prepare-standalone.sh
step "bundle budgets" node scripts/measure-bundles.mjs --skip-build --ci
step "observability tests" npm test -- __tests__/observability-node.test.ts __tests__/observability-collector.test.ts __tests__/observability-schema.test.ts --runInBand --forceExit
step "metrics dashboard typecheck" npm run typecheck:metrics
step "metrics dashboard tests" npm run test:metrics
step "metrics dashboard build" npm run build:metrics-dashboard
step "observability benchmark" bash scripts/benchmark-observability.sh --ci
step "platform e2e" bash scripts/test-platform-e2e.sh

write_timings
total_ms=0
for name in "${STEP_ORDER[@]}"; do total_ms=$((total_ms + STEP_MS[$name])); done
echo ""; echo "=== CI verify passed ==="; echo "Total: ${total_ms} ms"
