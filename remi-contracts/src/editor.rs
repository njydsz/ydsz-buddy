//! 编辑器集成模式定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 在编辑器中打开文件的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct OpenInEditorInput {
    /// 要打开的文件路径。
    pub path: String,
    /// 行号（从 1 开始，可选）。
    pub line: Option<u32>,
    /// 列号（从 1 开始，可选）。
    pub column: Option<u32>,
}

/// 支持的编辑器类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum EditorType {
    /// VS Code。
    VsCode,
    /// Cursor。
    Cursor,
    /// Vim。
    Vim,
    /// Neovim。
    Neovim,
    /// Emacs。
    Emacs,
    /// 系统默认编辑器。
    Default,
}
