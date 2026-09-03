#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROFILE="release"
TIMEOUT_SECS="${PLATFORM_E2E_TIMEOUT_SECS:-180}"
SCENARIO_TIMEOUT_SECS="${PLATFORM_E2E_SCENARIO_TIMEOUT_SECS:-45}"
REPORT_DIR="${CI_REPORT_DIR:-$ROOT/ci-reports}"
REPORT_JSON="$REPORT_DIR/platform-e2e.json"

API_PID=""
VITE_PID=""
WORK_DIR=""
COOKIE_JAR=""
declare -a SCENARIO_NAMES=()
declare -a SCENARIO_MS=()

usage() {
  echo "Usage: $0 [--debug] [--timeout <secs>]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug) PROFILE="debug" ;;
    --timeout)
      shift
      TIMEOUT_SECS="${1:?missing timeout value}"
      ;;
    -h | --help) usage ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
  shift
done

pick_port() {
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

cleanup() {
  local code=$?
  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
  if [[ $code -ne 0 ]]; then
    echo "Platform E2E failed (exit $code)" >&2
  fi
}
trap cleanup EXIT

sign_webhook() {
  local body="$1"
  local secret="$2"
  printf '%s' "$body" | openssl dgst -sha256 -hmac "$secret" | awk '{print $2}'
}

wait_for_url() {
  local url="$1"
  local deadline=$((SECONDS + SCENARIO_TIMEOUT_SECS))
  while ((SECONDS < deadline)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

record_scenario() {
  local name="$1"
  local start_ms="$2"
  local end_ms="$3"
  local elapsed=$((end_ms - start_ms))
  SCENARIO_NAMES+=("$name")
  SCENARIO_MS+=("$elapsed")
  printf "  ✓ %s (%s ms)\n" "$name" "$elapsed"
}

run_scenario() {
  local name="$1"
  local func="$2"
  local start_ms end_ms
  start_ms="$(date +%s%3N)"
  echo ""
  echo "▶ $name"
  timeout "$SCENARIO_TIMEOUT_SECS" env \
    ROOT="$ROOT" \
    API_BASE="$API_BASE" \
    COOKIE_JAR="$COOKIE_JAR" \
    WORK_DIR="$WORK_DIR" \
    MIGRATE_BIN="$MIGRATE_BIN" \
    API_BIN="$API_BIN" \
    WEBHOOK_SECRET="$WEBHOOK_SECRET" \
    BOOTSTRAP_EMAIL="$BOOTSTRAP_EMAIL" \
    BOOTSTRAP_PASSWORD="$BOOTSTRAP_PASSWORD" \
    METRICS_USER="$METRICS_USER" \
    METRICS_PASSWORD="$METRICS_PASSWORD" \
    METRICS_TOKEN="$METRICS_TOKEN" \
    VITE_PORT="$VITE_PORT" \
  bash -euo pipefail -c "
    $(declare -f sign_webhook login_bearer login_web wait_for_url assert_no_secret_leaks pick_port)
    $(declare -f "$func")
    $func
  "
  end_ms="$(date +%s%3N)"
  record_scenario "$name" "$start_ms" "$end_ms"
}

assert_no_secret_leaks() {
  local log_file="$1"
  if [[ ! -f "$log_file" ]]; then
    return 0
  fi
  if grep -qiE '(password|bearerToken|csrfToken|bootstrap_password|ANALYTICS_AUTH_PASSWORD)=' "$log_file"; then
    echo "Secret leak detected in API log" >&2
    return 1
  fi
}

build_binaries() {
  if [[ "$PROFILE" == "release" ]]; then
    cargo build --release -p finance-api
    API_BIN="$ROOT/target/release/finance-api"
    MIGRATE_BIN="$ROOT/target/release/finance-api-migrate"
  else
    cargo build -p finance-api
    API_BIN="$ROOT/target/debug/finance-api"
    MIGRATE_BIN="$ROOT/target/debug/finance-api-migrate"
  fi
  [[ -x "$API_BIN" ]] || { echo "Missing API binary: $API_BIN" >&2; exit 1; }
  [[ -x "$MIGRATE_BIN" ]] || { echo "Missing migrate binary: $MIGRATE_BIN" >&2; exit 1; }
}

start_api() {
  local data_dir="$1"
  local port="$2"
  local db_path="$data_dir/finance-api.db"
  local log_file="$data_dir/api.log"

  install -d -m 700 "$data_dir"

  export FINANCE_API_ENV=development
  export FINANCE_API_BIND="127.0.0.1:${port}"
  export FINANCE_API_DATA_DIR="$data_dir"
  export FINANCE_API_DATABASE_URL="sqlite://${db_path}?mode=rwc"
  export FINANCE_API_BOOTSTRAP_EMAIL="$BOOTSTRAP_EMAIL"
  export FINANCE_API_BOOTSTRAP_PASSWORD="$BOOTSTRAP_PASSWORD"
  export FINANCE_API_BOOTSTRAP_DISPLAY_NAME="E2E Owner"
  export FINANCE_API_BOOTSTRAP_HOUSEHOLD_NAME="E2E Household"
  export FINANCE_API_BILLING_WEBHOOK_SECRET="$WEBHOOK_SECRET"
  export ANALYTICS_AUTH_USER="$METRICS_USER"
  export ANALYTICS_AUTH_PASSWORD="$METRICS_PASSWORD"
  export OBSERVABILITY_TOKEN="$METRICS_TOKEN"
  export FINANCE_API_SESSION_COOKIE_SECURE=0
  export FINANCE_API_WORKER_CONCURRENCY=1
  export FINANCE_API_JOB_TIMEOUT_SECS=30
  export RUST_LOG=finance_api=warn,tower_http=warn,sqlx=warn

  "$API_BIN" >"$log_file" 2>&1 &
  API_PID="$!"
  wait_for_url "http://127.0.0.1:${port}/health"
  assert_no_secret_leaks "$log_file"
}

start_vite_preview() {
  local api_port="$1"
  local vite_port="$2"
  local log_file="$WORK_DIR/vite.log"
  (
    cd "$ROOT/apps/web"
    VITE_API_PROXY_TARGET="http://127.0.0.1:${api_port}" \
      npx vite preview --host 127.0.0.1 --port "$vite_port" --strictPort
  ) >"$log_file" 2>&1 &
  VITE_PID="$!"
  wait_for_url "http://127.0.0.1:${vite_port}/"
}

login_bearer() {
  curl -fsS -X POST "$API_BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$BOOTSTRAP_EMAIL\",\"password\":\"$BOOTSTRAP_PASSWORD\",\"clientKind\":\"mobile\"}" \
    | jq -r .bearerToken
}

login_web() {
  local resp
  resp="$(curl -fsS -c "$COOKIE_JAR" -X POST "$API_BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$BOOTSTRAP_EMAIL\",\"password\":\"$BOOTSTRAP_PASSWORD\",\"clientKind\":\"web\"}")"
  WEB_CSRF="$(echo "$resp" | jq -r .csrfToken)"
  [[ -n "$WEB_CSRF" && "$WEB_CSRF" != null ]]
  grep -q finance_session "$COOKIE_JAR"
}

scenario_health() {
  curl -fsS "$API_BASE/health" | jq -e '.database == "ok"' >/dev/null
}

scenario_bootstrap_owner() {
  curl -fsS "$API_BASE/api/v1/auth/me" \
    -H "Authorization: Bearer $(login_bearer)" \
    | jq -e '.role == "owner"' >/dev/null
}

scenario_cookie_csrf_flow() {
  login_web
  curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/v1/auth/me" | jq -e '.email != null' >/dev/null
  curl -fsS -b "$COOKIE_JAR" -X PUT "$API_BASE/api/v1/portfolio" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: $WEB_CSRF" \
    -d '{"schemaVersion":1,"baseRevision":0,"document":{"version":1,"source":"web-cookie"}}' \
    | jq -e '.revision >= 1' >/dev/null
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X PUT "$API_BASE/api/v1/portfolio" \
    -H "Content-Type: application/json" \
    -d '{"schemaVersion":1,"baseRevision":0,"document":{"version":1}}')"
  [[ "$status" == "403" ]]
}

scenario_bearer_flow() {
  local token revision replay
  token="$(login_bearer)"
  curl -fsS "$API_BASE/api/v1/auth/me" -H "Authorization: Bearer $token" \
    | jq -e '.householdId != null' >/dev/null
  revision="$(curl -fsS -X PUT "$API_BASE/api/v1/portfolio" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -H "idempotency-key: bearer-sync-1" \
    -d '{"schemaVersion":1,"baseRevision":1,"document":{"version":1,"source":"bearer"}}' \
    | jq -r .revision)"
  replay="$(curl -fsS -X PUT "$API_BASE/api/v1/portfolio" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -H "idempotency-key: bearer-sync-1" \
    -d '{"schemaVersion":1,"baseRevision":1,"document":{"version":1,"source":"bearer"}}' \
    | jq -r .revision)"
  [[ "$revision" == "$replay" ]]
}

scenario_portfolio_conflict() {
  local token status
  token="$(login_bearer)"
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "$API_BASE/api/v1/portfolio" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d '{"schemaVersion":1,"baseRevision":0,"document":{"version":1,"conflict":true}}')"
  [[ "$status" == "409" ]]
}

scenario_statements_and_export() {
  local token statement_id export_body
  token="$(login_bearer)"
  statement_id="$(curl -fsS -X POST "$API_BASE/api/v1/statements" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d '{"fileName":"e2e.csv","content":"date,amount\n2026-01-01,42\n"}' \
    | jq -r .id)"
  curl -fsS "$API_BASE/api/v1/statements/$statement_id/content" \
    -H "Authorization: Bearer $token" | grep -q '2026-01-01'
  export_body="$(curl -fsS "$API_BASE/api/v1/backup/export" \
    -H "Authorization: Bearer $token")"
  echo "$export_body" | jq -e '.formatVersion == 1 and (.statements | length) >= 1' >/dev/null
}

scenario_resilience_entitlement() {
  local token household_id body sig status job_id deadline payload_file
  payload_file="$WORK_DIR/resilience-payload.json"
  cat >"$payload_file" <<'JSON'
{
  "kind": "resilience.evaluate",
  "payload": {
    "mandatoryMonthlyExpenses": 1000.0,
    "discretionaryMonthlyExpenses": 100.0,
    "liquidAssets": 5000.0,
    "monthlySurplus": 200.0,
    "payCycleDays": 30.0,
    "household": {
      "incomeStability": "stable",
      "incomeSourceCount": 1,
      "hasSecondaryHouseholdIncome": false,
      "dependentCount": 0,
      "jobSearchMonths": 3,
      "insuranceCoverage": "medium",
      "riskTolerance": "moderate"
    },
    "debt": {
      "totalBalance": 0.0,
      "monthlyPayments": 0.0,
      "weightedAnnualRate": 0.0,
      "highInterestBalance": 0.0
    },
    "sinkingFunds": [],
    "experiences": { "annualTarget": 0.0, "currentAmount": 0.0 }
  }
}
JSON
  token="$(login_bearer)"
  household_id="$(curl -fsS "$API_BASE/api/v1/auth/me" -H "Authorization: Bearer $token" | jq -r .householdId)"
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$API_BASE/api/v1/jobs" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d @"$payload_file")"
  [[ "$status" == "403" ]]
  body="$(jq -nc --arg hid "$household_id" \
    '{provider:"test",eventType:"entitlement.granted",householdId:$hid,payload:{},idempotencyKey:"e2e-entitlement",featureKey:"resilience.compute"}')"
  sig="$(sign_webhook "$body" "$WEBHOOK_SECRET")"
  curl -fsS -X POST "$API_BASE/api/v1/billing/webhook" \
    -H "Content-Type: application/json" \
    -H "x-test-signature: $sig" \
    -d "$body" >/dev/null
  job_id="$(curl -fsS -X POST "$API_BASE/api/v1/jobs" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -H "idempotency-key: e2e-resilience-job" \
    -d @"$payload_file" | jq -r .id)"
  [[ -n "$job_id" && "$job_id" != null ]]
  for _ in $(seq 1 150); do
    if curl -fsS "$API_BASE/api/v1/jobs/$job_id" -H "Authorization: Bearer $token" \
      | jq -e '.status == "completed"' >/dev/null; then
      return 0
    fi
    sleep 0.2
  done
  curl -sS "$API_BASE/api/v1/jobs/$job_id" -H "Authorization: Bearer $token" >&2 || true
  echo "Resilience job did not complete" >&2
  return 1
}

scenario_metrics_auth() {
  local status body
  status="$(curl -sS -o /dev/null -w '%{http_code}' "$API_BASE/internal/metrics")"
  [[ "$status" == "401" ]]
  body="$(curl -fsS "$API_BASE/internal/metrics" \
    -H "Authorization: Bearer $METRICS_TOKEN")"
  echo "$body" | jq -e '.service == "finance-api"' >/dev/null
  body="$(curl -fsS "$API_BASE/internal/metrics" \
    -u "$METRICS_USER:$METRICS_PASSWORD")"
  echo "$body" | jq -e '.schema_version == 1' >/dev/null
  ! printf '%s' "$body" | grep -qiE 'portfolio|payload_json'
}

scenario_logout() {
  local token status
  token="$(login_bearer)"
  curl -fsS -X POST "$API_BASE/api/v1/auth/logout" \
    -H "Authorization: Bearer $token" >/dev/null
  status="$(curl -sS -o /dev/null -w '%{http_code}' "$API_BASE/api/v1/auth/me" \
    -H "Authorization: Bearer $token")"
  [[ "$status" == "401" ]]
  login_web
  curl -fsS -b "$COOKIE_JAR" -X POST "$API_BASE/api/v1/auth/logout" \
    -H "x-csrf-token: $WEB_CSRF" >/dev/null
  status="$(curl -sS -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" "$API_BASE/api/v1/auth/me")"
  [[ "$status" == "401" ]]
}

scenario_vite_proxy_contract() {
  local status content_type
  status="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${VITE_PORT}/api/v1/auth/me")"
  [[ "$status" == "401" ]]
  content_type="$(curl -sS -o /dev/null -w '%{content_type}' "http://127.0.0.1:${VITE_PORT}/api/v1/auth/me")"
  [[ "$content_type" == *"json"* ]]
  status="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${VITE_PORT}/api/v1/portfolio")"
  [[ "$status" == "401" ]]
}

scenario_migration_roundtrip() {
  local migrate_data="$WORK_DIR/migrate-data"
  local migrate_db="$migrate_data/finance-api.db"
  local backup="$ROOT/fixtures/finance-api/backup-v1-minimal.json"
  local statements_dir="$ROOT/fixtures/finance-api/statements"
  local export_path="$WORK_DIR/migrated-export.json"
  [[ -f "$backup" ]] || { echo "Missing backup fixture: $backup" >&2; return 1; }
  install -d -m 700 "$migrate_data"

  FINANCE_API_DATA_DIR="$migrate_data" \
    FINANCE_API_DATABASE_URL="sqlite://${migrate_db}?mode=rwc" \
    "$MIGRATE_BIN" import \
      --backup "$backup" \
      --statements-dir "$statements_dir" \
      --bootstrap-email "$BOOTSTRAP_EMAIL" \
      --bootstrap-password "$BOOTSTRAP_PASSWORD" \
      --dry-run \
    | jq -e '.dryRun == true and .statementCount >= 1' >/dev/null

  local household_id
  household_id="$(FINANCE_API_DATA_DIR="$migrate_data" \
    FINANCE_API_DATABASE_URL="sqlite://${migrate_db}?mode=rwc" \
    "$MIGRATE_BIN" import \
      --backup "$backup" \
      --statements-dir "$statements_dir" \
      --bootstrap-email "$BOOTSTRAP_EMAIL" \
      --bootstrap-password "$BOOTSTRAP_PASSWORD" \
    | jq -r '.householdId')"
  [[ -n "$household_id" && "$household_id" != null ]]

  FINANCE_API_DATA_DIR="$migrate_data" \
    FINANCE_API_DATABASE_URL="sqlite://${migrate_db}?mode=rwc" \
    "$MIGRATE_BIN" import \
      --backup "$backup" \
      --statements-dir "$statements_dir" \
      --household-id "$household_id" \
    | jq -e '.idempotentSkip == true' >/dev/null

  local mig_port mig_pid mig_log mig_token
  mig_port="$(pick_port)"
  mig_log="$migrate_data/api.log"
  export FINANCE_API_ENV=development
  export FINANCE_API_BIND="127.0.0.1:${mig_port}"
  export FINANCE_API_DATA_DIR="$migrate_data"
  export FINANCE_API_DATABASE_URL="sqlite://${migrate_db}?mode=rwc"
  export FINANCE_API_BOOTSTRAP_EMAIL="$BOOTSTRAP_EMAIL"
  export FINANCE_API_BOOTSTRAP_PASSWORD="$BOOTSTRAP_PASSWORD"
  export FINANCE_API_SESSION_COOKIE_SECURE=0
  export RUST_LOG=finance_api=warn,tower_http=warn,sqlx=warn
  "$API_BIN" >"$mig_log" 2>&1 &
  mig_pid="$!"
  wait_for_url "http://127.0.0.1:${mig_port}/health"
  mig_token="$(curl -fsS -X POST "http://127.0.0.1:${mig_port}/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$BOOTSTRAP_EMAIL\",\"password\":\"$BOOTSTRAP_PASSWORD\",\"clientKind\":\"mobile\"}" \
    | jq -r .bearerToken)"
  curl -fsS "http://127.0.0.1:${mig_port}/api/v1/backup/export" \
    -H "Authorization: Bearer $mig_token" >"$export_path"
  jq -e '.formatVersion == 1 and (.portfolio | type) == "object" and (.statements | length) >= 1' \
    "$export_path" >/dev/null
  kill "$mig_pid" 2>/dev/null || true
  wait "$mig_pid" 2>/dev/null || true
  assert_no_secret_leaks "$mig_log"
}

write_report() {
  mkdir -p "$REPORT_DIR"
  local total_ms=0
  local i
  {
    echo "{"
    echo "  \"generatedAt\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
    echo "  \"profile\": \"$PROFILE\","
    echo "  \"apiPort\": $API_PORT,"
    echo "  \"vitePort\": $VITE_PORT,"
    echo "  \"timeoutSecs\": $TIMEOUT_SECS,"
    echo "  \"scenarios\": ["
    for i in "${!SCENARIO_NAMES[@]}"; do
      [[ $i -eq 0 ]] || echo ","
      printf '    {"name": "%s", "durationMs": %s}' "${SCENARIO_NAMES[$i]}" "${SCENARIO_MS[$i]}"
      total_ms=$((total_ms + SCENARIO_MS[$i]))
    done
    echo ""
    echo "  ],"
    echo "  \"totalDurationMs\": $total_ms"
    echo "}"
  } >"$REPORT_JSON"
}

main() {
  local gate_start_ms gate_end_ms
  gate_start_ms="$(date +%s%3N)"

  echo "=== Platform E2E ($PROFILE) ==="
  command -v curl >/dev/null
  command -v jq >/dev/null
  command -v openssl >/dev/null
  command -v python3 >/dev/null
  command -v timeout >/dev/null

  build_binaries

  WORK_DIR="$(mktemp -d)"
  COOKIE_JAR="$(mktemp)"
  API_PORT="$(pick_port)"
  VITE_PORT="$(pick_port)"
  API_BASE="http://127.0.0.1:${API_PORT}"

  BOOTSTRAP_EMAIL="e2e-$(openssl rand -hex 8)@example.test"
  BOOTSTRAP_PASSWORD="$(openssl rand -base64 24 | tr -d '\n/+=')"
  WEBHOOK_SECRET="$(openssl rand -hex 16)"
  METRICS_USER="metrics-$(openssl rand -hex 4)"
  METRICS_PASSWORD="$(openssl rand -base64 18 | tr -d '\n/+=')"
  METRICS_TOKEN="$(openssl rand -hex 16)"

  start_api "$WORK_DIR/data" "$API_PORT"
  start_vite_preview "$API_PORT" "$VITE_PORT"

  export ROOT API_BASE COOKIE_JAR WORK_DIR MIGRATE_BIN API_BIN WEBHOOK_SECRET
  export BOOTSTRAP_EMAIL BOOTSTRAP_PASSWORD METRICS_USER METRICS_PASSWORD METRICS_TOKEN
  export VITE_PORT API_PORT WEB_CSRF=""
  export SCENARIO_TIMEOUT_SECS TIMEOUT_SECS

  run_scenario health scenario_health
  run_scenario bootstrap_owner scenario_bootstrap_owner
  run_scenario cookie_csrf_login scenario_cookie_csrf_flow
  run_scenario bearer_login scenario_bearer_flow
  run_scenario portfolio_conflict scenario_portfolio_conflict
  run_scenario statements_export scenario_statements_and_export
  run_scenario resilience_entitlement scenario_resilience_entitlement
  run_scenario metrics_auth scenario_metrics_auth
  run_scenario logout scenario_logout
  run_scenario vite_proxy_contract scenario_vite_proxy_contract
  run_scenario migration_roundtrip scenario_migration_roundtrip

  gate_end_ms="$(date +%s%3N)"
  local gate_ms=$((gate_end_ms - gate_start_ms))
  if ((gate_ms > TIMEOUT_SECS * 1000)); then
    echo "Platform E2E exceeded wall timeout (${gate_ms} ms > $((TIMEOUT_SECS * 1000)) ms)" >&2
    exit 1
  fi

  write_report
  echo ""
  echo "Platform E2E passed (${gate_ms} ms)"
  jq . "$REPORT_JSON"
}

main "$@"
