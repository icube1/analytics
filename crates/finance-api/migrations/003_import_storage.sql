CREATE TABLE import_content_blobs (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    checksum_sha256 TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    content_type TEXT,
    content_blob BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (household_id, checksum_sha256)
);

CREATE INDEX idx_import_content_blobs_household
    ON import_content_blobs(household_id, created_at);

ALTER TABLE statements ADD COLUMN content_blob_id TEXT
    REFERENCES import_content_blobs(id) ON DELETE SET NULL;
ALTER TABLE statements ADD COLUMN provenance_source TEXT NOT NULL DEFAULT 'api';
ALTER TABLE statements ADD COLUMN retention_until TEXT;

CREATE UNIQUE INDEX idx_statements_household_checksum
    ON statements(household_id, checksum_sha256)
    WHERE checksum_sha256 IS NOT NULL;

ALTER TABLE broker_imports ADD COLUMN content_blob_id TEXT
    REFERENCES import_content_blobs(id) ON DELETE SET NULL;
ALTER TABLE broker_imports ADD COLUMN provenance_source TEXT NOT NULL DEFAULT 'api';
ALTER TABLE broker_imports ADD COLUMN retention_until TEXT;
ALTER TABLE broker_imports ADD COLUMN parse_delegated INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX idx_broker_imports_household_checksum
    ON broker_imports(household_id, checksum_sha256)
    WHERE checksum_sha256 IS NOT NULL;

CREATE TABLE data_migration_runs (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    migration_version INTEGER NOT NULL,
    source_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'completed', 'rolled_back', 'failed')
    ) DEFAULT 'pending',
    rollback_db_path TEXT,
    summary_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at TEXT,
    UNIQUE (household_id, migration_version, source_fingerprint)
);

CREATE INDEX idx_data_migration_runs_household
    ON data_migration_runs(household_id, created_at);
