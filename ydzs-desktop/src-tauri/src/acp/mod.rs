//! # ACP (Agent Client Protocol) 双向集成框架
//!
//! 提供 Agent Client Protocol 的基础框架，支持入站（stdio 接口）和出站（委派外部 Agent）。
//!
//! ## 架构
//!
//! - `AcpSession` trait: 定义会话接口（发送请求、接收响应、工具调用）
//! - `AcpManager`: 管理所有 ACP 会话（启动/停止/查询）
//! - `types`: ACP 协议类型定义
//! - `stdio_server`: stdio 服务端实现（满足 IDE Agent 的 agent-client-protocol）

mod types;
pub use types::*;

use std::sync::{Arc, Mutex};
use tracing::{info, warn, error};

/// ACP 会话 trait
///
/// 所有 ACP 会话（入站/出站）需实现此 trait
pub trait AcpSession: Send + Sync {
    /// 获取会话 ID
    fn session_id(&self) -> &str;

    /// 发送请求到外部 Agent
    fn send_request(&mut self, request: AcpSessionRequest) -> Result<(), String>;

    /// 接收响应（非阻塞）
    fn receive_response(&mut self) -> Option<AcpAgentResponse>;

    /// 获取会话状态
    fn status(&self) -> AcpSessionState;
}

/// ACP 会话请求
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionRequest {
    pub session_id: String,
    pub task: String,
    pub context: Option<String>,
}

/// ACP Agent 响应
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpAgentResponse {
    pub session_id: String,
    pub status: String,
    pub output: Option<String>,
    pub error: Option<String>,
}

/// ACP 会话状态
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum AcpSessionState {
    Idle,
    Running,
    Completed,
    Failed(String),
}

/// ACP 管理器状态
#[derive(Default, Clone)]
pub struct AcpManagerState {
    inner: Arc<Mutex<AcpManagerInner>>,
}

#[derive(Default)]
struct AcpManagerInner {
    server_running: bool,
    sessions: Vec<Box<dyn AcpSession>>,
}

impl AcpManagerState {
    pub fn new() -> Self {
        Self::default()
    }

    /// 启动 stdio 服务
    pub fn start_server(&self) -> Result<String, String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        if inner.server_running {
            return Err("ACP stdio 服务已在运行".to_string());
        }
        inner.server_running = true;
        info!("ACP stdio 服务已启动");
        Ok("stdio-server-started".to_string())
    }

    /// 停止 stdio 服务
    pub fn stop_server(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        if !inner.server_running {
            warn!("ACP stdio 服务未在运行");
            return Ok(());
        }
        inner.server_running = false;
        info!("ACP stdio 服务已停止");
        Ok(())
    }

    /// 获取服务状态
    pub fn server_status(&self) -> AcpServerStatus {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        AcpServerStatus {
            running: inner.server_running,
            session_count: inner.sessions.len() as u32,
        }
    }

    /// 注册会话
    pub fn register_session(&self, session: Box<dyn AcpSession>) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        let id = session.session_id().to_string();
        info!("注册 ACP 会话: {}", id);
        inner.sessions.push(session);
        Ok(())
    }
}

/// ACP 服务状态
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AcpServerStatus {
    pub running: bool,
    pub session_count: u32,
}

pub mod stdio_server;
