//! Migration 016: Canonicalize model selections
//!
//! Helper migration — runtime code path normalizes legacy model selection
//! shapes; no schema change required.

pub const VERSION: u32 = 16;
pub const NAME: &str = "016_canonicalize_model_selections";
pub const SQL: &str = r#"
SELECT 1;
"#;
