//! # Menu Shortcuts 模块
//!
//! 提供 Tauri 菜单 / 全局快捷键的"声明式"模型：每个菜单项有 id、显示文本、
//! 加速键（accelerator）、作用域（全局 / 局部）。
//!
//! ## 用法
//!
//! ```rust,ignore
//! use crate::commands::menu_shortcuts::{MenuShortcut, MenuShortcutScope};
//! let item = MenuShortcut::new("file.new_chat", "新建会话", "CmdOrCtrl+N")
//!     .with_scope(MenuShortcutScope::Global);
//! ```

use serde::{Deserialize, Serialize};

/// 快捷键作用域
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MenuShortcutScope {
    /// 仅当前窗口内有效
    Window,
    /// 跨窗口 / 系统级
    Global,
}

/// 菜单项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuShortcut {
    /// 唯一 id（前端通过 `invoke('menu_event', id)` 接收）
    pub id: String,
    /// 显示文本（中文 / 本地化）
    pub label: String,
    /// 加速键字符串（Electron 风格）：`CmdOrCtrl+N` / `Alt+F4`
    pub accelerator: Option<String>,
    /// 作用域
    pub scope: MenuShortcutScope,
    /// 是否启用
    pub enabled: bool,
}

impl MenuShortcut {
    /// 构造
    pub fn new(
        id: impl Into<String>,
        label: impl Into<String>,
        accelerator: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            accelerator: Some(accelerator.into()),
            scope: MenuShortcutScope::Window,
            enabled: true,
        }
    }

    /// 仅文本，无加速键
    pub fn label_only(id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            accelerator: None,
            scope: MenuShortcutScope::Window,
            enabled: true,
        }
    }

    /// 设置作用域
    pub fn with_scope(mut self, scope: MenuShortcutScope) -> Self {
        self.scope = scope;
        self
    }

    /// 设置启用状态
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

/// 菜单分组（一组相关菜单项）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuGroup {
    /// 分组 id
    pub id: String,
    /// 显示标题（可选：作为子菜单标题）
    pub title: Option<String>,
    /// 菜单项列表
    pub items: Vec<MenuShortcut>,
}

impl MenuGroup {
    /// 构造
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            title: None,
            items: Vec::new(),
        }
    }

    /// 标题
    pub fn with_title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    /// 推入菜单项
    pub fn push(mut self, item: MenuShortcut) -> Self {
        self.items.push(item);
        self
    }
}

/// 默认菜单（按互联网大厂 IDE 风格：File / Edit / View / Help）
pub fn default_menu() -> Vec<MenuGroup> {
    use MenuShortcut as M;
    vec![
        MenuGroup::new("file")
            .with_title("文件")
            .push(M::new("file.new_chat", "新建会话", "CmdOrCtrl+N"))
            .push(M::new("file.open_project", "打开项目…", "CmdOrCtrl+O"))
            .push(M::new("file.save", "保存", "CmdOrCtrl+S"))
            .push(M::label_only("file.separator", "---"))
            .push(M::new("file.quit", "退出", "CmdOrCtrl+Q")),
        MenuGroup::new("edit")
            .with_title("编辑")
            .push(M::new("edit.undo", "撤销", "CmdOrCtrl+Z"))
            .push(M::new("edit.redo", "重做", "CmdOrCtrl+Shift+Z"))
            .push(M::label_only("edit.separator", "---"))
            .push(M::new("edit.cut", "剪切", "CmdOrCtrl+X"))
            .push(M::new("edit.copy", "复制", "CmdOrCtrl+C"))
            .push(M::new("edit.paste", "粘贴", "CmdOrCtrl+V"))
            .push(M::new("edit.find", "查找", "CmdOrCtrl+F")),
        MenuGroup::new("view")
            .with_title("视图")
            .push(M::new("view.toggle_sidebar", "切换侧栏", "CmdOrCtrl+B"))
            .push(M::new("view.toggle_terminal", "切换终端", "CmdOrCtrl+`"))
            .push(M::new("view.zoom_in", "放大", "CmdOrCtrl+="))
            .push(M::new("view.zoom_out", "缩小", "CmdOrCtrl+-")),
        MenuGroup::new("help")
            .with_title("帮助")
            .push(M::new("help.docs", "打开文档", "F1"))
            .push(M::new("help.about", "关于", "")),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_with_accelerator() {
        let m = MenuShortcut::new("file.new", "新建", "CmdOrCtrl+N");
        assert_eq!(m.id, "file.new");
        assert_eq!(m.accelerator.as_deref(), Some("CmdOrCtrl+N"));
        assert_eq!(m.scope, MenuShortcutScope::Window);
    }

    #[test]
    fn default_menu_has_groups() {
        let groups = default_menu();
        assert!(groups.len() >= 4);
        assert!(groups.iter().any(|g| g.id == "file"));
        assert!(groups.iter().any(|g| g.id == "edit"));
    }
}
