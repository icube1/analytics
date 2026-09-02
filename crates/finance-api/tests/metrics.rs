mod support;

use axum::http::StatusCode;
use axum_test::TestServer;
use finance_api::{build_app, AppState};
use serde_json::json;
use support::TestHarness;

#[tokio::test]
async fn internal_metrics_requires_auth_in_production() {
    std::env::remove_var("OBSERVABILITY_TOKEN");
    let harness = TestHarness::new().await;
    let mut config = harness.state.config().clone();
    config.environment = finance_api::config::Environment::Production;
    config.auth_user = Some("owner".to_owned());
    config.auth_password = Some("secret".to_owned());
    let state = AppState::new(harness.state.pool().clone(), config);
    let server = TestServer::new(build_app(state)).unwrap();

    server.get("/internal/metrics").await.assert_status(StatusCode::UNAUTHORIZED);
    let authorized = server
        .get("/internal/metrics")
        .add_header("authorization", "Basic b3duZXI6c2VjcmV0")
        .await;
    authorized.assert_status_ok();
    let body = authorized.json::<serde_json::Value>();
    assert_eq!(body["schema_version"], 1);
    assert_eq!(body["service"], "finance-api");
}

#[tokio::test]
async fn internal_metrics_accepts_bearer_token() {
    let harness = TestHarness::new().await;
    let mut config = harness.state.config().clone();
    config.auth_user = Some("owner".to_owned());
    config.auth_password = Some("secret".to_owned());
    let state = AppState::new(harness.state.pool().clone(), config);
    let server = TestServer::new(build_app(state)).unwrap();

    std::env::set_var("OBSERVABILITY_TOKEN", "metrics-token");
    let response = server
        .get("/internal/metrics")
        .add_header("authorization", "Bearer metrics-token")
        .await;
    std::env::remove_var("OBSERVABILITY_TOKEN");
    response.assert_status_ok();
    response.assert_json_contains(&json!({ "service": "finance-api" }));
}

#[tokio::test]
async fn internal_metrics_excludes_financial_payloads() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let response = server.get("/internal/metrics").await;
    response.assert_status_ok();
    let serialized = response.text();
    assert!(!serialized.contains("portfolio"));
    assert!(!serialized.contains("payload_json"));
}
