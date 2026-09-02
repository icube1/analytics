use std::time::Duration;

use serde::Deserialize;

#[derive(Clone, Debug)]
pub struct YooKassaConfig {
    pub enabled: bool,
    pub shop_id: Option<String>,
    pub secret_key: Option<String>,
    pub api_base_url: String,
    pub request_timeout: Duration,
    pub max_retries: u32,
    pub retry_backoff: Duration,
}

impl Default for YooKassaConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            shop_id: None,
            secret_key: None,
            api_base_url: "https://api.yookassa.ru/v3".to_owned(),
            request_timeout: Duration::from_secs(15),
            max_retries: 2,
            retry_backoff: Duration::from_millis(250),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct PaymentResponse {
    pub id: String,
    pub status: String,
    #[serde(default)]
    pub paid: bool,
    pub amount: Amount,
    #[serde(default)]
    pub metadata: serde_json::Value,
    pub confirmation: Option<Confirmation>,
    pub created_at: Option<String>,
    pub captured_at: Option<String>,
    pub canceled_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RefundResponse {
    pub id: String,
    pub status: String,
    pub payment_id: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Amount {
    pub value: String,
    pub currency: String,
}

#[derive(Debug, Deserialize)]
pub struct Confirmation {
    #[serde(rename = "confirmation_url")]
    pub confirmation_url: Option<String>,
}
