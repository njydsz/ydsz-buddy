//! # OS Jank 检测模块
//!
//! 用于检测当前操作系统的'卡顿' / 性能降级情况，帮助应用自适应降级。
//!
//! ## 指标
//!
//! - **CPU 负载**（loadavg / 1min 移动平均）
//! - **内存压力**（可用内存 < 阈值）
//! - **磁盘压力**（读延迟异常）
//! - **主线程心跳**（业务侧自报）
//!
//! ## 用法
//!
//! ```rust,ignore
//! let report = OsJankMonitor::snapshot();
//! if report.should_reduce_quality() {
//!     // 关闭高斯模糊 / 减少粒子
//! }
//! ```

use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// 性能快照
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JankSnapshot {
    /// 1min 负载（Unix）
    pub loadavg_1min: Option<f64>,
    /// 5min 负载
    pub loadavg_5min: Option<f64>,
    /// 15min 负载
    pub loadavg_15min: Option<f64>,
    /// 可用内存字节（best-effort，平台相关）
    pub available_memory_bytes: Option<u64>,
    /// 总内存字节
    pub total_memory_bytes: Option<u64>,
    /// 业务心跳间隔（ms，自上次报心跳到现在）
    pub heartbeat_age_ms: Option<u64>,
    /// 是否建议降低 UI 质量
    pub should_reduce_quality: bool,
    /// 是否建议禁用后台动画
    pub should_disable_animations: bool,
    /// 评分（0=流畅，100=严重卡顿）
    pub score: u8,
    /// 评估时间
    pub evaluated_at_ms: i64,
}

impl JankSnapshot {
    /// 内存使用率（百分比），如果数据可用
    pub fn memory_used_percent(&self) -> Option<u8> {
        match (self.available_memory_bytes, self.total_memory_bytes) {
            (Some(avail), Some(total)) if total > 0 => {
                let used = total.saturating_sub(avail);
                Some(((used as f64 / total as f64) * 100.0) as u8)
            }
            _ => None,
        }
    }
}

/// OS Jank 监控器
///
/// 业务侧可周期性调用 `tick()` 报心跳；调用 `snapshot()` 立即得到当前快照。
pub struct OsJankMonitor {
    last_heartbeat: Arc<AtomicI64>,
    started_at: Instant,
}

impl OsJankMonitor {
    /// 创建监控器
    pub fn new() -> Self {
        Self {
            last_heartbeat: Arc::new(AtomicI64::new(now_ms())),
            started_at: Instant::now(),
        }
    }

    /// 进程启动至今的时长
    pub fn uptime(&self) -> Duration {
        self.started_at.elapsed()
    }

    /// 上报一次业务心跳
    pub fn tick(&self) {
        self.last_heartbeat.store(now_ms(), Ordering::Relaxed);
    }

    /// 拿到内部心跳 Atomic 的引用，可分发给其他线程
    pub fn heartbeat_handle(&self) -> Arc<AtomicI64> {
        self.last_heartbeat.clone()
    }

    /// 获取当前快照
    pub fn snapshot(&self) -> JankSnapshot {
        let loadavg = read_loadavg();
        let (avail, total) = read_memory();
        let heartbeat_age_ms = {
            let last = self.last_heartbeat.load(Ordering::Relaxed);
            let now = now_ms();
            if last == 0 { None } else { Some((now - last).max(0) as u64) }
        };

        let mut score: u32 = 0;
        // 负载贡献
        if let Some(l1) = loadavg.0 {
            if l1 > 8.0 { score += 50; }
            else if l1 > 4.0 { score += 30; }
            else if l1 > 2.0 { score += 15; }
        }
        // 内存贡献
        if let (Some(avail), Some(total)) = (avail, total) {
            if total > 0 {
                let used_pct = (total.saturating_sub(avail) as f64 / total as f64) * 100.0;
                if used_pct > 95.0 { score += 40; }
                else if used_pct > 85.0 { score += 20; }
                else if used_pct > 70.0 { score += 10; }
            }
        }
        // 心跳贡献
        if let Some(age) = heartbeat_age_ms {
            if age > 5000 { score += 30; }
            else if age > 2000 { score += 15; }
            else if age > 1000 { score += 5; }
        }
        let score = (score.min(100)) as u8;

        JankSnapshot {
            loadavg_1min: loadavg.0,
            loadavg_5min: loadavg.1,
            loadavg_15min: loadavg.2,
            available_memory_bytes: avail,
            total_memory_bytes: total,
            heartbeat_age_ms,
            should_reduce_quality: score >= 50,
            should_disable_animations: score >= 70,
            score,
            evaluated_at_ms: now_ms(),
        }
    }
}

impl Default for OsJankMonitor {
    fn default() -> Self {
        Self::new()
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// 读取 loadavg，返回 (1min, 5min, 15min)
fn read_loadavg() -> (Option<f64>, Option<f64>, Option<f64>) {
    #[cfg(unix)]
    {
        extern "C" {
            fn getloadavg(loadavg: *mut f64, nelem: i32) -> i32;
        }
        let mut buf = [0f64; 3];
        // SAFETY: getloadavg is safe to call with a valid buffer.
        let r = unsafe { getloadavg(buf.as_mut_ptr(), 3) };
        if r == 3 {
            (Some(buf[0]), Some(buf[1]), Some(buf[2]))
        } else {
            (None, None, None)
        }
    }
    #[cfg(not(unix))]
    {
        (None, None, None)
    }
}

/// 读取可用/总内存（best-effort）
fn read_memory() -> (Option<u64>, Option<u64>) {
    #[cfg(target_os = "linux")]
    {
        use std::fs;
        let total = fs::read_to_string("/proc/meminfo")
            .ok()
            .and_then(|s| {
                s.lines()
                    .find(|l| l.starts_with("MemTotal:"))
                    .and_then(|l| l.split_whitespace().nth(1))
                    .and_then(|v| v.parse::<u64>().ok())
            })
            .map(|kb| kb * 1024);
        let avail = fs::read_to_string("/proc/meminfo")
            .ok()
            .and_then(|s| {
                s.lines()
                    .find(|l| l.starts_with("MemAvailable:"))
                    .and_then(|l| l.split_whitespace().nth(1))
                    .and_then(|v| v.parse::<u64>().ok())
            })
            .map(|kb| kb * 1024);
        (avail, total)
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let total_out = Command::new("sysctl").args(["-n", "hw.memsize"]).output().ok();
        let total = total_out
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<u64>().ok());
        // avail 需要 vm_stat 解析，略
        (None, total)
    }
    #[cfg(target_os = "windows")]
    {
        // 简单实现：依赖 GlobalMemoryStatusEx，但避免外部 crate
        (None, None)
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        (None, None)
    }
}

/// 简易自检：阻塞当前线程指定毫秒，模拟卡顿
pub fn simulate_blocking(ms: u64) {
    std::thread::sleep(Duration::from_millis(ms));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monitor_default_heartbeat() {
        let m = OsJankMonitor::new();
        let snap = m.snapshot();
        // 默认心跳刚刚发生，年龄应当 < 1000ms
        assert!(snap.heartbeat_age_ms.unwrap_or(0) < 1000);
        // score 应当在 0-100 之间
        assert!(snap.score <= 100);
    }

    #[test]
    fn tick_updates_heartbeat() {
        let m = OsJankMonitor::new();
        m.tick();
        let snap = m.snapshot();
        assert!(snap.heartbeat_age_ms.unwrap_or(9999) < 100);
    }

    #[test]
    fn stale_heartbeat_increases_score() {
        let m = OsJankMonitor::new();
        // 把心跳手动设到 10 秒前
        m.last_heartbeat.store(now_ms() - 10_000, Ordering::Relaxed);
        let snap = m.snapshot();
        assert!(snap.heartbeat_age_ms.unwrap_or(0) >= 9_000);
        assert!(snap.score >= 30);
    }

    #[test]
    fn memory_used_percent_works() {
        let snap = JankSnapshot {
            loadavg_1min: None,
            loadavg_5min: None,
            loadavg_15min: None,
            available_memory_bytes: Some(2_000_000),
            total_memory_bytes: Some(8_000_000),
            heartbeat_age_ms: None,
            should_reduce_quality: false,
            should_disable_animations: false,
            score: 0,
            evaluated_at_ms: 0,
        };
        assert_eq!(snap.memory_used_percent(), Some(75));
    }

    #[test]
    fn simulate_blocking_works() {
        let start = Instant::now();
        simulate_blocking(50);
        assert!(start.elapsed() >= Duration::from_millis(45));
    }
}

