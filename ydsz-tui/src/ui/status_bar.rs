//! # 底部状态栏
//!
//! 显示当前工作区、执行模式、连接状态和 Token 用量。

use ratatui::{
    layout::{Constraint, Direction, Layout},
    style::Style,
    text::{Line, Span},
    widgets::Paragraph,
    Frame,
};

use crate::app::TuiApp;

/// 渲染底部状态栏
pub fn render(app: &TuiApp, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let theme = &app.theme;

    // 状态栏分三段：工作区 + 模式/连接 + Token
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(34),
            Constraint::Percentage(33),
            Constraint::Percentage(33),
        ])
        .split(area);

    // 第一段：工作区信息
    let workspace = app.current_workspace.as_deref().unwrap_or("未选择");
    let ws_span = Span::styled(
        format!(" 📁 {} ", workspace),
        theme.status_bar(),
    );

    // 第二段：模式 + 连接状态
    let connected_icon = if app.client.is_connected() { "🟢" } else { "🔴" };
    let mode_span = Span::styled(
        format!(" {} 模式:{} {} ", connected_icon, app.mode, connected_icon),
        theme.status_bar(),
    );

    // 第三段：Token 用量
    let usage = &app.token_usage;
    let token_span = Span::styled(
        format!(" Tok: ↓{} ↑{} ", usage.input_tokens, usage.output_tokens),
        theme.status_bar(),
    );

    // 渲染三段状态到三个区域
    frame.render_widget(Paragraph::new(Line::from(vec![ws_span])).style(theme.status_bar()), chunks[0]);
    frame.render_widget(Paragraph::new(Line::from(vec![mode_span])).style(theme.status_bar()), chunks[1]);
    frame.render_widget(Paragraph::new(Line::from(vec![token_span])).style(theme.status_bar()), chunks[2]);
}
