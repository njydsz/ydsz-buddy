//! Terminal 会话管理

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use tokio::sync::{broadcast, RwLock};
use tracing::{info, warn};

use crate::error::{TerminalError, TerminalResult};
use crate::pty::{PtyProcess, PtySize};

/// 终端会话状态
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminalSessionStatus {
    /// 启动中
    Starting,
    /// 运行中
    Running,
    /// 已退出
    Exited,
    /// 错误
    Error,
}

/// 终端会话快照
#[derive(Debug, Clone)]
pub struct TerminalSessionSnapshot {
    /// 线程 ID
    pub thread_id: String,
    /// 终端 ID
    pub terminal_id: String,
    /// 工作目录
    pub cwd: String,
    /// 状态
    pub status: TerminalSessionStatus,
    /// 进程 PID
    pub pid: Option<u32>,
    /// 历史输出
    pub history: String,
    /// 退出码
    pub exit_code: Option<i32>,
    /// 退出信号
    pub exit_signal: Option<i32>,
    /// 更新时间
    pub updated_at: DateTime<Utc>,
}

/// 终端事件
#[derive(Debug, Clone)]
pub enum TerminalEvent {
    /// 启动事件
    Started {
        thread_id: String,
        terminal_id: String,
        snapshot: TerminalSessionSnapshot,
        created_at: DateTime<Utc>,
    },
    /// 输出事件
    Output {
        thread_id: String,
        terminal_id: String,
        data: String,
        created_at: DateTime<Utc>,
    },
    /// 退出事件
    Exited {
        thread_id: String,
        terminal_id: String,
        exit_code: Option<i32>,
        exit_signal: Option<i32>,
        created_at: DateTime<Utc>,
    },
    /// 错误事件
    Error {
        thread_id: String,
        terminal_id: String,
        message: String,
        created_at: DateTime<Utc>,
    },
    /// 清屏事件
    Cleared {
        thread_id: String,
        terminal_id: String,
        created_at: DateTime<Utc>,
    },
    /// 重启事件
    Restarted {
        thread_id: String,
        terminal_id: String,
        snapshot: TerminalSessionSnapshot,
        created_at: DateTime<Utc>,
    },
}

/// 终端会话
struct TerminalSession {
    thread_id: String,
    terminal_id: String,
    cwd: String,
    status: TerminalSessionStatus,
    history: String,
    exit_code: Option<i32>,
    exit_signal: Option<i32>,
    updated_at: DateTime<Utc>,
    cols: u16,
    rows: u16,
    process: Option<PtyProcess>,
    env: HashMap<String, String>,
}

/// 打开终端输入
#[derive(Debug, Clone)]
pub struct TerminalOpenInput {
    pub thread_id: String,
    pub terminal_id: String,
    pub cwd: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub env: Option<HashMap<String, String>>,
}

/// 写入终端输入
#[derive(Debug, Clone)]
pub struct TerminalWriteInput {
    pub thread_id: String,
    pub terminal_id: String,
    pub data: String,
}

/// 调整终端大小输入
#[derive(Debug, Clone)]
pub struct TerminalResizeInput {
    pub thread_id: String,
    pub terminal_id: String,
    pub cols: u16,
    pub rows: u16,
}

/// 重启终端输入
#[derive(Debug, Clone)]
pub struct TerminalRestartInput {
    pub thread_id: String,
    pub terminal_id: String,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub env: Option<HashMap<String, String>>,
}

/// 关闭终端输入
#[derive(Debug, Clone)]
pub struct TerminalCloseInput {
    pub thread_id: String,
    pub terminal_id: Option<String>,
    pub delete_history: bool,
}

/// 终端管理器
pub struct TerminalManager {
    sessions: Arc<RwLock<HashMap<String, TerminalSession>>>,
    event_tx: broadcast::Sender<TerminalEvent>,
}

impl TerminalManager {
    /// 创建新的终端管理器
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// 生成会话键
    fn session_key(thread_id: &str, terminal_id: &str) -> String {
        format!("{}:{}", thread_id, terminal_id)
    }

    /// 打开终端
    pub async fn open(&self, input: TerminalOpenInput) -> TerminalResult<TerminalSessionSnapshot> {
        let key = Self::session_key(&input.thread_id, &input.terminal_id);

        // 检查是否已存在
        {
            let sessions = self.sessions.read().await;
            if let Some(session) = sessions.get(&key) {
                info!("复用已存在的终端会话: {}", key);
                return Ok(self.create_snapshot(session));
            }
        }

        info!("打开新终端会话: {}", key);

        let cols = input.cols.unwrap_or(80);
        let rows = input.rows.unwrap_or(24);

        // 创建新会话
        let mut session = TerminalSession {
            thread_id: input.thread_id.clone(),
            terminal_id: input.terminal_id.clone(),
            cwd: input.cwd.clone(),
            status: TerminalSessionStatus::Starting,
            history: String::new(),
            exit_code: None,
            exit_signal: None,
            updated_at: Utc::now(),
            cols,
            rows,
            process: None,
            env: input.env.unwrap_or_default(),
        };

        // 启动 PTY 进程
        // TODO: 实现实际的 PTY 启动逻辑
        session.status = TerminalSessionStatus::Running;
        session.updated_at = Utc::now();

        let snapshot = self.create_snapshot(&session);

        // 保存会话
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(key.clone(), session);
        }

        // 广播启动事件
        let _ = self.event_tx.send(TerminalEvent::Started {
            thread_id: input.thread_id,
            terminal_id: input.terminal_id,
            snapshot: snapshot.clone(),
            created_at: Utc::now(),
        });

        Ok(snapshot)
    }

    /// 写入终端
    pub async fn write(&self, input: TerminalWriteInput) -> TerminalResult<()> {
        let key = Self::session_key(&input.thread_id, &input.terminal_id);

        let mut sessions = self.sessions.write().await;
        let session = sessions
            .get_mut(&key)
            .ok_or_else(|| TerminalError::TerminalNotFound(key.clone()))?;

        if session.status != TerminalSessionStatus::Running {
            return Err(TerminalError::TerminalNotStarted);
        }

        // TODO: 实际写入 PTY
        info!("写入终端 {}: {} 字节", key, input.data.len());

        Ok(())
    }

    /// 调整终端大小
    pub async fn resize(&self, input: TerminalResizeInput) -> TerminalResult<()> {
        let key = Self::session_key(&input.thread_id, &input.terminal_id);

        let mut sessions = self.sessions.write().await;
        let session = sessions
            .get_mut(&key)
            .ok_or_else(|| TerminalError::TerminalNotFound(key.clone()))?;

        info!("调整终端大小: {} -> {}x{}", key, input.cols, input.rows);

        session.cols = input.cols;
        session.rows = input.rows;
        session.updated_at = Utc::now();

        // TODO: 实际调整 PTY 大小

        Ok(())
    }

    /// 清屏
    pub async fn clear(&self, thread_id: &str, terminal_id: &str) -> TerminalResult<()> {
        let key = Self::session_key(thread_id, terminal_id);

        let mut sessions = self.sessions.write().await;
        let session = sessions
            .get_mut(&key)
            .ok_or_else(|| TerminalError::TerminalNotFound(key.clone()))?;

        info!("清屏: {}", key);

        session.history.clear();
        session.updated_at = Utc::now();

        // 广播清屏事件
        let _ = self.event_tx.send(TerminalEvent::Cleared {
            thread_id: thread_id.to_string(),
            terminal_id: terminal_id.to_string(),
            created_at: Utc::now(),
        });

        Ok(())
    }

    /// 重启终端
    pub async fn restart(
        &self,
        input: TerminalRestartInput,
    ) -> TerminalResult<TerminalSessionSnapshot> {
        let key = Self::session_key(&input.thread_id, &input.terminal_id);

        info!("重启终端: {}", key);

        // 先关闭现有会话
        {
            let mut sessions = self.sessions.write().await;
            if let Some(session) = sessions.get_mut(&key) {
                // 停止进程
                if let Some(process) = session.process.take() {
                    // TODO: 实际停止进程
                }

                // 清空历史
                session.history.clear();
                session.exit_code = None;
                session.exit_signal = None;
            }
        }

        // 重新打开
        let snapshot = self
            .open(TerminalOpenInput {
                thread_id: input.thread_id.clone(),
                terminal_id: input.terminal_id.clone(),
                cwd: input.cwd,
                cols: Some(input.cols),
                rows: Some(input.rows),
                env: input.env,
            })
            .await?;

        // 广播重启事件
        let _ = self.event_tx.send(TerminalEvent::Restarted {
            thread_id: input.thread_id,
            terminal_id: input.terminal_id,
            snapshot: snapshot.clone(),
            created_at: Utc::now(),
        });

        Ok(snapshot)
    }

    /// 关闭终端
    pub async fn close(&self, input: TerminalCloseInput) -> TerminalResult<()> {
        let mut sessions = self.sessions.write().await;

        if let Some(terminal_id) = input.terminal_id {
            // 关闭指定终端
            let key = Self::session_key(&input.thread_id, &terminal_id);
            info!("关闭终端: {}", key);

            if let Some(mut session) = sessions.remove(&key) {
                // 停止进程
                if let Some(process) = session.process.take() {
                    // TODO: 实际停止进程
                }

                if input.delete_history {
                    session.history.clear();
                }
            }
        } else {
            // 关闭该线程的所有终端
            info!("关闭线程 {} 的所有终端", input.thread_id);

            let keys_to_remove: Vec<String> = sessions
                .keys()
                .filter(|k| k.starts_with(&format!("{}:", input.thread_id)))
                .cloned()
                .collect();

            for key in keys_to_remove {
                if let Some(mut session) = sessions.remove(&key) {
                    if let Some(process) = session.process.take() {
                        // TODO: 实际停止进程
                    }

                    if input.delete_history {
                        session.history.clear();
                    }
                }
            }
        }

        Ok(())
    }

    /// 订阅终端事件
    pub fn subscribe(&self) -> broadcast::Receiver<TerminalEvent> {
        self.event_tx.subscribe()
    }

    /// 获取会话快照
    pub async fn get_snapshot(
        &self,
        thread_id: &str,
        terminal_id: &str,
    ) -> TerminalResult<TerminalSessionSnapshot> {
        let key = Self::session_key(thread_id, terminal_id);

        let sessions = self.sessions.read().await;
        let session = sessions
            .get(&key)
            .ok_or_else(|| TerminalError::TerminalNotFound(key.clone()))?;

        Ok(self.create_snapshot(session))
    }

    /// 列出所有会话
    pub async fn list_sessions(&self) -> Vec<TerminalSessionSnapshot> {
        let sessions = self.sessions.read().await;
        sessions.values().map(|s| self.create_snapshot(s)).collect()
    }

    /// 创建快照
    fn create_snapshot(&self, session: &TerminalSession) -> TerminalSessionSnapshot {
        TerminalSessionSnapshot {
            thread_id: session.thread_id.clone(),
            terminal_id: session.terminal_id.clone(),
            cwd: session.cwd.clone(),
            status: session.status.clone(),
            pid: None, // TODO: 从 process 获取取
            history: session.history.clone(),
            exit_code: session.exit_code,
            exit_signal: session.exit_signal,
            updated_at: session.updated_at,
        }
    }

    /// 释放所有资源
    pub async fn dispose(&self) {
        info!("释放所有终端资源");

        let mut sessions = self.sessions.write().await;
        for (_, mut session) in sessions.drain() {
            if let Some(process) = session.process.take() {
                // TODO: 实际停止进程
            }
        }
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
