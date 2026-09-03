mod support;

use axum::http::StatusCode;
use axum_test::TestServer;
use hmac::{Hmac, Mac};
use serde_json::json;
use sha2::Sha256;
use support::TestHarness;

#[tokio::test]
async fn health_endpoint_reports_database_ok() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    server.get("/health").await.assert_status_ok();
}

#[tokio::test]
async fn login_me_logout_roundtrip() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let login = server
        .post("/api/v1/auth/login")
        .json(&json!({
            "email": harness.email_a,
            "password": harness.password_a,
            "clientKind": "mobile"
        }))
        .await;
    login.assert_status_ok();
    let body = login.json::<serde_json::Value>();
    let token = body["bearerToken"].as_str().unwrap().to_owned();
    server
        .get("/api/v1/auth/me")
        .add_header("Authorization", format!("Bearer {token}"))
        .await
        .assert_status_ok();
    server
        .post("/api/v1/auth/logout")
        .add_header("Authorization", format!("Bearer {token}"))
        .await
        .assert_status_ok();
    server
        .get("/api/v1/auth/me")
        .add_header("Authorization", format!("Bearer {token}"))
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn portfolio_sync_roundtrip_and_idempotency() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token = harness
        .login_bearer(&harness.email_a, &harness.password_a)
        .await;
    server
        .get("/api/v1/portfolio")
        .add_header("Authorization", format!("Bearer {token}"))
        .await
        .assert_status_ok();
    server
        .put("/api/v1/portfolio")
        .add_header("Authorization", format!("Bearer {token}"))
        .add_header("idempotency-key", "sync-1")
        .json(&json!({ "schemaVersion": 1, "baseRevision": 0, "document": { "version": 1 } }))
        .await
        .assert_status_ok();
}

#[tokio::test]
async fn tenant_isolation_rejects_cross_household_login() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    server
        .post("/api/v1/auth/login")
        .json(&json!({
            "email": harness.email_b,
            "password": harness.password_b,
            "householdId": harness.household_a,
            "clientKind": "mobile"
        }))
        .await
        .assert_status(StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn missing_session_is_unauthorized() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    server
        .get("/api/v1/portfolio")
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn invalid_password_is_unauthorized() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    server
        .post("/api/v1/auth/login")
        .json(&json!({ "email": harness.email_a, "password": "wrong" }))
        .await
        .assert_status(StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn resilience_job_requires_entitlement() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token = harness
        .login_bearer(&harness.email_b, &harness.password_b)
        .await;
    server
        .post("/api/v1/jobs")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&sample_resilience_payload())
        .await
        .assert_status(StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn resilience_job_completes_with_entitlement() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token = harness
        .login_bearer(&harness.email_a, &harness.password_a)
        .await;
    let create = server
        .post("/api/v1/jobs")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&sample_resilience_payload())
        .await;
    create.assert_status(StatusCode::ACCEPTED);
    let job_id = create.json::<serde_json::Value>()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    for _ in 0..40 {
        let path = format!("/api/v1/jobs/{job_id}");
        let status = server
            .get(&path)
            .add_header("Authorization", format!("Bearer {token}"))
            .await;
        status.assert_status_ok();
        if status.json::<serde_json::Value>()["status"] == "completed" {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    panic!("job did not complete in time");
}

#[tokio::test]
async fn billing_webhook_grants_entitlement() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let envelope = json!({
        "provider": "test",
        "eventType": "entitlement.granted",
        "householdId": harness.household_b,
        "payload": {},
        "idempotencyKey": "evt-1",
        "featureKey": "resilience.compute"
    });
    let body = serde_json::to_vec(&envelope).unwrap();
    let signature = sign_webhook(&body, "test-webhook-secret");
    server
        .post("/api/v1/billing/webhook")
        .add_header("x-test-signature", signature)
        .bytes(body.into())
        .await
        .assert_status(StatusCode::ACCEPTED);
    let token = harness
        .login_bearer(&harness.email_b, &harness.password_b)
        .await;
    server
        .post("/api/v1/jobs")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&sample_resilience_payload())
        .await
        .assert_status(StatusCode::ACCEPTED);
}

#[tokio::test]
async fn finance_evaluate_compound_does_not_need_heavy_entitlement() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token = harness
        .login_bearer(&harness.email_b, &harness.password_b)
        .await;
    let create = server
        .post("/api/v1/jobs")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&sample_finance_compound_payload())
        .await;
    create.assert_status(StatusCode::ACCEPTED);
    assert_eq!(create.json::<serde_json::Value>()["cacheHit"], false);
    let job_id = create.json::<serde_json::Value>()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    wait_for_job(&server, &token, &job_id).await;

    let cached = server
        .post("/api/v1/jobs")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&sample_finance_compound_payload())
        .await;
    cached.assert_status(StatusCode::ACCEPTED);
    assert_eq!(cached.json::<serde_json::Value>()["cacheHit"], true);
    assert_eq!(cached.json::<serde_json::Value>()["status"], "completed");
}

#[tokio::test]
async fn finance_evaluate_monte_carlo_requires_heavy_entitlement() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token_b = harness
        .login_bearer(&harness.email_b, &harness.password_b)
        .await;
    server
        .post("/api/v1/jobs")
        .add_header("Authorization", format!("Bearer {token_b}"))
        .json(&sample_finance_monte_carlo_payload())
        .await
        .assert_status(StatusCode::FORBIDDEN);

    let token_a = harness
        .login_bearer(&harness.email_a, &harness.password_a)
        .await;
    let create = server
        .post("/api/v1/jobs")
        .add_header("Authorization", format!("Bearer {token_a}"))
        .json(&sample_finance_monte_carlo_payload())
        .await;
    create.assert_status(StatusCode::ACCEPTED);
    let job_id = create.json::<serde_json::Value>()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    wait_for_job(&server, &token_a, &job_id).await;
}

async fn wait_for_job(server: &TestServer, token: &str, job_id: &str) {
    for _ in 0..40 {
        let path = format!("/api/v1/jobs/{job_id}");
        let status = server
            .get(&path)
            .add_header("Authorization", format!("Bearer {token}"))
            .await;
        status.assert_status_ok();
        if status.json::<serde_json::Value>()["status"] == "completed" {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    panic!("job {job_id} did not complete in time");
}

fn sample_finance_compound_payload() -> serde_json::Value {
    json!({
        "kind": "finance.evaluate",
        "payload": {
            "schemaVersion": 1,
            "cases": [{
                "operation": "compoundProjection",
                "id": "job-compound",
                "params": sample_compound_params(),
                "options": { "asOf": "2026-01-15", "allMonths": false }
            }]
        }
    })
}

fn sample_finance_monte_carlo_payload() -> serde_json::Value {
    json!({
        "kind": "finance.evaluate",
        "payload": {
            "schemaVersion": 1,
            "cases": [{
                "operation": "monteCarlo",
                "id": "job-mc",
                "params": sample_compound_params(),
                "options": {
                    "simulations": 8,
                    "volatilityPercent": 10,
                    "seed": 3,
                    "asOf": "2026-01-15"
                }
            }]
        }
    })
}

fn sample_compound_params() -> serde_json::Value {
    json!({
        "initialCapital": 100_000,
        "monthlyContribution": 10_000,
        "annualReturnPercent": 8,
        "inflationPercent": 4,
        "years": 1,
        "taxOnProfitPercent": 0,
        "contributionGrowthPercent": 0,
        "compoundFrequency": "monthly",
        "monthlyRateMethod": "effective",
        "adjustContributionsForInflation": false,
        "reinvestReturns": true,
        "withdrawAfterYears": null,
        "withdrawalMode": "fixed",
        "monthlyWithdrawal": 0,
        "annualWithdrawalPercent": 0,
        "taxDividends": false,
        "taxableAssetShare": 0.5,
        "dividendYieldPercent": 9.5,
        "reinvestFreedDebtPayments": false,
        "debtPaymentsSeparateFromContribution": false
    })
}

fn sample_resilience_payload() -> serde_json::Value {
    json!({
        "kind": "resilience.evaluate",
        "payload": {
            "mandatoryMonthlyExpenses": 1000.0,
            "discretionaryMonthlyExpenses": 100.0,
            "liquidAssets": 5000.0,
            "monthlySurplus": 200.0,
            "payCycleDays": 30.0,
            "household": {
                "incomeStability": "stable",
                "incomeSourceCount": 1,
                "hasSecondaryHouseholdIncome": false,
                "dependentCount": 0,
                "jobSearchMonths": 3,
                "insuranceCoverage": "medium",
                "riskTolerance": "moderate"
            },
            "debt": {
                "totalBalance": 0.0,
                "monthlyPayments": 0.0,
                "weightedAnnualRate": 0.0,
                "highInterestBalance": 0.0
            },
            "sinkingFunds": [],
            "experiences": { "annualTarget": 0.0, "currentAmount": 0.0 }
        }
    })
}

fn sign_webhook(body: &[u8], secret: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body);
    let bytes = mac.finalize().into_bytes();
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        let _ = write!(out, "{byte:02x}");
    }
    out
}
