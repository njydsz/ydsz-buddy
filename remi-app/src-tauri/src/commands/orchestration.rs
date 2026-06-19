//! # AI 编排引擎命令模块
//!
//! 本模块提供与 AI 对话编排相关的 Tauri 命令，支持对话线程管理、消息发送、历史记录查询等功能。
//!
//! ## 模块职责
//!
//! - 封装 `remi_orchestration` 库的能力，提供前端可调用的 AI 对话命令
//! - 管理对话线程的生命周期（创建、删除、重命名）
//! - 处理消息的发送和导入
//! - 维护编排引擎状态
//!
//! ## 核心功能
//!
//! 1. **线程管理**：创建对话线程、列出线程、删除线程、重命名线程
//! 2. **消息处理**：发送用户消息、导入历史消息
//! 3. **状态管理**：维护编排引擎和数据库连接
//!
//! ## 使用场景
//!
//! - 前端需要开始新对话时调用 `create_thread`
//! - 用户发送消息时调用 `send_message`
//! - 前端需要显示对话列表时调用 `list_threads`
//! - 用户删除对话时调用 `delete_thread`
//!
//! ## 架构说明
//!
//! 本模块基于事件溯源（Event Sourcing）架构：
//! - 所有操作通过命令（Command）分发到编排引擎
//! - 引擎将事件持久化到 SQLite 数据库
//! - 投影（Projection）用于查询当前状态
//!
//! ## 依赖说明
//!
//! 本模块依赖：
//! - `remi_orchestration`: 编排引擎核心
//! - `remi_persistence`: SQLite 持久化层
//! - `remi_core`: 核心数据模型

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;
use uuid::Uuid;

use remi_core::commands::*;
use remi_core::models::*;
use remi_core::provider::ModelSelection;
use remi_orchestration::{OrchestrationEngine, OrchestrationReadModel, OrchestrationShellSnapshot};
use remi_persistence::{SqliteClient, SqliteEventStore, SqliteProjectionRepository, run_migrations};

/// 编排引擎状态管理器
///
/// 持有 AI 编排引擎实例和数据库路径，负责管理对话线程和消息流。
///
/// # 字段说明
///
/// - `engine`: 编排引擎实例，负责命令分发和事件处理
/// - `db_path`: SQLite 数据库文件的绝对路径
///
/// # 使用场景
///
/// 在 `lib.rs` 中通过 `.manage(OrchestrationState::new())` 注入，
/// 各命令通过 `State<'_, OrchestrationState>` 参数获取该状态。
///
/// # 设计说明
///
/// - 引擎通过 Arc 包装，支持多线程共享
/// - 数据库在初始化时自动创建并执行迁移
pub struct OrchestrationState {
    engine: Arc<OrchestrationEngine>,
    db_path: std::path::PathBuf,
}

impl OrchestrationState {
    /// 创建新的编排引擎状态管理器
    ///
    /// 初始化数据库连接、事件存储、投影仓库和编排引擎。
    ///
    /// # 返回值
    ///
    /// 返回初始化后的 `OrchestrationState` 实例
    ///
    /// # Panics
    ///
    /// - 如果无法创建 SQLite 客户端
    /// - 如果数据库迁移失败
    ///
    /// # 设计说明
    ///
    /// - 数据库默认存储在系统数据目录下
    /// - Windows: `%APPDATA%\remi-code\remi.sqlite`
    /// - macOS: `~/Library/Application Support/remi-code/remi.sqlite`
    /// - Linux: `~/.local/share/remi-code/remi.sqlite`
    pub fn new() -> Self {
        // 使用默认数据库路径
        let db_path = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("remi-code")
            .join("remi.sqlite");

        // 初始化数据库
        let client = SqliteClient::new(&db_path).expect("Failed to create SQLite client");
        run_migrations(&client).expect("Failed to run migrations");

        // 创建事件存储和投影仓库
        let event_store = Arc::new(SqliteEventStore::new(client.clone()));
        let projection_repo = Arc::new(SqliteProjectionRepository::new(client));

        // 创建编排引擎
        let engine = Arc::new(OrchestrationEngine::new(event_store, projection_repo));

        Self { engine, db_path }
    }

    /// 获取编排引擎实例的引用
    ///
    /// # 返回值
    ///
    /// 返回 `OrchestrationEngine` 的 Arc 引用
    pub fn engine(&self) -> &Arc<OrchestrationEngine> {
        &self.engine
    }
}

/// 创建线程参数
///
/// 用于 `create_thread` 命令的输入参数。
///
/// # 字段说明
///
/// - `project_id`: 项目 ID（必填），线程所属的项目
/// - `title`: 线程标题（可选），如果不提供则使用默认值 "New Thread"
#[derive(Debug, Deserialize)]
pub struct CreateThreadParams {
    /// 项目 ID
    pub project_id: String,
    /// 线程标题
    pub title: Option<String>,
}

/// 发送消息参数
///
/// 用于 `send_message` 命令的输入参数。
///
/// # 字段说明
///
/// - `thread_id`: 线程 ID（必填），消息要发送到的目标线程
/// - `role`: 消息角色（必填），可能的值：`"user"`、`"assistant"`、`"system"`
/// - `content`: 消息内容（必填），文本内容
#[derive(Debug, Deserialize)]
pub struct SendMessageParams {
    /// 线程 ID
    pub thread_id: String,
    /// 消息角色
    pub role: String,
    /// 消息内容
    pub content: String,
}

/// 线程数据结构
///
/// 用于向前端返回对话线程的基本信息。
///
/// # 字段说明
///
/// - `id`: 线程唯一标识符（UUID 格式）
/// - `project_id`: 所属项目 ID
/// - `title`: 线程标题
/// - `created_at`: 创建时间戳（Unix 时间戳，秒）
/// - `updated_at`: 最后更新时间戳（Unix 时间戳，秒）
///
/// # 使用场景
///
/// 作为 `create_thread`、`list_threads` 等命令的返回值。
#[derive(Debug, Serialize)]
pub struct ThreadData {
    /// 线程 ID
    pub id: String,
    /// 项目 ID
    pub project_id: String,
    /// 线程标题
    pub title: String,
    /// 创建时间戳
    pub created_at: i64,
    /// 更新时间戳
    pub updated_at: i64,
}

/// 消息数据结构
///
/// 用于向前端返回单条消息的信息。
///
/// # 字段说明
///
/// - `id`: 消息唯一标识符（UUID 格式）
/// - `role`: 消息角色（`"user"`、`"assistant"`、`"system"`）
/// - `content`: 消息文本内容
/// - `timestamp`: 消息时间戳（Unix 时间戳，秒）
///
/// # 使用场景
///
/// 用于前端渲染对话历史中的单条消息。
#[derive(Debug, Serialize)]
pub struct MessageData {
    /// 消息 ID
    pub id: String,
    /// 消息角色
    pub role: String,
    /// 消息内容
    pub content: String,
    /// 时间戳
    pub timestamp: i64,
}

/// 创建对话线程命令
///
/// 在指定项目中创建新的对话线程。
///
/// # 参数
///
/// - `state`: 编排引擎状态（通过 Tauri State 注入）
/// - `params`: 创建线程参数（项目 ID、可选标题）
///
/// # 返回值
///
/// - `Ok(ThreadData)`: 创建成功，返回新线程的数据
/// - `Err(String)`: 创建失败（如项目 ID 无效、引擎错误）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const thread = await window.__TAURI__.invoke('create_thread', {
///     params: {
///         projectId: 'xxx-xxx-xxx',
///         title: '新对话'  // 可选
///     }
/// });
/// console.log('线程 ID:', thread.id);
/// ```
///
/// # 设计说明
///
/// - 线程 ID 自动生成（UUID v4）
/// - 默认使用 Codex 提供商和 "default" 模型
/// - 时间戳使用 UTC 时间
#[tauri::command]
pub async fn create_thread(
    state: State<'_, OrchestrationState>,
    params: CreateThreadParams,
) -> Result<ThreadData, String> {
    let thread_id = Uuid::new_v4();
    let project_id: ProjectId = params.project_id.parse().map_err(|e| format!("Invalid project_id: {}", e))?;

    // 构建创建线程命令
    let command = OrchestrationCommand::ThreadCreate(ThreadCreateCommand {
        command_id: Some(Uuid::new_v4().to_string()),
        thread_id,
        project_id,
        title: params.title.unwrap_or_else(|| "New Thread".to_string()),
        model_selection: ModelSelection {
            provider: remi_core::provider::ProviderKind::Codex,
            model: "default".to_string(),
            options: None,
        },
    });

    // 分发命令到编排引擎
    state.engine().dispatch(command).await.map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    Ok(ThreadData {
        id: thread_id.to_string(),
        project_id: project_id.to_string(),
        title: params.title.unwrap_or_else(|| "New Thread".to_string()),
        created_at: now,
        updated_at: now,
    })
}

/// 发送消息命令
///
/// 向指定对话线程发送一条消息。
///
/// # 参数
///
/// - `state`: 编排引擎状态
/// - `params`: 发送消息参数（线程 ID、角色、内容）
///
/// # 返回值
///
/// - `Ok(())`: 发送成功
/// - `Err(String)`: 发送失败（如线程 ID 无效、角色无效）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('send_message', {
///     params: {
///         threadId: 'xxx-xxx-xxx',
///         role: 'user',
///         content: '你好，请帮我写一个函数'
///     }
/// });
/// ```
///
/// # 设计说明
///
/// - 消息 ID 自动生成（UUID v4）
/// - 角色会自动转换为小写并匹配
/// - 如果角色不是 "user"、"assistant"、"system"，默认使用 "user"
/// - 当前实现仅导入消息，不触发 AI 响应（需要额外的处理逻辑）
#[tauri::command]
pub async fn send_message(
    state: State<'_, OrchestrationState>,
    params: SendMessageParams,
) -> Result<(), String> {
    let thread_id: ThreadId = params.thread_id.parse().map_err(|e| format!("Invalid thread_id: {}", e))?;
    let message_id = Uuid::new_v4();

    // 解析消息角色
    let role = match params.role.to_lowercase().as_str() {
        "user" => remi_core::models::MessageRole::User,
        "assistant" => remi_core::models::MessageRole::Assistant,
        "system" => remi_core::models::MessageRole::System,
        _ => remi_core::models::MessageRole::User,
    };

    // 构建消息对象
    let message = remi_core::models::Message {
        id: message_id,
        role,
        text: params.content,
        attachments: vec![],
        skills: vec![],
        mentions: vec![],
        dispatch_mode: None,
        turn_id: None,
        streaming: false,
        source: None,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    // 构建导入消息命令
    let command = OrchestrationCommand::ThreadMessagesImport(ThreadMessagesImportCommand {
        command_id: Some(Uuid::new_v4().to_string()),
        thread_id,
        messages: vec![message],
    });

    // 分发命令到编排引擎
    state.engine().dispatch(command).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 列出对话线程命令
///
/// 获取指定项目中的所有对话线程列表。
///
/// # 参数
///
/// - `state`: 编排引擎状态
/// - `project_id`: 项目 ID
///
/// # 返回值
///
/// - `Ok(Vec<ThreadData>)`: 查询成功，返回线程数据列表
/// - `Err(String)`: 查询失败（如项目 ID 无效）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const threads = await window.__TAURI__.invoke('list_threads', {
///     projectId: 'xxx-xxx-xxx'
/// });
/// threads.forEach(t => {
///     console.log(`线程: ${t.title}, ID: ${t.id}`);
/// });
/// ```
///
/// # 设计说明
///
/// - 从编排引擎的 Shell 快照中获取线程列表
/// - 按项目 ID 过滤
/// - 时间戳字段当前为 0（Shell 快照不包含时间信息）
#[tauri::command]
pub async fn list_threads(
    state: State<'_, OrchestrationState>,
    project_id: String,
) -> Result<Vec<ThreadData>, String> {
    let snapshot = state.engine().get_shell_snapshot().await.map_err(|e| e.to_string())?;
    let project_uuid: ProjectId = project_id.parse().map_err(|e| format!("Invalid project_id: {}", e))?;

    // 过滤并转换线程数据
    let threads: Vec<ThreadData> = snapshot
        .threads
        .into_iter()
        .filter(|t| t.project_id == project_uuid)
        .map(|t| ThreadData {
            id: t.id.to_string(),
            project_id: t.project_id.to_string(),
            title: t.title,
            created_at: 0, // Shell snapshot doesn't include timestamps
            updated_at: 0,
        })
        .collect();

    Ok(threads)
}

/// 删除对话线程命令
///
/// 删除指定的对话线程及其所有消息。
///
/// # 参数
///
/// - `state`: 编排引擎状态
/// - `thread_id`: 要删除的线程 ID
///
/// # 返回值
///
/// - `Ok(())`: 删除成功
/// - `Err(String)`: 删除失败（如线程 ID 无效）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('delete_thread', {
///     threadId: 'xxx-xxx-xxx'
/// });
/// ```
///
/// # 注意事项
///
/// - 删除操作不可逆
/// - 会同时删除线程下的所有消息
#[tauri::command]
pub async fn delete_thread(
    state: State<'_, OrchestrationState>,
    thread_id: String,
) -> Result<(), String> {
    let thread_uuid: ThreadId = thread_id.parse().map_err(|e| format!("Invalid thread_id: {}", e))?;

    // 构建删除线程命令
    let command = OrchestrationCommand::ThreadDelete(ThreadDeleteCommand {
        command_id: Some(Uuid::new_v4().to_string()),
        thread_id: thread_uuid,
    });

    // 分发命令到编排引擎
    state.engine().dispatch(command).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 重命名对话线程命令
///
/// 修改指定对话线程的标题。
///
/// # 参数
///
/// - `state`: 编排引擎状态
/// - `thread_id`: 线程 ID
/// - `title`: 新标题
///
/// # 返回值
///
/// - `Ok(())`: 重命名成功
/// - `Err(String)`: 重命名失败（如线程 ID 无效）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('rename_thread', {
///     threadId: 'xxx-xxx-xxx',
///     title: '新的标题'
/// });
/// ```
#[tauri::command]
pub async fn rename_thread(
    state: State<'_, OrchestrationState>,
    thread_id: String,
    title: String,
) -> Result<(), String> {
    let thread_uuid: ThreadId = thread_id.parse().map_err(|e| format!("Invalid thread_id: {}", e))?;

    // 构建更新线程元数据命令
    let command = OrchestrationCommand::ThreadMetaUpdate(ThreadMetaUpdateCommand {
        command_id: Some(Uuid::new_v4().to_string()),
        thread_id: thread_uuid,
        title: Some(title),
    });

    // 分发命令到编排引擎
    state.engine().dispatch(command).await.map_err(|e| e.to_string())?;
    Ok(())
}
