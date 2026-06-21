//! # Session Runtime 模块
//!
//! 一个 ACP Provider 在客户端侧表现为'会话（Session）'：
//!
//! - 一次会话 = 一个 thread + 一个稳定 session_id + 一次 ACP 长连接
//! - 会话内可以发多次 turn
//! - 会话状态由 [SessionState] 表示
//!
//! ## 设计
//!
//! - `SessionRuntime` 是会话的'运行时包装'：聚合 `AcpJsonRpcConnection` + `EventBus` + 会话元数据
//! - 支持恢复（fork cursor）、停止、中断
//! - 不持有任何 IO 句柄——IO 都在 `AcpJsonRpcConnection` 里
//!
//! ## 用法
//!
//! ```rust,ignore
//! let mut rt = SessionRuntime::new(SessionConfig::default());
//! rt.connect(Arc::new(connection)).await?;
//! rt.initialize().await?;
//! rt.new_session(Some('thread-1')).await?;
//! rt.send_turn('hello').await?;
//! ```

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;

use super::core_runtime_events::{CoreRuntimeEvent, EventBus, EventSource, SharedEventBus};
use super::json_rpc_connection::AcpJsonRpcConnection;

/// 会话状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    /// 未连接
    Disconnected,
    /// 正在连接
    Connecting,
    /// 已握手但未创建会话
    Initialized,
    /// 会话已创建，可发 turn
    Active,
    /// 正在关闭
    Closing,
    /// 已关闭
    Closed,
    /// 失败
    Failed,
}

impl SessionState {
    /// 是否可发 turn
    pub fn can_send_turn(&self) -> bool {
        self == &SessionState::Active
    }

    /// 是否已终结
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Closed | Self::Failed)
    }
}

/// 会话配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    /// 关联的 thread_id
    pub thread_id: String,
    /// Provider 标识
    pub provider: String,
    /// 模型
    pub model: Option<String>,
    /// ACP 协议版本（v0 / v1）
    pub protocol_version: String,
    /// 工作目录
    pub working_dir: Option<std::path::PathBuf>,
    /// 会话恢复游标
    pub resume_cursor: Option<String>,
}

impl SessionConfig {
    pub fn new(thread_id: impl Into<String>, provider: impl Into<String>) -> Self {
        Self {
            thread_id: thread_id.into(),
            provider: provider.into(),
            model: None,
            protocol_version: "v0".to_string(),
            working_dir: None,
            resume_cursor: None,
        }
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    pub fn with_protocol(mut self, v: impl Into<String>) -> Self {
        self.protocol_version = v.into();
        self
    }
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self::new("default-thread", "unknown")
    }
}

/// 会话元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetadata {
    /// Provider 侧 session_id
    pub session_id: String,
    /// Provider 返回的能力
    pub capabilities: Vec<String>,
    /// 创建时间
    pub created_at_ms: i64,
}

/// 会话运行时
pub struct SessionRuntime {
    config: SessionConfig,
    state: RwLock<SessionState>,
    /// Provider 侧 session_id
    session_id: RwLock<Option<String>>,
    /// JSON-RPC 连接
    connection: RwLock<Option<Arc<AcpJsonRpcConnection>>>,
    /// 事件总线（每个 runtime 一个）
    bus: SharedEventBus,
    /// 元数据
    metadata: RwLock<Option<SessionMetadata>>,
    /// 创建时间
    created_at: Instant,
}

impl SessionRuntime {
    pub fn new(config: SessionConfig) -> Self {
        Self {
            config,
            state: RwLock::new(SessionState::Disconnected),
            session_id: RwLock::new(None),
            connection: RwLock::new(None),
            bus: Arc::new(EventBus::default()),
            metadata: RwLock::new(None),
            created_at: Instant::now(),
        }
    }

    pub fn config(&self) -> &SessionConfig {
        &self.config
    }

    pub async fn state(&self) -> SessionState {
        *self.state.read().await
    }

    pub fn bus(&self) -> SharedEventBus {
        self.bus.clone()
    }

    pub async fn session_id(&self) -> Option<String> {
        self.session_id.read().await.clone()
    }

    pub async fn metadata(&self) -> Option<SessionMetadata> {
        self.metadata.read().await.clone()
    }

    /// 设置连接
    pub async fn connect(&self, connection: Arc<AcpJsonRpcConnection>) {
        *self.connection.write().await = Some(connection);
        *self.state.write().await = SessionState::Connecting;
    }

    /// 握手（initialize）
    pub async fn initialize(&self) -> Result<(), SessionRuntimeError> {
        let conn = self.connection.read().await.clone();
        let conn = conn.ok_or(SessionRuntimeError::NotConnected)?;
        let resp = conn
            .request(
                "initialize",
                Some(serde_json::json!({
                    "protocolVersion": self.config.protocol_version,
                    "model": self.config.model,
                })),
            )
            .await
            .map_err(SessionRuntimeError::Connection)?;
        if let Some(err) = &resp.error {
            return Err(SessionRuntimeError::InitializeFailed(err.message.clone()));
        }
        *self.state.write().await = SessionState::Initialized;
        info!("SessionRuntime 已 initialize: {:?}", self.config.thread_id);
        Ok(())
    }

    /// 创建会话
    pub async fn new_session(&self) -> Result<String, SessionRuntimeError> {
        let conn = self.connection.read().await.clone();
        let conn = conn.ok_or(SessionRuntimeError::NotConnected)?;
        let mut params = serde_json::json!({
            "workingDirectory": self.config.working_dir,
        });
        if let Some(cursor) = &self.config.resume_cursor {
            params["resumeCursor"] = serde_json::Value::String(cursor.clone());
        }
        let resp = conn
            .request("session/new", Some(params))
            .await
            .map_err(SessionRuntimeError::Connection)?;
        if let Some(err) = &resp.error {
            return Err(SessionRuntimeError::SessionCreateFailed(err.message.clone()));
        }
        let session_id = resp
            .result
            .as_ref()
            .and_then(|r| r.get("sessionId"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let capabilities = resp
            .result
            .as_ref()
            .and_then(|r| r.get("capabilities"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        *self.session_id.write().await = Some(session_id.clone());
        *self.metadata.write().await = Some(SessionMetadata {
            session_id: session_id.clone(),
            capabilities,
            created_at_ms: chrono::Utc::now().timestamp_millis(),
        });
        *self.state.write().await = SessionState::Active;

        // 发布事件
        self.bus.publish(CoreRuntimeEvent::SessionStart {
            source: EventSource {
                provider: self.config.provider.clone(),
                thread_id: self.config.thread_id.clone(),
                turn_id: None,
                session_id: Some(session_id.clone()),
            },
            model: self.config.model.clone(),
        });
        Ok(session_id)
    }

    /// 发送一个 turn
    pub async fn send_turn(
        &self,
        text: &str,
    ) -> Result<String, SessionRuntimeError> {
        let state = self.state().await;
        if !state.can_send_turn() {
            return Err(SessionRuntimeError::InvalidState(state));
        }
        let conn = self.connection.read().await.clone();
        let conn = conn.ok_or(SessionRuntimeError::NotConnected)?;
        let session_id = self
            .session_id
            .read()
            .await
            .clone()
            .ok_or(SessionRuntimeError::NoSession)?;
        let turn_id = Uuid::new_v4().to_string();
        let resp = conn
            .request(
                "session/prompt",
                Some(serde_json::json!({
                    "sessionId": session_id,
                    "turnId": turn_id,
                    "text": text,
                })),
            )
            .await
            .map_err(SessionRuntimeError::Connection)?;
        if let Some(err) = &resp.error {
            return Err(SessionRuntimeError::TurnFailed(err.message.clone()));
        }
        Ok(turn_id)
    }

    /// 关闭会话
    pub async fn close(&self) -> Result<(), SessionRuntimeError> {
        *self.state.write().await = SessionState::Closing;
        // 通知 Provider
        if let Some(conn) = self.connection.read().await.clone() {
            let _ = conn
                .request("session/close", Some(serde_json::json!({})))
                .await;
        }
        // 关闭连接
        if let Some(conn) = self.connection.write().await.take() {
            let _ = conn.close().await;
        }
        let session_id = self.session_id.read().await.clone();
        self.bus.publish(CoreRuntimeEvent::SessionEnd {
            source: EventSource {
                provider: self.config.provider.clone(),
                thread_id: self.config.thread_id.clone(),
                turn_id: None,
                session_id,
            },
            reason: Some("user_requested".to_string()),
        });
        *self.state.write().await = SessionState::Closed;
        Ok(())
    }

    /// 上线时长
    pub fn uptime(&self) -> Duration {
        self.created_at.elapsed()
    }
}

/// Session Runtime 错误
#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
pub enum SessionRuntimeError {
    #[error("未连接")]
    NotConnected,
    #[error("没有可用会话")]
    NoSession,
    #[error("非法状态: {0:?}")]
    InvalidState(SessionState),
    #[error("initialize 失败: {0}")]
    InitializeFailed(String),
    #[error("session/new 失败: {0}")]
    SessionCreateFailed(String),
    #[error("session/prompt 失败: {0}")]
    TurnFailed(String),
    #[error("连接错误: {0}")]
    Connection(#[from] super::json_rpc_connection::AcpConnectionError),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_defaults() {
        let c = SessionConfig::default();
        assert_eq!(c.thread_id, "default-thread");
        assert_eq!(c.provider, "unknown");
    }

    #[test]
    fn config_builder() {
        let c = SessionConfig::new("t1", "cursor")
            .with_model("gpt-5")
            .with_protocol("v1");
        assert_eq!(c.model.as_deref(), Some("gpt-5"));
        assert_eq!(c.protocol_version, "v1");
    }

    #[test]
    fn state_predicates() {
        assert!(SessionState::Active.can_send_turn());
        assert!(!SessionState::Closed.can_send_turn());
        assert!(SessionState::Closed.is_terminal());
        assert!(SessionState::Failed.is_terminal());
        assert!(!SessionState::Active.is_terminal());
    }

    #[tokio::test]
    async fn new_runtime_starts_disconnected() {
        let rt = SessionRuntime::new(SessionConfig::default());
        assert_eq!(rt.state().await, SessionState::Disconnected);
        assert!(rt.session_id().await.is_none());
        assert!(rt.uptime() < Duration::from_secs(1));
    }
}
