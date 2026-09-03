use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::auth::hash_password;
use crate::auth::TenantScope;
use crate::error::{ApiError, ApiResult};
use crate::import::{
    fingerprint_backup_sources, sanitize_statement_file_name, validate_backup_v1,
    BACKUP_FORMAT_VERSION,
};
use crate::repositories::{
    CredentialRepository, HouseholdRepository, MembershipRepository, MembershipRole,
    MigrationRunRepository, UserRepository, MIGRATION_VERSION,
};

#[derive(Clone, Debug)]
pub struct MigrationOptions {
    pub backup_path: PathBuf,
    pub statements_dir: Option<PathBuf>,
    pub household_id: Option<Uuid>,
    pub bootstrap_email: Option<String>,
    pub bootstrap_password: Option<String>,
    pub bootstrap_display_name: Option<String>,
    pub bootstrap_household_name: Option<String>,
    pub dry_run: bool,
    pub checksum_only: bool,
    pub rollback_dir: Option<PathBuf>,
}

#[derive(Clone, Debug)]
pub struct RollbackOptions {
    pub run_id: Uuid,
    pub household_id: Uuid,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub run_id: Option<Uuid>,
    pub household_id: Uuid,
    pub source_fingerprint: String,
    pub dry_run: bool,
    pub idempotent_skip: bool,
    pub portfolio_revision: i64,
    pub statement_count: usize,
    pub statement_bytes: u64,
    pub portfolio_bytes: u64,
    pub rollback_db_path: Option<String>,
}

pub struct MigrationRunner {
    pool: SqlitePool,
}

impl MigrationRunner {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn run(&self, options: MigrationOptions) -> ApiResult<MigrationReport> {
        let backup_bytes =
            fs::read(&options.backup_path).map_err(|error| ApiError::BadRequest {
                message: format!("failed to read backup file: {error}"),
            })?;
        let backup_json: Value =
            serde_json::from_slice(&backup_bytes).map_err(|error| ApiError::BadRequest {
                message: format!("backup is not valid JSON: {error}"),
            })?;
        let validated =
            validate_backup_v1(&backup_json).map_err(|message| ApiError::BadRequest { message })?;

        let statement_files = load_statement_files_from_dir(options.statements_dir.as_deref())?;
        let mut by_name: std::collections::BTreeMap<String, Vec<u8>> =
            statement_files.into_iter().collect();
        for entry in &validated.statements {
            by_name
                .entry(entry.file_name.clone())
                .or_insert_with(|| entry.content.as_bytes().to_vec());
        }
        let statement_files: Vec<(String, Vec<u8>)> = by_name.into_iter().collect();

        let fingerprint = fingerprint_backup_sources(&backup_bytes, &statement_files);
        if options.checksum_only {
            return Ok(self.build_report(
                None,
                options.household_id.unwrap_or(Uuid::nil()),
                fingerprint.hex,
                &options,
                &validated,
                &statement_files,
                0,
                false,
                None,
            ));
        }

        let scope = self.resolve_scope(&options).await?;
        let runs = MigrationRunRepository::new(self.pool.clone());
        if let Some(existing) = runs
            .find_completed(scope, MIGRATION_VERSION, &fingerprint.hex)
            .await?
        {
            let head_row = sqlx::query_as::<_, (i64,)>(
                "SELECT revision FROM portfolio_documents WHERE household_id = ?1",
            )
            .bind(scope.household_id().to_string())
            .fetch_optional(&self.pool)
            .await?;
            let revision = head_row.map(|row| row.0).unwrap_or(0);
            return Ok(self.build_report(
                Some(existing.id),
                scope.household_id(),
                fingerprint.hex,
                &options,
                &validated,
                &statement_files,
                revision,
                true,
                existing.rollback_db_path,
            ));
        }

        let portfolio_payload =
            serde_json::to_string(&validated.portfolio).map_err(|_| ApiError::Internal)?;
        let portfolio_bytes = u64::try_from(portfolio_payload.len()).unwrap_or(u64::MAX);
        let statement_bytes: u64 = statement_files
            .iter()
            .map(|(_, bytes)| bytes.len() as u64)
            .sum();

        if options.dry_run {
            return Ok(self.build_report(
                None,
                scope.household_id(),
                fingerprint.hex,
                &options,
                &validated,
                &statement_files,
                0,
                false,
                None,
            ));
        }

        let rollback_path = self
            .create_rollback_snapshot(scope, options.rollback_dir.as_deref())
            .await?;
        let summary = serde_json::json!({
            "backupPath": options.backup_path.display().to_string(),
            "statementCount": statement_files.len(),
            "portfolioBytes": portfolio_bytes,
            "statementBytes": statement_bytes,
            "formatVersion": BACKUP_FORMAT_VERSION,
        });
        let run = runs
            .create_pending(
                scope,
                MIGRATION_VERSION,
                &fingerprint.hex,
                rollback_path.as_deref().map(str::to_owned).as_deref(),
                &summary.to_string(),
            )
            .await?;

        let result = self
            .import_transactional(scope, &portfolio_payload, &statement_files)
            .await;

        match result {
            Ok(revision) => {
                runs.mark_completed(scope, run.id).await?;
                Ok(self.build_report(
                    Some(run.id),
                    scope.household_id(),
                    fingerprint.hex,
                    &options,
                    &validated,
                    &statement_files,
                    revision,
                    false,
                    rollback_path,
                ))
            }
            Err(error) => {
                let _ = runs.mark_failed(scope, run.id).await;
                if let Some(path) = rollback_path.as_deref() {
                    let _ = self.restore_rollback_snapshot(path).await;
                }
                Err(error)
            }
        }
    }

    pub async fn rollback(&self, options: RollbackOptions) -> ApiResult<()> {
        let scope = TenantScope {
            household_id: options.household_id,
        };
        let runs = MigrationRunRepository::new(self.pool.clone());
        let run = runs.get(scope, options.run_id).await?;
        let rollback_path = run.rollback_db_path.ok_or_else(|| ApiError::BadRequest {
            message: "migration run has no rollback snapshot".to_owned(),
        })?;
        self.restore_rollback_snapshot(&rollback_path).await?;
        runs.mark_rolled_back(scope, run.id).await
    }

    async fn import_transactional(
        &self,
        scope: TenantScope,
        portfolio_payload: &str,
        statement_files: &[(String, Vec<u8>)],
    ) -> ApiResult<i64> {
        let household_id = scope.household_id();
        let mut tx = self.pool.begin().await?;

        sqlx::query("INSERT OR IGNORE INTO portfolio_documents (household_id) VALUES (?1)")
            .bind(household_id.to_string())
            .execute(&mut *tx)
            .await?;

        let head_row = sqlx::query_as::<_, (i64,)>(
            "SELECT revision FROM portfolio_documents WHERE household_id = ?1",
        )
        .bind(household_id.to_string())
        .fetch_one(&mut *tx)
        .await?;
        let next_revision = head_row.0 + 1;
        let revision_id = Uuid::new_v4();

        sqlx::query(
            "UPDATE portfolio_documents
             SET revision = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE household_id = ?1",
        )
        .bind(household_id.to_string())
        .bind(next_revision)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO portfolio_revisions
             (id, household_id, revision, payload_json, idempotency_key)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(revision_id.to_string())
        .bind(household_id.to_string())
        .bind(next_revision)
        .bind(portfolio_payload)
        .bind("migration-v1")
        .execute(&mut *tx)
        .await?;

        for (file_name, bytes) in statement_files {
            let checksum = crate::import::sha256_hex(bytes);
            let existing = sqlx::query_as::<_, (String,)>(
                "SELECT id FROM statements WHERE household_id = ?1 AND checksum_sha256 = ?2",
            )
            .bind(household_id.to_string())
            .bind(&checksum)
            .fetch_optional(&mut *tx)
            .await?;
            if existing.is_some() {
                continue;
            }

            let blob_id = Uuid::new_v4();
            sqlx::query(
                "INSERT OR IGNORE INTO import_content_blobs
                 (id, household_id, checksum_sha256, byte_size, content_type, content_blob)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(blob_id.to_string())
            .bind(household_id.to_string())
            .bind(&checksum)
            .bind(i64::try_from(bytes.len()).map_err(|_| ApiError::PayloadTooLarge)?)
            .bind("text/csv")
            .bind(bytes.as_slice())
            .execute(&mut *tx)
            .await?;

            let resolved_blob_id = if let Some((existing_id,)) = sqlx::query_as::<_, (String,)>(
                "SELECT id FROM import_content_blobs
                 WHERE household_id = ?1 AND checksum_sha256 = ?2",
            )
            .bind(household_id.to_string())
            .bind(&checksum)
            .fetch_optional(&mut *tx)
            .await?
            {
                existing_id
            } else {
                blob_id.to_string()
            };

            let statement_id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO statements
                 (id, household_id, source_type, file_name, content_type, byte_size,
                  checksum_sha256, content_blob_id, provenance_source, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )
            .bind(statement_id.to_string())
            .bind(household_id.to_string())
            .bind("csv")
            .bind(file_name)
            .bind("text/csv")
            .bind(i64::try_from(bytes.len()).map_err(|_| ApiError::PayloadTooLarge)?)
            .bind(&checksum)
            .bind(resolved_blob_id)
            .bind("migration")
            .bind("{}")
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(next_revision)
    }

    async fn resolve_scope(&self, options: &MigrationOptions) -> ApiResult<TenantScope> {
        if let Some(household_id) = options.household_id {
            return Ok(TenantScope { household_id });
        }

        let email = options
            .bootstrap_email
            .as_deref()
            .ok_or_else(|| ApiError::BadRequest {
                message: "household_id or bootstrap_email is required".to_owned(),
            })?;
        let password =
            options
                .bootstrap_password
                .as_deref()
                .ok_or_else(|| ApiError::BadRequest {
                    message: "bootstrap_password is required when bootstrap_email is set"
                        .to_owned(),
                })?;

        let credentials = CredentialRepository::new(self.pool.clone());
        if let Some(user_id) = credentials.find_user_id_by_email(email).await? {
            let memberships = MembershipRepository::new(self.pool.clone());
            let households = memberships.list_households_for_user(user_id).await?;
            let household_id = households
                .into_iter()
                .find(|membership| membership.role == MembershipRole::Owner)
                .map(|membership| membership.household_id)
                .ok_or(ApiError::Forbidden)?;
            return Ok(TenantScope { household_id });
        }

        let users = UserRepository::new(self.pool.clone());
        let user = users
            .create(
                Some(email),
                options
                    .bootstrap_display_name
                    .as_deref()
                    .unwrap_or("Migration Owner"),
            )
            .await?;
        credentials
            .upsert(user.id, &hash_password(password)?)
            .await?;
        let households = HouseholdRepository::new(self.pool.clone());
        let household = households
            .create(
                options
                    .bootstrap_household_name
                    .as_deref()
                    .unwrap_or("Migrated Household"),
            )
            .await?;
        MembershipRepository::new(self.pool.clone())
            .add_member(
                TenantScope {
                    household_id: household.id,
                },
                user.id,
                MembershipRole::Owner,
            )
            .await?;
        Ok(TenantScope {
            household_id: household.id,
        })
    }

    async fn create_rollback_snapshot(
        &self,
        _scope: TenantScope,
        rollback_dir: Option<&Path>,
    ) -> ApiResult<Option<String>> {
        let Some(db_path) = self.database_file_path() else {
            return Ok(None);
        };
        let dir = rollback_dir
            .map(Path::to_path_buf)
            .unwrap_or_else(|| db_path.parent().unwrap_or(Path::new(".")).join("rollbacks"));
        fs::create_dir_all(&dir).map_err(|error| ApiError::Config {
            message: format!("failed to create rollback directory: {error}"),
        })?;
        let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
        let target = dir.join(format!("finance-api-pre-migration-{stamp}.db"));
        fs::copy(&db_path, &target).map_err(|error| ApiError::Config {
            message: format!("failed to copy rollback snapshot: {error}"),
        })?;
        Ok(Some(target.display().to_string()))
    }

    async fn restore_rollback_snapshot(&self, rollback_path: &str) -> ApiResult<()> {
        let Some(db_path) = self.database_file_path() else {
            return Err(ApiError::BadRequest {
                message: "rollback is only supported for file-backed SQLite databases".to_owned(),
            });
        };
        fs::copy(rollback_path, &db_path).map_err(|error| ApiError::Config {
            message: format!("failed to restore rollback snapshot: {error}"),
        })?;
        Ok(())
    }

    fn database_file_path(&self) -> Option<PathBuf> {
        // Pool does not expose DSN; migration CLI passes explicit path through env.
        std::env::var("FINANCE_API_DATABASE_FILE")
            .ok()
            .map(PathBuf::from)
    }

    #[allow(clippy::too_many_arguments)]
    fn build_report(
        &self,
        run_id: Option<Uuid>,
        household_id: Uuid,
        source_fingerprint: String,
        options: &MigrationOptions,
        validated: &crate::import::ValidatedBackupV1,
        statement_files: &[(String, Vec<u8>)],
        portfolio_revision: i64,
        idempotent_skip: bool,
        rollback_db_path: Option<String>,
    ) -> MigrationReport {
        let portfolio_bytes = serde_json::to_string(&validated.portfolio)
            .map(|value| value.len() as u64)
            .unwrap_or(0);
        let statement_bytes: u64 = statement_files
            .iter()
            .map(|(_, bytes)| bytes.len() as u64)
            .sum();
        MigrationReport {
            run_id,
            household_id,
            source_fingerprint,
            dry_run: options.dry_run || options.checksum_only,
            idempotent_skip,
            portfolio_revision,
            statement_count: statement_files.len(),
            statement_bytes,
            portfolio_bytes,
            rollback_db_path,
        }
    }
}

pub fn load_statement_files_from_dir(
    statements_dir: Option<&Path>,
) -> ApiResult<Vec<(String, Vec<u8>)>> {
    let Some(dir) = statements_dir else {
        return Ok(Vec::new());
    };
    if !dir.exists() {
        return Err(ApiError::BadRequest {
            message: format!("statements directory does not exist: {}", dir.display()),
        });
    }

    let mut files = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| ApiError::BadRequest {
        message: format!("failed to read statements directory: {error}"),
    })? {
        let entry = entry.map_err(|error| ApiError::BadRequest {
            message: format!("failed to read statements entry: {error}"),
        })?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| ApiError::BadRequest {
                message: "invalid statement file name".to_owned(),
            })?;
        let safe_name = sanitize_statement_file_name(file_name)
            .map_err(|message| ApiError::BadRequest { message })?;
        let bytes = fs::read(&path).map_err(|error| ApiError::BadRequest {
            message: format!("failed to read statement file {safe_name}: {error}"),
        })?;
        files.push((safe_name, bytes));
    }
    files.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(files)
}
