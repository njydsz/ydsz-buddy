//! Logging and tracing initialization.
//!
//! This module wires up `tracing` with `tracing-subscriber` based on the
//! [`LogConfig`](crate::LogConfig) settings. The server binary uses this
//! during startup so all crates emit consistent log output.

use crate::config::LogConfig;
use crate::config::LogFormat;
use std::io::IsTerminal;
use std::path::Path;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

/// Initialise the global tracing subscriber.
///
/// This must be called at most once per process. Subsequent calls are
/// no-ops so embedded test harnesses don't crash when the binary already
/// initialised logging.
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

/// Construct a [`LogConfig`] from a level string and optional file path.
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
