//! # 工作区选择界面
//!
//! 启动时显示可用工作区列表，用户通过上下箭头选择，
//! 确认后进入会话列表界面。

use std::sync::{LazyLock, Mutex};

use anyhow::Result;
use crossterm::event::{KeyCode, KeyModifiers};
use ratatui::{
    layout::{Constraint, Direction, Layout},
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Padding, Paragraph},
    Frame,
};

use crate::app::{Screen, TuiApp};
use crate::theme::Theme;

/// 模拟的工作区列表（骨架阶段硬编码，后续从服务器获取）
const WORKSPACES: &[&str] = &[
    "~/projects/ydsz-buddy",
    "~/projects/demo-app",
    "~/work/client-project",
];

/// 当前列表选中的索引
static SELECTED_INDEX: LazyLock<Mutex<usize>> = LazyLock::new(|| Mutex::new(0));

/// 渲染工作区选择界面
pub fn render(app: &mut TuiApp, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let theme = &app.theme;
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(3),  // 标题
            Constraint::Min(3),     // 工作区列表
            Constraint::Length(3),  // 提示
        ])
        .split(area);

    // 标题
    let title = Paragraph::new(Line::from(vec![
        Span::styled(" 工作区选择 ", Style::default()
            .fg(theme.primary)
            .add_modifier(Modifier::BOLD)),
        Span::styled(" — 使用 ↑↓ 选择，Enter 确认 ", theme.muted_text()),
    ]))
    .block(Block::default().borders(Borders::BOTTOM).border_style(border_style(theme)));
    frame.render_widget(title, chunks[0]);

    // 工作区列表
    let selected = *SELECTED_INDEX.lock().unwrap();
    let items: Vec<ListItem> = WORKSPACES
        .iter()
        .enumerate()
        .map(|(i, ws)| {
            let style = if selected == i && matches!(app.screen, Screen::WorkspaceSelect) {
                theme.selected()
            } else {
                theme.text()
            };
            ListItem::new(Line::from(vec![
                Span::styled("  📁 ", style),
                Span::styled(*ws, style),
            ]))
        })
        .collect();

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(border_style(theme))
                .padding(Padding::horizontal(1))
                .title("工作区")
                .title_style(title_style(theme)),
        )
        .highlight_style(theme.selected());

    let mut state = ListState::default();
    state.select(Some(selected));
    frame.render_stateful_widget(list, chunks[1], &mut state);

    // 底部提示
    let help = Paragraph::new(Line::from(vec![
        Span::styled(" Esc ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("退出  ", theme.text()),
        Span::styled(" Enter ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("确认  ", theme.text()),
        Span::styled(" Tab ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("切换 ", theme.text()),
    ]))
    .block(Block::default().borders(Borders::TOP).border_style(theme.border()));
    frame.render_widget(help, chunks[2]);
}

/// 处理输入
pub async fn handle_input(
    app: &mut TuiApp,
    code: KeyCode,
    _modifiers: KeyModifiers,
) -> Result<()> {
    match code {
        KeyCode::Up => {
            let mut idx = SELECTED_INDEX.lock().unwrap();
            if *idx > 0 {
                *idx -= 1;
            }
        }
        KeyCode::Down => {
            let mut idx = SELECTED_INDEX.lock().unwrap();
            if *idx < WORKSPACES.len() - 1 {
                *idx += 1;
            }
        }
        KeyCode::Enter => {
            // 确认选择，切换到会话列表
            let idx = *SELECTED_INDEX.lock().unwrap();
            app.current_workspace = Some(WORKSPACES[idx].to_string());
            app.screen = Screen::SessionList;
        }
        _ => {}
    }
    Ok(())
}

fn border_style(theme: &Theme) -> Style {
    Style::default().fg(theme.border)
}

fn title_style(theme: &Theme) -> Style {
    Style::default()
        .fg(theme.primary)
        .add_modifier(Modifier::BOLD)
}
