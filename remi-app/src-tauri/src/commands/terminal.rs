//! # 终端会话管理命令模块
//!
//! 本模块提供与终端会话相关的 Tauri 命令，支持创建、写入、调整大小和关闭终端会话。
//!
//! ## 模块职责
//!
//! - 管理多个终端会话的生命周期
//! - 封装 PTY（伪终端）系统的底层操作
//! - 提供前端可调用的终端控制命令
//!
//! ## 核心功能
//!
//! 1. **创建终端**：启动新的终端进程并分配 PTY
//! 2. **写入数据**：向终端发送用户输入或命令
//! 3. **调整大小**：动态修改终端的行列数
//! 4. **关闭终端**：终止终端进程并清理资源
//!
//! ## 使用场景
//!
//! - 前端需要集成终端面板时调用 `create_terminal` 创建会话
//! - 用户输入命令时通过 `write_terminal` 发送到终端
//! - 终端窗口大小变化时调用 `resize_terminal` 同步尺寸
//! - 关闭终端面板时调用 `close_terminal` 释放资源
//!
//! ## 依赖说明
//!
//! 本模块依赖 `portable-pty` crate 实现跨平台的 PTY 操作。

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::State;

/// 终端状态管理器
///
/// 持有所有活跃终端会话的集合，通过互斥锁保证线程安全。
///
/// # 字段说明
///
/// - `terminals`: 存储所有终端会话的 HashMap，键为会话 ID，值为会话对象
///
/// # 使用场景
///
/// 在 `lib.rs` 中通过 `.manage(TerminalState::new())` 注入，
/// 各命令通过 `State<'_, TerminalState>` 参数获取该状态。
pub struct TerminalState {
    terminals: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

/// 单个终端会话
///
/// 封装一个终端会话的所有资源，包括读写流和子进程句柄。
///
/// # 字段说明
///
/// - `reader`: 从终端读取输出的读取流（Box<dyn Read + Send>）
/// - `writer`: 向终端写入输入的写入流（Box<dyn Write + Send>）
/// - `process`: 终端子进程句柄，用于控制进程生命周期
///
/// # 设计说明
///
/// 该结构体不可序列化（因包含 trait object），仅在 Rust 后端使用。
struct TerminalSession {
    reader: Box<dyn Read + Send>,
    writer: Box<dyn Write + Send>,
    process: Box<dyn portable_pty::Child + Send>,
}

impl TerminalState {
    /// 创建新的终端状态管理器
    ///
    /// 初始化空的会话集合。
    ///
    /// # 返回值
    ///
    /// 返回初始化后的 `TerminalState` 实例
    pub fn new() -> Self {
        Self {
            terminals: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// 创建终端会话命令
///
/// 启动一个新的终端进程，分配 PTY 对，并返回会话 ID。
///
/// # 参数
///
/// - `state`: 终端状态管理器（通过 Tauri State 注入）
/// - `cwd`: 终端的工作目录（绝对路径）
/// - `shell`: 可选的 Shell 程序路径，如果不提供则使用系统默认 Shell
///   - Windows: cmd.exe
///   - Unix: $SHELL 环境变量或 /bin/bash
///
/// # 返回值
///
/// - `Ok(String)`: 创建成功，返回终端会话 ID（UUID 格式）
/// - `Err(String)`: 创建失败（如 PTY 分配失败、Shell 启动失败）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const sessionId = await window.__TAURI__.invoke('create_terminal', {
///     cwd: '/home/user/project',
///     shell: '/bin/zsh'  // 可选
/// });
/// console.log('终端会话 ID:', sessionId);
/// ```
#[tauri::command]
pub async fn create_terminal(
    state: State<'_, TerminalState>,
    cwd: String,
    shell: Option<String>,
) -> Result<String, String> {
    // 创建 PTY 系统
    let pty_system = native_pty_system();
    
    // 打开 PTY 对（主从设备），初始大小为 24 行 80 列
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // 确定要使用的 Shell
    let shell_cmd = shell.unwrap_or_else(|| {
        if cfg!(windows) {
            "cmd.exe".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
    });

    // 构建命令，设置工作目录
    let mut cmd = CommandBuilder::new(&shell_cmd);
    cmd.cwd(std::path::Path::new(&cwd));

    // 在从 PTY 上启动子进程
    let child = pty_pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    
    // 克隆读取器并获取写入器
    let mut reader = pty_pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pty_pair.master.take_writer().map_err(|e| e.to_string())?;

    // 生成唯一的会话 ID
    let terminal_id = uuid::Uuid::new_v4().to_string();
    
    // 创建会话对象
    let session = TerminalSession {
        reader: Box::new(reader),
        writer: Box::new(writer),
        process: child,
    };

    // 将会话存入状态管理器
    let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    terminals.insert(terminal_id.clone(), session);

    Ok(terminal_id)
}

/// 向终端写入数据命令
///
/// 将数据（通常是用户输入）发送到指定的终端会话。
///
/// # 参数
///
/// - `state`: 终端状态管理器
/// - `session_id`: 终端会话 ID（由 `create_terminal` 返回）
/// - `data`: 要写入的数据字符串（通常是按键输入或命令）
///
/// # 返回值
///
/// - `Ok(())`: 写入成功
/// - `Err(String)`: 写入失败（如会话不存在、IO 错误）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('write_terminal', {
///     sessionId: 'xxx-xxx-xxx',
///     data: 'ls -la\n'  // 注意需要换行符执行命令
/// });
/// ```
#[tauri::command]
pub async fn write_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(session) = terminals.get_mut(&session_id) {
        // 写入数据并刷新缓冲区
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Terminal session not found".to_string())
    }
}

/// 调整终端大小命令
///
/// 修改指定终端会话的行列数（当前为占位实现）。
///
/// # 参数
///
/// - `state`: 终端状态管理器
/// - `session_id`: 终端会话 ID
/// - `rows`: 新的行数
/// - `cols`: 新的列数
///
/// # 返回值
///
/// - `Ok(())`: 调整成功（当前始终返回成功）
/// - `Err(String)`: 调整失败
///
/// # 注意事项
///
/// 当前实现为占位符，实际的 PTY 大小调整需要持有 PTY master 的引用，
/// 具体实现取决于 `portable-pty` 版本。
#[tauri::command]
pub async fn resize_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    // Note: resize implementation depends on portable-pty version
    // This is a placeholder - actual resize needs PTY master reference
    Ok(())
}

/// 关闭终端会话命令
///
/// 终止指定的终端进程并从状态管理器中移除会话。
///
/// # 参数
///
/// - `state`: 终端状态管理器
/// - `session_id`: 终端会话 ID
///
/// # 返回值
///
/// - `Ok(())`: 关闭成功（即使会话不存在也返回成功）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('close_terminal', {
///     sessionId: 'xxx-xxx-xxx'
/// });
/// ```
#[tauri::command]
pub async fn close_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = terminals.remove(&session_id) {
        // 尝试终止子进程，忽略错误（进程可能已退出）
        let _ = session.process.kill();
        Ok(())
    } else {
        Ok(())
    }
}
