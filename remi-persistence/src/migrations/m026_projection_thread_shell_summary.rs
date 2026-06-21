//! Migration 026: Thread shell summary
//!
//! Caches the most recent project-root shell terminal title for fast
//! Sidebar display without spawning a Tauri command.

pub const VERSION: u32 = 26;
pub const NAME: &str = "026_projection_thread_shell_summary";
pub const SQL: &str = r#"
ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS shell_summary TEXT;
"#;
