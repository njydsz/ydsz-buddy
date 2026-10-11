//! # 设置面板
//!
//! 允许用户切换 Provider、执行权限模式等配置。

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

/// 当前设置项选中索引
static mut PROVIDER_SELECTED: usize = 0;
static mut MODE_SELECTED: usize = 0;
static mut ACTIVE_SECTION: u8 = 0; // 0=Provider, 1=Mode

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
    let highlight = unsafe { ACTIVE_SECTION == 0 };
    let items: Vec<ListItem> = PROVIDERS
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let selected = highlight && unsafe { PROVIDER_SELECTED } == i;
            let style = if selected {
                theme.selected()
            } else {
                theme.text()
            };
            ListItem::new(Line::from(vec![
                Span::styled(if selected { " ▶ " } else { "   " }, theme.primary_text()),
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

    let mut state = ListState::default();
    state.select(Some(unsafe { PROVIDER_SELECTED }));
    frame.render_stateful_widget(list, area, &mut state);
}

fn render_mode_list(theme: &Theme, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let highlight = unsafe { ACTIVE_SECTION == 1 };
    let items: Vec<ListItem> = MODES
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let selected = highlight && unsafe { MODE_SELECTED } == i;
            let style = if selected {
                theme.selected()
            } else {
                theme.text()
            };
            ListItem::new(Line::from(vec![
                Span::styled(if selected { " ▶ " } else { "   " }, theme.primary_text()),
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

    let mut state = ListState::default();
    state.select(Some(unsafe { MODE_SELECTED }));
    frame.render_stateful_widget(list, area, &mut state);
}

/// 处理输入
pub async fn handle_input(
    app: &mut TuiApp,
    code: KeyCode,
    _modifiers: KeyModifiers,
) -> Result<()> {
    match code {
        KeyCode::Tab => {
            unsafe {
                ACTIVE_SECTION = if ACTIVE_SECTION == 0 { 1 } else { 0 };
            }
        }
        KeyCode::Up => {
            unsafe {
                if ACTIVE_SECTION == 0 && PROVIDER_SELECTED > 0 {
                    PROVIDER_SELECTED -= 1;
                } else if ACTIVE_SECTION == 1 && MODE_SELECTED > 0 {
                    MODE_SELECTED -= 1;
                }
            }
        }
        KeyCode::Down => {
            unsafe {
                if ACTIVE_SECTION == 0 && PROVIDER_SELECTED < PROVIDERS.len() - 1 {
                    PROVIDER_SELECTED += 1;
                } else if ACTIVE_SECTION == 1 && MODE_SELECTED < MODES.len() - 1 {
                    MODE_SELECTED += 1;
                }
            }
        }
        KeyCode::Enter => {
            // 确认选择
            unsafe {
                app.mode = match MODE_SELECTED {
                    0 => "code".to_string(),
                    1 => "work".to_string(),
                    2 => "plan".to_string(),
                    3 => "ask".to_string(),
                    _ => "code".to_string(),
                };
            }
        }
        KeyCode::Esc => {
            // 返回工作区选择
            app.screen = crate::app::Screen::WorkspaceSelect;
        }
        _ => {}
    }
    Ok(())
}
