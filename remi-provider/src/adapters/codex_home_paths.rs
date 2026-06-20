//! # Codex 家目录路径解析
//!
//! 本模块负责解析 Codex CLI / App Server 相关的配置文件与缓存目录路径。
//!
//! ## 模块职责
//!
//! - 解析 `$CODEX_HOME` 环境变量，默认为 `~/.codex`
//! - 推导 `auth.json`、`config.toml`、`sessions/`、`logs/` 等子路径
//! - 支持自定义家目录用于多用户/多租户场景
//!
//! ## 路径约定
//!
//! | 路径 | 用途 |
//! |------|------|
//! | `<home>/auth.json` | 认证凭证 |
//! | `<home>/config.toml` | 主配置 |
//! | `<home>/sessions/` | 会话历史 |
//! | `<home>/logs/` | 日志输出 |

use std::path::{Path, PathBuf};

/// 解析后的 Codex 家目录布局
#[derive(Debug, Clone)]
pub struct CodexHomeLayout {
    /// 家目录根
    pub home: PathBuf,
    /// 认证文件路径
    pub auth_file: PathBuf,
    /// 配置文件路径
    pub config_file: PathBuf,
    /// 会话目录
    pub sessions_dir: PathBuf,
    /// 日志目录
    pub logs_dir: PathBuf,
    /// 缓存目录
    pub cache_dir: PathBuf,
}

impl CodexHomeLayout {
    /// 基于给定的家目录创建布局
    pub fn new(home: impl Into<PathBuf>) -> Self {
        let home = home.into();
        Self {
            auth_file: home.join("auth.json"),
            config_file: home.join("config.toml"),
            sessions_dir: home.join("sessions"),
            logs_dir: home.join("logs"),
            cache_dir: home.join("cache"),
            home,
        }
    }

    /// 探测环境变量与默认路径，解析家目录
    pub fn detect() -> Self {
        if let Ok(custom) = std::env::var("CODEX_HOME") {
            if !custom.is_empty() {
                return Self::new(custom);
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            return Self::new(Path::new(&home).join(".codex"));
        }
        // Windows: USERPROFILE
        if let Ok(profile) = std::env::var("USERPROFILE") {
            return Self::new(Path::new(&profile).join(".codex"));
        }
        Self::new("./.codex")
    }

    /// 确保所有目录存在
    pub fn ensure_dirs(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.home)?;
        std::fs::create_dir_all(&self.sessions_dir)?;
        std::fs::create_dir_all(&self.logs_dir)?;
        std::fs::create_dir_all(&self.cache_dir)?;
        Ok(())
    }
}
