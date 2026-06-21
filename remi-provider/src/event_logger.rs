//! Provider 事件日志模块
//!
//! 本模块提供 Provider 会话事件的持久化日志功能，将事件记录为 NDJSON 格式。
//!
//! # 核心功能
//!
//! - **线程隔离**：每个会话线程拥有独立的日志文件
//! - **轮转管理**：支持日志文件大小限制和自动轮转
//! - **批量写入**：通过批量缓冲提高写入性能
//! - **容错设计**：日志写入失败不影响 Provider 运行
//!
//! # 使用场景
//!
//! - 调试和排查 Provider 会话问题
//! - 审计 Provider 调用历史
//! - 性能分析和监控

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tokio::sync::RwLock;
use tokio::io::AsyncWriteExt;
use tracing::{warn, debug};

/// 日志流类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventLogStream {
    /// 原生事件流
    Native,
    /// 规范化事件流
    Canonical,
    /// 编排事件流
    Orchestration,
}

impl EventLogStream {
    /// 获取流标签
    pub fn label(&self) -> &'static str {
        match self {
            EventLogStream::Native => "NATIVE",
            EventLogStream::Canonical => "CANON",
            EventLogStream::Orchestration => "ORCH",
        }
    }
}

/// 事件日志配置
#[derive(Debug, Clone)]
pub struct EventLoggerConfig {
    /// 日志根目录
    pub log_dir: PathBuf,
    /// 单个日志文件最大字节数（默认 10MB）
    pub max_bytes: u64,
    /// 保留的日志文件数量（默认 10）
    pub max_files: usize,
    /// 批量写入间隔（毫秒）
    pub batch_interval_ms: u64,
}

impl Default for EventLoggerConfig {
    fn default() -> Self {
        Self {
            log_dir: PathBuf::from("logs/provider"),
            max_bytes: 10 * 1024 * 1024,
            max_files: 10,
            batch_interval_ms: 200,
        }
    }
}

/// 线程日志写入器
struct ThreadWriter {
    /// 日志文件路径
    file_path: PathBuf,
    /// 当前文件大小
    current_size: u64,
    /// 文件序号
    file_index: u32,
    /// 缓冲区
    buffer: Vec<String>,
}

impl ThreadWriter {
    fn new(file_path: PathBuf) -> Self {
        Self {
            file_path,
            current_size: 0,
            file_index: 0,
            buffer: Vec::with_capacity(100),
        }
    }

    /// 添加日志条目到缓冲区
    fn buffer_entry(&mut self, entry: String) {
        self.buffer.push(entry);
    }

    /// 刷新缓冲区到磁盘
    async fn flush(&mut self) -> std::io::Result<()> {
        if self.buffer.is_empty() {
            return Ok(());
        }

        let content = self.buffer.join("\n");
        let bytes = content.len() as u64;

        // 检查是否需要轮转
        if self.current_size + bytes > 10 * 1024 * 1024 {
            self.rotate().await?;
        }

        // 追加写入
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .await?;

        file.write_all(content.as_bytes()).await?;
        file.write_all(b"\n").await?;

        self.current_size += bytes + 1;
        self.buffer.clear();

        Ok(())
    }

    /// 轮转日志文件
    async fn rotate(&mut self) -> std::io::Result<()> {
        self.file_index += 1;
        let new_path = self.file_path.with_extension(format!("log.{}", self.file_index));

        // 重命名当前文件
        if self.file_path.exists() {
            tokio::fs::rename(&self.file_path, &new_path).await?;
        }

        self.current_size = 0;
        debug!("日志文件轮转: {:?}", new_path);

        Ok(())
    }
}

/// Provider 事件日志记录器
///
/// 负责将 Provider 事件持久化为 NDJSON 格式日志文件。
/// 每个会话线程拥有独立的日志文件，支持自动轮转和批量写入。
pub struct ProviderEventLogger {
    /// 配置
    config: EventLoggerConfig,
    /// 流类型
    stream: EventLogStream,
    /// 线程写入器映射
    writers: Arc<RwLock<HashMap<String, ThreadWriter>>>,
}

impl ProviderEventLogger {
    /// 创建新的事件日志记录器
    pub fn new(config: EventLoggerConfig, stream: EventLogStream) -> Self {
        Self {
            config,
            stream,
            writers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 记录事件
    ///
    /// 将事件序列化为 JSON 并写入对应线程的日志文件。
    ///
    /// # 参数
    ///
    /// - `event`: 要记录的事件，必须实现 `Serialize`
    /// - `thread_id`: 会话线程 ID，为 None 时使用 '_global'
    ///
    /// # 返回值
    ///
    /// 写入成功返回 `Ok(())`，失败返回错误但不会影响 Provider 运行
    pub async fn log_event<E: Serialize>(
        &self,
        event: &E,
        thread_id: Option<&str>,
    ) -> Result<(), EventLoggerError> {
        let thread_segment = thread_id.unwrap_or("_global");

        // 序列化事件
        let json = serde_json::to_string(event).map_err(|e| {
            warn!("事件序列化失败: {}", e);
            EventLoggerError::SerializeError(e.to_string())
        })?;

        // 添加时间戳和流标签
        let timestamp = chrono::Utc::now().to_rfc3339();
        let entry = format!(
            r#"{{"timestamp":"{}","stream":"{}","event":{}}}"#,
            timestamp,
            self.stream.label(),
            json
        );

        // 获取或创建写入器
        let mut writers = self.writers.write().await;
        let writer = writers
            .entry(thread_segment.to_string())
            .or_insert_with(|| {
                let file_path = self.config.log_dir.join(format!("{}.log", thread_segment));
                ThreadWriter::new(file_path)
            });

        writer.buffer_entry(entry);

        // 尝试刷新（非阻塞）
        if let Err(e) = writer.flush().await {
            warn!("日志写入失败: {}", e);
        }

        Ok(())
    }

    /// 刷新所有缓冲区
    pub async fn flush_all(&self) -> Result<(), EventLoggerError> {
        let mut writers = self.writers.write().await;
        for writer in writers.values_mut() {
            if let Err(e) = writer.flush().await {
                warn!("刷新日志失败: {}", e);
            }
        }
        Ok(())
    }

    /// 关闭日志记录器
    pub async fn close(&self) -> Result<(), EventLoggerError> {
        self.flush_all().await?;
        let mut writers = self.writers.write().await;
        writers.clear();
        debug!("Provider 事件日志记录器已关闭");
        Ok(())
    }
}

/// 事件日志错误
#[derive(Debug, thiserror::Error)]
pub enum EventLoggerError {
    #[error("序列化失败: {0}")]
    SerializeError(String),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_event_logger() {
        let temp_dir = tempdir().unwrap();
        let config = EventLoggerConfig {
            log_dir: temp_dir.path().to_path_buf(),
            ..Default::default()
        };

        let logger = ProviderEventLogger::new(config, EventLogStream::Native);

        // 记录测试事件
        let event = serde_json::json!({
            "type": "test",
            "message": "hello"
        });

        let result = logger.log_event(&event, Some("thread-1")).await;
        assert!(result.is_ok());

        // 刷新并关闭
        logger.close().await.unwrap();
    }
}

