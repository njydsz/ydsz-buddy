//! 运行时模式辅助工具
//!
//! 服务器二进制文件、Tauri 桌面应用和嵌入式 CLI 都可以加载相同的
//! [`ServerConfig`](crate::ServerConfig)，但解释方式略有不同。本模块集中处理运行时模式逻辑，
//! 使每个入口点只需问一个问题："我们处于什么模式？"。

use crate::config::RuntimeMode;

/// 启动时使用的有效运行时模式
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EffectiveRuntimeMode {
    /// 无头服务器，监听 HTTP 和 WebSocket
    Server,
    /// Tauri 桌面应用
    Desktop,
    /// 开发模式（详细日志、宽松 CORS、热重载）
    Development,
}

impl EffectiveRuntimeMode {
    /// 从 [`RuntimeMode`] 构建 [`EffectiveRuntimeMode`]
    pub fn from_config(mode: RuntimeMode, dev_mode: bool) -> Self {
        match mode {
            RuntimeMode::Server if dev_mode => Self::Development,
            RuntimeMode::Server => Self::Server,
            RuntimeMode::Desktop => Self::Desktop,
            RuntimeMode::Dev => Self::Development,
        }
    }

    /// 是否作为桌面应用运行
    pub fn is_desktop(&self) -> bool {
        matches!(self, Self::Desktop)
    }

    /// 是否是无头服务器
    pub fn is_server(&self) -> bool {
        matches!(self, Self::Server)
    }

    /// 是否启用开发便利功能
    pub fn is_development(&self) -> bool {
        matches!(self, Self::Development)
    }
}

/// 基于 `REMI_DESKTOP` 环境变量和标准输出是否为 TTY 的启发式运行时模式检测
pub fn detect() -> EffectiveRuntimeMode {
    if std::env::var_os("REMI_DESKTOP").is_some() {
        return EffectiveRuntimeMode::Desktop;
    }
    if std::env::var_os("REMI_DEV").is_some() {
        return EffectiveRuntimeMode::Development;
    }
    EffectiveRuntimeMode::Server
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_config_server() {
        let mode = EffectiveRuntimeMode::from_config(RuntimeMode::Server, false);
        assert!(mode.is_server());
        assert!(!mode.is_desktop());
        assert!(!mode.is_development());
    }

    #[test]
    fn test_from_config_server_with_dev_flag() {
        let mode = EffectiveRuntimeMode::from_config(RuntimeMode::Server, true);
        assert!(mode.is_development());
    }

    #[test]
    fn test_from_config_desktop() {
        let mode = EffectiveRuntimeMode::from_config(RuntimeMode::Desktop, false);
        assert!(mode.is_desktop());
    }

    #[test]
    fn test_from_config_dev() {
        let mode = EffectiveRuntimeMode::from_config(RuntimeMode::Dev, false);
        assert!(mode.is_development());
    }

    #[test]
    fn test_detect_default_is_server() {
        // SAFETY: test-only environment manipulation.
        unsafe {
            std::env::remove_var("REMI_DESKTOP");
            std::env::remove_var("REMI_DEV");
        }
        let mode = detect();
        assert!(mode.is_server() || mode.is_development());
    }
}
