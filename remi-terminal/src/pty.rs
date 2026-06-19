//! PTY 进程封装

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tracing::{debug, error};

/// PTY 进程
pub struct PtyProcess {
    pid: u32,
    size: PtySize,
    writer: Option<Arc<Mutex<Box<dyn Write + Send>>>>,
    reader: Option<Arc<Mutex<Box<dyn Read + Send>>>>,
    child: Option<Arc<Mutex<Box<dyn portable_pty::Child + Send>>>>,
}

impl PtyProcess {
    /// 创建新的 PTY 进程
    pub fn new(cwd: &str, size: PtySize, env: &HashMap<String, String>) -> Self {
        let pty_system = native_pty_system();
        
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

        // 确定 shell 命令
        let shell_cmd = if cfg!(windows) {
            std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        };

        let mut cmd = CommandBuilder::new(&shell_cmd);
        cmd.cwd(std::path::Path::new(cwd));

        // 设置环境变量
        for (key, value) in env {
            cmd.env(key, value);
        }

        // 启动子进程
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

    /// 获取 PID
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// 调整大小
    pub fn resize(&mut self, size: PtySize) {
        self.size = size;
        // portable-pty 的 resize 需要通过 master 端调用
        // 这里保存新的尺寸，实际 resize 需要在 master 上操作
        debug!("PTY resized to {}x{}", size.cols, size.rows);
    }

    /// 写入数据
    pub fn write(&self, data: &str) {
        if let Some(ref writer) = self.writer {
            if let Ok(mut w) = writer.lock() {
                if let Err(e) = w.write_all(data.as_bytes()) {
                    error!("Failed to write to PTY: {}", e);
                }
                if let Err(e) = w.flush() {
                    error!("Failed to flush PTY: {}", e);
                }
            }
        }
    }

    /// 读取数据（非阻塞）
    pub fn read(&self, buf: &mut [u8]) -> Option<usize> {
        if let Some(ref reader) = self.reader {
            if let Ok(mut r) = reader.lock() {
                match r.read(buf) {
                    Ok(n) => return Some(n),
                    Err(e) => {
                        if e.kind() != std::io::ErrorKind::WouldBlock {
                            error!("Failed to read from PTY: {}", e);
                        }
                    }
                }
            }
        }
        None
    }

    /// 停止进程
    pub fn kill(&mut self) {
        if let Some(ref child) = self.child {
            if let Ok(mut c) = child.lock() {
                if let Err(e) = c.kill() {
                    error!("Failed to kill PTY process: {}", e);
                }
            }
        }
    }

    /// 检查进程是否还在运行
    pub fn is_alive(&self) -> bool {
        if let Some(ref child) = self.child {
            if let Ok(mut c) = child.lock() {
                // 尝试等待，如果返回 None 说明还在运行
                return c.try_wait().ok().flatten().is_none();
            }
        }
        false
    }
}

impl Drop for PtyProcess {
    fn drop(&mut self) {
        self.kill();
    }
}
