use std::env;
use std::path::PathBuf;
use std::process::ExitCode;

use finance_api::config::Config;
use finance_api::db;
use finance_api::migration::{MigrationOptions, MigrationRunner, RollbackOptions};
use uuid::Uuid;

#[tokio::main]
async fn main() -> ExitCode {
    if let Err(error) = run().await {
        eprintln!("migration failed: {error}");
        return ExitCode::from(1);
    }
    ExitCode::SUCCESS
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    finance_api::app::init_tracing();
    let args: Vec<String> = env::args().collect();
    let command = args.get(1).map_or("import", String::as_str);

    match command {
        "import" => run_import(&args[2..]).await?,
        "rollback" => run_rollback(&args[2..]).await?,
        "checksum" => run_checksum(&args[2..]).await?,
        _ => {
            print_usage();
            return Err("unknown command".into());
        }
    }

    Ok(())
}

async fn run_import(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let mut backup_path = None;
    let mut statements_dir = None;
    let mut household_id = None;
    let mut bootstrap_email = None;
    let mut bootstrap_password = None;
    let mut bootstrap_display_name = None;
    let mut bootstrap_household_name = None;
    let mut dry_run = false;
    let mut checksum_only = false;
    let mut rollback_dir = None;

    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--backup" => {
                index += 1;
                backup_path = Some(PathBuf::from(require_arg(args, index)?));
            }
            "--statements-dir" => {
                index += 1;
                statements_dir = Some(PathBuf::from(require_arg(args, index)?));
            }
            "--household-id" => {
                index += 1;
                household_id = Some(Uuid::parse_str(require_arg(args, index)?)?);
            }
            "--bootstrap-email" => {
                index += 1;
                bootstrap_email = Some(require_arg(args, index)?.to_owned());
            }
            "--bootstrap-password" => {
                index += 1;
                bootstrap_password = Some(require_arg(args, index)?.to_owned());
            }
            "--bootstrap-display-name" => {
                index += 1;
                bootstrap_display_name = Some(require_arg(args, index)?.to_owned());
            }
            "--bootstrap-household-name" => {
                index += 1;
                bootstrap_household_name = Some(require_arg(args, index)?.to_owned());
            }
            "--rollback-dir" => {
                index += 1;
                rollback_dir = Some(PathBuf::from(require_arg(args, index)?));
            }
            "--dry-run" => dry_run = true,
            "--checksum" => checksum_only = true,
            flag => return Err(format!("unknown flag: {flag}").into()),
        }
        index += 1;
    }

    let backup_path = backup_path.ok_or("missing --backup")?;
    let config = Config::from_env()?;
    set_database_file_env(&config.database_url);
    let pool = db::connect(&config).await?;
    let runner = MigrationRunner::new(pool);
    let report = runner
        .run(MigrationOptions {
            backup_path,
            statements_dir,
            household_id,
            bootstrap_email,
            bootstrap_password,
            bootstrap_display_name,
            bootstrap_household_name,
            dry_run,
            checksum_only,
            rollback_dir,
        })
        .await?;

    tracing::info!(
        run_id = ?report.run_id,
        household_id = %report.household_id,
        source_fingerprint = %report.source_fingerprint,
        dry_run = report.dry_run,
        idempotent_skip = report.idempotent_skip,
        portfolio_revision = report.portfolio_revision,
        statement_count = report.statement_count,
        portfolio_bytes = report.portfolio_bytes,
        statement_bytes = report.statement_bytes,
        rollback_db_path = ?report.rollback_db_path,
        "migration completed"
    );
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

async fn run_rollback(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let mut run_id = None;
    let mut household_id = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--run-id" => {
                index += 1;
                run_id = Some(Uuid::parse_str(require_arg(args, index)?)?);
            }
            "--household-id" => {
                index += 1;
                household_id = Some(Uuid::parse_str(require_arg(args, index)?)?);
            }
            flag => return Err(format!("unknown flag: {flag}").into()),
        }
        index += 1;
    }

    let run_id = run_id.ok_or("missing --run-id")?;
    let household_id = household_id.ok_or("missing --household-id")?;
    let config = Config::from_env()?;
    set_database_file_env(&config.database_url);
    let pool = db::connect(&config).await?;
    MigrationRunner::new(pool)
        .rollback(RollbackOptions {
            run_id,
            household_id,
        })
        .await?;
    tracing::info!(%run_id, %household_id, "migration rollback completed");
    Ok(())
}

async fn run_checksum(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let mut forwarded = vec!["--checksum".to_owned()];
    forwarded.extend(args.iter().cloned());
    run_import(&forwarded).await
}

fn require_arg(args: &[String], index: usize) -> Result<&str, Box<dyn std::error::Error>> {
    args.get(index)
        .map(String::as_str)
        .ok_or_else(|| "missing argument value".into())
}

fn set_database_file_env(database_url: &str) {
    if let Some(path) = database_url
        .strip_prefix("sqlite://")
        .and_then(|value| value.split('?').next())
    {
        env::set_var("FINANCE_API_DATABASE_FILE", path);
    }
}

fn print_usage() {
    eprintln!(
        "usage:
  finance-api-migrate import --backup <path> [--statements-dir <dir>] [--household-id <uuid>]
    [--bootstrap-email <email> --bootstrap-password <password>] [--dry-run] [--checksum]
    [--rollback-dir <dir>]
  finance-api-migrate rollback --run-id <uuid> --household-id <uuid>
  finance-api-migrate checksum --backup <path> [--statements-dir <dir>]"
    );
}
