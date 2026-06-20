//! # 右键上下文菜单命令模块
//!
//! 本模块提供与右键上下文菜单相关的 Tauri 命令，支持在指定位置显示自定义菜单。
//!
//! ## 模块职责
//!
//! - 定义上下文菜单项的数据结构
//! - 提供显示上下文菜单的命令接口
//! - 处理菜单项的点击事件
//!
//! ## 核心功能
//!
//! 1. **菜单项定义**：支持菜单项 ID、标签、启用状态
//! 2. **位置控制**：支持在指定坐标位置显示菜单
//! 3. **事件返回**：通过 Tauri 事件 `context_menu://selected` 通知前端用户选择结果
//!
//! ## 使用场景
//!
//! - 用户在文件树中右键点击时显示文件操作菜单
//! - 用户在编辑器中右键点击时显示编辑操作菜单
//! - 用户在终端中右键点击时显示终端操作菜单
//!
//! ## 跨平台实现
//!
//! - Windows / Linux：通过 Tauri 2.x Menu API 创建原生菜单，调用 `popup()` 显示
//! - macOS：通过 NSMenu 弹出（由 Tauri 内部处理）

use serde::Deserialize;
use tauri::menu::{Menu, MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// 上下文菜单项结构
///
/// 表示右键菜单中的单个菜单项。
#[derive(Debug, Deserialize)]
pub struct ContextMenuItem {
    /// 菜单项唯一标识符
    pub id: String,
    /// 菜单项显示文本
    pub label: String,
    /// 菜单项是否可用（可选，默认为 true）
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

/// serde 默认值函数，菜单项默认启用
fn default_enabled() -> bool {
    true
}

/// 位置坐标结构
///
/// 表示屏幕上的二维坐标点，用于指定菜单显示位置。
#[derive(Debug, Deserialize)]
pub struct Position {
    /// 水平坐标（像素）
    pub x: f64,
    /// 垂直坐标（像素）
    pub y: f64,
}

/// 显示上下文菜单命令
///
/// 在指定位置显示右键上下文菜单。用户选择某项后通过
/// `context_menu://selected` 事件将 ID 发送回前端。
///
/// 跨平台实现说明：
/// - Windows / Linux：通过 `popup_menu` / `popup_menu_at` 在当前窗口弹出
/// - macOS：通过 `popup_menu_at` 在指定坐标显示
#[tauri::command]
pub async fn show_context_menu<R: Runtime>(
    app: AppHandle<R>,
    items: Vec<ContextMenuItem>,
    position: Option<Position>,
) -> Result<Option<String>, String> {
    // 构建菜单
    let mut menu_builder: MenuBuilder<R> = MenuBuilder::new(&app);

    for it in &items {
        let label = if it.enabled {
            it.label.clone()
        } else {
            format!("{} （已禁用）", it.label)
        };
        let mi: MenuItem<R> = MenuItemBuilder::with_id(&it.id, &label)
            .enabled(it.enabled)
            .build(&app)
            .map_err(|e| format!("创建菜单项失败: {e}"))?;
        menu_builder = menu_builder.item(&mi);
    }

    let menu: Menu<R> = menu_builder
        .build()
        .map_err(|e| format!("构建菜单失败: {e}"))?;

    // 监听菜单项点击事件
    let app_handle_for_event = app.clone();
    menu.set_app_event_handler(move |_app, event| {
        if let tauri::menu::MenuEvent::MenuItem(menu_id) = event {
            let id = menu_id.0.clone();
            let _ = app_handle_for_event.emit("context_menu://selected", id);
        }
    });

    // 弹出菜单
    if let Some(win) = app.get_webview_window("main") {
        if let Some(pos) = position {
            let _ = win.popup_menu_at(
                &menu,
                Some(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: pos.x as i32,
                    y: pos.y as i32,
                })),
            );
        } else {
            let _ = win.popup_menu(&menu);
        }
    }

    // 实际选择结果通过事件 `context_menu://selected` 推送；命令本身保持返回 None
    Ok(None)
}
