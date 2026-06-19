//! Terminal 会话管理模块
//!
//! 本模块是终端功能的核心，负责管理所有 PTY 终端会话的完整生命周期。
//!
//! # 核心职责
//!
//! - **会话生命周期管理**：创建（open）、重启（restart）、关闭（close）终端会话
//! - **数据交互**：向终端写入数据（write），维护终端输出历史记录
//! - **终端配置**：调整终端窗口大小（resize）、清屏（clear）
//! - **状态追踪**：通过快照（Snapshot）机制暴露会话的实时状态
//! - **事件广播**：通过 `broadcast` 通道向订阅者推送终端事件（启动、输出、退出、错误、清屏、重启）
//!
//! # 使用场景
//!
//! - IDE 终端面板：用户打开多个终端标签页，每个标签页由 `TerminalManager` 管理
//! - 线程绑定终端：每个终端会话通过 `thread_id` 与 IDE 的工作线程关联，支持按线程批量管理
//! - 前端实时展示：前端通过订阅 [`TerminalEvent`] 获取终端输出，实现实时渲染
//!
//! # 模块结构
//!
//! | 类型 | 说明 |
//! |------|------|
//! | [`TerminalSessionStatus`] | 终端会话状态枚举（启动中、运行中、已退出、错误） |
//! | [`TerminalSessionSnapshot`] | 终端会话的只读快照，用于对外暴露状态 |
//! | [`TerminalEvent`] | 终端事件枚举，通过广播通道推送 |
//! | [`TerminalManager`] | 终端管理器，核心协调者 |
//! | `TerminalOpenInput` 等 | 各操作的输入参数结构体 |

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use tokio::sync::{broadcast, RwLock};
use tracing::info;

use crate::error::{TerminalError, TerminalResult};
use crate::pty::PtyProcess;

/// 终端会话状态枚举
///
/// 表示终端会话在其生命周期中所处的阶段。
/// 状态转换路径：`Starting` → `Running` → `Exited`，任何阶段都可能进入 `Error`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminalSessionStatus {
    /// 启动中：PTY 进程正在创建和初始化
    Starting,
    /// 运行中：PTY 进程已就绪，可接受输入和产生输出
    Running,
    /// 已退出：PTY 子进程已终止，会话不可再使用
    Exited,
    /// 错误：会话遇到不可恢复的错误
    Error,
}

/// 终端会话快照
///
/// 提供终端会话在某一时刻的只读视图，用于对外暴露会话状态。
/// 快照是不可变的值类型，可安全地在异步任务间传递和克隆。
///
/// # 使用场景
///
/// - 前端请求终端列表时，返回每个会话的快照
/// - 终端事件（如启动、重启）中携带快照，提供完整的状态信息
/// - 轮询检查终端状态时获取快照
#[derive(Debug, Clone)]
pub struct TerminalSessionSnapshot {
    /// 线程 ID：标识该终端所属的工作线程
    pub thread_id: String,
    /// 终端 ID：在同一线程内唯一标识一个终端会话
    pub terminal_id: String,
    /// 工作目录：终端进程启动时的工作目录路径
    pub cwd: String,
    /// 当前状态：终端会话的生命周期阶段
    pub status: TerminalSessionStatus,
    /// 进程 PID：PTY 子进程的操作系统进程 ID，若进程未启动则为 `None`
    pub pid: Option<u32>,
    /// 历史输出：终端自启动以来（或上次清屏以来）累积的所有输出文本
    pub history: String,
    /// 退出码：子进程正常退出时的退出码，未退出或异常终止时为 `None`
    pub exit_code: Option<i32>,
    /// 退出信号：子进程被信号终止时的信号编号，仅在 Unix 系统上有意义
    pub exit_signal: Option<i32>,
    /// 更新时间：快照最后一次更新的时间戳（UTC）
    pub updated_at: DateTime<Utc>,
}

/// 终端事件枚举
///
/// 通过 `broadcast` 通道推送的终端生命周期事件。
/// 前端或其他订阅者可通过监听这些事件实现实时 UI 更新。
///
/// 所有变体都包含 `thread_id`、`terminal_id` 和 `created_at` 字段，
/// 用于标识事件来源和发生时间。
#[derive(Debug, Clone)]
pub enum TerminalEvent {
    /// 终端启动事件
    ///
    /// 当新终端会话成功创建并进入运行状态时触发。
    /// 携带完整的会话快照，供订阅者初始化终端 UI。
    Started {
        /// 线程 ID
        thread_id: String,
        /// 终端 ID
        terminal_id: String,
        /// 启动时的会话快照
        snapshot: TerminalSessionSnapshot,
        /// 事件创建时间（UTC）
        created_at: DateTime<Utc>,
    },
    /// 终端输出事件
    ///
    /// 当终端产生新的输出数据时触发。
    /// 前端应将 `data` 追加渲染到对应的终端面板。
    Output {
        /// 线程 ID
        thread_id: String,
        /// 终端 ID
        terminal_id: String,
        /// 新产生的输出文本内容
        data: String,
        /// 事件创建时间（UTC）
        created_at: DateTime<Utc>,
    },
    /// 终端退出事件
    ///
    /// 当终端子进程终止时触发。
    /// 前端可据此显示退出信息并禁用输入区域。
    Exited {
        /// 线程 ID
        thread_id: String,
        /// 终端 ID
        terminal_id: String,
        /// 进程退出码（正常退出时存在）
        exit_code: Option<i32>,
        /// 终止信号编号（被信号杀死时存在，仅 Unix）
        exit_signal: Option<i32>,
        /// 事件创建时间（UTC）
        created_at: DateTime<Utc>,
    },
    /// 终端错误事件
    ///
    /// 当终端运行过程中发生错误时触发。
    /// 前端应展示错误信息并提示用户。
    Error {
        /// 线程 ID
        thread_id: String,
        /// 终端 ID
        terminal_id: String,
        /// 错误描述信息
        message: String,
        /// 事件创建时间（UTC）
        created_at: DateTime<Utc>,
    },
    /// 终端清屏事件
    ///
    /// 当用户或系统触发清屏操作时通知订阅者清空对应的终端显示区域。
    Cleared {
        /// 线程 ID
        thread_id: String,
        /// 终端 ID
        terminal_id: String,
        /// 事件创建时间（UTC）
        created_at: DateTime<Utc>,
    },
    /// 终端重启事件
    ///
    /// 当终端会话被重启时触发。
    /// 携带重启后的新会话快照，前端应重置终端面板状态。
    Restarted {
        /// 线程 ID
        thread_id: String,
        /// 终端 ID
        terminal_id: String,
        /// 重启后的会话快照
        snapshot: TerminalSessionSnapshot,
        /// 事件创建时间（UTC）
        created_at: DateTime<Utc>,
    },
}

/// 终端会话（内部结构体）
///
/// 维护单个终端会话的完整运行时状态，包括元数据、历史记录和底层 PTY 进程引用。
/// 此结构体仅在 `TerminalManager` 内部使用，对外通过 [`TerminalSessionSnapshot`] 暴露状态。
///
/// # 线程安全
///
/// 此结构体通过 `TerminalManager` 中的 `Arc<RwLock<HashMap<...>>>` 进行保护，
/// 确保并发访问的安全性。
struct TerminalSession {
    /// 线程 ID：标识该终端所属的工作线程
    thread_id: String,
    /// 终端 ID：在同一线程内唯一标识一个终端会话
    terminal_id: String,
    /// 工作目录：终端进程的启动目录
    cwd: String,
    /// 当前会话状态
    status: TerminalSessionStatus,
    /// 累积的输出历史记录（自启动或上次清屏以来）
    history: String,
    /// 子进程退出码（仅在退出后有效）
    exit_code: Option<i32>,
    /// 子进程终止信号编号（仅在 Unix 下被信号终止时有效）
    exit_signal: Option<i32>,
    /// 最后一次状态更新的时间戳（UTC）
    updated_at: DateTime<Utc>,
    /// 终端列数（窗口宽度）
    cols: u16,
    /// 终端行数（窗口高度）
    rows: u16,
    /// 进程 ID 缓存，避免频繁通过 PTY 进程获取
    pid: Option<u32>,
    /// 底层 PTY 进程引用，为 `None` 表示进程尚未创建或已被回收
    process: Option<PtyProcess>,
    /// 终端进程的环境变量配置（预留字段，当前未使用）
    #[allow(dead_code)]
    env: HashMap<String, String>,
}

/// 打开终端的输入参数
///
/// 用于创建新的终端会话。若指定的 `thread_id` + `terminal_id` 组合已存在，
/// 则复用现有会话并返回其快照。
#[derive(Debug, Clone)]
pub struct TerminalOpenInput {
    /// 线程 ID：标识终端所属的工作线程
    pub thread_id: String,
    /// 终端 ID：在同一线程内唯一标识一个终端
    pub terminal_id: String,
    /// 工作目录：终端进程的启动目录路径
    pub cwd: String,
    /// 终端列数（窗口宽度），默认 80
    pub cols: Option<u16>,
    /// 终端行数（窗口高度），默认 24
    pub rows: Option<u16>,
    /// 自定义环境变量，将合并到系统默认环境中
    pub env: Option<HashMap<String, String>>,
}

/// 写入终端的输入参数
///
/// 向指定终端会话写入数据（通常是用户输入的命令行文本）。
#[derive(Debug, Clone)]
pub struct TerminalWriteInput {
    /// 线程 ID
    pub thread_id: String,
    /// 终端 ID
    pub terminal_id: String,
    /// 要写入终端的文本数据（可包含 ANSI 转义序列）
    pub data: String,
}

/// 调整终端窗口大小的输入参数
///
/// 当前端终端面板尺寸变化时，调用此操作同步更新底层 PTY 的窗口尺寸。
#[derive(Debug, Clone)]
pub struct TerminalResizeInput {
    /// 线程 ID
    pub thread_id: String,
    /// 终端 ID
    pub terminal_id: String,
    /// 新的列数（窗口宽度）
    pub cols: u16,
    /// 新的行数（窗口高度）
    pub rows: u16,
}

/// 重启终端的输入参数
///
/// 重启操作会先终止现有进程、清空历史记录，然后以新参数重新启动终端。
#[derive(Debug, Clone)]
pub struct TerminalRestartInput {
    /// 线程 ID
    pub thread_id: String,
    /// 终端 ID
    pub terminal_id: String,
    /// 新的工作目录路径
    pub cwd: String,
    /// 新的终端列数
    pub cols: u16,
    /// 新的终端行数
    pub rows: u16,
    /// 新的环境变量配置
    pub env: Option<HashMap<String, String>>,
}

/// 关闭终端的输入参数
///
/// 支持关闭单个终端或按 `thread_id` 批量关闭该线程下的所有终端。
#[derive(Debug, Clone)]
pub struct TerminalCloseInput {
    /// 线程 ID
    pub thread_id: String,
    /// 终端 ID：若为 `Some` 则关闭指定终端，若为 `None` 则关闭该线程的所有终端
    pub terminal_id: Option<String>,
    /// 是否同时清除历史记录
    pub delete_history: bool,
}

/// 终端管理器
///
/// 终端模块的核心协调者，负责管理所有终端会话的创建、读写、调整和销毁。
///
/// # 架构设计
///
/// - **会话存储**：使用 `Arc<RwLock<HashMap<String, TerminalSession>>>` 存储所有会话，
///   键为 `thread_id:terminal_id` 格式的会话键，支持异步并发读写
/// - **事件广播**：通过 `broadcast::Sender<TerminalEvent>` 向所有订阅者推送终端事件，
///   通道容量为 10000，足以应对高频输出场景
/// - **无状态设计**：`TerminalManager` 本身不持有业务状态，所有状态均存储在会话中
///
/// # 使用示例
///
/// ```ignore
/// let manager = TerminalManager::new();
///
/// // 打开终端
/// let snapshot = manager.open(TerminalOpenInput {
///     thread_id: "thread-1".into(),
///     terminal_id: "term-1".into(),
///     cwd: "/workspace".into(),
///     cols: Some(120),
///     rows: Some(30),
///     env: None,
/// }).await?;
///
/// // 订阅事件
/// let mut rx = manager.subscribe();
/// tokio::spawn(async move {
///     while let Ok(event) = rx.recv().await {
///         // 处理终端事件...
///     }
/// });
/// ```
pub struct TerminalManager {
    /// 会话存储：键为 `thread_id:terminal_id`，值为会话对象
    /// 使用 `Arc<RwLock<...>>` 实现异步安全的共享可变访问
    sessions: Arc<RwLock<HashMap<String, TerminalSession>>>,
    /// 事件广播发送端：用于向所有订阅者推送终端事件
    /// 通道容量为 10000，超出后旧事件将被丢弃
    event_tx: broadcast::Sender<TerminalEvent>,
}

impl TerminalManager {
    /// 创建新的终端管理器实例
    ///
    /// 初始化空的会话存储和容量为 10000 的事件广播通道。
    ///
    /// # 返回值
    ///
    /// 返回一个新的 `TerminalManager` 实例，可直接投入使用。
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// 生成会话键
    ///
    /// 将会话的两个标识符组合为唯一的存储键，格式为 `thread_id:terminal_id`。
    ///
    /// # 参数
    ///
    /// - `thread_id`：线程 ID
    /// - `terminal_id`：终端 ID
    ///
    /// # 返回值
    ///
    /// 格式为 `"{thread_id}:{terminal_id}"` 的字符串，用作会话存储的 HashMap 键。
    fn session_key(thread_id: &str, terminal_id: &str) -> String {
        format!("{}:{}", thread_id, terminal_id)
    }

    /// 打开（创建）终端会话
    ///
    /// 根据输入参数创建新的终端会话并启动底层 PTY 进程。
    /// 若指定的 `thread_id` + `terminal_id` 组合已存在，则复用现有会话并返回其快照。
    ///
    /// # 参数
    ///
    /// - `input`：终端打开参数，包含线程 ID、终端 ID、工作目录、窗口尺寸和环境变量
    ///
    /// # 返回值
    ///
    /// - `Ok(TerminalSessionSnapshot)`：成功创建或复用时返回会话快照
    /// - `Err(TerminalError)`：PTY 进程启动失败时返回错误
    ///
    /// # 副作用
    ///
    /// - 在会话存储中插入新会话
    /// - 广播 `TerminalEvent::Started` 事件
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
            pid: None,
            process: None,
            env: input.env.clone().unwrap_or_default(),
        };

        // 启动 PTY 进程
        let process = PtyProcess::new(
            &input.cwd,
            crate::pty::PtySize { cols, rows },
            &input.env.unwrap_or_default(),
        );

        session.status = TerminalSessionStatus::Running;
        session.pid = Some(process.pid());
        session.process = Some(process);
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

    /// 向终端写入数据
    ///
    /// 将指定文本数据写入目标终端的 PTY 输入流，同时将数据追加到会话历史记录。
    ///
    /// # 参数
    ///
    /// - `input`：写入参数，包含线程 ID、终端 ID 和要写入的文本数据
    ///
    /// # 返回值
    ///
    /// - `Ok(())`：写入成功
    /// - `Err(TerminalError::TerminalNotFound)`：目标终端不存在
    /// - `Err(TerminalError::TerminalNotStarted)`：终端未处于运行状态
    pub async fn write(&self, input: TerminalWriteInput) -> TerminalResult<()> {
        let key = Self::session_key(&input.thread_id, &input.terminal_id);

        let mut sessions = self.sessions.write().await;
        let session = sessions
            .get_mut(&key)
            .ok_or_else(|| TerminalError::TerminalNotFound(key.clone()))?;

        if session.status != TerminalSessionStatus::Running {
            return Err(TerminalError::TerminalNotStarted);
        }

        // 实际写入 PTY
        if let Some(ref process) = session.process {
            process.write(&input.data);
        }

        // 追加到历史记录
        session.history.push_str(&input.data);
        session.updated_at = Utc::now();

        Ok(())
    }

    /// 调整终端窗口大小
    ///
    /// 更新终端会话的窗口尺寸配置，并同步调整底层 PTY 的实际大小。
    /// 此操作通常在用户拖拽调整终端面板大小时触发。
    ///
    /// # 参数
    ///
    /// - `input`：调整大小参数，包含线程 ID、终端 ID 和新的列数、行数
    ///
    /// # 返回值
    ///
    /// - `Ok(())`：调整成功
    /// - `Err(TerminalError::TerminalNotFound)`：目标终端不存在
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

        // 实际调整 PTY 大小
        if let Some(ref mut process) = session.process {
            process.resize(crate::pty::PtySize {
                cols: input.cols,
                rows: input.rows,
            });
        }

        Ok(())
    }

    /// 清空终端屏幕和历史记录
    ///
    /// 清除指定终端会话的累积输出历史，并广播清屏事件通知订阅者。
    ///
    /// # 参数
    ///
    /// - `thread_id`：线程 ID
    /// - `terminal_id`：终端 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(())`：清屏成功
    /// - `Err(TerminalError::TerminalNotFound)`：目标终端不存在
    ///
    /// # 副作用
    ///
    /// - 清空会话的 `history` 字段
    /// - 广播 `TerminalEvent::Cleared` 事件
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

    /// 重启终端会话
    ///
    /// 执行终端重启流程：先终止现有 PTY 进程并清空历史记录，
    /// 然后以新参数重新创建终端会话。
    ///
    /// # 参数
    ///
    /// - `input`：重启参数，包含线程 ID、终端 ID、新的工作目录、窗口尺寸和环境变量
    ///
    /// # 返回值
    ///
    /// - `Ok(TerminalSessionSnapshot)`：重启成功后返回新会话的快照
    /// - `Err(TerminalError)`：重启过程中发生错误
    ///
    /// # 副作用
    ///
    /// - 终止原有 PTY 子进程
    /// - 清空会话历史记录
    /// - 创建新的 PTY 进程
    /// - 广播 `TerminalEvent::Restarted` 事件
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
                if let Some(mut process) = session.process.take() {
                    process.kill();
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

    /// 关闭终端会话
    ///
    /// 终止指定的终端会话并回收其 PTY 进程资源。
    /// 支持两种模式：
    /// - 关闭单个终端：当 `terminal_id` 为 `Some` 时，仅关闭指定的终端
    /// - 批量关闭：当 `terminal_id` 为 `None` 时，关闭该 `thread_id` 下的所有终端
    ///
    /// # 参数
    ///
    /// - `input`：关闭参数，包含线程 ID、可选的终端 ID 和是否删除历史的标志
    ///
    /// # 返回值
    ///
    /// - `Ok(())`：关闭成功（即使目标终端不存在也不会报错）
    pub async fn close(&self, input: TerminalCloseInput) -> TerminalResult<()> {
        let mut sessions = self.sessions.write().await;

        if let Some(terminal_id) = input.terminal_id {
            // 关闭指定终端
            let key = Self::session_key(&input.thread_id, &terminal_id);
            info!("关闭终端: {}", key);

            if let Some(mut session) = sessions.remove(&key) {
                // 停止进程
                if let Some(mut process) = session.process.take() {
                    process.kill();
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
                    if let Some(mut process) = session.process.take() {
                        process.kill();
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
    ///
    /// 返回一个广播通道的接收端，用于接收所有终端会话的生命周期事件。
    /// 多个调用方可各自持有独立的接收端，实现一对多的事件分发。
    ///
    /// # 返回值
    ///
    /// 返回 `broadcast::Receiver<TerminalEvent>`，可通过 `.recv().await` 异步接收事件。
    ///
    /// # 注意事项
    ///
    /// - 接收端创建后只能接收到此时刻之后产生的事件
    /// - 若消费速度过慢导致落后超过通道容量（10000），接收端将收到 `Lagged` 错误
    pub fn subscribe(&self) -> broadcast::Receiver<TerminalEvent> {
        self.event_tx.subscribe()
    }

    /// 获取指定终端会话的快照
    ///
    /// 返回目标终端会话在当前时刻的只读快照，包含完整的历史记录和状态信息。
    ///
    /// # 参数
    ///
    /// - `thread_id`：线程 ID
    /// - `terminal_id`：终端 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(TerminalSessionSnapshot)`：成功获取快照
    /// - `Err(TerminalError::TerminalNotFound)`：目标终端不存在
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

    /// 列出所有活跃的终端会话
    ///
    /// 返回当前管理器中所有终端会话的快照列表。
    /// 此方法常用于前端初始化时加载完整的终端列表。
    ///
    /// # 返回值
    ///
    /// 返回包含所有会话快照的 `Vec`，若没有会话则返回空 `Vec`。
    pub async fn list_sessions(&self) -> Vec<TerminalSessionSnapshot> {
        let sessions = self.sessions.read().await;
        sessions.values().map(|s| self.create_snapshot(s)).collect()
    }

    /// 创建会话快照（内部方法）
    ///
    /// 将内部的 `TerminalSession` 转换为对外暴露的 `TerminalSessionSnapshot`。
    ///
    /// # 参数
    ///
    /// - `session`：内部会话引用
    ///
    /// # 返回值
    ///
    /// 返回与输入会话状态一致的只读快照。
    fn create_snapshot(&self, session: &TerminalSession) -> TerminalSessionSnapshot {
        TerminalSessionSnapshot {
            thread_id: session.thread_id.clone(),
            terminal_id: session.terminal_id.clone(),
            cwd: session.cwd.clone(),
            status: session.status.clone(),
            pid: session.process.as_ref().map(|p| p.pid()),
            history: session.history.clone(),
            exit_code: session.exit_code,
            exit_signal: session.exit_signal,
            updated_at: session.updated_at,
        }
    }

    /// 释放所有终端资源
    ///
    /// 终止所有活跃的 PTY 子进程并清空会话存储。
    /// 通常在应用关闭或模块卸载时调用，确保不会遗留僵尸进程。
    ///
    /// # 副作用
    ///
    /// - 终止所有 PTY 子进程
    /// - 清空会话存储 HashMap
    pub async fn dispose(&self) {
        info!("释放所有终端资源");

        let mut sessions = self.sessions.write().await;
        for (_, mut session) in sessions.drain() {
            if let Some(mut process) = session.process.take() {
                process.kill();
            }
        }
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
