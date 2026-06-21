//! Migration 009: Provider session runtime mode
//!
//! Persists the Provider's selected runtime mode (`full-access` /
//! `approval-required` / `read-only`) per session for crash-resume fidelity.

pub const VERSION: u32 = 9;
pub const NAME: &str = "009_provider_session_runtime_mode";
pub const SQL: &str = r#"
ALTER TABLE provider_session_runtime
    ADD COLUMN IF NOT EXISTS interaction_mode TEXT NOT NULL DEFAULT 'default';
"#;
