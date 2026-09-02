use std::time::Duration;

use reqwest::header::CONTENT_TYPE;
use reqwest::{Client, StatusCode};
use serde::de::DeserializeOwned;
use tracing::warn;

use crate::billing::validation::redact_secrets;

#[derive(Clone, Debug)]
pub struct HttpClientConfig {
    pub timeout: Duration,
    pub max_retries: u32,
    pub retry_backoff: Duration,
}

impl Default for HttpClientConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(15),
            max_retries: 2,
            retry_backoff: Duration::from_millis(250),
        }
    }
}

#[derive(Debug)]
pub struct HttpResponse {
    #[allow(dead_code)]
    pub status: StatusCode,
    pub body: Vec<u8>,
}

#[derive(Clone)]
pub struct BillingHttpClient {
    client: Client,
    config: HttpClientConfig,
}

impl BillingHttpClient {
    pub fn new(config: HttpClientConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(config.timeout)
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { client, config })
    }

    pub async fn get_json<T: DeserializeOwned>(
        &self,
        url: &str,
        shop_id: &str,
        secret_key: &str,
    ) -> Result<T, String> {
        let response = self
            .send_with_retries(|| {
                self.client
                    .get(url)
                    .basic_auth(shop_id, Some(secret_key))
                    .header(CONTENT_TYPE, "application/json")
            })
            .await?;
        parse_json(&response, &[secret_key])
    }

    pub async fn post_json<T: DeserializeOwned>(
        &self,
        url: &str,
        shop_id: &str,
        secret_key: &str,
        idempotence_key: &str,
        body: &serde_json::Value,
    ) -> Result<T, String> {
        let response = self
            .send_with_retries(|| {
                self.client
                    .post(url)
                    .basic_auth(shop_id, Some(secret_key))
                    .header(CONTENT_TYPE, "application/json")
                    .header("Idempotence-Key", idempotence_key)
                    .json(body)
            })
            .await?;
        parse_json(&response, &[secret_key])
    }

    async fn send_with_retries(
        &self,
        build: impl Fn() -> reqwest::RequestBuilder,
    ) -> Result<HttpResponse, String> {
        let mut attempt = 0;
        loop {
            let response = build()
                .send()
                .await
                .map_err(|e| format!("billing http request failed: {e}"))?;
            let status = response.status();
            let body = response
                .bytes()
                .await
                .map_err(|e| format!("billing http body read failed: {e}"))?
                .to_vec();
            if should_retry(status) && attempt < self.config.max_retries {
                attempt += 1;
                warn!(status = %status, attempt, "retrying billing http request");
                tokio::time::sleep(self.config.retry_backoff * attempt).await;
                continue;
            }
            if status.is_success() {
                return Ok(HttpResponse { status, body });
            }
            let text = String::from_utf8_lossy(&body);
            return Err(format!(
                "billing http error {}: {}",
                status.as_u16(),
                redact_secrets(&text, &[])
            ));
        }
    }
}

fn should_retry(status: StatusCode) -> bool {
    status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::TOO_MANY_REQUESTS
        || status.is_server_error()
}

fn parse_json<T: DeserializeOwned>(response: &HttpResponse, secrets: &[&str]) -> Result<T, String> {
    let text = String::from_utf8_lossy(&response.body);
    serde_json::from_slice(&response.body).map_err(|e| {
        format!(
            "invalid billing json: {e} body={}",
            redact_secrets(&text, secrets)
        )
    })
}
