//! # 对话界面
//!
//! 核心对话视图，包含消息列表（支持流式渲染）、输入框和快捷键提示。

use ratatui::{
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Padding, Paragraph, Wrap},
    Frame,
};

use crate::app::TuiApp;
use crate::theme::Theme;

/// 渲染对话界面
pub fn render(app: &mut TuiApp, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    // 垂直布局：消息区域 + 输入区域 + 底部提示
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(3),     // 消息列表
            Constraint::Length(5),  // 输入框
            Constraint::Length(1),  // 快捷键提示
        ])
        .split(area);

    // 渲染消息区域（可变借用 app.messages）
    render_messages(app, frame, chunks[0]);

    // 渲染输入框（可变借用 app.input）
    render_input(app, frame, chunks[1]);

    // 渲染快捷键提示（只需 theme 的不可变引用）
    render_shortcuts(&app.theme, frame, chunks[2]);
}

/// 渲染消息列表
fn render_messages(app: &mut TuiApp, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let theme = &app.theme;

    let messages_block = Block::default()
        .borders(Borders::ALL)
        .border_style(theme.border())
        .title(" 对话 ")
        .title_style(theme.title())
        .padding(Padding::horizontal(1));

    if app.messages.is_empty() {
        let empty = Paragraph::new(vec![
            Line::from(vec![
                Span::styled("暂无消息", theme.muted_text()),
            ]),
            Line::from(vec![
                Span::styled("输入内容开始对话，按 Tab 切换界面", theme.system_text()),
            ]),
        ])
        .block(messages_block)
        .wrap(Wrap { trim: false });
        frame.render_widget(empty, area);
        return;
    }

    // 构建消息行
    let mut lines: Vec<Line> = Vec::new();
    for msg in &app.messages {
        match msg.role {
            ydsz_core::models::MessageRole::User => {
                lines.push(Line::from(vec![
                    Span::styled(" 👤 ", theme.text()),
                    Span::styled(&msg.text, theme.user_bubble()),
                ]));
            }
            ydsz_core::models::MessageRole::Assistant => {
                // 简化 Markdown 渲染：直接显示文本
                let streaming_marker = if msg.streaming { " ●" } else { "" };
                lines.push(Line::from(vec![
                    Span::styled(" 🤖 ", theme.text()),
                    Span::styled(format!("{}{}", msg.text, streaming_marker), theme.assistant_bubble()),
                ]));
            }
            ydsz_core::models::MessageRole::System => {
                lines.push(Line::from(vec![
                    Span::styled(" ⚙ ", theme.muted_text()),
                    Span::styled(&msg.text, theme.system_text()),
                ]));
            }
        }
        // 分隔线
        lines.push(Line::from(Span::styled("  ─", theme.border())));
    }

    let text = Text::from(lines);
    let messages_para = Paragraph::new(text)
        .block(messages_block)
        .wrap(Wrap { trim: false })
        .scroll((0, 0)); // TODO: 根据消息数量和区域高度计算滚动偏移

    frame.render_widget(messages_para, area);
}

/// 渲染输入框
fn render_input(app: &mut TuiApp, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let theme = &app.theme;

    let input_text = if app.input.is_empty() {
        Span::styled("输入消息...（Enter 发送，Esc 返回）", theme.muted_text())
    } else {
        Span::raw(&app.input)
    };

    let input_para = Paragraph::new(Line::from(vec![input_text]))
        .block(
            Block::default()
                .borders(Borders::TOP)
                .border_style(theme.border())
                .title(" 输入 ")
                .title_style(theme.primary_text())
                .padding(Padding::horizontal(1)),
        )
        .wrap(Wrap { trim: false });

    frame.render_widget(input_para, area);
}

/// 渲染快捷键提示
fn render_shortcuts(theme: &Theme, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    let help_line = Line::from(vec![
        Span::styled(" Enter ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("发送 ", theme.text()),
        Span::styled(" Esc ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("返回列表 ", theme.text()),
        Span::styled(" Ctrl+N ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("新会话 ", theme.text()),
        Span::styled(" Ctrl+C ", Style::default().add_modifier(Modifier::BOLD)),
        Span::styled("退出", theme.text()),
    ]);

    let help = Paragraph::new(help_line);
    frame.render_widget(help, area);
}
