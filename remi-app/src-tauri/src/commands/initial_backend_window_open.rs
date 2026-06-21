//! # Initial Backend Window Open 模块
//!
//! 控制 Tauri 主窗口的'初始打开策略'——比如：
//!
//! - 是否在打开时先隐藏后端 splash，等 readiness 上来再显示？
//! - 是否在 OS 启动时自启？
//! - 启动后默认显示哪个路由？
//!
//! 这些策略是 `tauri.conf.json` 的补充——conf.json 写'静态'默认值，
//! 运行时可以根据用户偏好 / 命令行参数动态调整。

use serde::{Deserialize, Serialize};

/// 窗口启动模式
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WindowOpenMode {
    /// 立即显示（默认）
    Immediate,
    /// 延后显示：等 readiness 上来再 `show()`
    AfterReady,
    /// 隐藏到托盘：只启动后端
    Hidden,
}

/// 启动参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitialWindowOpen {
    /// 启动模式
    pub mode: WindowOpenMode,
    /// 默认路由（前端可读）
    pub default_route: String,
    /// 是否开机自启
    pub auto_launch: bool,
    /// 启动后是否聚焦窗口
    pub focus_on_open: bool,
}

impl Default for InitialWindowOpen {
    fn default() -> Self {
        Self {
            mode: WindowOpenMode::AfterReady,
            default_route: "/".to_string(),
            auto_launch: false,
            focus_on_open: true,
        }
    }
}

impl InitialWindowOpen {
    /// 从命令行参数推导
    pub fn from_cli_args(args: &[String]) -> Self {
        let mut cfg = Self::default();
        for a in args {
            match a.as_str() {
                "--hidden" => cfg.mode = WindowOpenMode::Hidden,
                "--immediate" => cfg.mode = WindowOpenMode::Immediate,
                "--after-ready" => cfg.mode = WindowOpenMode::AfterReady,
                "--no-focus" => cfg.focus_on_open = false,
                "--auto-launch" => cfg.auto_launch = true,
                other if other.starts_with("--route=") => {
                    cfg.default_route = other.trim_start_matches("--route=").to_string();
                }
                _ => {}
            }
        }
        cfg
    }

    /// 是否应该立即 `show()` 主窗口
    pub fn should_show_now(&self) -> bool {
        self.mode == WindowOpenMode::Immediate || self.mode == WindowOpenMode::AfterReady
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_after_ready() {
        let cfg = InitialWindowOpen::default();
        assert_eq!(cfg.mode, WindowOpenMode::AfterReady);
        assert!(cfg.should_show_now());
    }

    #[test]
    fn cli_overrides() {
        let args = vec![
            "--hidden".to_string(),
            "--no-focus".to_string(),
            "--route=/chat".to_string(),
        ];
        let cfg = InitialWindowOpen::from_cli_args(&args);
        assert_eq!(cfg.mode, WindowOpenMode::Hidden);
        assert!(!cfg.focus_on_open);
        assert_eq!(cfg.default_route, "/chat");
        assert!(!cfg.should_show_now());
    }
}

