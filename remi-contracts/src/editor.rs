//! 编辑器集成相关的模式定义
//!
//! 定义从后端"在 IDE 中打开文件"等动作所需的 DTO，覆盖主流编辑器（VS Code、Cursor、
//! Vim/Neovim、Emacs）以及系统默认编辑器。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// 在编辑器中打开文件的入参
///
/// 通过指定路径 + 可选行列号，后端会调用编辑器的 CLI（如 `code -g file:line:column`）
/// 跳转到对应位置。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct OpenInEditorInput {
    /// 要打开的文件路径（相对工作区根或绝对路径）
    pub path: String,
    /// 行号（从 1 开始，可选）
    pub line: Option<u32>,
    /// 列号（从 1 开始，可选）
    pub column: Option<u32>,
}

/// 支持的编辑器类型
///
/// 使用 `lowercase` 序列化约定，便于在前端作为字符串直接使用。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum EditorType {
    /// VS Code
    VsCode,
    /// Cursor
    Cursor,
    /// Vim
    Vim,
    /// Neovim
    Neovim,
    /// Emacs
    Emacs,
    /// 系统默认编辑器（由 `EDITOR` 环境变量或 OS 决定）
    Default,
}
