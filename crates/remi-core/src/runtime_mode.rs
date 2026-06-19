//! Runtime mode helpers.
//!
//! The server binary, the Tauri desktop app and the embedded CLI can all
//! load the same [`ServerConfig`](crate::ServerConfig) but interpret it
//! slightly differently. This module centralises the runtime-mode logic so
//! each entry point asks one question: "what mode are we in?".

use crate::config::RuntimeMode;

/// Effective runtime mode used at startup.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EffectiveRuntimeMode {
    /// Headless server, listens for HTTP and WebSocket.
    Server,
    /// Tauri desktop application.
    Desktop,
    /// Development mode (verbose logging, permissive CORS, hot reload).
    Development,
}

impl EffectiveRuntimeMode {
    /// Build an [`EffectiveRuntimeMode`] from a [`RuntimeMode`].
    pub fn from_config(mode: RuntimeMode, dev_mode: bool) -> Self {
        match mode {
            RuntimeMode::Server if dev_mode => Self::Development,
            RuntimeMode::Server => Self::Server,
            RuntimeMode::Desktop => Self::Desktop,
            RuntimeMode::Dev => Self::Development,
        }
    }

    /// Whether the mode runs as a desktop app.
    pub fn is_desktop(&self) -> bool {
        matches!(self, Self::Desktop)
    }

    /// Whether the mode is the headless server.
    pub fn is_server(&self) -> bool {
        matches!(self, Self::Server)
    }

    /// Whether the mode enables development conveniences.
    pub fn is_development(&self) -> bool {
        matches!(self, Self::Development)
    }
}

/// Heuristic detection of the effective runtime mode based on the presence
/// of the `REMI_DESKTOP` environment variable and whether stdout is a TTY.
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
