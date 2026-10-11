//! # 会话列表界面
//!
//! 显示当前工作区中的所有活跃会话线程，支持选择、新建等操作。

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

/// 当前列表选中的索引
static mut SELECTED_INDEX: usize = 0;

/// 渲染会话列表
pub fn render(app: &mut TuiApp, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let theme = &app.theme;
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(3),  // 标题栏
            Constraint::Min(3),     // 会话列表
            Constraint::Length(3),  // 底部操作提示
        ])
        .split(area);

    // 标题栏
    let workspace_display = app.current_workspace.as_deref().unwrap_or("未选择工作区");
    let title = Paragraph::new(Line::from(vec![
        Span::styled(" 会话列表 ", Style::default()
            .fg(theme.primary)
            .add_modifier(Modifier::BOLD)),
        Span::styled(format!(" — {} ", workspace_display), theme.muted_text()),
    ]))
    .block(Block::default().borders(Borders::BOTTOM).border_style(theme.border()));
    frame.render_widget(title, chunks[0]);

    // 会话列表（使用从服务器获取的数据或骨架数据）
    let threads = if app.threads.is_empty() {
        // 骨架阶段：显示占位数据
        vec![
            ("新会话 #1", "无消息"),
            ("新会话 #2", "无消息"),
        ]
    } else {
        app.threads
            .iter()
            .map(|t| (t.title.as_str(), t.latest_turn.as_ref().map(|lt| lt.id.as_str()).unwrap_or("待处理")))
            .collect()
    };

    let items: Vec<ListItem> = threads
        .iter()
        .enumerate()
        .map(|(i, (title, subtitle))| {
            let style = if unsafe { SELECTED_INDEX } == i {
                theme.selected()
            } else {
                theme.text()
            };
            let mode_icon = match app.mode.as_str() {
                "code" => "💻",
                "work" => "📋",
                _ => "💬",
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!(" {mode_icon} "), style),
                Span::styled(*title, Style::default().add_modifier(Modifier::BOLD)),
                Span::styled(format!("  — {subtitle}"), theme.muted_text()),
            ]))
        })
        .collect();

    let list_block = if items.is_empty() {
        Block::default()
            .borders(Borders::ALL)
            .title("暂无会话")
            .padding(Padding::uniform(1))
    } else {
        Block::default()
            .borders(Borders::ALL)
            .border_style(theme.border())
            .title("选择一个会话开始对话")
            .title_style(title_style(theme))
            .padding(Padding::horizontal(1))
    };

    let list = List::new(items)
        .block(list_block)
        .highlight_style(theme.selected());

    let mut state = ListState::default();
    state.select(Some(unsafe { SELECTED_INDEX }));
    frame.render_stateful_widget(list, chunks[1], &mut state);

    // 底部操作提示
    let help = Paragraph::new(Line::from(vec![
        Span::styled(" n ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("新建会话  ", theme.text()),
        Span::styled(" Enter ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("进入对话  ", theme.text()),
        Span::styled(" ⌫ ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("删除  ", theme.text()),
        Span::styled(" Esc ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("返回 ", theme.text()),
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
    let max_index = if app.threads.is_empty() { 2 } else { app.threads.len() };
    let max_index = max_index.saturating_sub(1);

    match code {
        KeyCode::Up => {
            unsafe {
                if SELECTED_INDEX > 0 {
                    SELECTED_INDEX -= 1;
                }
            }
        }
        KeyCode::Down => {
            unsafe {
                if SELECTED_INDEX < max_index {
                    SELECTED_INDEX += 1;
                }
            }
        }
        KeyCode::Enter => {
            // 进入选中的会话
            let thread_id = if app.threads.is_empty() {
                format!("skeleton-thread-{}", unsafe { SELECTED_INDEX })
            } else {
                app.threads[unsafe { SELECTED_INDEX }].id.to_string()
            };
            app.screen = Screen::Chat { thread_id };
        }
        KeyCode::Char('n') => {
            // 创建新会话
            let thread_id = format!("new-thread-{}", chrono::Utc::now().timestamp());
            app.screen = Screen::Chat { thread_id };
        }
        KeyCode::Esc => {
            // 返回工作区选择
            app.screen = Screen::WorkspaceSelect;
        }
        _ => {}
    }
    Ok(())
}

fn title_style(theme: &Theme) -> Style {
    Style::default()
        .fg(theme.primary)
        .add_modifier(Modifier::BOLD)
}
