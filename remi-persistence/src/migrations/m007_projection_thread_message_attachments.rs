//! Migration 007: Thread message attachments
//!
//! Adds the `attachments_json` column to thread messages for storing local
//! file paths, image references, and provider-specific attachment descriptors.

pub const VERSION: u32 = 7;
pub const NAME: &str = "007_projection_thread_message_attachments";
pub const SQL: &str = r#"
ALTER TABLE projection_thread_messages
    ADD COLUMN IF NOT EXISTS attachments_json TEXT;
"#;
