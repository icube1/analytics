mod support;

use std::path::PathBuf;

use axum::http::StatusCode;
use axum_test::TestServer;
use finance_api::migration::{MigrationOptions, MigrationRunner};
use serde_json::json;
use support::TestHarness;
use uuid::Uuid;

#[tokio::test]
async fn statement_import_metadata_and_content_roundtrip() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token = harness
        .login_bearer(&harness.email_a, &harness.password_a)
        .await;

    let create = server
        .post("/api/v1/statements")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&json!({
            "fileName": "sample.csv",
            "content": "date,amount\n2026-01-01,10\n"
        }))
        .await;
    create.assert_status(StatusCode::CREATED);
    let statement_id = create.json::<serde_json::Value>()["id"]
        .as_str()
        .unwrap()
        .to_owned();

    server
        .get(&format!("/api/v1/statements/{statement_id}"))
        .add_header("Authorization", format!("Bearer {token}"))
        .await
        .assert_status_ok();

    let content = server
        .get(&format!("/api/v1/statements/{statement_id}/content"))
        .add_header("Authorization", format!("Bearer {token}"))
        .await;
    content.assert_status_ok();
    assert!(content.text().contains("2026-01-01"));
}

#[tokio::test]
async fn statement_import_is_deduped_by_checksum() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token = harness
        .login_bearer(&harness.email_a, &harness.password_a)
        .await;
    let body = json!({
        "fileName": "dup.csv",
        "content": "date,amount\n2026-01-01,10\n"
    });

    let first = server
        .post("/api/v1/statements")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&body)
        .await;
    first.assert_status(StatusCode::CREATED);
    let first_id = first.json::<serde_json::Value>()["id"]
        .as_str()
        .unwrap()
        .to_owned();

    let second = server
        .post("/api/v1/statements")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&body)
        .await;
    second.assert_status(StatusCode::CREATED);
    let second_id = second.json::<serde_json::Value>()["id"]
        .as_str()
        .unwrap()
        .to_owned();

    assert_eq!(first_id, second_id);
}

#[tokio::test]
async fn tenant_cannot_read_other_household_statement_content() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token_a = harness
        .login_bearer(&harness.email_a, &harness.password_a)
        .await;
    let token_b = harness
        .login_bearer(&harness.email_b, &harness.password_b)
        .await;

    let create = server
        .post("/api/v1/statements")
        .add_header("Authorization", format!("Bearer {token_a}"))
        .json(&json!({
            "fileName": "private.csv",
            "content": "date,amount\n2026-01-01,99\n"
        }))
        .await;
    create.assert_status(StatusCode::CREATED);
    let statement_id = create.json::<serde_json::Value>()["id"]
        .as_str()
        .unwrap()
        .to_owned();

    server
        .get(&format!("/api/v1/statements/{statement_id}/content"))
        .add_header("Authorization", format!("Bearer {token_b}"))
        .await
        .assert_status(StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn broker_import_stores_delegated_pending_metadata() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token = harness
        .login_bearer(&harness.email_a, &harness.password_a)
        .await;

    let create = server
        .post("/api/v1/broker/imports")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&json!({
            "provider": "tbank",
            "externalAccountId": "acct-1",
            "fileName": "portfolio.html",
            "content": "<html><body>broker</body></html>"
        }))
        .await;
    create.assert_status(StatusCode::CREATED);
    let body = create.json::<serde_json::Value>();
    assert_eq!(body["status"], "pending");
    assert_eq!(body["parseDelegated"], true);

    let import_id = body["id"].as_str().unwrap().to_owned();
    server
        .get(&format!("/api/v1/broker/imports/{import_id}/content"))
        .add_header("Authorization", format!("Bearer {token}"))
        .await
        .assert_status_ok();
}

#[tokio::test]
async fn backup_export_matches_v1_shape() {
    let harness = TestHarness::new().await;
    let server = TestServer::new(harness.app()).unwrap();
    let token = harness
        .login_bearer(&harness.email_a, &harness.password_a)
        .await;

    server
        .put("/api/v1/portfolio")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&json!({
            "schemaVersion": 1,
            "baseRevision": 0,
            "document": { "version": 1, "updatedAt": "2026-01-01T00:00:00.000Z" }
        }))
        .await
        .assert_status_ok();

    server
        .post("/api/v1/statements")
        .add_header("Authorization", format!("Bearer {token}"))
        .json(&json!({
            "fileName": "export.csv",
            "content": "date,amount\n2026-01-01,1\n"
        }))
        .await
        .assert_status(StatusCode::CREATED);

    let export = server
        .get("/api/v1/backup/export")
        .add_header("Authorization", format!("Bearer {token}"))
        .await;
    export.assert_status_ok();
    let body = export.json::<serde_json::Value>();
    assert_eq!(body["formatVersion"], 1);
    assert!(body["portfolio"].is_object());
    assert!(body["statements"].is_array());
}

#[tokio::test]
async fn migration_cli_imports_backup_and_is_idempotent() {
    let harness = TestHarness::new().await;
    let backup_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/finance-api/backup-v1-minimal.json");
    let statements_dir =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/finance-api/statements");
    let rollback_dir = harness.state.config().database_url.clone();
    let _ = rollback_dir;

    let runner = MigrationRunner::new(harness.state.pool().clone());
    let options = MigrationOptions {
        backup_path: backup_path.clone(),
        statements_dir: Some(statements_dir),
        household_id: Some(harness.household_a),
        bootstrap_email: None,
        bootstrap_password: None,
        bootstrap_display_name: None,
        bootstrap_household_name: None,
        dry_run: false,
        checksum_only: false,
        rollback_dir: None,
    };

    let first = runner.run(options.clone()).await.expect("first migration");
    assert_eq!(first.statement_count, 2);
    assert!(!first.idempotent_skip);

    let second = runner.run(options).await.expect("second migration");
    assert!(second.idempotent_skip);
}

#[tokio::test]
async fn migration_cli_dry_run_does_not_write_statements() {
    let harness = TestHarness::new().await;
    let backup_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/finance-api/backup-v1-minimal.json");

    let runner = MigrationRunner::new(harness.state.pool().clone());
    let report = runner
        .run(MigrationOptions {
            backup_path,
            statements_dir: None,
            household_id: Some(harness.household_b),
            bootstrap_email: None,
            bootstrap_password: None,
            bootstrap_display_name: None,
            bootstrap_household_name: None,
            dry_run: true,
            checksum_only: false,
            rollback_dir: None,
        })
        .await
        .expect("dry run");

    assert!(report.dry_run);
    assert_eq!(report.statement_count, 1);

    let server = TestServer::new(harness.app()).unwrap();
    let token = harness
        .login_bearer(&harness.email_b, &harness.password_b)
        .await;
    let list = server
        .get("/api/v1/statements")
        .add_header("Authorization", format!("Bearer {token}"))
        .await;
    list.assert_status_ok();
    assert_eq!(
        list.json::<serde_json::Value>()["items"]
            .as_array()
            .unwrap()
            .len(),
        0
    );
}

#[tokio::test]
async fn migration_cli_checksum_is_stable() {
    let harness = TestHarness::new().await;
    let backup_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/finance-api/backup-v1-minimal.json");
    let runner = MigrationRunner::new(harness.state.pool().clone());
    let report = runner
        .run(MigrationOptions {
            backup_path,
            statements_dir: None,
            household_id: Some(Uuid::new_v4()),
            bootstrap_email: None,
            bootstrap_password: None,
            bootstrap_display_name: None,
            bootstrap_household_name: None,
            dry_run: false,
            checksum_only: true,
            rollback_dir: None,
        })
        .await
        .expect("checksum");
    assert!(!report.source_fingerprint.is_empty());
}
