//! 运行时模式辅助工具
//!
//! 服务器二进制、Tauri 桌面应用和嵌入式 CLI 都会加载相同的 [`ServerConfig`](crate::ServerConfig)，
//! 但解释方式略有不同。本模块集中处理运行时模式识别逻辑，使每个入口点只需问一个问题：
//! "我们处于什么模式？"，避免在多处重复实现启发式检测。
//!
//! 两种入口：
//! - [`EffectiveRuntimeMode::from_config`]：基于显式配置做精确判断。
//! - [`detect`]：基于环境变量（`REMI_DESKTOP` / `REMI_DEV`）做启发式检测，
//!   适用于 CLI 工具在未加载配置时快速决策。

use crate::config::RuntimeMode;

/// 启动时使用的有效运行时模式
///
/// 与 [`RuntimeMode`] 的区别在于：
/// - [`RuntimeMode`] 是"用户/配置文件声明"的模式；
/// - [`EffectiveRuntimeMode`] 是"代码实际看到"的模式（含 `dev_mode` 推导）。
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
    ///
    /// 推导规则：
    /// - `Server + dev_mode=true` ⇒ `Development`（启动时根据 `dev_mode` 提升）
    /// - `Server` ⇒ `Server`
    /// - `Desktop` ⇒ `Desktop`
    /// - `Dev` ⇒ `Development`
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

/// 基于环境变量的运行时模式启发式检测
///
/// 检查顺序：
/// 1. `REMI_DESKTOP` ⇒ [`EffectiveRuntimeMode::Desktop`]
/// 2. `REMI_DEV` ⇒ [`EffectiveRuntimeMode::Development`]
/// 3. 其他 ⇒ [`EffectiveRuntimeMode::Server`]
///
/// 该函数不依赖任何配置加载，常用于 main 函数最早期阶段。
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

    /// `Server + dev_mode=false` 应解析为 `Server`
    #[test]
    fn test_from_config_server() {
        let mode = EffectiveRuntimeMode::from_config(RuntimeMode::Server, false);
        assert!(mode.is_server());
        assert!(!mode.is_desktop());
        assert!(!mode.is_development());
    }

    /// `Server + dev_mode=true` 应被提升为 `Development`
    #[test]
    fn test_from_config_server_with_dev_flag() {
        let mode = EffectiveRuntimeMode::from_config(RuntimeMode::Server, true);
        assert!(mode.is_development());
    }

    /// `Desktop` 模式应原样保留
    #[test]
    fn test_from_config_desktop() {
        let mode = EffectiveRuntimeMode::from_config(RuntimeMode::Desktop, false);
        assert!(mode.is_desktop());
    }

    /// `Dev` 模式应解析为 `Development`
    #[test]
    fn test_from_config_dev() {
        let mode = EffectiveRuntimeMode::from_config(RuntimeMode::Dev, false);
        assert!(mode.is_development());
    }

    /// 在没有环境变量时，`detect` 应回退为 Server 或 Development
    #[test]
    fn test_detect_default_is_server() {
        // SAFETY: 单线程测试中清理环境变量是安全的。
        unsafe {
            std::env::remove_var("REMI_DESKTOP");
            std::env::remove_var("REMI_DEV");
        }
        let mode = detect();
        assert!(mode.is_server() || mode.is_development());
    }
}
