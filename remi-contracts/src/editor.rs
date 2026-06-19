//! Editor integration schemas.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Input for opening a file in editor.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OpenInEditorInput {
    /// File path to open.
    pub path: String,
    /// Line number (1-indexed, optional).
    pub line: Option<u32>,
    /// Column number (1-indexed, optional).
    pub column: Option<u32>,
}

/// Supported editor types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum EditorType {
    /// VS Code.
    VsCode,
    /// Cursor.
    Cursor,
    /// Vim.
    Vim,
    /// Neovim.
    Neovim,
    /// Emacs.
    Emacs,
    /// System default.
    Default,
}
