//! # 对话界面
//!
//! 核心对话视图，包含消息列表（支持流式渲染）、输入框和快捷键提示。
//! 从 TuiApp.state.messages 读取真实数据，支持逐字流式更新。

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Padding, Paragraph, Wrap},
    Frame,
};

use crate::app::TuiApp;
use crate::theme::Theme;

/// 渲染对话界面
pub fn render(app: &mut TuiApp, frame: &mut Frame<'_>, area: ratatui::layout::Rect) {
    // 垂直布局：消息区域 + 连接状态提示 + 输入区域 + 底部提示
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

/// 渲染消息列表（带自动滚动）
fn render_messages(app: &mut TuiApp, frame: &mut Frame<'_>, area: Rect) {
    let theme = &app.theme;

    let messages_block = Block::default()
        .borders(Borders::ALL)
        .border_style(theme.border())
        .title(" 对话 ")
        .title_style(theme.title())
        .padding(Padding::horizontal(1));

    if app.messages.is_empty() {
        let status_hint = if app.client.is_connected() {
            "输入内容开始对话，按 Tab 切换界面"
        } else if app.client.is_reconnecting() {
            "正在重新连接..."
        } else {
            "等待连接..."
        };

        let empty = Paragraph::new(vec![
            Line::from(vec![
                Span::styled("暂无消息", theme.muted_text()),
            ]),
            Line::from(vec![
                Span::styled(status_hint, theme.system_text()),
            ]),
        ])
        .block(messages_block)
        .wrap(Wrap { trim: false });
        frame.render_widget(empty, area);
        return;
    }

    // 计算可用高度和总行数
    let available_height = area.height.saturating_sub(2); // 减去上下边框

    // 构建消息行
    let mut all_lines: Vec<Line> = Vec::new();
    for msg in &app.messages {
        match msg.role {
            ydsz_core::models::MessageRole::User => {
                // 用户消息：右对齐气泡样式
                let streaming_marker = if msg.streaming { " ●" } else { "" };
                all_lines.push(Line::from(vec![
                    Span::styled(" 👤 你", theme.user_label()),
                    Span::styled(streaming_marker, theme.streaming_indicator()),
                ]));
                all_lines.push(Line::from(vec![
                    Span::raw("    "),
                    Span::styled(
                        format!("{}{}", msg.text, if msg.streaming { "" } else { "" }),
                        theme.user_bubble(),
                    ),
                ]));
            }
            ydsz_core::models::MessageRole::Assistant => {
                // 助手消息：左对齐，带流式指示器
                let streaming_marker = if msg.streaming { " ●" } else { "" };
                all_lines.push(Line::from(vec![
                    Span::styled(" 🤖 AI", theme.assistant_label()),
                    Span::styled(streaming_marker, theme.streaming_indicator()),
                ]));

                // 处理多行文本内容
                if msg.text.is_empty() && msg.streaming {
                    all_lines.push(Line::from(vec![
                        Span::styled("    ...", theme.streaming_indicator()),
                    ]));
                } else {
                    // 按换行符分割文本
                    for line_text in msg.text.lines() {
                        all_lines.push(Line::from(vec![
                            Span::raw("    "),
                            Span::styled(line_text.to_string(), theme.assistant_bubble()),
                        ]));
                    }
                }
            }
            ydsz_core::models::MessageRole::System => {
                // 系统消息：斜体灰色
                all_lines.push(Line::from(vec![
                    Span::styled(" ⚙ 系统", theme.muted_text()),
                ]));
                all_lines.push(Line::from(vec![
                    Span::raw("    "),
                    Span::styled(&msg.text, theme.system_text()),
                ]));
            }
        }
        // 分隔线
        all_lines.push(Line::from(Span::raw("")));
    }

    // 计算需要滚动的行数（保持最新消息在底部）
    let total_lines = all_lines.len() as u16;
    let scroll_offset = if total_lines > available_height {
        total_lines - available_height
    } else {
        0
    };

    let text = Text::from(all_lines);
    let messages_para = Paragraph::new(text)
        .block(messages_block)
        .wrap(Wrap { trim: false })
        .scroll((scroll_offset, 0));

    frame.render_widget(messages_para, area);
}

/// 渲染输入框
fn render_input(app: &mut TuiApp, frame: &mut Frame<'_>, area: Rect) {
    let theme = &app.theme;

    let (input_text, border_title) = if app.input.is_empty() {
        let hint = if app.client.is_connected() {
            "输入消息...（Enter 发送，Esc 返回）"
        } else if app.client.is_reconnecting() {
            "重连中，请稍候..."
        } else {
            "离线 - 按 Enter 尝试发送（将缓存）"
        };
        (
            Span::styled(hint, theme.muted_text()),
            " 输入 (离线) ",
        )
    } else {
        (
            Span::raw(&app.input),
            " 输入 ",
        )
    };

    let border_style = if app.client.is_connected() {
        theme.border()
    } else {
        theme.error_border()
    };

    let input_para = Paragraph::new(Line::from(vec![input_text]))
        .block(
            Block::default()
                .borders(Borders::TOP)
                .border_style(border_style)
                .title(border_title)
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
