#!/usr/bin/env bash
# Stage the Vite/Astro/Axum platform release on the VPS without public cutover.
set -euo pipefail

if [[ "${PLATFORM_CUTOVER:-0}" == "1" ]]; then
  echo "Refusing automated stage when PLATFORM_CUTOVER=1" >&2
  exit 1
fi

DEPLOY_ROOT=/tmp/analytics-platform-deploy
TARBALL="$DEPLOY_ROOT/platform-release.tar.gz"
[[ -f "$TARBALL" ]] || {
  echo "missing $TARBALL" >&2
  exit 1
}

install -d /opt/analytics-platform
chmod +x "$DEPLOY_ROOT/scripts/"*.sh
PLATFORM_APP_ROOT=/opt/analytics-platform \
  bash "$DEPLOY_ROOT/scripts/deploy-platform-release.sh" "$TARBALL"
echo "Platform staged (Next public vhost unchanged)"
