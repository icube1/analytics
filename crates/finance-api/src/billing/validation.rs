use std::collections::HashSet;

const SUPPORTED_CURRENCIES: &[&str] = &["RUB"];
const MAX_AMOUNT_RUB: &str = "999999.99";

pub fn validate_return_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "return_url must be a valid URL".to_owned())?;
    if parsed.scheme() != "https" {
        return Err("return_url must use https".to_owned());
    }
    if parsed.host_str().is_none() {
        return Err("return_url must include a host".to_owned());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("return_url must not include credentials".to_owned());
    }
    Ok(())
}

pub fn validate_amount(value: &str, currency: &str) -> Result<(), String> {
    validate_currency(currency)?;
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err("amount must not be empty".to_owned());
    }
    let parts: Vec<&str> = normalized.split('.').collect();
    match parts.as_slice() {
        [whole] => {
            if whole.is_empty() || !whole.chars().all(|c| c.is_ascii_digit()) {
                return Err("amount must be a positive decimal".to_owned());
            }
        }
        [whole, frac] => {
            if whole.is_empty()
                || !whole.chars().all(|c| c.is_ascii_digit())
                || frac.len() != 2
                || !frac.chars().all(|c| c.is_ascii_digit())
            {
                return Err("amount must use two decimal places".to_owned());
            }
        }
        _ => return Err("amount must be a positive decimal".to_owned()),
    }
    let amount: f64 = normalized
        .parse()
        .map_err(|_| "amount must be a positive decimal".to_owned())?;
    if !amount.is_finite() || amount <= 0.0 {
        return Err("amount must be greater than zero".to_owned());
    }
    if currency.eq_ignore_ascii_case("RUB") {
        let max: f64 = MAX_AMOUNT_RUB
            .parse()
            .map_err(|_| "invalid max amount".to_owned())?;
        if amount > max {
            return Err(format!("amount must not exceed {MAX_AMOUNT_RUB} RUB"));
        }
    }
    Ok(())
}

pub fn validate_currency(currency: &str) -> Result<(), String> {
    let upper = currency.trim().to_ascii_uppercase();
    if upper.len() != 3 || !upper.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err("currency must be a 3-letter ISO code".to_owned());
    }
    let allowed: HashSet<&str> = SUPPORTED_CURRENCIES.iter().copied().collect();
    if allowed.contains(upper.as_str()) {
        Ok(())
    } else {
        Err(format!(
            "unsupported currency {upper}; supported: {}",
            SUPPORTED_CURRENCIES.join(", ")
        ))
    }
}

pub fn redact_secrets(input: &str, secrets: &[&str]) -> String {
    let mut out = input.to_owned();
    for secret in secrets {
        if secret.len() < 4 {
            continue;
        }
        out = out.replace(secret, "[REDACTED]");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https_return_url() {
        validate_return_url("https://example.com/billing/return").unwrap();
    }

    #[test]
    fn rejects_http_return_url() {
        assert!(validate_return_url("http://example.com").is_err());
    }

    #[test]
    fn validates_rub_amount() {
        validate_amount("199.00", "RUB").unwrap();
        assert!(validate_amount("0.00", "RUB").is_err());
        assert!(validate_amount("199.0", "RUB").is_err());
    }
}
