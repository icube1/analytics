use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutRequest {
    pub subscription_id: Uuid,
    pub plan_id: String,
    pub amount_value: String,
    pub currency: String,
    pub return_url: String,
    pub description: Option<String>,
    pub feature_key: Option<String>,
    pub grant_days: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutSession {
    pub payment_id: String,
    pub confirmation_url: String,
    pub provider: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileReport {
    pub provider: String,
    pub checked: usize,
    pub updated: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}
