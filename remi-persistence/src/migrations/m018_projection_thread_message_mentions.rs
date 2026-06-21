//! Migration 018: Thread message mentions
//!
//! Adds the `mentions_json` column to thread messages to capture
//! `@skill` / `@file` / `@thread` references made by the user.

pub const VERSION: u32 = 18;
pub const NAME: &str = "018_projection_thread_message_mentions";
pub const SQL: &str = r#"
ALTER TABLE projection_thread_messages
    ADD COLUMN IF NOT EXISTS mentions_json TEXT;
"#;
