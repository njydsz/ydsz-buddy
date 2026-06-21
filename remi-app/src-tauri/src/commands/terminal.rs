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
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::task::JoinHandle;
use tracing::{debug, warn};

/// 终端输出事件载荷
///
/// 通过 `terminal-output` 事件推送到前端，前端通过 `listen('terminal-output')` 接收。
#[derive(Debug, Clone, serde::Serialize)]
struct TerminalOutputPayload {
    /// 终端会话 ID
    session_id: String,
    /// 终端输出内容（UTF-8 字符串，可能包含 ANSI 转义序列）
    output: String,
}

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
    /// 终端会话集合（键为会话 ID，值为会话对象）
    terminals: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

/// 单个终端会话
///
/// 封装一个终端会话的所有资源，包括 PTY master（用于 resize）、写入流、
/// 子进程句柄和后台读取任务的 JoinHandle。
///
/// # 字段说明
///
/// - `master`: PTY 主设备，用于 resize 操作
/// - `writer`: 向终端写入输入的写入流
/// - `process`: 终端子进程句柄，用于控制进程生命周期
/// - `reader_handle`: 后台读取任务的句柄，用于在关闭终端时终止读取循环
/// - `cwd`: 终端工作目录，用于重启
/// - `shell`: Shell 程序路径，用于重启
struct TerminalSession {
    /// PTY 主设备，用于 resize 操作
    master: Box<dyn portable_pty::MasterPty + Send>,
    /// 向终端写入输入的写入流
    writer: Box<dyn Write + Send>,
    /// 终端子进程句柄，用于控制进程生命周期
    process: Box<dyn portable_pty::Child + Send>,
    /// 后台读取任务的句柄，用于在关闭终端时终止读取循环
    reader_handle: Option<JoinHandle<()>>,
    /// 终端工作目录，用于重启时恢复
    cwd: String,
    /// Shell 程序路径，用于重启时恢复
    shell: String,
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

/// 启动后台 PTY 读取任务
///
/// 在独立的 tokio 任务中持续读取 PTY 输出，并通过 `app.emit('terminal-output', payload)`
/// 推送到前端。读取循环在以下情况退出：
/// - PTY 已关闭（read 返回 0 字节）
/// - 读取发生错误
///
/// # 参数
///
/// - `app`: Tauri 应用句柄，用于发射事件
/// - `session_id`: 终端会话 ID，包含在事件载荷中
/// - `reader`: PTY 读取器
fn spawn_pty_reader(
    app: AppHandle,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
) -> JoinHandle<()> {
    tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    debug!("终端 {} 的 PTY 已关闭，停止读取", session_id);
                    break;
                }
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    let payload = TerminalOutputPayload {
                        session_id: session_id.clone(),
                        output,
                    };
                    if let Err(e) = app.emit("terminal-output", &payload) {
                        warn!("终端 {} 推送输出事件失败: {}", session_id, e);
                    }
                }
                Err(e) => {
                    warn!("终端 {} 读取输出失败: {}", session_id, e);
                    break;
                }
            }
        }
    })
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
    app: AppHandle,
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
    let reader = pty_pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pty_pair.master.take_writer().map_err(|e| e.to_string())?;

    // 生成唯一的会话 ID
    let terminal_id = uuid::Uuid::new_v4().to_string();

    // 启动后台读取任务，持续推送 PTY 输出到前端
    let reader_handle = spawn_pty_reader(app, terminal_id.clone(), Box::new(reader));

    // 创建会话对象
    let session = TerminalSession {
        master: pty_pair.master,
        writer,
        process: child,
        reader_handle: Some(reader_handle),
        cwd: cwd.clone(),
        shell: shell_cmd.clone(),
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
/// 修改指定终端会话的行列数，通过 PTY master 的 `resize` 方法实现。
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
/// - `Ok(())`: 调整成功
/// - `Err(String)`: 调整失败（会话不存在或 PTY resize 失败）
#[tauri::command]
pub async fn resize_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(session) = terminals.get(&session_id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Terminal session not found".to_string())
    }
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
        // 终止后台读取任务
        if let Some(handle) = session.reader_handle.take() {
            handle.abort();
        }
        // 尝试终止子进程，忽略错误（进程可能已退出）
        let _ = session.process.kill();
        Ok(())
    } else {
        Ok(())
    }
}

/// 清除终端会话命令
///
/// 清除指定终端会话的屏幕内容（发送清屏序列）。
#[tauri::command]
pub async fn clear_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(session) = terminals.get_mut(&session_id) {
        // 发送 ANSI 清屏序列
        session.writer.write_all(b"\x1b[2J\x1b[H").map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Terminal session not found".to_string())
    }
}

/// 重启终端会话命令
///
/// 终止当前终端进程并重新启动一个新的终端会话。
#[tauri::command]
pub async fn restart_terminal(
    app: AppHandle,
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = terminals.remove(&session_id) {
        // 终止旧的后台读取任务
        if let Some(handle) = session.reader_handle.take() {
            handle.abort();
        }
        // 终止旧进程
        let _ = session.process.kill();

        // 重新启动
        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let mut cmd = CommandBuilder::new(&session.shell);
        cmd.cwd(std::path::Path::new(&session.cwd));
        let child = pty_pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        let reader = pty_pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pty_pair.master.take_writer().map_err(|e| e.to_string())?;

        // 启动新的后台读取任务
        let reader_handle = spawn_pty_reader(app, session_id.clone(), Box::new(reader));

        let new_session = TerminalSession {
            master: pty_pair.master,
            writer,
            process: child,
            reader_handle: Some(reader_handle),
            cwd: session.cwd,
            shell: session.shell,
        };
        terminals.insert(session_id, new_session);
        Ok(())
    } else {
        Err("Terminal session not found".to_string())
    }
}

