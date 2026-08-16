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
use specta::Type;

/// 运行时架构信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
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
#[allow(dead_code)]
pub fn is_apple_silicon(info: &RuntimeArch) -> bool {
    info.os == "macos" && info.arch == "aarch64"
}

/// 是否是 Windows ARM
#[allow(dead_code)]
pub fn is_windows_arm(info: &RuntimeArch) -> bool {
    info.os == "windows" && (info.arch == "aarch64" || info.arch == "arm")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_info(os: &str, arch: &str) -> RuntimeArch {
        RuntimeArch {
            arch: arch.to_string(),
            os: os.to_string(),
            family: match os {
                "windows" => OsFamily::Windows,
                "macos" | "linux" | "freebsd" | "openbsd" | "netbsd" | "dragonfly" => {
                    OsFamily::Unix
                }
                _ => OsFamily::Other,
            },
            pointer_width: 64,
        }
    }

    #[test]
    fn detect_returns_current_runtime() {
        let info = detect();
        // 字段必须与 std::env::consts 一致
        assert_eq!(info.arch, std::env::consts::ARCH);
        assert_eq!(info.os, std::env::consts::OS);
        // 当前进程位数非 0
        assert!(info.pointer_width == 32 || info.pointer_width == 64);
    }

    #[test]
    fn family_classification_windows() {
        let info = make_info("windows", "x86_64");
        assert_eq!(info.family, OsFamily::Windows);
    }

    #[test]
    fn family_classification_macos() {
        let info = make_info("macos", "aarch64");
        assert_eq!(info.family, OsFamily::Unix);
    }

    #[test]
    fn family_classification_linux() {
        let info = make_info("linux", "x86_64");
        assert_eq!(info.family, OsFamily::Unix);
    }

    #[test]
    fn family_classification_bsd_variants() {
        for os in ["freebsd", "openbsd", "netbsd", "dragonfly"] {
            let info = make_info(os, "x86_64");
            assert_eq!(
                info.family,
                OsFamily::Unix,
                "expected Unix family for {os}"
            );
        }
    }

    #[test]
    fn family_classification_unknown_os() {
        let info = make_info("aix", "ppc64");
        assert_eq!(info.family, OsFamily::Other);
    }

    #[test]
    fn is_apple_silicon_only_for_macos_aarch64() {
        assert!(is_apple_silicon(&make_info("macos", "aarch64")));
        assert!(!is_apple_silicon(&make_info("macos", "x86_64")));
        assert!(!is_apple_silicon(&make_info("linux", "aarch64")));
        assert!(!is_apple_silicon(&make_info("windows", "aarch64")));
    }

    #[test]
    fn is_windows_arm_for_aarch64_and_arm() {
        assert!(is_windows_arm(&make_info("windows", "aarch64")));
        assert!(is_windows_arm(&make_info("windows", "arm")));
        assert!(!is_windows_arm(&make_info("windows", "x86_64")));
        assert!(!is_windows_arm(&make_info("macos", "aarch64")));
        assert!(!is_windows_arm(&make_info("linux", "aarch64")));
    }

    #[test]
    fn serialization_uses_lowercase_family() {
        let info = make_info("windows", "x86_64");
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"family\":\"windows\""));
        let back: RuntimeArch = serde_json::from_str(&json).unwrap();
        assert_eq!(back.family, OsFamily::Windows);
    }
}

