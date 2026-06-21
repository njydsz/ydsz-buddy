//! Migration 035: Normalize legacy model selection options
//!
//! Earlier client builds stored `model_selection` as a flat JSON map; the
//! orchestrator expects a canonical `{ mode, value }` shape. This migration
//! rewrites both `projection_threads` and `projection_projects` rows.

pub const VERSION: u32 = 35;
pub const NAME: &str = "035_normalize_legacy_model_selection_options";
pub const SQL: &str = r#"
UPDATE projection_threads
   SET model_selection = json_object('mode', 'default', 'value', model_selection)
 WHERE json_valid(model_selection) = 1
   AND json_extract(model_selection, '$.mode') IS NULL;

UPDATE projection_projects
   SET default_model_selection_json = json_object(
       'mode', 'default',
       'value', default_model_selection_json
   )
 WHERE default_model_selection_json IS NOT NULL
   AND json_valid(default_model_selection_json) = 1
   AND json_extract(default_model_selection_json, '$.mode') IS NULL;
"#;
