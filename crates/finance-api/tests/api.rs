mod support;

use axum::http::StatusCode;
use axum_test::TestServer;
use finance_api::{build_app, AppState};
use serde_json::json;
use support::TestHarness;
use uuid::Uuid;

#[tokio::test]
async fn health_endpoint_reports_database_ok() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();

    let response = server.get("/health").await;
    response.assert_status_ok();
    response.assert_json(&json!({
        "status": "ok",
        "database": "ok"
    }));
}

#[tokio::test]
async fn portfolio_sync_roundtrip_and_idempotency() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();

    let get = server
        .get("/api/v1/portfolio")
        .add_header("x-user-id", harness.user_a.to_string())
        .add_header("x-household-id", harness.household_a.to_string())
        .await;
    get.assert_status_ok();
    let initial = get.json::<serde_json::Value>();
    assert_eq!(initial["revision"], 0);

    let put = server
        .put("/api/v1/portfolio")
        .add_header("x-user-id", harness.user_a.to_string())
        .add_header("x-household-id", harness.household_a.to_string())
        .add_header("idempotency-key", "sync-1")
        .json(&json!({
            "schemaVersion": 1,
            "baseRevision": 0,
            "document": { "version": 1, "customAssets": { "items": [] } }
        }))
        .await;
    put.assert_status_ok();
    assert_eq!(put.json::<serde_json::Value>()["revision"], 1);

    let replay = server
        .put("/api/v1/portfolio")
        .add_header("x-user-id", harness.user_a.to_string())
        .add_header("x-household-id", harness.household_a.to_string())
        .add_header("idempotency-key", "sync-1")
        .json(&json!({
            "schemaVersion": 1,
            "baseRevision": 99,
            "document": { "version": 1, "should": "not apply" }
        }))
        .await;
    replay.assert_status_ok();
    assert_eq!(replay.json::<serde_json::Value>()["revision"], 1);
}

#[tokio::test]
async fn revision_conflict_returns_409() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();

    server
        .put("/api/v1/portfolio")
        .add_header("x-user-id", harness.user_a.to_string())
        .add_header("x-household-id", harness.household_a.to_string())
        .json(&json!({
            "schemaVersion": 1,
            "baseRevision": 0,
            "document": { "version": 1 }
        }))
        .await
        .assert_status_ok();

    let conflict = server
        .put("/api/v1/portfolio")
        .add_header("x-user-id", harness.user_a.to_string())
        .add_header("x-household-id", harness.household_a.to_string())
        .json(&json!({
            "schemaVersion": 1,
            "baseRevision": 0,
            "document": { "version": 1, "stale": true }
        }))
        .await;
    conflict.assert_status(StatusCode::CONFLICT);
}

#[tokio::test]
async fn tenant_isolation_rejects_cross_household_access() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();

    server
        .put("/api/v1/portfolio")
        .add_header("x-user-id", harness.user_a.to_string())
        .add_header("x-household-id", harness.household_a.to_string())
        .json(&json!({
            "schemaVersion": 1,
            "baseRevision": 0,
            "document": { "version": 1, "tenant": "a" }
        }))
        .await
        .assert_status_ok();

    let cross_user = server
        .get("/api/v1/portfolio")
        .add_header("x-user-id", harness.user_b.to_string())
        .add_header("x-household-id", harness.household_a.to_string())
        .await;
    cross_user.assert_status(StatusCode::FORBIDDEN);

    let cross_household = server
        .get("/api/v1/portfolio")
        .add_header("x-user-id", harness.user_a.to_string())
        .add_header("x-household-id", harness.household_b.to_string())
        .await;
    cross_household.assert_status(StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn repository_negative_isolation_blocks_foreign_household_rows() {
    let harness = TestHarness::new().await;
    let pool = harness.state.pool().clone();

    let portfolio = finance_api::repositories::PortfolioRepository::new(pool.clone());
    let scope_a = finance_api::auth::TenantScope {
        household_id: harness.household_a,
    };
    let scope_b = finance_api::auth::TenantScope {
        household_id: harness.household_b,
    };

    portfolio.ensure_document(scope_a).await.unwrap();
    portfolio
        .upsert_revision(scope_a, 0, r#"{"tenant":"a"}"#, None)
        .await
        .unwrap();

    assert!(portfolio.get_head(scope_b).await.is_err());

    let foreign_revision = portfolio.get_latest_revision(scope_b).await.unwrap();
    assert!(foreign_revision.is_none());

    let device_repo = finance_api::repositories::DeviceRepository::new(pool);
    let device = device_repo
        .register(scope_a, harness.user_a, "phone")
        .await
        .unwrap();
    assert!(device_repo.get(scope_b, device.id).await.is_err());
}

#[tokio::test]
async fn oversized_content_length_is_rejected() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();

    let response = server
        .put("/api/v1/portfolio")
        .add_header("x-user-id", harness.user_a.to_string())
        .add_header("x-household-id", harness.household_a.to_string())
        .add_header("content-length", "2000000")
        .json(&json!({
            "schemaVersion": 1,
            "baseRevision": 0,
            "document": { "version": 1 }
        }))
        .await;
    response.assert_status(StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn production_auth_fails_closed_without_credentials() {
    let harness = TestHarness::new().await;
    let mut config = harness.state.config().clone();
    config.environment = finance_api::config::Environment::Production;
    config.auth_user = None;
    config.auth_password = None;
    let state = AppState::new(harness.state.pool().clone(), config);

    let server = TestServer::new(build_app(state)).unwrap();
    let response = server
        .get("/api/v1/portfolio")
        .add_header("x-user-id", Uuid::new_v4().to_string())
        .add_header("x-household-id", Uuid::new_v4().to_string())
        .await;
    response.assert_status(StatusCode::SERVICE_UNAVAILABLE);
}
