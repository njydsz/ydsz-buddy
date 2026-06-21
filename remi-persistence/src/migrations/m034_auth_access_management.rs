//! Migration 034: Auth access management
//!
//! Persists session and pairing-link metadata so the auth layer can decide
//! who can connect to the embedded server.

pub const VERSION: u32 = 34;
pub const NAME: &str = "034_auth_access_management";
pub const SQL: &str = r#"
CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    role TEXT NOT NULL,
    method TEXT NOT NULL,
    client_label TEXT,
    client_ip_address TEXT,
    client_user_agent TEXT,
    client_device_type TEXT NOT NULL DEFAULT 'unknown',
    client_os TEXT,
    client_browser TEXT,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_connected_at TEXT,
    revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
    ON auth_sessions(revoked_at, expires_at, issued_at);

CREATE TABLE IF NOT EXISTS auth_pairing_links (
    id TEXT PRIMARY KEY,
    credential TEXT NOT NULL UNIQUE,
    method TEXT NOT NULL,
    role TEXT NOT NULL,
    subject TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_pairing_links_active
    ON auth_pairing_links(revoked_at, consumed_at, expires_at);
"#;
