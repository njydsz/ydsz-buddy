//! # 调试会话管理
//!
//! 管理调试会话的生命周期：启动、暂停、继续、步进、终止。
//!
//! ## 设计
//!
//! 每个调试会话对应一个 DAP Server 进程，通过 stdio 通信。
//! 会话状态机：Created → Configured → Launched → Running ↔ Paused → Terminated

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing::{debug, info};
use uuid::Uuid;

use super::adapter::DebugAdapterRegistry;
use super::types::{
    DebugBreakpoint, DebugEvent, DebugStackFrame, DebugThread, DebugVariable,
    StartDebuggingParams,
};

/// 调试会话状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DebugSessionState {
    /// 已创建，尚未配置
    Created,
    /// 已配置，准备启动
    Configured,
    /// 已启动，正在运行
    Running,
    /// 已暂停（命中断点 / 手动暂停）
    Paused,
    /// 已终止
    Terminated,
    /// 启动失败
    Failed,
}

/// 调试会话
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugSession {
    /// 会话 ID
    pub id: String,
    /// 语言
    pub language: String,
    /// 工作区根目录
    pub workspace_root: String,
    /// 程序入口
    pub program: String,
    /// 当前状态
    pub state: DebugSessionState,
    /// 断点列表
    pub breakpoints: Vec<DebugBreakpoint>,
    /// 当前线程列表
    #[serde(default)]
    pub threads: Vec<DebugThread>,
    /// 当前调用栈（暂停时填充）
    #[serde(default)]
    pub stack_frames: Vec<DebugStackFrame>,
    /// 创建时间
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// 调试会话管理器
pub struct DebugSessionManager {
    sessions: Arc<RwLock<HashMap<String, DebugSession>>>,
    event_tx: broadcast::Sender<DebugEvent>,
    adapter_registry: DebugAdapterRegistry,
}

impl DebugSessionManager {
    /// 创建新的会话管理器
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
            adapter_registry: DebugAdapterRegistry::new(),
        }
    }

    /// 获取适配器注册表
    pub fn adapter_registry(&self) -> &DebugAdapterRegistry {
        &self.adapter_registry
    }

    /// 订阅调试事件流
    pub fn subscribe(&self) -> broadcast::Receiver<DebugEvent> {
        self.event_tx.subscribe()
    }

    /// 创建调试会话
    pub fn create_session(&self, params: StartDebuggingParams) -> anyhow::Result<DebugSession> {
        // 检查语言是否支持
        if !self.adapter_registry.supports(&params.language) {
            anyhow::bail!(
                "不支持的语言调试器: {}。支持的: javascript, typescript, python, rust, go",
                params.language
            );
        }

        let session = DebugSession {
            id: Uuid::new_v4().to_string(),
            language: params.language,
            workspace_root: params.workspace_root,
            program: params.program,
            state: DebugSessionState::Configured,
            breakpoints: params.breakpoints,
            threads: Vec::new(),
            stack_frames: Vec::new(),
            created_at: chrono::Utc::now(),
        };

        debug!(
            "创建调试会话: {} ({})",
            session.id, session.language
        );

        self.sessions
            .write()
            .insert(session.id.clone(), session.clone());

        Ok(session)
    }

    /// 获取会话
    pub fn get_session(&self, id: &str) -> Option<DebugSession> {
        self.sessions.read().get(id).cloned()
    }

    /// 列出所有会话
    pub fn list_sessions(&self) -> Vec<DebugSession> {
        self.sessions.read().values().cloned().collect()
    }

    /// 更新会话状态
    pub fn update_state(&self, id: &str, state: DebugSessionState) {
        if let Some(session) = self.sessions.write().get_mut(id) {
            session.state = state;
        }
    }

    /// 设置断点
    pub fn set_breakpoints(&self, id: &str, breakpoints: Vec<DebugBreakpoint>) {
        if let Some(session) = self.sessions.write().get_mut(id) {
            session.breakpoints = breakpoints;
        }
    }

    /// 更新线程列表
    pub fn update_threads(&self, id: &str, threads: Vec<DebugThread>) {
        if let Some(session) = self.sessions.write().get_mut(id) {
            session.threads = threads;
        }
    }

    /// 更新调用栈
    pub fn update_stack_frames(&self, id: &str, frames: Vec<DebugStackFrame>) {
        if let Some(session) = self.sessions.write().get_mut(id) {
            session.stack_frames = frames;
        }
    }

    /// 广播调试事件
    pub fn emit_event(&self, event: DebugEvent) {
        let _ = self.event_tx.send(event);
    }

    /// 终止会话
    pub fn terminate_session(&self, id: &str) -> anyhow::Result<()> {
        let mut sessions = self.sessions.write();
        if let Some(session) = sessions.get_mut(id) {
            session.state = DebugSessionState::Terminated;
            info!("终止调试会话: {}", id);
            Ok(())
        } else {
            anyhow::bail!("调试会话不存在: {}", id)
        }
    }

    /// 清理已终止的会话
    pub fn cleanup_terminated(&self) {
        let mut sessions = self.sessions.write();
        sessions.retain(|_, s| s.state != DebugSessionState::Terminated);
    }
}

impl Default for DebugSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn create_session_for_python() {
        let manager = DebugSessionManager::new();
        let params = StartDebuggingParams {
            language: "python".to_string(),
            workspace_root: "/test".to_string(),
            program: "/test/main.py".to_string(),
            args: vec![],
            env: HashMap::new(),
            launch: true,
            breakpoints: vec![],
        };
        let session = manager.create_session(params).unwrap();
        assert_eq!(session.language, "python");
        assert_eq!(session.state, DebugSessionState::Configured);
    }

    #[test]
    fn create_session_unsupported_language() {
        let manager = DebugSessionManager::new();
        let params = StartDebuggingParams {
            language: "brainfuck".to_string(),
            workspace_root: "/test".to_string(),
            program: "/test/test.bf".to_string(),
            args: vec![],
            env: HashMap::new(),
            launch: true,
            breakpoints: vec![],
        };
        let result = manager.create_session(params);
        assert!(result.is_err());
    }

    #[test]
    fn update_and_terminate_session() {
        let manager = DebugSessionManager::new();
        let params = StartDebuggingParams {
            language: "rust".to_string(),
            workspace_root: "/test".to_string(),
            program: "/test/target/debug/test".to_string(),
            args: vec![],
            env: HashMap::new(),
            launch: true,
            breakpoints: vec![],
        };
        let session = manager.create_session(params).unwrap();

        manager.update_state(&session.id, DebugSessionState::Running);
        assert_eq!(
            manager.get_session(&session.id).unwrap().state,
            DebugSessionState::Running
        );

        manager.terminate_session(&session.id).unwrap();
        assert_eq!(
            manager.get_session(&session.id).unwrap().state,
            DebugSessionState::Terminated
        );
    }

    #[test]
    fn list_sessions() {
        let manager = DebugSessionManager::new();
        for lang in &["python", "rust", "go"] {
            manager
                .create_session(StartDebuggingParams {
                    language: lang.to_string(),
                    workspace_root: "/test".to_string(),
                    program: "/test/main".to_string(),
                    args: vec![],
                    env: HashMap::new(),
                    launch: true,
                    breakpoints: vec![],
                })
                .unwrap();
        }
        assert_eq!(manager.list_sessions().len(), 3);
    }

    #[test]
    fn cleanup_terminated() {
        let manager = DebugSessionManager::new();
        let s1 = manager
            .create_session(StartDebuggingParams {
                language: "python".to_string(),
                workspace_root: "/test".to_string(),
                program: "/test/main.py".to_string(),
                args: vec![],
                env: HashMap::new(),
                launch: true,
                breakpoints: vec![],
            })
            .unwrap();
        manager
            .create_session(StartDebuggingParams {
                language: "rust".to_string(),
                workspace_root: "/test".to_string(),
                program: "/test/main".to_string(),
                args: vec![],
                env: HashMap::new(),
                launch: true,
                breakpoints: vec![],
            })
            .unwrap();

        manager.terminate_session(&s1.id).unwrap();
        manager.cleanup_terminated();
        assert_eq!(manager.list_sessions().len(), 1);
    }
}
