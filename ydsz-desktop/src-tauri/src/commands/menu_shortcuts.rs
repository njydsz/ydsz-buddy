//! # Menu Shortcuts 模块
//!
//! 提供 Tauri 菜单 / 全局快捷键的'声明式'模型：每个菜单项有 id、显示文本、
//! 加速键（accelerator）、作用域（全局 / 局部）。
//!
//! ## 用法
//!
//! ```rust,ignore
//! use crate::commands::menu_shortcuts::{MenuShortcut, MenuShortcutScope};
//! let item = MenuShortcut::new('file.new_chat', '新建会话', 'CmdOrCtrl+N')
//!     .with_scope(MenuShortcutScope::Global);
//! ```

use serde::{Deserialize, Serialize};
use specta::Type;

/// 快捷键作用域
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum MenuShortcutScope {
    /// 仅当前窗口内有效
    Window,
    /// 跨窗口 / 系统级
    Global,
}

/// 菜单项
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
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
    #[allow(dead_code)]
    pub fn with_scope(mut self, scope: MenuShortcutScope) -> Self {
        self.scope = scope;
        self
    }

    /// 设置启用状态
    #[allow(dead_code)]
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

/// 菜单分组（一组相关菜单项）
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
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

    #[test]
    fn label_only_has_no_accelerator() {
        let m = MenuShortcut::label_only("file.separator", "---");
        assert!(m.accelerator.is_none());
        assert!(m.enabled);
        assert_eq!(m.scope, MenuShortcutScope::Window);
    }

    #[test]
    fn with_scope_changes_scope() {
        let m = MenuShortcut::new("test", "测试", "CmdOrCtrl+T")
            .with_scope(MenuShortcutScope::Global);
        assert_eq!(m.scope, MenuShortcutScope::Global);
    }

    #[test]
    fn with_enabled_toggles() {
        let m = MenuShortcut::new("test", "测试", "CmdOrCtrl+T")
            .with_enabled(false);
        assert!(!m.enabled);
    }

    #[test]
    fn menu_group_builder() {
        let group = MenuGroup::new("file")
            .with_title("文件")
            .push(MenuShortcut::new("file.new", "新建", "CmdOrCtrl+N"))
            .push(MenuShortcut::new("file.open", "打开", "CmdOrCtrl+O"));
        assert_eq!(group.id, "file");
        assert_eq!(group.title.as_deref(), Some("文件"));
        assert_eq!(group.items.len(), 2);
        assert_eq!(group.items[0].id, "file.new");
    }

    #[test]
    fn default_menu_contains_expected_shortcuts() {
        // 互联网大厂基线：关键快捷键必须可用
        let groups = default_menu();
        let all_ids: Vec<&str> = groups
            .iter()
            .flat_map(|g| g.items.iter().map(|i| i.id.as_str()))
            .collect();
        // 关键快捷键必须存在
        assert!(all_ids.contains(&"file.new_chat"));
        assert!(all_ids.contains(&"file.save"));
        assert!(all_ids.contains(&"edit.undo"));
        assert!(all_ids.contains(&"edit.redo"));
        assert!(all_ids.contains(&"view.toggle_sidebar"));
    }

    #[test]
    fn default_menu_ids_unique() {
        // 关键约束：菜单 id 全局唯一，否则前端 dispatch 会乱
        let groups = default_menu();
        let mut seen = std::collections::HashSet::new();
        for g in groups {
            for item in g.items {
                // 允许 separator（label_only）重复
                if item.id.ends_with(".separator") {
                    continue;
                }
                assert!(seen.insert(item.id.clone()), "duplicate id: {}", item.id);
            }
        }
    }

    #[test]
    fn scope_serialization_snake_case() {
        let s = serde_json::to_string(&MenuShortcutScope::Global).unwrap();
        assert_eq!(s, "\"global\"");
        let s = serde_json::to_string(&MenuShortcutScope::Window).unwrap();
        assert_eq!(s, "\"window\"");
    }

    #[test]
    fn menu_shortcut_skip_none_accelerator() {
        // label_only 的 None 字段不出现
        let m = MenuShortcut::label_only("x", "y");
        let v = serde_json::to_value(&m).unwrap();
        assert!(v.get("accelerator").is_none());
        assert_eq!(v["id"], "x");
        assert_eq!(v["label"], "y");
        assert_eq!(v["enabled"], true);
    }
}

