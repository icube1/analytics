# YooKassa billing adapter (операционная документация)

Адаптер YooKassa в `crates/finance-api` реализует provider-neutral контракт биллинга и **по умолчанию отключён**. Продакшен не активируется без явной настройки окружения и реальных учётных данных мерчанта.

## Поддерживаемый поток

1. **Checkout** — аутентифицированный `POST /api/v1/billing/checkout` с заголовком `Idempotency-Key` создаёт платёж YooKassa (`POST /v3/payments`) с `confirmation.type=redirect` и `return_url` (только `https`).
2. **Оплата** — пользователь перенаправляется на страницу YooMoney; карточные данные обрабатываются только на стороне YooKassa (PCI DSS у провайдера).
3. **Webhook** — `POST /api/v1/billing/webhook` принимает уведомление, **не доверяя телу**: адаптер повторно запрашивает платёж/возврат через API (`GET /v3/payments/{id}` или `GET /v3/refunds/{id}`).
4. **События** — маппинг в внутренние переходы:
   - `payment.succeeded` → подписка `active`, entitlement по `feature_key` + `grant_days`
   - `payment.canceled` → `cancelled`, отзыв entitlement
   - `payment.waiting_for_capture` → `trialing` (без entitlement)
   - `refund.succeeded` → `cancelled`, отзыв entitlement
5. **Дедупликация** — `idempotency_key` вида `yookassa:{event}:{object_id}`; повтор webhook не создаёт дубликат в `billing_events`.
6. **Out-of-order** — `transition_subscription_status` игнорирует устаревшие события по `event_time`.
7. **Сверка** — периодическая команда `finance-api-migrate billing-reconcile` опрашивает API для подписок с `provider=yookassa` и `external_id`.

## Переменные окружения

| Переменная | Назначение | По умолчанию |
| --- | --- | --- |
| `FINANCE_API_YOOKASSA_ENABLED` | Явное включение адаптера | `false` |
| `FINANCE_API_YOOKASSA_SHOP_ID` | Shop ID (Basic Auth user) | — |
| `FINANCE_API_YOOKASSA_SECRET_KEY` | Secret key (Basic Auth password) | — |
| `FINANCE_API_YOOKASSA_API_BASE` | Базовый URL API | `https://api.yookassa.ru/v3` |
| `FINANCE_API_YOOKASSA_REQUEST_TIMEOUT_MS` | Таймаут HTTP | `15000` |
| `FINANCE_API_YOOKASSA_MAX_RETRIES` | Повторы 5xx/429/408 | `2` |
| `FINANCE_API_YOOKASSA_RETRY_BACKOFF_MS` | Базовая задержка повтора | `250` |

При `FINANCE_API_YOOKASSA_ENABLED=false` (или без credentials) остаются провайдеры **Null** и **Test** (`FINANCE_API_BILLING_WEBHOOK_SECRET`).

## Валидация

- `return_url` — только `https`, без credentials в URL.
- `amount` — положительное десятичное с двумя знаками после запятой; для RUB максимум `999999.99`.
- `currency` — только `RUB` (расширяемый allowlist).
- Секреты в логах HTTP-ошибок редактируются (`[REDACTED]`).

## Команды

```bash
# Периодическая сверка (требует включённый YooKassa и credentials)
cargo run -p finance-api --bin finance-api-migrate -- billing-reconcile

# Тесты контракта (mock HTTP)
cargo test -p finance-api billing_yookassa
```

Рекомендуется запускать `billing-reconcile` по cron (например, каждые 15–60 минут) и алертить на `errors` в отчёте.

## Блокеры продакшена и регуляторика

### Merchant account / YooKassa

- Договор с YooKassa (ЮKassa) и прохождение модерации магазина.
- Настройка webhook URL в личном кабинете на `https://<домен>/api/v1/billing/webhook`.
- Для РФ: соответствие 54-ФЗ (онлайн-касса / чеки) — ответственность мерчанта и настроек в ЛК YooKassa; адаптер чеки не формирует.
- Валюта расчётов — RUB; международные карты/валюты зависят от настроек магазина.

### Продуктовые / технические

- Маршрутизация продакшен-трафика на `finance-api` (сейчас authoritative — Next.js).
- Нет встроенных recurring/subscription API YooKassa — модель «подписка» эмулируется metadata + период entitlement; автопродление требует отдельного планировщика checkout.
- IP-allowlist webhook YooKassa рекомендуется на уровне reverse proxy (дополнительно к API re-fetch).
- Отсутствие реальных credentials в репозитории и CI — намеренно.

### Безопасность

- Секреты только из env; не логировать `FINANCE_API_YOOKASSA_SECRET_KEY`.
- Карточные данные не проходят через приложение.
- Webhook без HMAC — опора на authoritative API re-fetch.

## Пример checkout (тестовый контур)

```http
POST /api/v1/billing/checkout HTTP/1.1
Authorization: Bearer <token>
Idempotency-Key: checkout-household-1
Content-Type: application/json

{
  "subscriptionId": "550e8400-e29b-41d4-a716-446655440000",
  "planId": "pro",
  "amountValue": "199.00",
  "currency": "RUB",
  "returnUrl": "https://app.example.com/billing/return",
  "featureKey": "resilience.compute",
  "grantDays": 30
}
```

Ответ: `confirmationUrl` для редиректа пользователя.
