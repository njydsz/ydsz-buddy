//! PTY 进程封装模块
//!
//! 本模块提供底层伪终端（PTY）进程的封装，为上层终端管理器提供跨平台的终端进程操作能力。
//!
//! # 核心职责
//!
//! - **PTY 进程创建**：通过 `portable-pty` 库创建跨平台的伪终端进程
//! - **进程通信**：提供向 PTY 写入数据和从 PTY 读取数据的接口
//! - **进程控制**：支持调整终端大小、终止进程等操作
//! - **进程状态监控**：提供检查进程是否存活的方法
//!
//! # 使用场景
//!
//! 本模块主要被 `manager` 模块使用，作为终端会话的底层执行引擎：
//!
//! - 当用户打开新终端时，`TerminalManager` 调用 `PtyProcess::new` 创建 PTY 进程
//! - 用户输入命令时，通过 `write` 方法将数据写入 PTY
//! - 终端输出通过 `read` 方法读取并传递给前端
//! - 调整终端窗口大小时，调用 `resize` 方法同步 PTY 尺寸
//! - 关闭终端时，调用 `kill` 方法终止进程
//!
//! # 跨平台支持
//!
//! - **Windows**：使用 `ConPTY` API（通过 `portable-pty` 封装）
//! - **Unix/Linux/macOS**：使用 POSIX PTY 接口
//! - 自动检测操作系统并选择合适的 shell：
//!   - Windows: 优先使用 `COMSPEC` 环境变量，默认 `cmd.exe`
//!   - Unix: 优先使用 `SHELL` 环境变量，默认 `/bin/bash`
//!
//! # 线程安全
//!
//! 本模块使用 `Arc<Mutex<...>>` 保护内部资源，确保在多线程环境下的安全访问：
//!
//! - `writer`：PTY 写入端，支持并发写入
//! - `reader`：PTY 读取端，支持并发读取
//! - `child`：子进程句柄，支持并发控制

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder};
use tracing::{debug, error};

/// PTY 大小配置
///
/// 定义伪终端的窗口尺寸，用于创建和调整 PTY 时指定列数和行数。
#[derive(Debug, Clone, Copy)]
pub struct PtySize {
    /// 终端列数（窗口宽度），即每行可显示的字符数
    pub cols: u16,
    /// 终端行数（窗口高度），即终端可显示的文本行数
    pub rows: u16,
}

/// PTY 进程封装
///
/// 封装底层伪终端进程的完整生命周期管理，包括进程创建、通信、控制和状态监控。
/// 通过 `Arc<Mutex<...>>` 实现内部资源的线程安全访问。
///
/// # 资源管理
///
/// - 实现了 `Drop` trait，确保在对象销毁时自动终止子进程，防止僵尸进程
/// - 所有 IO 操作都通过互斥锁保护，支持多线程并发访问
///
/// # 使用示例
///
/// ```ignore
/// let env = HashMap::new();
/// let mut pty = PtyProcess::new("/workspace", PtySize { cols: 80, rows: 24 }, &env);
///
/// // 写入命令
/// pty.write("ls -la\n");
///
/// // 读取输出
/// let mut buf = [0u8; 1024];
/// if let Some(n) = pty.read(&mut buf) {
///     let output = String::from_utf8_lossy(&buf[..n]);
///     println!("Output: {}", output);
/// }
///
/// // 检查进程状态
/// if pty.is_alive() {
///     println!("Process {} is running", pty.pid());
/// }
///
/// // 进程会在 pty 离开作用域时自动终止
/// ```
pub struct PtyProcess {
    /// 进程 ID：操作系统分配的进程标识符，若进程未成功启动则为 0
    pid: u32,
    /// 终端尺寸：记录当前 PTY 的列数和行数配置
    size: PtySize,
    /// PTY 写入端：用于向子进程的标准输入写入数据
    /// 使用 `Arc<Mutex<...>>` 保护，支持多线程并发写入
    writer: Option<Arc<Mutex<Box<dyn Write + Send>>>>,
    /// PTY 读取端：用于从子进程的标准输出读取数据
    /// 使用 `Arc<Mutex<...>>` 保护，支持多线程并发读取
    reader: Option<Arc<Mutex<Box<dyn Read + Send>>>>,
    /// 子进程句柄：用于控制子进程的生命周期（终止、状态查询等）
    /// 使用 `Arc<Mutex<...>>` 保护，支持多线程并发控制
    child: Option<Arc<Mutex<Box<dyn portable_pty::Child + Send>>>>,
}

impl PtyProcess {
    /// 创建新的 PTY 进程
    ///
    /// 在指定工作目录下启动一个新的伪终端进程，自动检测操作系统并选择合适的 shell。
    /// 若 PTY 创建或进程启动失败，返回一个未初始化的实例（pid 为 0，所有资源为 None）。
    ///
    /// # 参数
    ///
    /// - `cwd`：工作目录路径，子进程将在此目录下启动
    /// - `size`：PTY 初始尺寸配置，包含列数和行数
    /// - `env`：自定义环境变量集合，将合并到系统默认环境中
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `PtyProcess` 实例。若创建失败，实例的 `pid` 为 0，所有资源字段为 `None`。
    ///
    /// # 平台特定行为
    ///
    /// - **Windows**：使用 `ConPTY` API，默认 shell 为 `cmd.exe`
    /// - **Unix/Linux/macOS**：使用 POSIX PTY，默认 shell 为 `/bin/bash`
    ///
    /// # 错误处理
    ///
    /// 本方法不会返回错误，而是在失败时记录错误日志并返回未初始化的实例。
    /// 调用方应检查 `pid()` 是否为 0 来判断创建是否成功。
    pub fn new(cwd: &str, size: PtySize, env: &HashMap<String, String>) -> Self {
        // 获取当前平台原生的 PTY 系统实现（Windows 为 ConPTY，Unix 为 POSIX PTY）
        let pty_system = native_pty_system();

        // 打开 PTY 设备对（master/slave），失败时返回未初始化实例
        let pty_pair = match pty_system.openpty(portable_pty::PtySize {
            rows: size.rows,
            cols: size.cols,
            pixel_width: 0,
            pixel_height: 0,
        }) {
            Ok(pair) => pair,
            Err(e) => {
                error!("Failed to open PTY: {}", e);
                return Self {
                    pid: 0,
                    size,
                    writer: None,
                    reader: None,
                    child: None,
                };
            }
        };

        // 根据平台选择默认 shell：Windows 使用 COMSPEC 或 cmd.exe，Unix 使用 SHELL 或 /bin/bash
        let shell_cmd = if cfg!(windows) {
            std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        };

        let mut cmd = CommandBuilder::new(&shell_cmd);
        cmd.cwd(std::path::Path::new(cwd));

        // 将自定义环境变量合并到子进程环境中，覆盖同名默认变量
        for (key, value) in env {
            cmd.env(key, value);
        }

        // 在 PTY slave 端启动子进程，失败时返回未初始化实例
        let child = match pty_pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to spawn command: {}", e);
                return Self {
                    pid: 0,
                    size,
                    writer: None,
                    reader: None,
                    child: None,
                };
            }
        };

        // 从 master 端获取写入和读取句柄，用于与子进程通信
        let writer = pty_pair.master.take_writer().ok();
        let reader = pty_pair.master.try_clone_reader().ok();

        let pid = child.process_id().unwrap_or(0);

        debug!("PTY process started with PID: {}", pid);

        Self {
            pid,
            size,
            writer: writer.map(|w| Arc::new(Mutex::new(w))),
            reader: reader.map(|r| Arc::new(Mutex::new(r))),
            child: Some(Arc::new(Mutex::new(child))),
        }
    }

    /// 获取进程 ID
    ///
    /// 返回操作系统分配给此 PTY 子进程的进程标识符。
    /// 若进程未成功启动，返回 0。
    ///
    /// # 返回值
    ///
    /// - `u32`：进程 ID，0 表示进程未启动或已失效
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// 调整终端窗口大小
    ///
    /// 更新 PTY 的终端尺寸配置。注意：此方法仅更新内部记录的尺寸，
    /// 实际的 PTY 窗口大小调整需要通过 `portable-pty` 的 master 端调用。
    ///
    /// # 参数
    ///
    /// - `size`：新的终端尺寸配置，包含列数和行数
    ///
    /// # 注意事项
    ///
    /// 当前实现仅更新内部状态，未实际调用底层 PTY 的 resize API。
    /// 若需要完整的窗口大小调整功能，需要持有 master 端引用并调用相应的 resize 方法。
    pub fn resize(&mut self, size: PtySize) {
        self.size = size;
        // portable-pty 的 resize 需要通过 master 端调用
        // 这里保存新的尺寸，实际 resize 需要在 master 上操作
        debug!("PTY resized to {}x{}", size.cols, size.rows);
    }

    /// 向 PTY 写入数据
    ///
    /// 将指定的文本数据写入 PTY 子进程的标准输入流。
    /// 数据写入后会自动刷新缓冲区，确保数据立即传递给子进程。
    ///
    /// # 参数
    ///
    /// - `data`：要写入的文本数据，通常包含用户输入的命令或按键序列
    ///
    /// # 线程安全
    ///
    /// 此方法通过互斥锁保护写入操作，支持多线程并发调用。
    ///
    /// # 错误处理
    ///
    /// 写入失败时记录错误日志，但不返回错误。调用方无法感知写入是否成功。
    pub fn write(&self, data: &str) {
        if let Some(ref writer) = self.writer {
            if let Ok(mut w) = writer.lock() {
                // 写入全部数据，失败时仅记录日志不中断流程
                if let Err(e) = w.write_all(data.as_bytes()) {
                    error!("Failed to write to PTY: {}", e);
                }
                // 立即刷新缓冲区，确保数据及时传递给子进程
                if let Err(e) = w.flush() {
                    error!("Failed to flush PTY: {}", e);
                }
            }
        }
    }

    /// 从 PTY 读取数据
    ///
    /// 尝试从 PTY 子进程的标准输出读取数据。此方法为非阻塞读取，
    /// 若无数据可读或遇到 WouldBlock 错误，立即返回 `None`。
    ///
    /// # 参数
    ///
    /// - `buf`：用于存储读取数据的缓冲区
    ///
    /// # 返回值
    ///
    /// - `Some(usize)`：成功读取的字节数
    /// - `None`：无数据可读、读取失败或 PTY 未初始化
    ///
    /// # 线程安全
    ///
    /// 此方法通过互斥锁保护读取操作，支持多线程并发调用。
    ///
    /// # 错误处理
    ///
    /// - `WouldBlock` 错误被静默忽略（表示无数据可读）
    /// - 其他 IO 错误会被记录到日志
    pub fn read(&self, buf: &mut [u8]) -> Option<usize> {
        if let Some(ref reader) = self.reader {
            if let Ok(mut r) = reader.lock() {
                match r.read(buf) {
                    Ok(n) => return Some(n),
                    Err(e) => {
                        // WouldBlock 表示当前无数据可读，属于正常情况，无需记录错误
                        if e.kind() != std::io::ErrorKind::WouldBlock {
                            error!("Failed to read from PTY: {}", e);
                        }
                    }
                }
            }
        }
        None
    }

    /// 终止 PTY 子进程
    ///
    /// 强制终止与此 PTY 关联的子进程。此操作会立即杀死进程，
    /// 不会等待进程优雅退出。
    ///
    /// # 线程安全
    ///
    /// 此方法通过互斥锁保护子进程句柄，支持多线程并发调用。
    ///
    /// # 错误处理
    ///
    /// 终止失败时记录错误日志，但不返回错误。
    pub fn kill(&mut self) {
        if let Some(ref child) = self.child {
            if let Ok(mut c) = child.lock() {
                if let Err(e) = c.kill() {
                    error!("Failed to kill PTY process: {}", e);
                }
            }
        }
    }

    /// 检查进程是否存活
    ///
    /// 通过尝试非阻塞等待来检查子进程是否仍在运行。
    ///
    /// # 返回值
    ///
    /// - `true`：进程仍在运行
    /// - `false`：进程已退出、已被终止或 PTY 未初始化
    ///
    /// # 实现细节
    ///
    /// 使用 `try_wait()` 进行非阻塞检查：
    /// - 若返回 `None`，表示进程仍在运行
    /// - 若返回 `Some(exit_status)`，表示进程已退出
    pub fn is_alive(&self) -> bool {
        if let Some(ref child) = self.child {
            if let Ok(mut c) = child.lock() {
                // try_wait() 返回 None 表示进程仍在运行，返回 Some 表示进程已退出
                return c.try_wait().ok().flatten().is_none();
            }
        }
        false
    }
}

impl Drop for PtyProcess {
    /// 资源清理
    ///
    /// 在 `PtyProcess` 实例被销毁时自动调用，确保子进程被正确终止，
    /// 防止产生僵尸进程。
    ///
    /// # 行为
    ///
    /// 调用 `kill()` 方法强制终止子进程。若进程已退出，此操作为无害的空操作。
    fn drop(&mut self) {
        self.kill();
    }
}
