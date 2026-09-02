use serde_json::Value;

pub const BACKUP_FORMAT_VERSION: i64 = 1;

#[derive(Clone, Debug)]
pub struct ValidatedBackupV1 {
    pub exported_at: String,
    pub portfolio: Value,
    pub statements: Vec<BackupStatementEntry>,
}

#[derive(Clone, Debug)]
pub struct BackupStatementEntry {
    pub file_name: String,
    pub content: String,
}

pub fn validate_backup_v1(value: &Value) -> Result<ValidatedBackupV1, String> {
    let format_version = value
        .get("formatVersion")
        .and_then(Value::as_i64)
        .ok_or_else(|| "missing formatVersion".to_owned())?;
    if format_version != BACKUP_FORMAT_VERSION {
        return Err(format!("unsupported formatVersion {format_version}"));
    }

    let exported_at = value
        .get("exportedAt")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing exportedAt".to_owned())?
        .to_owned();

    let portfolio = value
        .get("portfolio")
        .cloned()
        .ok_or_else(|| "missing portfolio".to_owned())?;
    sanitize_portfolio_document(&portfolio)?;

    let statements_value = value
        .get("statements")
        .and_then(Value::as_array)
        .ok_or_else(|| "statements must be an array".to_owned())?;

    let mut statements = Vec::with_capacity(statements_value.len());
    for entry in statements_value {
        let file_name = entry
            .get("fileName")
            .and_then(Value::as_str)
            .ok_or_else(|| "statement.fileName must be a string".to_owned())?;
        let content = entry
            .get("content")
            .and_then(Value::as_str)
            .ok_or_else(|| "statement.content must be a string".to_owned())?;
        statements.push(BackupStatementEntry {
            file_name: sanitize_statement_file_name(file_name)?,
            content: content.to_owned(),
        });
    }

    Ok(ValidatedBackupV1 {
        exported_at,
        portfolio: sanitize_portfolio_document(&portfolio)?,
        statements,
    })
}

pub fn sanitize_portfolio_document(value: &Value) -> Result<Value, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "portfolio must be a JSON object".to_owned())?;

    let version = object.get("version").and_then(Value::as_i64).unwrap_or(1);
    if version != 1 {
        return Err(format!("unsupported portfolio version {version}"));
    }

    let mut normalized = object.clone();
    normalized.insert("version".to_owned(), Value::from(1));
    if !normalized.contains_key("updatedAt") {
        normalized.insert(
            "updatedAt".to_owned(),
            Value::String(chrono::Utc::now().to_rfc3339()),
        );
    }

    Ok(Value::Object(normalized))
}

pub fn sanitize_statement_file_name(file_name: &str) -> Result<String, String> {
    let base = file_name
        .trim()
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .to_owned();
    if base.is_empty() || base.starts_with('.') {
        return Err("invalid statement file name".to_owned());
    }
    if !base.to_ascii_lowercase().ends_with(".csv") {
        return Err("only CSV statement files are supported".to_owned());
    }
    if base.len() > 255 {
        return Err("statement file name is too long".to_owned());
    }
    Ok(base)
}

pub fn sanitize_broker_file_name(file_name: &str) -> Result<String, String> {
    let base = file_name
        .trim()
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .to_owned();
    if base.is_empty() || base.starts_with('.') {
        return Err("invalid broker import file name".to_owned());
    }
    let lower = base.to_ascii_lowercase();
    if !(lower.ends_with(".html") || lower.ends_with(".json") || lower.ends_with(".csv")) {
        return Err("broker import must be .html, .json, or .csv".to_owned());
    }
    if base.len() > 255 {
        return Err("broker import file name is too long".to_owned());
    }
    Ok(base)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_backup_v1_shape() {
        let backup = json!({
            "formatVersion": 1,
            "exportedAt": "2026-01-01T00:00:00.000Z",
            "portfolio": { "version": 1, "updatedAt": "2026-01-01T00:00:00.000Z" },
            "statements": [{ "fileName": "sample.csv", "content": "a,b\n1,2" }]
        });
        let validated = validate_backup_v1(&backup).expect("valid backup");
        assert_eq!(validated.statements.len(), 1);
    }

    #[test]
    fn rejects_non_csv_statement_names() {
        assert!(sanitize_statement_file_name("evil.txt").is_err());
        assert!(sanitize_statement_file_name(".hidden.csv").is_err());
    }
}
