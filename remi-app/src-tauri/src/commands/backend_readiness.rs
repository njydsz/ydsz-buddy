//! # Backend Readiness 模块
//!
//! 检查嵌入式 remi-server 是否已经'就绪'，可被前端调用 RPC。
//!
//! ## 就绪定义
//!
//! - 端口已经在监听
//! - 至少有一个核心 RPC 方法（`system.ping` 或 `system.health`）注册成功
//! - 数据库迁移已应用
//!
//! 任何一个不满足，前端就停留在 splash 页面继续轮询。

use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// 就绪级别
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReadinessLevel {
    /// 进程刚启动，端口还没监听
    Booting,
    /// 端口已监听，但核心服务未完成
    Listening,
    /// 数据库迁移完成
    Migrated,
    /// 全部就绪
    Ready,
    /// 启动失败
    Failed,
}

impl ReadinessLevel {
    pub fn as_u8(self) -> u8 {
        match self {
            Self::Booting => 0,
            Self::Listening => 1,
            Self::Migrated => 2,
            Self::Ready => 3,
            Self::Failed => 4,
        }
    }
}

impl PartialOrd for ReadinessLevel {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ReadinessLevel {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.as_u8().cmp(&other.as_u8())
    }
}

/// Readiness 状态（线程安全共享）
#[derive(Clone, Default)]
pub struct Readiness {
    inner: Arc<ReadinessInner>,
}

#[derive(Default)]
struct ReadinessInner {
    level: AtomicU8,
    last_error: Mutex<Option<String>>,
    port_reachable: AtomicBool,
    migrated: AtomicBool,
}

impl Readiness {
    pub fn new() -> Self {
        Self::default()
    }

    /// 设置级别
    pub fn set_level(&self, level: ReadinessLevel) {
        self.inner.level.store(level.as_u8(), Ordering::SeqCst);
    }

    /// 标记端口可达
    pub fn mark_port_reachable(&self) {
        self.inner.port_reachable.store(true, Ordering::SeqCst);
        if self.inner.level.load(Ordering::SeqCst) < ReadinessLevel::Listening.as_u8() {
            self.set_level(ReadinessLevel::Listening);
        }
    }

    /// 标记迁移完成
    pub fn mark_migrated(&self) {
        self.inner.migrated.store(true, Ordering::SeqCst);
        if self.inner.level.load(Ordering::SeqCst) < ReadinessLevel::Migrated.as_u8() {
            self.set_level(ReadinessLevel::Migrated);
        }
    }

    /// 标记全部就绪
    pub fn mark_ready(&self) {
        self.set_level(ReadinessLevel::Ready);
    }

    /// 标记失败
    pub fn mark_failed(&self, err: impl Into<String>) {
        self.set_level(ReadinessLevel::Failed);
        *self.inner.last_error.lock().unwrap() = Some(err.into());
    }

    /// 当前级别
    pub fn level(&self) -> ReadinessLevel {
        match self.inner.level.load(Ordering::SeqCst) {
            0 => ReadinessLevel::Booting,
            1 => ReadinessLevel::Listening,
            2 => ReadinessLevel::Migrated,
            3 => ReadinessLevel::Ready,
            _ => ReadinessLevel::Failed,
        }
    }

    /// 最近一次错误
    pub fn last_error(&self) -> Option<String> {
        self.inner.last_error.lock().unwrap().clone()
    }

    /// 探测 TCP 端口是否可达
    pub fn probe_port(addr: std::net::SocketAddr) -> bool {
        TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_ordered() {
        assert!(ReadinessLevel::Booting < ReadinessLevel::Listening);
        assert!(ReadinessLevel::Listening < ReadinessLevel::Migrated);
        assert!(ReadinessLevel::Migrated < ReadinessLevel::Ready);
        assert!(ReadinessLevel::Ready < ReadinessLevel::Failed);
    }

    #[test]
    fn transitions() {
        let r = Readiness::new();
        assert_eq!(r.level(), ReadinessLevel::Booting);
        r.mark_port_reachable();
        assert_eq!(r.level(), ReadinessLevel::Listening);
        r.mark_migrated();
        assert_eq!(r.level(), ReadinessLevel::Migrated);
        r.mark_ready();
        assert_eq!(r.level(), ReadinessLevel::Ready);
    }

    #[test]
    fn failed_records_error() {
        let r = Readiness::new();
        r.mark_failed("boom");
        assert_eq!(r.level(), ReadinessLevel::Failed);
        assert_eq!(r.last_error().as_deref(), Some("boom"));
    }
}

