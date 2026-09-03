#!/usr/bin/env bash
# Apply a Next.js standalone tarball to production. Run as one SSH command:
# appleboy/ssh-action script_stop injects shell between inline script lines.
set -euo pipefail

APP_DIR=/opt/analytics
RELEASE_DIR=/tmp/analytics-deploy
AUTH_ENV=/etc/analytics-auth.env
API_ENV=/etc/analytics-finance-api.env

fail() {
  echo "Production deploy failed: $*" >&2
  journalctl -u analytics -n 80 --no-pager || true
  systemctl status analytics --no-pager || true
  exit 1
}

echo "Applying production Next.js release"

if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v nginx >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
fi
if ! id analytics >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin analytics
fi

umask 077
if [[ ! -s "$AUTH_ENV" ]]; then
  {
    printf 'ANALYTICS_AUTH_USER=owner\n'
    printf 'ANALYTICS_AUTH_PASSWORD=%s\n' "$(openssl rand -base64 24 | tr -d '\n')"
    printf 'ANALYTICS_SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'ANALYTICS_AUTH_DISPLAY_NAME=%s\n' 'Администратор'
    printf 'ANALYTICS_ADMIN_LOGIN=admin\n'
  } >"$AUTH_ENV"
fi
if ! grep -q '^ANALYTICS_SESSION_SECRET=' "$AUTH_ENV"; then
  printf 'ANALYTICS_SESSION_SECRET=%s\n' "$(openssl rand -hex 32)" >>"$AUTH_ENV"
fi
if ! grep -q '^ANALYTICS_AUTH_DISPLAY_NAME=' "$AUTH_ENV"; then
  printf 'ANALYTICS_AUTH_DISPLAY_NAME=%s\n' 'Администратор' >>"$AUTH_ENV"
fi
if ! grep -q '^ANALYTICS_ADMIN_LOGIN=' "$AUTH_ENV"; then
  printf 'ANALYTICS_ADMIN_LOGIN=admin\n' >>"$AUTH_ENV"
fi
chmod 600 "$AUTH_ENV"

if [[ -f /etc/nginx/.htpasswd-analytics ]]; then
  chown root:www-data /etc/nginx/.htpasswd-analytics || true
  chmod 640 /etc/nginx/.htpasswd-analytics
fi

if [[ ! -s "$API_ENV" ]]; then
  ANALYTICS_AUTH_PASSWORD="$(
    python3 -c 'from pathlib import Path; vals={k.strip():v.strip().strip(chr(39)+chr(34)) for k,_,v in (line.partition("=") for raw in Path("/etc/analytics-auth.env").read_text(encoding="utf-8").splitlines() for line in [raw.strip()] if line and not line.startswith("#") and "=" in line)}; print(vals["ANALYTICS_AUTH_PASSWORD"])'
  )"
  {
    printf '%s\n' "FINANCE_API_BOOTSTRAP_EMAIL=admin@gala-soft.ru"
    printf '%s\n' "FINANCE_API_BOOTSTRAP_PASSWORD=$ANALYTICS_AUTH_PASSWORD"
    printf '%s\n' "FINANCE_API_BOOTSTRAP_DISPLAY_NAME=Администратор"
    printf '%s\n' "FINANCE_API_BOOTSTRAP_HOUSEHOLD_NAME=Household"
  } >"$API_ENV"
  chmod 600 "$API_ENV"
  unset ANALYTICS_AUTH_PASSWORD
fi

install -d -o analytics -g analytics -m 700 \
  "$APP_DIR/data" "$APP_DIR/data/backups" "$APP_DIR/statements"
[[ -f "$RELEASE_DIR/deploy.tar.gz" ]] || fail "missing $RELEASE_DIR/deploy.tar.gz"
tar -xzf "$RELEASE_DIR/deploy.tar.gz" -C "$APP_DIR"
[[ -f "$APP_DIR/server.js" ]] || fail "standalone tarball has no server.js"
chown -R analytics:analytics "$APP_DIR"

install -m 644 "$RELEASE_DIR/deploy/analytics.service" /etc/systemd/system/analytics.service
systemctl daemon-reload
systemctl enable analytics
systemctl restart analytics || fail "systemctl restart analytics"

install -m 644 "$RELEASE_DIR/deploy/nginx-analytics.conf" /etc/nginx/sites-available/analytics
ln -sf /etc/nginx/sites-available/analytics /etc/nginx/sites-enabled/analytics
rm -f /etc/nginx/sites-enabled/default
nginx -t || fail "nginx -t"
systemctl enable nginx
systemctl reload nginx

login_page_ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/login; then
    login_page_ok=1
    break
  fi
  sleep 1
done
[[ "$login_page_ok" -eq 1 ]] || fail "GET http://127.0.0.1:3000/login"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT
# One physical line: appleboy/ssh-action script_stop injects shell between lines.
LOGIN_JSON="$(python3 -c 'from pathlib import Path; import json; vals={k.strip():v.strip().strip(chr(39)+chr(34)) for k,_,v in (line.partition("=") for raw in Path("/etc/analytics-auth.env").read_text(encoding="utf-8").splitlines() for line in [raw.strip()] if line and not line.startswith("#") and "=" in line)}; print(json.dumps({"login": vals.get("ANALYTICS_ADMIN_LOGIN") or "admin", "password": vals["ANALYTICS_AUTH_PASSWORD"]}))')"

login_ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -c "$COOKIE_JAR" -H 'Content-Type: application/json' \
    -d "$LOGIN_JSON" http://127.0.0.1:3000/api/auth/login >/dev/null; then
    login_ok=1
    break
  fi
  sleep 1
done
[[ "$login_ok" -eq 1 ]] || fail "POST http://127.0.0.1:3000/api/auth/login"

if ! curl -fsS -b "$COOKIE_JAR" -o /dev/null http://127.0.0.1:3000/; then
  fail "GET http://127.0.0.1:3000/ after login"
fi

echo "Production deploy OK"
