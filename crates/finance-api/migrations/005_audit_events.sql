CREATE TABLE audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    household_id TEXT REFERENCES households(id) ON DELETE CASCADE,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_audit_events_household_created
    ON audit_events (household_id, created_at DESC, id DESC);

CREATE INDEX idx_audit_events_action_created
    ON audit_events (action, created_at DESC);
