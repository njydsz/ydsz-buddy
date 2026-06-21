//! # Server Listening Detector 模块
//!
//! 轮询嵌入式 remi-server 的监听端口，端口可达时通知 readiness。
//!
//! ## 背景
//!
//! Tauri 启动嵌入式后端是异步的，前端需要尽快知道"可以连上 WebSocket 了"。
//! 这里提供：
//!
//! - `probe_once`：单次探测
//! - `wait_until_ready`：阻塞等待端口可达（带超时）
//! - `poll_loop`：异步轮询任务，配合 `tokio::sync::Notify` 优雅退出

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::Notify;

use super::backend_readiness::Readiness;

/// 单次探测：500ms 内尝试建立 TCP 连接
pub fn probe_once(addr: SocketAddr) -> bool {
    Readiness::probe_port(addr)
}

/// 阻塞等待端口可达（带超时）
///
/// - 间隔 100ms
/// - 超时后返回 false
pub fn wait_until_ready(addr: SocketAddr, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if probe_once(addr) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

/// 异步轮询任务参数
#[derive(Clone)]
pub struct PollerConfig {
    pub addr: SocketAddr,
    pub readiness: Readiness,
    pub interval: Duration,
    pub stop: Arc<Notify>,
}

/// 异步轮询任务：使用 `tokio::select!` 优雅退出
///
/// - 每 `interval` 探测一次端口
/// - 一旦可达就 `mark_port_reachable()` 并 return
/// - `stop.notify_one()` 可让循环提前退出
pub async fn poll_loop(cfg: PollerConfig) {
    loop {
        if probe_once(cfg.addr) {
            cfg.readiness.mark_port_reachable();
            return;
        }
        tokio::select! {
            _ = tokio::time::sleep(cfg.interval) => continue,
            _ = cfg.stop.notified() => return,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn probe_once_unbound_port_returns_false() {
        let addr: SocketAddr = "127.0.0.1:1".parse().unwrap();
        // 端口 1 通常未监听
        assert!(!probe_once(addr));
    }

    #[test]
    fn wait_until_ready_detects_listener() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        // 启动一个接受连接的线程
        std::thread::spawn(move || {
            for _ in listener.incoming() {}
        });
        let result = wait_until_ready(addr, Duration::from_secs(2));
        assert!(result);
    }

    #[test]
    fn wait_until_ready_times_out() {
        let addr: SocketAddr = "127.0.0.1:1".parse().unwrap();
        let result = wait_until_ready(addr, Duration::from_millis(300));
        assert!(!result);
    }
}
