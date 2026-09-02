CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    bearer_token_hash TEXT UNIQUE,
    csrf_token TEXT NOT NULL,
    client_kind TEXT NOT NULL CHECK (client_kind IN ('web', 'mobile')),
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    rotated_from_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    last_seen_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_household ON sessions(household_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE local_credentials (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE statements (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    checksum_sha256 TEXT,
    imported_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_statements_household ON statements(household_id, imported_at);

CREATE TABLE broker_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_account_id TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (household_id, provider, external_account_id)
);

CREATE TABLE broker_imports (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    broker_account_id TEXT NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    checksum_sha256 TEXT,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    ) DEFAULT 'pending',
    error_message TEXT,
    imported_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_broker_imports_household ON broker_imports(household_id, imported_at);
CREATE INDEX idx_broker_imports_account ON broker_imports(broker_account_id);

ALTER TABLE jobs ADD COLUMN started_at TEXT;
ALTER TABLE jobs ADD COLUMN finished_at TEXT;
ALTER TABLE jobs ADD COLUMN timeout_at TEXT;
ALTER TABLE jobs ADD COLUMN cancelled_at TEXT;
