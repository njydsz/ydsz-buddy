//! # Rotating File Sink 模块
//!
//! 提供带大小 / 时间轮转的文件日志落地器（Tauri 桌面侧使用）。
//!
//! ## 特性
//!
//! - 单文件大小上限（超过后轮转）
//! - 文件总数上限（超过后丢弃最旧）
//! - 失败时降级到 stderr，不影响业务
//!
//! ## 用法
//!
//! ```rust,ignore
//! use crate::commands::rotating_file_sink::RotatingFileSink;
//! let mut sink = RotatingFileSink::with_defaults(logs_dir, "remi")?;
//! sink.write_line("hello world");
//! ```

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

/// Rotating File Sink 配置
#[derive(Debug, Clone)]
pub struct RotatingSinkConfig {
    /// 日志根目录（不含文件名），如 `C:/Users/me/.remi-claw/logs/app`
    pub dir: PathBuf,
    /// 日志文件基础名（不含扩展名），如 `remi` → 写入 `remi.log`
    pub base_name: String,
    /// 单文件最大字节数
    pub max_bytes: u64,
    /// 保留历史文件数（不含当前文件）
    pub keep_files: usize,
}

impl RotatingSinkConfig {
    /// 当前日志文件路径（`<dir>/<base>.log`）
    pub fn current_path(&self) -> PathBuf {
        self.dir.join(format!("{}.log", self.base_name))
    }

    /// 历史日志文件路径（`<dir>/<base>.<n>.log`）
    pub fn rotated_path(&self, n: usize) -> PathBuf {
        self.dir.join(format!("{}.{}.log", self.base_name, n))
    }
}

/// Rotating File Sink
pub struct RotatingFileSink {
    cfg: RotatingSinkConfig,
    /// 当前文件大小（粗略缓存，避免每次 stat）
    current_size: u64,
}

impl RotatingFileSink {
    /// 构造并确保目录存在
    pub fn new(cfg: RotatingSinkConfig) -> std::io::Result<Self> {
        fs::create_dir_all(&cfg.dir)?;
        let current_size = fs::metadata(cfg.current_path())
            .map(|m| m.len())
            .unwrap_or(0);
        Ok(Self {
            cfg,
            current_size,
        })
    }

    /// 默认配置：5MB × 5 个文件
    pub fn with_defaults(dir: PathBuf, base_name: impl Into<String>) -> std::io::Result<Self> {
        Self::new(RotatingSinkConfig {
            dir,
            base_name: base_name.into(),
            max_bytes: 5 * 1024 * 1024,
            keep_files: 5,
        })
    }

    /// 写入一行，自动追加 `\n`
    pub fn write_line(&mut self, line: &str) {
        self.write_bytes(line.as_bytes());
        self.write_bytes(b"\n");
    }

    /// 写入字节
    pub fn write_bytes(&mut self, data: &[u8]) {
        if self.cfg.max_bytes > 0
            && self.current_size + data.len() as u64 > self.cfg.max_bytes
        {
            self.rotate();
        }
        match self.append(data) {
            Ok(n) => self.current_size += n as u64,
            Err(e) => {
                eprintln!("RotatingFileSink append failed: {}", e);
            }
        }
    }

    fn append(&self, data: &[u8]) -> std::io::Result<usize> {
        let path = self.cfg.current_path();
        let mut f = OpenOptions::new().create(true).append(true).open(&path)?;
        f.write(data)
    }

    /// 执行一次轮转：`.log → .1.log`、`.1.log → .2.log` … 最旧的被覆盖
    pub fn rotate(&mut self) {
        let keep = self.cfg.keep_files.max(1);
        // 把 keep 之后的丢弃（最旧）
        let _ = fs::remove_file(self.cfg.rotated_path(keep));
        // 链式 rename：i → i+1
        for i in (1..keep).rev() {
            let from = self.cfg.rotated_path(i);
            let to = self.cfg.rotated_path(i + 1);
            if from.exists() {
                let _ = fs::rename(&from, &to);
            }
        }
        let cur = self.cfg.current_path();
        if cur.exists() {
            let _ = fs::rename(&cur, self.cfg.rotated_path(1));
        }
        self.current_size = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("remi-rotating-test-{}", name));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn write_creates_file() {
        let dir = temp_dir("basic");
        let mut sink = RotatingFileSink::with_defaults(dir.clone(), "test").unwrap();
        sink.write_line("hello world");
        let content = fs::read_to_string(dir.join("test.log")).unwrap();
        assert!(content.contains("hello world"));
    }

    #[test]
    fn rotates_on_size() {
        let dir = temp_dir("rotate");
        let cfg = RotatingSinkConfig {
            dir: dir.clone(),
            base_name: "app".into(),
            max_bytes: 16,
            keep_files: 2,
        };
        let mut sink = RotatingFileSink::new(cfg).unwrap();
        for i in 0..10 {
            sink.write_line(&format!("line {}", i));
        }
        assert!(dir.join("app.log").exists());
        assert!(dir.join("app.1.log").exists());
    }
}
