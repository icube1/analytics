use std::time::Duration;

use finance_api::{
    auth::hash_password,
    billing::yookassa::YooKassaConfig,
    build_app,
    config::{Config, Environment},
    db,
    repositories::{
        BillingRepository, CredentialRepository, HouseholdRepository, MembershipRepository,
        MembershipRole, UserRepository,
    },
    AppState,
};
use tempfile::tempdir;
use uuid::Uuid;

#[allow(dead_code)]
pub struct TestHarness {
    pub state: AppState,
    pub _user_a: Uuid,
    pub household_a: Uuid,
    pub _user_b: Uuid,
    pub household_b: Uuid,
    pub password_a: String,
    pub password_b: String,
    pub email_a: String,
    pub email_b: String,
    pub _dir: tempfile::TempDir,
}

impl TestHarness {
    pub async fn new() -> Self {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let config = Config {
            bind_addr: "127.0.0.1:0".to_owned(),
            database_url: format!("sqlite://{}?mode=rwc", db_path.display()),
            environment: Environment::Development,
            auth_user: None,
            auth_password: None,
            bootstrap_email: None,
            bootstrap_password: None,
            bootstrap_display_name: None,
            bootstrap_household_name: None,
            billing_webhook_secret: Some("test-webhook-secret".to_owned()),
            yookassa: YooKassaConfig::default(),
            session_ttl: chrono::Duration::hours(1),
            session_cookie_secure: false,
            max_request_bytes: 1024 * 1024,
            db_max_connections: 2,
            db_acquire_timeout: Duration::from_secs(5),
            worker_concurrency: 1,
            job_timeout: chrono::Duration::seconds(30),
            max_pending_jobs_per_household: 4,
            idempotency_ttl: Duration::from_secs(3600),
        };

        let pool = db::connect(&config).await.expect("database");
        let state = AppState::new(pool.clone(), config)
            .with_worker()
            .await
            .unwrap();

        let users = UserRepository::new(pool.clone());
        let households = HouseholdRepository::new(pool.clone());
        let memberships = MembershipRepository::new(pool.clone());
        let credentials = CredentialRepository::new(pool);

        let email_a = "a@example.test".to_owned();
        let email_b = "b@example.test".to_owned();
        let password_a = "password-a".to_owned();
        let password_b = "password-b".to_owned();

        let user_a = users.create(Some(&email_a), "User A").await.unwrap().id;
        let user_b = users.create(Some(&email_b), "User B").await.unwrap().id;
        let household_a = households.create("Household A").await.unwrap().id;
        let household_b = households.create("Household B").await.unwrap().id;

        credentials
            .upsert(user_a, &hash_password(&password_a).unwrap())
            .await
            .unwrap();
        credentials
            .upsert(user_b, &hash_password(&password_b).unwrap())
            .await
            .unwrap();

        memberships
            .add_member(
                finance_api::auth::TenantScope {
                    household_id: household_a,
                },
                user_a,
                MembershipRole::Owner,
            )
            .await
            .unwrap();
        memberships
            .add_member(
                finance_api::auth::TenantScope {
                    household_id: household_b,
                },
                user_b,
                MembershipRole::Owner,
            )
            .await
            .unwrap();

        let billing = BillingRepository::new(state.pool().clone());
        let scope_a = finance_api::auth::TenantScope {
            household_id: household_a,
        };
        for feature in ["resilience.compute", "finance.heavy"] {
            billing
                .upsert_entitlement(scope_a, feature, None, None)
                .await
                .unwrap();
        }

        Self {
            state,
            _user_a: user_a,
            household_a,
            _user_b: user_b,
            household_b,
            password_a,
            password_b,
            email_a,
            email_b,
            _dir: dir,
        }
    }

    pub fn app(&self) -> axum::Router {
        build_app(self.state.clone())
    }

    #[allow(dead_code)]
    pub async fn login_bearer(&self, email: &str, password: &str) -> String {
        let server = axum_test::TestServer::new(self.app()).unwrap();
        let response = server
            .post("/api/v1/auth/login")
            .json(&serde_json::json!({
                "email": email,
                "password": password,
                "clientKind": "mobile"
            }))
            .await;
        response.assert_status_ok();
        response.json::<serde_json::Value>()["bearerToken"]
            .as_str()
            .expect("bearer token")
            .to_owned()
    }
}
