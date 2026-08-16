//! # Backend Readiness 模块
//!
//! 检查嵌入式 ydsz-server 是否已经'就绪'，可被前端调用 RPC。
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
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
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
    #[allow(dead_code)]
    inner: Arc<ReadinessInner>,
}

#[derive(Default)]
struct ReadinessInner {
    #[allow(dead_code)]
    level: AtomicU8,
    #[allow(dead_code)]
    last_error: Mutex<Option<String>>,
    #[allow(dead_code)]
    port_reachable: AtomicBool,
    #[allow(dead_code)]
    migrated: AtomicBool,
}

impl Readiness {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::default()
    }

    /// 设置级别
    #[allow(dead_code)]
    pub fn set_level(&self, level: ReadinessLevel) {
        self.inner.level.store(level.as_u8(), Ordering::SeqCst);
    }

    /// 标记端口可达
    #[allow(dead_code)]
    pub fn mark_port_reachable(&self) {
        self.inner.port_reachable.store(true, Ordering::SeqCst);
        if self.inner.level.load(Ordering::SeqCst) < ReadinessLevel::Listening.as_u8() {
            self.set_level(ReadinessLevel::Listening);
        }
    }

    /// 标记迁移完成
    #[allow(dead_code)]
    pub fn mark_migrated(&self) {
        self.inner.migrated.store(true, Ordering::SeqCst);
        if self.inner.level.load(Ordering::SeqCst) < ReadinessLevel::Migrated.as_u8() {
            self.set_level(ReadinessLevel::Migrated);
        }
    }

    /// 标记全部就绪
    #[allow(dead_code)]
    pub fn mark_ready(&self) {
        self.set_level(ReadinessLevel::Ready);
    }

    /// 标记失败
    #[allow(dead_code)]
    pub fn mark_failed(&self, err: impl Into<String>) {
        self.set_level(ReadinessLevel::Failed);
        *self.inner.last_error.lock().unwrap() = Some(err.into());
    }

    /// 当前级别
    #[allow(dead_code)]
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
    #[allow(dead_code)]
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
    use std::net::TcpListener;
    use std::sync::Arc;

    #[test]
    fn levels_ordered() {
        assert!(ReadinessLevel::Booting < ReadinessLevel::Listening);
        assert!(ReadinessLevel::Listening < ReadinessLevel::Migrated);
        assert!(ReadinessLevel::Migrated < ReadinessLevel::Ready);
        assert!(ReadinessLevel::Ready < ReadinessLevel::Failed);
    }

    #[test]
    fn levels_as_u8_distinct() {
        // 互联网大厂基线：枚举值必须可稳定映射成整型（兼容旧版持久化）
        let mut seen = std::collections::HashSet::new();
        for level in [
            ReadinessLevel::Booting,
            ReadinessLevel::Listening,
            ReadinessLevel::Migrated,
            ReadinessLevel::Ready,
            ReadinessLevel::Failed,
        ] {
            assert!(seen.insert(level.as_u8()), "duplicate u8 for {level:?}");
        }
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

    #[test]
    fn mark_ready_from_every_state() {
        // 任何状态上调到 Ready 都必须生效
        for start in [
            ReadinessLevel::Booting,
            ReadinessLevel::Listening,
            ReadinessLevel::Migrated,
            ReadinessLevel::Failed,
        ] {
            let r = Readiness::new();
            r.set_level(start);
            r.mark_ready();
            assert_eq!(r.level(), ReadinessLevel::Ready, "from {start:?}");
        }
    }

    #[test]
    fn mark_port_reachable_then_migrated() {
        // 推进链：Booting → Listening → Migrated
        let r = Readiness::new();
        r.mark_port_reachable();
        r.mark_port_reachable(); // 重复调用无副作用
        assert_eq!(r.level(), ReadinessLevel::Listening);
        r.mark_migrated();
        assert_eq!(r.level(), ReadinessLevel::Migrated);
    }

    #[test]
    fn probe_port_unbound_returns_false() {
        let addr: std::net::SocketAddr = "127.0.0.1:1".parse().unwrap();
        assert!(!Readiness::probe_port(addr));
    }

    #[test]
    fn probe_port_listening_returns_true() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for _ in listener.incoming() {}
        });
        assert!(Readiness::probe_port(addr));
    }

    #[test]
    fn readiness_serialization_snake_case() {
        // 互联网大厂基线：跨语言契约 - 序列化字段名稳定
        let r = Readiness::new();
        r.mark_port_reachable();
        let json = serde_json::to_string(&r.level()).unwrap();
        assert_eq!(json, "\"listening\"");
    }

    #[test]
    fn concurrent_mark_writes_safe() {
        // 多线程并发 mark 不应触发 panic 或死锁
        let r = Arc::new(Readiness::new());
        let mut handles = vec![];
        for _ in 0..16 {
            let r = r.clone();
            handles.push(std::thread::spawn(move || {
                r.mark_port_reachable();
                r.mark_migrated();
                r.mark_ready();
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(r.level(), ReadinessLevel::Ready);
    }
}

