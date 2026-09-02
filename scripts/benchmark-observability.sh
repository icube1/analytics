#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REPORT_DIR="${CI_REPORT_DIR:-$ROOT/ci-reports}"
mkdir -p "$REPORT_DIR"
REPORT_JSON="$REPORT_DIR/observability-benchmark.json"
CHECK_ONLY=0
[[ "${1:-}" == "--ci" ]] && CHECK_ONLY=1
start_ms() { date +%s%3N; }

rust_start="$(start_ms)"
cargo test -p finance-api metrics --quiet
rust_ms=$(( $(start_ms) - rust_start ))

node_start="$(start_ms)"
npm test -- __tests__/observability-node.test.ts __tests__/observability-collector.test.ts __tests__/observability-schema.test.ts --runInBand --forceExit >/dev/null
node_ms=$(( $(start_ms) - node_start ))

collector_start="$(start_ms)"
OBSERVABILITY_DATA_DIR="$ROOT/tmp/observability-bench" npx tsx observability/collector/run.ts >/dev/null
collector_ms=$(( $(start_ms) - collector_start ))

dashboard_start="$(start_ms)"
npm run build --workspace @analytics/metrics-dashboard >/dev/null
dashboard_ms=$(( $(start_ms) - dashboard_start ))

dist_kb=$(du -sk apps/metrics-dashboard/dist | awk '{print $1}')
data_kb=$(du -sk tmp/observability-bench 2>/dev/null | awk '{print $1}')
data_kb=${data_kb:-0}
cat >"$REPORT_JSON" <<EOF
{"generatedAt":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")","timingsMs":{"rustMetricsTests":$rust_ms,"nodeObservabilityTests":$node_ms,"collectorRun":$collector_ms,"dashboardBuild":$dashboard_ms},"artifacts":{"dashboardDistKb":$dist_kb,"collectorDataKb":$data_kb},"budgets":{"dashboardDistMaxKb":256,"collectorDataMaxKb":64}}
EOF
echo "$REPORT_JSON"
cat "$REPORT_JSON"
if [[ $CHECK_ONLY -eq 1 ]]; then
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const f=[];if(r.artifacts.dashboardDistKb>r.budgets.dashboardDistMaxKb)f.push("dashboard too large");if(r.artifacts.collectorDataKb>r.budgets.collectorDataMaxKb)f.push("collector data too large");if(f.length){console.error(f.join("\n"));process.exit(1)}' "$REPORT_JSON"
fi
