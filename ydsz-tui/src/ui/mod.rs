//! # UI 模块
//!
//! 包含所有 TUI 界面的渲染逻辑，每个子模块对应一个独立的界面组件。

pub mod chat_view;
pub mod session_list;
pub mod settings;
pub mod status_bar;
pub mod workspace_selector;

use anyhow::Result;
use crossterm::event::{KeyCode, KeyModifiers};

use crate::app::TuiApp;

/// 通用屏幕输入分发函数
/// 根据当前屏幕状态将输入路由到对应处理器
pub async fn handle_screen_input(
    app: &mut TuiApp,
    code: KeyCode,
    modifiers: KeyModifiers,
) -> Result<()> {
    match &app.screen {
        crate::app::Screen::WorkspaceSelect => {
            workspace_selector::handle_input(app, code, modifiers).await?;
        }
        crate::app::Screen::SessionList => {
            session_list::handle_input(app, code, modifiers).await?;
        }
        crate::app::Screen::Settings => {
            settings::handle_input(app, code, modifiers).await?;
        }
        crate::app::Screen::Chat { .. } => {
            // 聊天界面在 app.rs 中处理，不经过此路由
        }
    }
    Ok(())
}
