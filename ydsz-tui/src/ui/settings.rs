//! # 设置面板
//!
//! 允许用户切换 Provider、执行权限模式等配置。

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

use crate::app::TuiApp;
use crate::theme::Theme;

/// 支持的 Provider 列表
const PROVIDERS: &[&str] = &[
    "claude (Anthropic)",
    "codex (OpenAI)",
    "gemini (Google)",
    "deepseek",
    "kimi (Moonshot)",
    "qwen (通义千问)",
    "glm (智谱)",
    "doubao (豆包)",
    "文心一言 (Ernie)",
    "混元 (Hunyuan)",
];

/// 支持的执行模式
const MODES: &[&str] = &[
    "code (代码开发模式)",
    "work (办公自动化模式)",
    "plan (规划模式)",
    "ask (问答模式)",
];

/// 设置面板的持久状态
#[derive(Default)]
struct SettingsState {
    provider_selected: usize,
    mode_selected: usize,
    active_section: u8, // 0=Provider, 1=Mode
}

/// 当前设置项选中索引
static SETTINGS_STATE: LazyLock<Mutex<SettingsState>> =
    LazyLock::new(|| Mutex::new(SettingsState::default()));

/// 渲染设置面板
pub fn render(app: &mut TuiApp, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let theme = &app.theme;

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(3),  // 标题
            Constraint::Length(6),  // Provider 选择
            Constraint::Length(6),  // Mode 选择
            Constraint::Length(3),  // 提示信息
        ])
        .split(area);

    // 标题
    let title = Paragraph::new(Line::from(vec![
        Span::styled(" ⚙ 设置 ", Style::default()
            .fg(theme.primary)
            .add_modifier(Modifier::BOLD)),
    ]))
    .block(Block::default().borders(Borders::BOTTOM).border_style(theme.border()));
    frame.render_widget(title, chunks[0]);

    // Provider 列表
    render_provider_list(theme, frame, chunks[1]);

    // Mode 列表
    render_mode_list(theme, frame, chunks[2]);

    // 提示
    let help = Paragraph::new(Line::from(vec![
        Span::styled(" Tab ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("切换区间 ", theme.text()),
        Span::styled(" ↑↓ ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("选择 ", theme.text()),
        Span::styled(" Enter ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("确认  ", theme.text()),
        Span::styled(" Esc ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("返回 ", theme.text()),
    ]))
    .block(Block::default().borders(Borders::TOP).border_style(theme.border()));
    frame.render_widget(help, chunks[3]);

    let _ = app;
}

fn render_provider_list(theme: &Theme, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let state = SETTINGS_STATE.lock().unwrap();
    let highlight = state.active_section == 0;
    let selected = state.provider_selected;

    let items: Vec<ListItem> = PROVIDERS
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let is_selected = highlight && selected == i;
            let style = if is_selected {
                theme.selected()
            } else {
                theme.text()
            };
            ListItem::new(Line::from(vec![
                Span::styled(if is_selected { " ▶ " } else { "   " }, theme.primary_text()),
                Span::styled(*p, style),
            ]))
        })
        .collect();

    let block = Block::default()
        .borders(Borders::ALL)
        .title(" AI Provider ")
        .title_style(theme.title())
        .border_style(if highlight { Style::default().fg(theme.highlight) } else { theme.border() })
        .padding(Padding::horizontal(1));

    let list = List::new(items).block(block);

    let mut list_state = ListState::default();
    list_state.select(Some(selected));
    frame.render_stateful_widget(list, area, &mut list_state);
}

fn render_mode_list(theme: &Theme, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let state = SETTINGS_STATE.lock().unwrap();
    let highlight = state.active_section == 1;
    let selected = state.mode_selected;

    let items: Vec<ListItem> = MODES
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let is_selected = highlight && selected == i;
            let style = if is_selected {
                theme.selected()
            } else {
                theme.text()
            };
            ListItem::new(Line::from(vec![
                Span::styled(if is_selected { " ▶ " } else { "   " }, theme.primary_text()),
                Span::styled(*m, style),
            ]))
        })
        .collect();

    let block = Block::default()
        .borders(Borders::ALL)
        .title(" 执行模式 ")
        .title_style(theme.title())
        .border_style(if highlight { Style::default().fg(theme.highlight) } else { theme.border() })
        .padding(Padding::horizontal(1));

    let list = List::new(items).block(block);

    let mut list_state = ListState::default();
    list_state.select(Some(selected));
    frame.render_stateful_widget(list, area, &mut list_state);
}

/// 处理输入
pub async fn handle_input(
    app: &mut TuiApp,
    code: KeyCode,
    _modifiers: KeyModifiers,
) -> Result<()> {
    match code {
        KeyCode::Tab => {
            let mut state = SETTINGS_STATE.lock().unwrap();
            state.active_section = if state.active_section == 0 { 1 } else { 0 };
        }
        KeyCode::Up => {
            let mut state = SETTINGS_STATE.lock().unwrap();
            if state.active_section == 0 && state.provider_selected > 0 {
                state.provider_selected -= 1;
            } else if state.active_section == 1 && state.mode_selected > 0 {
                state.mode_selected -= 1;
            }
        }
        KeyCode::Down => {
            let mut state = SETTINGS_STATE.lock().unwrap();
            if state.active_section == 0 && state.provider_selected < PROVIDERS.len() - 1 {
                state.provider_selected += 1;
            } else if state.active_section == 1 && state.mode_selected < MODES.len() - 1 {
                state.mode_selected += 1;
            }
        }
        KeyCode::Enter => {
            // 确认选择
            let state = SETTINGS_STATE.lock().unwrap();
            app.mode = match state.mode_selected {
                0 => "code".to_string(),
                1 => "work".to_string(),
                2 => "plan".to_string(),
                3 => "ask".to_string(),
                _ => "code".to_string(),
            };
        }
        KeyCode::Esc => {
            // 返回工作区选择
            app.screen = crate::app::Screen::WorkspaceSelect;
        }
        _ => {}
    }
    Ok(())
}
