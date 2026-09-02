#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_ROOT="${PLATFORM_APP_ROOT:-/opt/analytics-platform}"
STAGING_LINK="$APP_ROOT/staging/current"
PREVIOUS_LINK="$APP_ROOT/staging/previous"
SERVICE_NAME="${PLATFORM_FINANCE_API_SERVICE:-finance-api}"

if [[ ! -L "$PREVIOUS_LINK" ]]; then
  echo "No previous release to roll back to ($PREVIOUS_LINK)" >&2
  exit 1
fi

previous_target="$(readlink -f "$PREVIOUS_LINK")"
[[ -d "$previous_target" ]] || { echo "Previous release missing: $previous_target" >&2; exit 1; }

ln -sfn "$previous_target" "$STAGING_LINK"
chown -h analytics:analytics "$STAGING_LINK" 2>/dev/null || true
systemctl restart "$SERVICE_NAME"
PLATFORM_APP_ROOT="$APP_ROOT" bash "$ROOT/scripts/smoke-platform-release.sh"
echo "Rolled back staging to $previous_target"
