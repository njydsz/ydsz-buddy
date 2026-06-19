//! 日志与追踪初始化
//!
//! 本模块根据 [`LogConfig`](crate::LogConfig) 将 `tracing` 与 `tracing-subscriber` 串联。
//! 服务器二进制、Tauri 桌面壳和嵌入式 CLI 在启动时统一调用 [`init`]，确保所有 crate
//! 输出一致的日志格式（JSON / Pretty）。
//!
//! # 设计要点
//! - **进程级单次初始化**：通过 [`std::sync::OnceLock`] 保证多次调用 [`init`] 不会 panic。
//! - **环境变量优先**：若设置了 `RUST_LOG`，将覆盖 [`LogConfig`] 中的 `level`。
//! - **TTY 自适应**：Pretty 模式下仅在 stdout 是 TTY 时才启用 ANSI 颜色。
//! - **可写文件**：可指定日志文件路径，自动创建缺失的父目录。
//!
//! [`init`]: crate::log::init

use crate::config::LogConfig;
use crate::config::LogFormat;
use std::io::IsTerminal;
use std::path::Path;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

/// 初始化全局追踪订阅器
///
/// 每个进程最多执行真正的初始化逻辑一次；后续调用将快速返回 `Ok(())`，
/// 避免嵌入式测试运行器重复初始化时 panic。
///
/// # 流程
/// 1. 使用 [`EnvFilter`] 解析日志级别（`RUST_LOG` 优先）。
/// 2. 根据 [`LogConfig::format`] 选择 JSON / Pretty 格式器。
/// 3. 若 [`LogConfig::file`] 已配置，将日志写入该文件；否则写入 stdout。
///
/// # 错误
/// - 打开日志文件失败（如权限不足）：返回包装后的 `anyhow::Error`。
/// - `try_init` 失败：返回包装后的 `anyhow::Error`。
pub fn init(config: &LogConfig) -> anyhow::Result<()> {
    // 进程级单次初始化守卫：避免多次调用 `try_init` 失败。
    static INIT: std::sync::OnceLock<()> = std::sync::OnceLock::new();
    let mut initialised = false;
    INIT.get_or_init(|| {
        initialised = true;
    });
    if !initialised {
        return Ok(());
    }

    // 优先使用 RUST_LOG 环境变量，否则使用 config.level。
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(&config.level));

    match config.format {
        LogFormat::Json => {
            let builder = fmt().with_env_filter(filter).with_target(true);
            if let Some(file) = &config.file {
                let writer = open_log_file(file)?;
                builder
                    .json()
                    .with_writer(writer)
                    .try_init()
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
            } else {
                builder.json().try_init().map_err(|e| anyhow::anyhow!("{e}"))?;
            }
        }
        LogFormat::Pretty => {
            // Pretty 模式下仅在 stdout 是 TTY 时才启用 ANSI 颜色，避免在管道/文件中乱码。
            let ansi = if config.ansi {
                std::io::stdout().is_terminal()
            } else {
                false
            };
            let builder = fmt()
                .with_env_filter(filter)
                .with_target(true)
                .with_ansi(ansi);
            if let Some(file) = &config.file {
                let writer = open_log_file(file)?;
                builder
                    .with_writer(writer)
                    .try_init()
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
            } else {
                builder.try_init().map_err(|e| anyhow::anyhow!("{e}"))?;
            }
        }
    }

    Ok(())
}

/// 从级别字符串和可选文件路径构造 [`LogConfig`]
///
/// 用于在 main 函数早期未加载完整配置时快速构建合理的默认日志配置。
///
/// - `level`：可选的显式级别，未提供时回退到 `RUST_LOG` 环境变量，最后默认 `info`。
/// - `file`：可选的日志文件路径。
/// - 格式与 ANSI 颜色基于 stdout 是否为 TTY 自动判断。
pub fn config_from_env(level: Option<&str>, file: Option<&Path>) -> LogConfig {
    let level = level
        .map(|s| s.to_string())
        .or_else(|| std::env::var("RUST_LOG").ok())
        .unwrap_or_else(|| "info".to_string());
    LogConfig {
        level,
        // TTY 环境使用 Pretty，非 TTY 使用 JSON，便于日志平台采集。
        format: if std::io::stdout().is_terminal() {
            LogFormat::Pretty
        } else {
            LogFormat::Json
        },
        file: file.map(|p| p.to_path_buf()),
        ansi: std::io::stdout().is_terminal(),
    }
}

/// 打开日志文件，自动创建缺失的父目录
///
/// 使用追加模式写入，进程重启不会清空历史日志，便于事后排查。
fn open_log_file(path: &Path) -> anyhow::Result<std::fs::File> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 默认级别在没有 `RUST_LOG` 与显式参数时应为 `info`
    #[test]
    fn test_config_from_env_default() {
        // SAFETY: 单线程测试中修改环境变量是安全的。
        unsafe {
            std::env::remove_var("RUST_LOG");
        }
        let config = config_from_env(None, None);
        assert_eq!(config.level, "info");
    }
}
