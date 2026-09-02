use crate::config::{Config, Environment};
use crate::error::{ApiError, ApiResult};

pub fn authenticate_basic(config: &Config, authorization: Option<&str>) -> ApiResult<()> {
    let (expected_user, expected_password) =
        match (config.auth_user.as_deref(), config.auth_password.as_deref()) {
            (Some(user), Some(password)) => (user, password),
            _ if config.environment == Environment::Development => return Ok(()),
            _ => return Err(ApiError::AuthNotConfigured),
        };

    let Some(header) = authorization else {
        return Err(ApiError::Unauthorized);
    };

    let Some((user, password)) = decode_basic_credentials(header) else {
        return Err(ApiError::Unauthorized);
    };

    if constant_time_equal(&user, expected_user)
        && constant_time_equal(&password, expected_password)
    {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

fn constant_time_equal(left: &str, right: &str) -> bool {
    use subtle::ConstantTimeEq;

    let max_len = left.len().max(right.len());
    let mut left_bytes = vec![0_u8; max_len];
    let mut right_bytes = vec![0_u8; max_len];
    left_bytes[..left.len()].copy_from_slice(left.as_bytes());
    right_bytes[..right.len()].copy_from_slice(right.as_bytes());
    left_bytes.ct_eq(&right_bytes).into()
}

fn decode_basic_credentials(header: &str) -> Option<(String, String)> {
    let encoded = header.strip_prefix("Basic ")?;
    let decoded = String::from_utf8(base64_decode(encoded.trim()).ok()?).ok()?;
    let separator = decoded.find(':')?;
    Some((
        decoded[..separator].to_owned(),
        decoded[separator + 1..].to_owned(),
    ))
}

fn base64_decode(input: &str) -> Result<Vec<u8>, ()> {
    const TABLE: &[u8; 256] = &{
        let mut table = [255_u8; 256];
        let mut index = 0_u8;
        while index < 64 {
            let value = match index {
                0..=25 => b'A' + index,
                26..=51 => b'a' + (index - 26),
                52..=61 => b'0' + (index - 52),
                62 => b'+',
                63 => b'/',
                _ => unreachable!(),
            };
            table[value as usize] = index;
            index += 1;
        }
        table
    };

    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let mut buffer = 0_u32;
    let mut bits = 0_u32;

    for byte in input.bytes() {
        if byte == b'=' {
            break;
        }
        if byte.is_ascii_whitespace() {
            continue;
        }
        let value = TABLE[byte as usize];
        if value == 255 {
            return Err(());
        }
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn accepts_valid_basic_credentials() {
        let config = Config {
            bind_addr: "127.0.0.1:8080".to_owned(),
            database_url: "sqlite://:memory:".to_owned(),
            environment: Environment::Production,
            auth_user: Some("owner".to_owned()),
            auth_password: Some("secret".to_owned()),
            bootstrap_email: None,
            bootstrap_password: None,
            bootstrap_display_name: None,
            bootstrap_household_name: None,
            billing_webhook_secret: None,
            session_ttl: chrono::Duration::hours(1),
            session_cookie_secure: true,
            max_request_bytes: 1024,
            db_max_connections: 1,
            db_acquire_timeout: Duration::from_secs(1),
            worker_concurrency: 1,
            job_timeout: chrono::Duration::seconds(30),
            max_pending_jobs_per_household: 4,
            idempotency_ttl: Duration::from_secs(60),
        };

        let header = format!("Basic {}", encode_base64("owner:secret"));
        assert!(authenticate_basic(&config, Some(&header)).is_ok());
    }

    fn encode_base64(input: &str) -> String {
        const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let bytes = input.as_bytes();
        let mut output = String::new();
        for chunk in bytes.chunks(3) {
            let b0 = u32::from(chunk[0]);
            let b1 = chunk.get(1).copied().unwrap_or(0);
            let b2 = chunk.get(2).copied().unwrap_or(0);
            let triple = (b0 << 16) | (u32::from(b1) << 8) | u32::from(b2);
            output.push(ALPHABET[((triple >> 18) & 63) as usize] as char);
            output.push(ALPHABET[((triple >> 12) & 63) as usize] as char);
            output.push(if chunk.len() > 1 {
                ALPHABET[((triple >> 6) & 63) as usize] as char
            } else {
                '='
            });
            output.push(if chunk.len() > 2 {
                ALPHABET[(triple & 63) as usize] as char
            } else {
                '='
            });
        }
        output
    }
}
