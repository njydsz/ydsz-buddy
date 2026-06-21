//! Migration 032: Reconcile legacy T3 schema import
//!
//! For users migrating from a pre-Rust legacy T3 import, this migration
//! fixes up rows whose `model_selection` was stored as a raw string rather
//! than the canonical JSON structure.

pub const VERSION: u32 = 32;
pub const NAME: &str = "032_reconcile_legacy_t3_schema_import";
pub const SQL: &str = r#"
UPDATE projection_threads
   SET model_selection = json_object('mode', 'default', 'value', model_selection)
 WHERE model_selection IS NOT NULL
   AND json_valid(model_selection) = 0;
"#;
