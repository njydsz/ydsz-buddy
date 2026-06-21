//! # 心跳服务
//!
//! ## 模块职责
//!
//! 本模块实现 [`HeartbeatService`]，作为后台任务定期向分析服务上报服务器运行状态。
//! 心跳事件包含线程数、项目数、运行时长（自启动起的秒数）以及平台内存使用情况，
//! 用于运维监控和长期运行状态追踪。
//!
//! ## 核心类型
//!
//! - [`HeartbeatService`]：心跳服务的核心实现，封装后台任务的启动与停止逻辑。
//!
//! ## 使用场景
//!
//! 1. **运维监控**：通过定期上报的运行时长和内存使用，评估服务器健康状态。
//! 2. **容量规划**：结合线程数和项目数指标，分析服务器负载趋势。
//! 3. **异常检测**：当心跳事件中断或指标异常时，触发告警通知。

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::Utc;
use tokio::sync::watch;
use tracing::{info, warn};

use crate::analytics::{AnalyticsEvent, AnalyticsEventType, AnalyticsService};

/// 心跳服务
///
/// 定期向分析服务上报服务器运行状态。内部使用 `tokio::sync::watch` 通道
/// 实现优雅停止，通过 `start()` 启动后台任务，通过 `stop()` 发送停止信号。
///
/// # 心跳事件数据
///
/// 每次心跳上报的元数据字段：
///
/// | 字段 | 说明 |
/// |------|------|
/// | `threads` | 当前活跃线程数（预留，默认 0） |
/// | `projects` | 当前项目数（预留，默认 0） |
/// | `uptime` | 服务器运行时长，单位为秒 |
/// | `memory_usage` | 内存使用量，单位为 KB（仅 Linux 平台可用） |
pub struct HeartbeatService {
    /// 分析服务实例，用于记录心跳事件。
    analytics: Arc<AnalyticsService>,
    /// 心跳间隔时长。
    interval: Duration,
    /// 关闭信号发送端。`None` 表示尚未启动或已停止。
    shutdown_tx: Mutex<Option<watch::Sender<()>>>,
    /// 服务启动时刻，用于计算运行时长。
    start_time: Instant,
}

impl HeartbeatService {
    /// 创建新的心跳服务实例。
    ///
    /// # 参数
    ///
    /// - `analytics`: 分析服务实例，心跳事件将记录到该服务中。
    /// - `interval`: 心跳上报间隔，例如 `Duration::from_secs(3600)` 表示每小时上报一次。
    ///
    /// # 注意
    ///
    /// 创建后需调用 [`start`](HeartbeatService::start) 才会开始上报。
    pub fn new(analytics: Arc<AnalyticsService>, interval: Duration) -> Self {
        Self {
            analytics,
            interval,
            shutdown_tx: Mutex::new(None),
            start_time: Instant::now(),
        }
    }

    /// 启动心跳后台任务。
    ///
    /// 使用 `tokio::spawn` 启动一个异步循环任务，每隔 `interval` 时长收集
    /// 服务器运行状态并上报一次心跳事件。任务会持续运行直到调用 [`stop`](HeartbeatService::stop)。
    ///
    /// 此方法通过 `Arc<Self>` 接收，以便将 `self` 的克隆传入 spawned task。
    /// 多次调用 `start` 只有第一次生效（后续调用会检测到 `shutdown_tx` 已存在并跳过）。
    pub fn start(self: &Arc<Self>) {
        let (shutdown_tx, mut shutdown_rx) = watch::channel(());

        {
            let mut tx_guard = self.shutdown_tx.lock().unwrap();
            if tx_guard.is_some() {
                warn!("心跳服务已在运行中，忽略重复启动");
                return;
            }
            *tx_guard = Some(shutdown_tx);
        }

        let service = self.clone();
        tokio::spawn(async move {
            info!(
                "心跳服务已启动，上报间隔: {}s",
                service.interval.as_secs()
            );

            loop {
                tokio::select! {
                    _ = tokio::time::sleep(service.interval) => {
                        let uptime = service.start_time.elapsed().as_secs();
                        let memory = get_memory_usage();

                        let mut metadata = HashMap::new();
                        metadata.insert("threads".to_string(), "0".to_string());
                        metadata.insert("projects".to_string(), "0".to_string());
                        metadata.insert("uptime".to_string(), uptime.to_string());
                        if let Some(ref mem) = memory {
                            metadata.insert("memory_usage".to_string(), mem.clone());
                        }

                        let event = AnalyticsEvent {
                            id: uuid::Uuid::new_v4().to_string(),
                            event_type: AnalyticsEventType::ServerHeartbeat,
                            thread_id: None,
                            provider: None,
                            model: None,
                            timestamp: Utc::now(),
                            metadata,
                        };

                        match service.analytics.record_event(event).await {
                            Ok(()) => {
                                info!(
                                    "心跳事件已记录: uptime={}s, memory={:?}",
                                    uptime, memory
                                );
                            }
                            Err(e) => {
                                warn!("心跳事件记录失败: {}", e);
                            }
                        }
                    }
                    _ = shutdown_rx.changed() => {
                        info!("心跳服务已停止");
                        break;
                    }
                }
            }
        });
    }

    /// 停止心跳后台任务。
    ///
    /// 发送关闭信号，使后台循环退出。如果任务尚未启动或已停止，此方法无副作用。
    pub fn stop(&self) {
        if let Some(tx) = self.shutdown_tx.lock().unwrap().take() {
            let _ = tx.send(());
            info!("已发送心跳服务停止信号");
        }
    }
}

/// 获取当前进程的内存使用量（尽力而为，平台相关）。
///
/// # 返回值
///
/// - `Some(String)`：以 KB 为单位的字符串表示，如 `"12345"`。
/// - `None`：当前平台不支持或获取失败。
///
/// # 平台支持
///
/// | 平台 | 实现方式 |
/// |------|----------|
/// | Linux | 解析 `/proc/self/status` 中的 `VmRSS` 字段 |
/// | 其他 | 返回 `None` |
fn get_memory_usage() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let content = std::fs::read_to_string("/proc/self/status").ok()?;
        for line in content.lines() {
            if line.starts_with("VmRSS:") {
                // VmRSS 格式: "VmRSS:    12345 kB"
                let kb = line
                    .split_whitespace()
                    .nth(1)?
                    .parse::<u64>()
                    .ok()?;
                return Some(kb.to_string());
            }
        }
        None
    }

    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}