use chrono::{TimeZone, Utc};
use finance_api::auth::TenantScope;
use finance_api::billing::yookassa::{YooKassaBillingProvider, YooKassaConfig};
use finance_api::billing::{BillingProvider, BillingService, CheckoutRequest, WebhookEnvelope};
use finance_api::repositories::{BillingRepository, HouseholdRepository};
use serde_json::json;
use uuid::Uuid;
use wiremock::matchers::{method, path, path_regex};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn yookassa_config(base_url: &str) -> YooKassaConfig {
    YooKassaConfig {
        enabled: true,
        shop_id: Some("100001".to_owned()),
        secret_key: Some("test_secret_key".to_owned()),
        api_base_url: base_url.to_owned(),
        ..YooKassaConfig::default()
    }
}

#[tokio::test]
async fn yookassa_create_checkout_returns_confirmation_url() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/payments"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "pay-123",
            "status": "pending",
            "paid": false,
            "amount": { "value": "199.00", "currency": "RUB" },
            "metadata": {},
            "confirmation": {
                "confirmation_url": "https://yoomoney.ru/checkout/pay-123"
            }
        })))
        .mount(&server)
        .await;

    let provider = YooKassaBillingProvider::new(yookassa_config(&server.uri())).unwrap();
    let session = provider
        .create_checkout_payment(
            TenantScope {
                household_id: Uuid::new_v4(),
            },
            &CheckoutRequest {
                subscription_id: Uuid::new_v4(),
                plan_id: "pro".to_owned(),
                amount_value: "199.00".to_owned(),
                currency: "RUB".to_owned(),
                return_url: "https://example.com/billing/return".to_owned(),
                description: Some("Pro plan".to_owned()),
                feature_key: Some("resilience.compute".to_owned()),
                grant_days: Some(30),
            },
            "idem-checkout-1",
        )
        .await
        .unwrap();

    assert_eq!(session.payment_id, "pay-123");
    assert_eq!(
        session.confirmation_url,
        "https://yoomoney.ru/checkout/pay-123"
    );
}

#[tokio::test]
async fn yookassa_webhook_refetches_payment_before_ingest() {
    let server = MockServer::start().await;
    let household_id = Uuid::new_v4();
    let subscription_id = Uuid::new_v4();
    let metadata = json!({
        "household_id": household_id.to_string(),
        "subscription_id": subscription_id.to_string(),
        "plan_id": "pro",
        "feature_key": "resilience.compute",
        "grant_days": 30
    });

    Mock::given(method("GET"))
        .and(path("/payments/pay-456"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "pay-456",
            "status": "succeeded",
            "paid": true,
            "amount": { "value": "199.00", "currency": "RUB" },
            "metadata": metadata,
            "created_at": "2026-01-01T00:00:00Z",
            "captured_at": "2026-01-01T00:00:05Z"
        })))
        .mount(&server)
        .await;

    let provider = YooKassaBillingProvider::new(yookassa_config(&server.uri())).unwrap();
    let notification = json!({
        "type": "notification",
        "event": "payment.succeeded",
        "object": { "id": "pay-456" }
    });
    let envelope = provider
        .verify_webhook(notification.to_string().as_bytes(), None)
        .await
        .unwrap();

    assert_eq!(envelope.provider, "yookassa");
    assert_eq!(envelope.event_type, "subscription.activated");
    assert_eq!(envelope.subscription_status.as_deref(), Some("active"));
    assert_eq!(
        envelope.idempotency_key.as_deref(),
        Some("yookassa:payment.succeeded:pay-456")
    );
}

#[tokio::test]
async fn yookassa_refund_webhook_revokes_entitlement() {
    let server = MockServer::start().await;
    let household_id = Uuid::new_v4();
    let subscription_id = Uuid::new_v4();
    let metadata = json!({
        "household_id": household_id.to_string(),
        "subscription_id": subscription_id.to_string(),
        "plan_id": "pro",
        "feature_key": "resilience.compute",
        "grant_days": 30
    });

    Mock::given(method("GET"))
        .and(path("/refunds/ref-1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "ref-1",
            "status": "succeeded",
            "payment_id": "pay-789",
            "created_at": "2026-01-02T00:00:00Z"
        })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/payments/pay-789"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "pay-789",
            "status": "succeeded",
            "paid": true,
            "amount": { "value": "199.00", "currency": "RUB" },
            "metadata": metadata
        })))
        .mount(&server)
        .await;

    let provider = YooKassaBillingProvider::new(yookassa_config(&server.uri())).unwrap();
    let notification = json!({
        "type": "notification",
        "event": "refund.succeeded",
        "object": { "id": "ref-1" }
    });
    let envelope = provider
        .verify_webhook(notification.to_string().as_bytes(), None)
        .await
        .unwrap();

    assert_eq!(envelope.event_type, "subscription.refunded");
    assert_eq!(envelope.subscription_status.as_deref(), Some("cancelled"));
}

#[tokio::test]
async fn billing_webhook_idempotency_is_stable_across_replays() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("billing.db");
    let config = finance_api::config::Config {
        bind_addr: "127.0.0.1:0".to_owned(),
        database_url: format!("sqlite://{}?mode=rwc", db_path.display()),
        environment: finance_api::config::Environment::Development,
        auth_user: None,
        auth_password: None,
        bootstrap_email: None,
        bootstrap_password: None,
        bootstrap_display_name: None,
        bootstrap_household_name: None,
        billing_webhook_secret: None,
        yookassa: YooKassaConfig::default(),
        session_ttl: chrono::Duration::hours(1),
        session_cookie_secure: false,
        max_request_bytes: 1024 * 1024,
        db_max_connections: 2,
        db_acquire_timeout: std::time::Duration::from_secs(5),
        worker_concurrency: 1,
        job_timeout: chrono::Duration::seconds(30),
        max_pending_jobs_per_household: 4,
        idempotency_ttl: std::time::Duration::from_secs(3600),
    };
    let pool = finance_api::db::connect(&config).await.unwrap();
    let billing = BillingService::test(pool.clone(), "unused");

    let household_id = HouseholdRepository::new(pool)
        .create("Test household")
        .await
        .unwrap()
        .id;
    let envelope = WebhookEnvelope {
        provider: "test".to_owned(),
        event_type: "entitlement.granted".to_owned(),
        household_id,
        payload: json!({}),
        idempotency_key: Some("evt-dup".to_owned()),
        event_time: Some(
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0)
                .unwrap()
                .to_rfc3339(),
        ),
        subscription_id: None,
        plan_id: None,
        subscription_status: None,
        feature_key: Some("resilience.compute".to_owned()),
        granted_until: None,
    };

    let first = billing.apply_envelope(envelope.clone()).await.unwrap();
    let second = billing.apply_envelope(envelope).await.unwrap();
    assert_eq!(first, second);
}

#[tokio::test]
async fn yookassa_reconcile_updates_stale_subscription() {
    let server = MockServer::start().await;
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("billing.db");
    let config = finance_api::config::Config {
        bind_addr: "127.0.0.1:0".to_owned(),
        database_url: format!("sqlite://{}?mode=rwc", db_path.display()),
        environment: finance_api::config::Environment::Development,
        auth_user: None,
        auth_password: None,
        bootstrap_email: None,
        bootstrap_password: None,
        bootstrap_display_name: None,
        bootstrap_household_name: None,
        billing_webhook_secret: None,
        yookassa: yookassa_config(&server.uri()),
        session_ttl: chrono::Duration::hours(1),
        session_cookie_secure: false,
        max_request_bytes: 1024 * 1024,
        db_max_connections: 2,
        db_acquire_timeout: std::time::Duration::from_secs(5),
        worker_concurrency: 1,
        job_timeout: chrono::Duration::seconds(30),
        max_pending_jobs_per_household: 4,
        idempotency_ttl: std::time::Duration::from_secs(3600),
    };
    let pool = finance_api::db::connect(&config).await.unwrap();
    let household_id = HouseholdRepository::new(pool.clone())
        .create("Test household")
        .await
        .unwrap()
        .id;
    let subscription_id = Uuid::new_v4();
    let repo = BillingRepository::new(pool.clone());
    repo.upsert_subscription(
        TenantScope { household_id },
        subscription_id,
        "pro",
        "trialing",
        Some("yookassa"),
        Some("pay-rec"),
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
    )
    .await
    .unwrap();

    Mock::given(method("GET"))
        .and(path_regex(r"/payments/pay-rec"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "pay-rec",
            "status": "succeeded",
            "paid": true,
            "amount": { "value": "199.00", "currency": "RUB" },
            "metadata": {
                "household_id": household_id.to_string(),
                "subscription_id": subscription_id.to_string(),
                "plan_id": "pro",
                "feature_key": "resilience.compute",
                "grant_days": 30
            },
            "captured_at": "2026-01-01T00:00:05Z"
        })))
        .mount(&server)
        .await;

    let billing = finance_api::billing::build_billing_service(pool, &config).unwrap();
    let report = billing.reconcile().await.unwrap();
    assert_eq!(report.checked, 1);
    assert_eq!(report.updated, 1);

    let updated = repo
        .get_subscription(TenantScope { household_id }, subscription_id)
        .await
        .unwrap();
    assert_eq!(updated.status, "active");
}
