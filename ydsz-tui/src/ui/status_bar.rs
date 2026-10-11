//! # 底部状态栏
//!
//! 显示当前工作区、执行模式、连接状态、Token 用量和重连信息。

use ratatui::{
    layout::{Constraint, Direction, Layout},
    style::{Color, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::app::TuiApp;

/// 渲染底部状态栏
pub fn render(app: &TuiApp, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let theme = &app.theme;

    // 状态栏分四段：工作区 + 模式 + Token + 连接状态
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(28),
            Constraint::Percentage(24),
            Constraint::Percentage(24),
            Constraint::Percentage(24),
        ])
        .split(area);

    // 第一段：工作区信息
    let workspace = app.current_workspace.as_deref().unwrap_or("未选择");
    let ws_span = Span::styled(
        format!(" 📁 {} ", workspace),
        theme.status_bar(),
    );
    frame.render_widget(
        Paragraph::new(Line::from(vec![ws_span])).style(theme.status_bar()),
        chunks[0],
    );

    // 第二段：模式
    let mode_span = Span::styled(
        format!(" 模式:{} ", app.mode),
        theme.status_bar(),
    );
    frame.render_widget(
        Paragraph::new(Line::from(vec![mode_span])).style(theme.status_bar()),
        chunks[1],
    );

    // 第三段：Token 用量
    let usage = &app.token_usage;
    let token_text = if usage.current_turn_tokens > 0 {
        format!(" Tok:↓{}↑{} (本轮{}) ", usage.input_tokens, usage.output_tokens, usage.current_turn_tokens)
    } else {
        format!(" Tok: ↓{} ↑{} ", usage.input_tokens, usage.output_tokens)
    };
    let token_span = Span::styled(token_text, theme.status_bar());
    frame.render_widget(
        Paragraph::new(Line::from(vec![token_span])).style(theme.status_bar()),
        chunks[2],
    );

    // 第四段：连接状态（含重连信息）
    let conn_display = if app.client.is_connected() {
        ("🟢 已连接".to_string(), theme.status_bar())
    } else if app.client.is_reconnecting() {
        // 显示重连中状态（黄色背景突出）
        let text = if let Some(msg) = &app.connection_status {
            format!(" 🟡 {} ", msg)
        } else {
            " 🟡 重连中...".to_string()
        };
        // 截断以防过长
        let display = if text.len() > 25 {
            format!("{}...", &text[..22])
        } else {
            text
        };
        (display, Style::default().fg(theme.background).bg(theme.warning))
    } else {
        ("🔴 已断开".to_string(), Style::default().fg(theme.foreground).bg(Color::Rgb(80, 30, 30)))
    };

    let conn_span = Span::styled(conn_display.0, conn_display.1.clone());
    frame.render_widget(
        Paragraph::new(Line::from(vec![conn_span])).style(conn_display.1),
        chunks[3],
    );
}
