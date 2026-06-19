//! PTY 进程封装

use std::collections::HashMap;

/// PTY 大小
#[derive(Debug, Clone, Copy)]
pub struct PtySize {
    pub cols: u16,
    pub rows: u16,
}

/// PTY 进程
pub struct PtyProcess {
    pid: u32,
    size: PtySize,
}

impl PtyProcess {
    /// 创建新的 PTY 进程
    pub fn new(_cwd: &str, size: PtySize, _env: &HashMap<String, String>) -> Self {
        // TODO: 实现实际的 PTY 启动逻辑
        // 需要使用 portable-pty 或类似库
        Self {
            pid: 0,
            size,
        }
    }

    /// 获取 PID
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// 调整大小
    pub fn resize(&mut self, size: PtySize) {
        self.size = size;
        // TODO: 实际调整 PTY 大小
    }

    /// 写入数据
    pub fn write(&self, _data: &str) {
        // TODO: 实际写入 PTY
    }

    /// 停止进程
    pub fn kill(&mut self) {
        // TODO: 实际停止进程
    }
}
