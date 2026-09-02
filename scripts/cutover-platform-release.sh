#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${PLATFORM_CUTOVER:-0}" != "1" ]]; then
  echo "Cutover disabled. Set PLATFORM_CUTOVER=1 to enable nginx vhosts and retire Next public routing." >&2
  exit 1
fi

APP_ROOT="${PLATFORM_APP_ROOT:-/opt/analytics-platform}"
STAGING_LINK="$APP_ROOT/staging/current"
SERVICE_NAME="${PLATFORM_FINANCE_API_SERVICE:-finance-api}"
NEXT_SERVICE="${PLATFORM_NEXT_SERVICE:-analytics}"

[[ -L "$STAGING_LINK" ]] || { echo "Missing staging release: $STAGING_LINK" >&2; exit 1; }

PLATFORM_APP_ROOT="$APP_ROOT" bash "$ROOT/scripts/smoke-platform-release.sh"

install -m 644 "$ROOT/deploy/blue-green/nginx-site-staging.conf.disabled" \
  /etc/nginx/sites-available/analytics-platform-site
install -m 644 "$ROOT/deploy/blue-green/nginx-app-staging.conf.disabled" \
  /etc/nginx/sites-available/analytics-platform-app
install -m 644 "$ROOT/deploy/blue-green/nginx-api-staging.conf.disabled" \
  /etc/nginx/sites-available/analytics-platform-api
install -m 644 "$ROOT/deploy/blue-green/nginx-metrics-staging.conf.disabled" \
  /etc/nginx/sites-available/analytics-platform-metrics

ln -sf /etc/nginx/sites-available/analytics-platform-site /etc/nginx/sites-enabled/analytics-platform-site
ln -sf /etc/nginx/sites-available/analytics-platform-app /etc/nginx/sites-enabled/analytics-platform-app
ln -sf /etc/nginx/sites-available/analytics-platform-api /etc/nginx/sites-enabled/analytics-platform-api
ln -sf /etc/nginx/sites-available/analytics-platform-metrics /etc/nginx/sites-enabled/analytics-platform-metrics

rm -f /etc/nginx/sites-enabled/analytics
nginx -t
systemctl reload nginx
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

if systemctl is-active --quiet "$NEXT_SERVICE"; then
  systemctl stop "$NEXT_SERVICE" || true
  systemctl disable "$NEXT_SERVICE" || true
fi

echo "Platform cutover complete. Next public vhost disabled; staging configs are live."
