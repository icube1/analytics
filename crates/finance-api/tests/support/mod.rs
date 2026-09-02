use std::time::Duration;

use finance_api::{
    build_app,
    config::{Config, Environment},
    db,
    repositories::{HouseholdRepository, MembershipRepository, MembershipRole, UserRepository},
    AppState,
};
use tempfile::tempdir;
use uuid::Uuid;

#[allow(dead_code)]
pub struct TestHarness {
    pub state: AppState,
    pub user_a: Uuid,
    pub household_a: Uuid,
    pub user_b: Uuid,
    pub household_b: Uuid,
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
            max_request_bytes: 1024 * 1024,
            db_max_connections: 2,
            db_acquire_timeout: Duration::from_secs(5),
            worker_concurrency: 1,
            idempotency_ttl: Duration::from_secs(3600),
        };

        let pool = db::connect(&config).await.expect("database");
        let state = AppState::new(pool.clone(), config);

        let users = UserRepository::new(pool.clone());
        let households = HouseholdRepository::new(pool.clone());
        let memberships = MembershipRepository::new(pool);

        let user_a = users
            .create(Some("a@example.test"), "User A")
            .await
            .unwrap()
            .id;
        let user_b = users
            .create(Some("b@example.test"), "User B")
            .await
            .unwrap()
            .id;
        let household_a = households.create("Household A").await.unwrap().id;
        let household_b = households.create("Household B").await.unwrap().id;

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

        Self {
            state,
            user_a,
            household_a,
            user_b,
            household_b,
            _dir: dir,
        }
    }

    pub fn app(&self) -> axum::Router {
        build_app(self.state.clone())
    }
}
