//! Migration 027: Backfill thread shell summary
//!
//! Ensures pre-migration rows have a uniform `NULL` value (not the empty
//! string) so query semantics remain consistent.

pub const VERSION: u32 = 27;
pub const NAME: &str = "027_backfill_projection_thread_shell_summary";
pub const SQL: &str = r#"
UPDATE projection_threads
   SET shell_summary = NULL
 WHERE shell_summary IS NULL;
"#;
