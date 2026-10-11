//! # 配色主题
//!
//! 定义 TUI 的配色方案，支持 ANSI 256 色和 true color。
//! 使用默认终端背景，通过高亮和色彩区分不同 UI 元素。
//!
//! ## 颜色主题
//!
//! - 主色调：深蓝色（品牌色，稳定感）
//! - 成功/接收：青绿色（信息接收）
//! - 操作/输入：琥珀色（用户操作）
//! - 错误/警告：红色系
//! - 边框/辅助：灰色系

use ratatui::style::{Color, Modifier, Style};

/// 主题结构体，定义所有 UI 元素的样式
#[allow(dead_code)]
pub struct Theme {
    /// 主色调（品牌色）
    pub primary: Color,
    /// 次要色调
    pub secondary: Color,
    /// 成功状态色
    pub success: Color,
    /// 警告状态色
    pub warning: Color,
    /// 错误状态色
    pub error: Color,
    /// 信息提示色
    pub info: Color,
    /// 背景色（默认）
    pub background: Color,
    /// 前景色（文本）
    pub foreground: Color,
    /// 边框色
    pub border: Color,
    /// 选中高亮色
    pub highlight: Color,
    /// 淡色（辅助文本）
    pub muted: Color,
    /// 用户消息颜色
    pub user_color: Color,
    /// 助手消息颜色
    pub assistant_color: Color,
    /// 流式传输指示器颜色
    pub streaming_color: Color,
}

impl Default for Theme {
    fn default() -> Self {
        Self {
            primary: Color::Rgb(0, 122, 204),       // 蓝色主调
            secondary: Color::Rgb(0, 150, 136),      // 青绿色
            success: Color::Rgb(80, 200, 120),       // 绿色
            warning: Color::Rgb(255, 193, 7),        // 琥珀色
            error: Color::Rgb(220, 53, 69),          // 红色
            info: Color::Rgb(0, 122, 204),           // 蓝色
            background: Color::Reset,                 // 默认终端背景
            foreground: Color::Reset,                 // 默认终端前景
            border: Color::DarkGray,
            highlight: Color::Rgb(0, 122, 204),      // 高亮蓝
            muted: Color::DarkGray,
            user_color: Color::Rgb(0, 150, 136),     // 青绿色
            assistant_color: Color::Rgb(139, 92, 246), // 紫色
            streaming_color: Color::Rgb(0, 200, 255), // 亮蓝闪烁
        }
    }
}

#[allow(dead_code)]
impl Theme {
    /// 获取样式：普通文本
    pub fn text(&self) -> Style {
        Style::default().fg(self.foreground)
    }

    /// 获取样式：主色调文本
    pub fn primary_text(&self) -> Style {
        Style::default().fg(self.primary)
    }

    /// 获取样式：边框
    pub fn border(&self) -> Style {
        Style::default().fg(self.border)
    }

    /// 获取样式：错误边框（断线时输入框使用）
    pub fn error_border(&self) -> Style {
        Style::default().fg(self.error)
    }

    /// 获取样式：选中的列表项
    pub fn selected(&self) -> Style {
        Style::default()
            .fg(self.background)
            .bg(self.highlight)
            .add_modifier(Modifier::BOLD)
    }

    /// 获取样式：标题
    pub fn title(&self) -> Style {
        Style::default()
            .fg(self.primary)
            .add_modifier(Modifier::BOLD)
    }

    /// 获取样式：状态栏背景
    pub fn status_bar(&self) -> Style {
        Style::default()
            .fg(self.foreground)
            .bg(self.primary)
    }

    /// 获取样式：用户消息标签
    pub fn user_label(&self) -> Style {
        Style::default()
            .fg(self.user_color)
            .add_modifier(Modifier::BOLD)
    }

    /// 获取样式：助手消息标签
    pub fn assistant_label(&self) -> Style {
        Style::default()
            .fg(self.assistant_color)
            .add_modifier(Modifier::BOLD)
    }

    /// 获取样式：用户消息气泡
    pub fn user_bubble(&self) -> Style {
        Style::default()
            .fg(Color::Rgb(220, 245, 240))
    }

    /// 获取样式：助手消息气泡
    pub fn assistant_bubble(&self) -> Style {
        Style::default()
            .fg(self.foreground)
    }

    /// 获取样式：系统消息
    pub fn system_text(&self) -> Style {
        Style::default()
            .fg(self.muted)
            .add_modifier(Modifier::ITALIC)
    }

    /// 获取样式：流式指示器（闪烁效果）
    pub fn streaming_indicator(&self) -> Style {
        Style::default()
            .fg(self.streaming_color)
            .add_modifier(Modifier::BOLD | Modifier::SLOW_BLINK)
    }

    /// 获取样式：错误消息
    pub fn error_text(&self) -> Style {
        Style::default().fg(self.error)
    }

    /// 获取样式：成功消息
    pub fn success_text(&self) -> Style {
        Style::default().fg(self.success)
    }

    /// 获取样式：淡色辅助文本
    pub fn muted_text(&self) -> Style {
        Style::default().fg(self.muted)
    }

    /// 获取样式：重连提示
    pub fn reconnecting_text(&self) -> Style {
        Style::default()
            .fg(self.warning)
            .add_modifier(Modifier::BOLD)
    }
}
