CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE households (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE household_members (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (household_id, user_id)
);

CREATE TABLE devices (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    last_seen_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE portfolio_documents (
    household_id TEXT PRIMARY KEY NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE portfolio_revisions (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    idempotency_key TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (household_id, revision)
);

CREATE UNIQUE INDEX idx_portfolio_revisions_idempotency
    ON portfolio_revisions (household_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE jobs (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
    ),
    idempotency_key TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_jobs_idempotency
    ON jobs (household_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('active', 'trialing', 'past_due', 'cancelled', 'paused')
    ),
    provider TEXT,
    external_id TEXT,
    current_period_start TEXT,
    current_period_end TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE entitlements (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    granted_until TEXT,
    source_subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (household_id, feature_key)
);

CREATE TABLE billing_events (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    provider TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    idempotency_key TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX idx_billing_events_idempotency
    ON billing_events (household_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE idempotency_responses (
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at TEXT NOT NULL,
    PRIMARY KEY (household_id, endpoint, idempotency_key)
);

CREATE INDEX idx_household_members_user ON household_members(user_id);
CREATE INDEX idx_devices_household ON devices(household_id);
CREATE INDEX idx_portfolio_revisions_household ON portfolio_revisions(household_id, revision);
CREATE INDEX idx_jobs_household_status ON jobs(household_id, status);
CREATE INDEX idx_subscriptions_household ON subscriptions(household_id);
CREATE INDEX idx_billing_events_household ON billing_events(household_id);
