//! 日志和追踪初始化
//!
//! 本模块根据 [`LogConfig`](crate::LogConfig) 设置将 `tracing` 与 `tracing-subscriber` 连接。
//! 服务器二进制文件在启动时使用此模块，以便所有 crate 输出一致的日志格式。

use crate::config::LogConfig;
use crate::config::LogFormat;
use std::io::IsTerminal;
use std::path::Path;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

/// 初始化全局追踪订阅器
///
/// 每个进程最多调用一次。后续调用将是空操作，
/// 这样当二进制文件已经初始化日志时，嵌入式测试工具不会崩溃。
pub fn init(config: &LogConfig) -> anyhow::Result<()> {
    static INIT: std::sync::OnceLock<()> = std::sync::OnceLock::new();
    let mut initialised = false;
    INIT.get_or_init(|| {
        initialised = true;
    });
    if !initialised {
        return Ok(());
    }

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
pub fn config_from_env(level: Option<&str>, file: Option<&Path>) -> LogConfig {
    let level = level
        .map(|s| s.to_string())
        .or_else(|| std::env::var("RUST_LOG").ok())
        .unwrap_or_else(|| "info".to_string());
    LogConfig {
        level,
        format: if std::io::stdout().is_terminal() {
            LogFormat::Pretty
        } else {
            LogFormat::Json
        },
        file: file.map(|p| p.to_path_buf()),
        ansi: std::io::stdout().is_terminal(),
    }
}

/// 打开日志文件
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

    #[test]
    fn test_config_from_env_default() {
        // SAFETY: test-only environment manipulation, safe in single-threaded tests.
        unsafe {
            std::env::remove_var("RUST_LOG");
        }
        let config = config_from_env(None, None);
        assert_eq!(config.level, "info");
    }
}
