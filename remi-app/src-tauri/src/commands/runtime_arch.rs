//! # Runtime Arch 模块
//!
//! 检测当前运行时的 CPU 架构 / OS / 平台信息，给前端做平台相关提示。
//!
//! ## 背景
//!
//! Tauri 桌面应用可能运行在：
//!
//! - macOS arm64 / x86_64
//! - Windows x86_64 / arm64
//! - Linux x86_64 / aarch64
//!
//! 不同架构的二进制/插件可能需要不同处理。

use serde::{Deserialize, Serialize};

/// 运行时架构信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeArch {
    /// CPU 架构（来自 `std::env::consts::ARCH`），如 `x86_64` / `aarch64` / `arm`
    pub arch: String,
    /// 操作系统（来自 `std::env::consts::OS`），如 `windows` / `macos` / `linux`
    pub os: String,
    /// 操作系统族（`windows` / `unix` / `other`）
    pub family: OsFamily,
    /// 当前进程位数（32 / 64）
    pub pointer_width: u8,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OsFamily {
    Windows,
    Unix,
    Other,
}

/// 取当前运行时架构信息
pub fn detect() -> RuntimeArch {
    let arch = std::env::consts::ARCH.to_string();
    let os = std::env::consts::OS.to_string();
    let family = match os.as_str() {
        "windows" => OsFamily::Windows,
        "macos" | "linux" | "freebsd" | "openbsd" | "netbsd" | "dragonfly" => OsFamily::Unix,
        _ => OsFamily::Other,
    };
    let pointer_width = (std::mem::size_of::<usize>() * 8) as u8;
    RuntimeArch {
        arch,
        os,
        family,
        pointer_width,
    }
}

/// 是否是 Apple Silicon
pub fn is_apple_silicon(info: &RuntimeArch) -> bool {
    info.os == "macos" && info.arch == "aarch64"
}

/// 是否是 Windows ARM
pub fn is_windows_arm(info: &RuntimeArch) -> bool {
    info.os == "windows" && (info.arch == "aarch64" || info.arch == "arm")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_returns_current() {
        let info = detect();
        assert!(!info.arch.is_empty());
        assert!(!info.os.is_empty());
        assert!(info.pointer_width == 32 || info.pointer_width == 64);
    }

    #[test]
    fn family_classification() {
        let mut info = detect();
        info.os = "windows".into();
        assert_eq!(info.family, OsFamily::Windows);
        info.os = "linux".into();
        assert_eq!(info.family, OsFamily::Unix);
        info.os = "aix".into();
        assert_eq!(info.family, OsFamily::Other);
    }
}
