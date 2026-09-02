use uuid::Uuid;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthContext {
    pub user_id: Uuid,
    pub household_id: Uuid,
}

impl AuthContext {
    pub fn new(user_id: Uuid, household_id: Uuid) -> Self {
        Self {
            user_id,
            household_id,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TenantScope {
    pub household_id: Uuid,
}

impl From<&AuthContext> for TenantScope {
    fn from(context: &AuthContext) -> Self {
        Self {
            household_id: context.household_id,
        }
    }
}

impl TenantScope {
    pub fn household_id(&self) -> Uuid {
        self.household_id
    }
}
