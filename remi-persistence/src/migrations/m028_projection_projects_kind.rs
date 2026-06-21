//! Migration 028: Projects kind
//!
//! Distinguishes plain projects from template / marketplace projects that
//! the user instantiated.

pub const VERSION: u32 = 28;
pub const NAME: &str = "028_projection_projects_kind";
pub const SQL: &str = r#"
ALTER TABLE projection_projects
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'project';
"#;
