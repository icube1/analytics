# Деплой на VPS через GitHub Actions

Сборка и тесты идут на GitHub, на сервер попадает только готовый standalone-бандл (~50–150 MB).

## 1. SSH-ключ для деплоя

На ноутбуке:

```bash
ssh-keygen -t ed25519 -C "github-deploy-analytics" -f ~/.ssh/analytics_deploy -N ""
```

Публичный ключ — на сервер:

```bash
ssh-copy-id -i ~/.ssh/analytics_deploy.pub root@5.253.30.126
```

Приватный ключ — в GitHub Secrets (см. ниже).

## 2. Secrets в репозитории

GitHub → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Значение |
|--------|----------|
| `DEPLOY_HOST` | `5.253.30.126` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | содержимое файла `~/.ssh/analytics_deploy` (весь приватный ключ) |

## 3. Автодеплой

При каждом push в `master` workflow `.github/workflows/deploy.yml`:

1. `npm ci` + тесты + `next build`
2. упаковка standalone в `deploy.tar.gz`
3. загрузка на VPS и распаковка в `/opt/analytics`
4. перезапуск `analytics.service` и nginx

Ручной запуск: Actions → Deploy → Run workflow.

## 4. Локальная сборка (без GitHub)

```bash
npm run build:standalone
tar -czf deploy.tar.gz -C .next/standalone .
scp deploy.tar.gz root@5.253.30.126:/tmp/
ssh root@5.253.30.126 'mkdir -p /opt/analytics/data/backups /opt/analytics/statements && tar -xzf /tmp/deploy.tar.gz -C /opt/analytics && systemctl restart analytics'
```

## 5. Доступ и авторизация

Production доступен по адресу **https://gala-soft.ru**. Nginx использует HTTP/2
и TLS 1.2 для совместимости с российскими сетями.

Вход — форма `/login` и httpOnly cookie сессии администратора.
Системное окно HTTP Basic браузера больше не используется.

При первом деплое workflow создаёт `/etc/analytics-auth.env`:

- `ANALYTICS_AUTH_USER` / `ANALYTICS_AUTH_PASSWORD` — админский аккаунт;
- `ANALYTICS_SESSION_SECRET` — подпись cookie;
- `ANALYTICS_AUTH_DISPLAY_NAME` — подпись в интерфейсе.

Файл доступен только `root`. Посмотреть credentials:

```bash
sudo cat /etc/analytics-auth.env
```

Логины-алиасы того же админа: `owner`, `admin`, `admin@gala-soft.ru`.
Machine clients (deploy smoke, curl) по-прежнему могут слать `Authorization: Basic`.

Приложение:

- runtime: `/opt/analytics` (`node server.js`);
- данные: `/opt/analytics/data/`, `/opt/analytics/statements/`;
- system user: `analytics`;
- Node слушает только `127.0.0.1:3000`;
- внешний HTTP перенаправляется на HTTPS;
- открытый fallback на `8080` отключён.
