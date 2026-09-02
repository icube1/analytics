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

## Windows: редирект на Google

На сервере порт **443** занят VPN (Amnezia Xray). Chrome на Windows с «Всегда использовать HTTPS» апгрейдит `http://IP` → `https://IP:443` → редирект на Google.

**Решения:**

1. Открывать **http://5.253.30.126:8080** (сайт слушает и 80, и 8080)
2. Chrome → Настройки → Безопасность → выключить «Всегда используйте защищённые подключения»
3. Долгосрочно: домен + отдельный порт/конфиг для веба, не трогая VPN на 443

- Приложение: `/opt/analytics` (`node server.js`)
- Данные: `/opt/analytics/data/`, `/opt/analytics/statements/` (не затираются при деплое)
- URL: http://5.253.30.126/ (на Windows с HTTPS-First лучше http://5.253.30.126:8080 — см. ниже)
