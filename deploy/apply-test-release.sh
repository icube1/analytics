#!/usr/bin/env bash
# Apply a Next.js standalone tarball to the test slot. Run as one SSH command:
# appleboy/ssh-action script_stop injects shell between inline script lines.
set -euo pipefail

APP_DIR=/opt/analytics-test
RELEASE_DIR=/tmp/analytics-test-deploy
AUTH_ENV=/etc/analytics-auth.env
TEST_ENV=/etc/analytics-test.env
CERT=/etc/letsencrypt/live/test.gala-soft.ru/fullchain.pem

export TEST_REF="${TEST_REF:-unknown}"
export TEST_SHA="${TEST_SHA:-}"

fail() {
  echo "Test deploy failed: $*" >&2
  journalctl -u analytics-test -n 80 --no-pager || true
  systemctl status analytics-test --no-pager || true
  exit 1
}

echo "Applying test release ref=${TEST_REF} sha=${TEST_SHA}"

install -d /var/www/html
if ! id analytics >/dev/null 2>&1; then
  useradd --system --home-dir /opt/analytics --shell /usr/sbin/nologin analytics
fi
install -d -o analytics -g analytics -m 700 \
  "$APP_DIR/data" "$APP_DIR/data/backups" "$APP_DIR/statements"

[[ -f "$RELEASE_DIR/deploy.tar.gz" ]] || fail "missing $RELEASE_DIR/deploy.tar.gz"
tar -xzf "$RELEASE_DIR/deploy.tar.gz" -C "$APP_DIR"
[[ -f "$APP_DIR/server.js" ]] || fail "standalone tarball has no server.js"

python3 -c 'import json,os,datetime; json.dump({"env":"test","ref":os.environ.get("TEST_REF") or "unknown","sha":os.environ.get("TEST_SHA") or "","deployedAt":datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")}, open("/opt/analytics-test/deploy-meta.json","w"), ensure_ascii=False)'
chown -R analytics:analytics "$APP_DIR"

install -m 644 "$RELEASE_DIR/deploy/analytics-test.service" /etc/systemd/system/analytics-test.service

umask 077
if [[ ! -s "$AUTH_ENV" ]]; then
  {
    printf 'ANALYTICS_AUTH_USER=owner\n'
    printf 'ANALYTICS_AUTH_PASSWORD=%s\n' "$(openssl rand -base64 24 | tr -d '\n')"
    printf 'ANALYTICS_SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'ANALYTICS_AUTH_DISPLAY_NAME=%s\n' 'Администратор'
    printf 'ANALYTICS_ADMIN_LOGIN=admin\n'
  } >"$AUTH_ENV"
  chmod 600 "$AUTH_ENV"
fi

if [[ -f "$CERT" ]]; then
  printf 'ANALYTICS_SESSION_COOKIE_SECURE=1\n' >"$TEST_ENV"
  NGINX_CONF="$RELEASE_DIR/deploy/nginx-analytics-test.conf"
else
  printf 'ANALYTICS_SESSION_COOKIE_SECURE=0\n' >"$TEST_ENV"
  NGINX_CONF="$RELEASE_DIR/deploy/nginx-analytics-test.http.conf"
fi
chmod 600 "$TEST_ENV"

systemctl daemon-reload
systemctl enable analytics-test
systemctl restart analytics-test || fail "systemctl restart analytics-test"

install -m 644 "$NGINX_CONF" /etc/nginx/sites-available/analytics-test
ln -sf /etc/nginx/sites-available/analytics-test /etc/nginx/sites-enabled/analytics-test
nginx -t || fail "nginx -t"
systemctl reload nginx

if getent ahostsv4 test.gala-soft.ru 2>/dev/null | awk '{print $1}' | grep -qx '5.253.30.126'; then
  if [[ ! -f "$CERT" ]] && command -v certbot >/dev/null; then
    certbot certonly --webroot -w /var/www/html -d test.gala-soft.ru \
      --non-interactive --agree-tos --keep-until-expiring \
      --register-unsafely-without-email || true
    if [[ -f "$CERT" ]]; then
      printf 'ANALYTICS_SESSION_COOKIE_SECURE=1\n' >"$TEST_ENV"
      chmod 600 "$TEST_ENV"
      install -m 644 "$RELEASE_DIR/deploy/nginx-analytics-test.conf" \
        /etc/nginx/sites-available/analytics-test
      nginx -t && systemctl reload nginx
      systemctl restart analytics-test || fail "restart after cert"
    fi
  fi
fi

login_ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null http://127.0.0.1:3001/login; then
    login_ok=1
    break
  fi
  sleep 1
done
[[ "$login_ok" -eq 1 ]] || fail "GET http://127.0.0.1:3001/login"

echo "Test deploy OK ref=${TEST_REF} sha=${TEST_SHA}"
