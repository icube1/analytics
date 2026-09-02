use std::{env, fs, process::ExitCode};

use finance_core::dto::v1::{evaluate, RequestBatch};

fn main() -> ExitCode {
    match run() {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("finance-core fixture failed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<String, Box<dyn std::error::Error>> {
    let fixture_path = env::args()
        .nth(1)
        .ok_or("usage: finance-core-fixture PATH")?;
    let fixture = fs::read_to_string(fixture_path)?;
    let requests: RequestBatch = serde_json::from_str(&fixture)?;
    let responses = evaluate(requests)?;
    Ok(serde_json::to_string(&responses)?)
}
