//! Migration 010: Threads runtime mode
//!
//! The default runtime mode for newly created threads, stored denormalized
//! on the projection for instant sidebar filtering without re-reading the
//! orchestration event stream.

pub const VERSION: u32 = 10;
pub const NAME: &str = "010_projection_threads_runtime_mode";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS runtime_mode TEXT NOT NULL DEFAULT 'full-access';
"#;
