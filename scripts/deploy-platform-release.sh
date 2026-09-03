#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARBALL=""
APP_ROOT="${PLATFORM_APP_ROOT:-/opt/analytics-platform}"
DATA_DIR="${PLATFORM_DATA_DIR:-$APP_ROOT/data}"
BACKUP_DIR="${PLATFORM_BACKUP_DIR:-$DATA_DIR/backups}"
STAGING_LINK="$APP_ROOT/staging/current"
PREVIOUS_LINK="$APP_ROOT/staging/previous"
RELEASES_DIR="$APP_ROOT/releases"
SERVICE_NAME="${PLATFORM_FINANCE_API_SERVICE:-finance-api}"
LOCAL_MODE=0
SKIP_SMOKE=0

usage() {
  echo "Usage: $0 <platform-release.tar.gz> [--local] [--skip-smoke]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL_MODE=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    -h | --help) usage ;;
    *)
      if [[ -z "$TARBALL" ]]; then
        TARBALL="$1"
      else
        echo "Unknown argument: $1" >&2
        usage
      fi
      ;;
  esac
  shift
done

[[ -n "$TARBALL" && -f "$TARBALL" ]] || usage

if [[ "${PLATFORM_CUTOVER:-0}" == "1" ]]; then
  echo "Refusing deploy with PLATFORM_CUTOVER=1. Use cutover-platform-release.sh after staging." >&2
  exit 1
fi

mapfile -t _tar_entries < <(tar -tzf "$TARBALL")
VERSION="${_tar_entries[0]%%/*}"
[[ -n "$VERSION" ]] || { echo "Could not detect release version from tarball" >&2; exit 1; }

TARGET="$RELEASES_DIR/$VERSION"
if [[ -d "$TARGET" ]]; then
  echo "Release already present: $TARGET"
else
  install -d -m 755 "$RELEASES_DIR"
  tar -xzf "$TARBALL" -C "$RELEASES_DIR"
fi

[[ -f "$TARGET/manifest.json" ]] || { echo "Invalid release (missing manifest.json): $TARGET" >&2; exit 1; }

install -d -m 700 "$DATA_DIR" "$BACKUP_DIR" "$APP_ROOT/staging"
if [[ -f "$DATA_DIR/finance-api.db" ]]; then
  backup_name="finance-api-$(date -u +%Y%m%dT%H%M%SZ).db"
  cp -a "$DATA_DIR/finance-api.db" "$BACKUP_DIR/$backup_name"
  chmod 600 "$BACKUP_DIR/$backup_name"
fi

if [[ -L "$STAGING_LINK" ]]; then
  current_target="$(readlink -f "$STAGING_LINK")"
  ln -sfn "$current_target" "$PREVIOUS_LINK"
fi

ln -sfn "$TARGET" "$STAGING_LINK"

if [[ $LOCAL_MODE -eq 0 ]]; then
  if ! id analytics >/dev/null 2>&1; then
    useradd --system --home-dir "$APP_ROOT" --shell /usr/sbin/nologin analytics
  fi
  chown -R analytics:analytics "$TARGET" "$DATA_DIR" "$BACKUP_DIR"
  chown -h analytics:analytics "$STAGING_LINK" "$PREVIOUS_LINK" 2>/dev/null || true

  service_src="$ROOT/deploy/blue-green/finance-api.service"
  [[ -f "$service_src" ]] || service_src="deploy/blue-green/finance-api.service"
  if [[ -f "$service_src" ]]; then
    install -m 644 "$service_src" "/etc/systemd/system/$SERVICE_NAME.service"
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
    systemctl restart "$SERVICE_NAME"
  fi

  loopback_src="$TARGET/nginx/nginx-loopback-staging.conf"
  if [[ -f "$loopback_src" && -d /etc/nginx/sites-available ]] && command -v nginx >/dev/null; then
    install -m 644 "$loopback_src" /etc/nginx/sites-available/analytics-platform-loopback
    ln -sf /etc/nginx/sites-available/analytics-platform-loopback \
      /etc/nginx/sites-enabled/analytics-platform-loopback
    if nginx -t >/dev/null 2>&1; then
      systemctl reload nginx
      echo "Loopback platform preview enabled on 127.0.0.1:9080-9083"
    else
      rm -f /etc/nginx/sites-enabled/analytics-platform-loopback
      echo "Loopback nginx config failed validation; public vhost unchanged" >&2
    fi
  fi
fi

if [[ $SKIP_SMOKE -eq 0 ]]; then
  PLATFORM_APP_ROOT="$APP_ROOT" PLATFORM_SMOKE_LOCAL="$LOCAL_MODE" \
    bash "$ROOT/scripts/smoke-platform-release.sh"
fi

echo "Staged release $VERSION at $TARGET (public Next vhost unchanged)"
