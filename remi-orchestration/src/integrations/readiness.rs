//! 服务就绪探针（Readiness Probe）。
//!
//! 大厂标准：编排服务启动后需要等待一系列子系统
//! （DB、Provider、缓存、文件系统等）就绪才能对外提供流量。
//! 本模块实现 [`ServerReadiness`]，允许声明多个就绪检查并
//! 报告整体状态。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{info, warn};

/// 就绪状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReadinessStatus {
    /// 尚未启动。
    Pending,
    /// 就绪。
    Ready,
    /// 降级（部分子系统不可用）。
    Degraded,
    /// 未就绪。
    NotReady,
}

/// 单个就绪检查结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadinessCheck {
    /// 检查名称。
    pub name: String,
    /// 状态。
    pub status: ReadinessStatus,
    /// 详情/错误。
    pub message: Option<String>,
    /// 上次检查时间。
    pub last_checked: DateTime<Utc>,
}

/// 整体就绪报告。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadinessReport {
    /// 整体状态。
    pub status: ReadinessStatus,
    /// 各子系统检查详情。
    pub checks: Vec<ReadinessCheck>,
    /// 报告生成时间。
    pub generated_at: DateTime<Utc>,
}

impl ReadinessReport {
    /// 是否可以接收流量。
    pub fn is_ready(&self) -> bool {
        matches!(self.status, ReadinessStatus::Ready | ReadinessStatus::Degraded)
    }
}

/// 单个就绪检查 trait。
#[async_trait::async_trait]
pub trait ReadinessCheckFn: Send + Sync {
    /// 检查名称。
    fn name(&self) -> &'static str;

    /// 执行检查。返回 (status, message)。
    async fn check(&self) -> (ReadinessStatus, Option<String>);
}

/// 服务就绪管理器。
pub struct ServerReadiness {
    checks: Vec<Arc<dyn ReadinessCheckFn>>,
    cached: Arc<RwLock<Option<ReadinessReport>>>,
    cache_ttl: Duration,
}

impl ServerReadiness {
    /// 创建一个新的就绪管理器。
    pub fn new() -> Self {
        Self {
            checks: Vec::new(),
            cached: Arc::new(RwLock::new(None)),
            cache_ttl: Duration::from_secs(5),
        }
    }

    /// 设置缓存 TTL。
    pub fn with_cache_ttl(mut self, ttl: Duration) -> Self {
        self.cache_ttl = ttl;
        self
    }

    /// 注册一个检查。
    pub fn register(&mut self, check: Arc<dyn ReadinessCheckFn>) {
        self.checks.push(check);
    }

    /// 获取整体就绪报告（带缓存）。
    pub async fn report(&self) -> ReadinessReport {
        // 检查缓存
        {
            let cached = self.cached.read().await;
            if let Some(report) = cached.as_ref() {
                let elapsed = Utc::now()
                    .signed_duration_since(report.generated_at)
                    .to_std()
                    .unwrap_or(Duration::from_secs(0));
                if elapsed < self.cache_ttl {
                    return report.clone();
                }
            }
        }
        // 重新计算
        let mut checks = Vec::new();
        for c in &self.checks {
            let (status, message) = c.check().await;
            checks.push(ReadinessCheck {
                name: c.name().to_string(),
                status,
                message,
                last_checked: Utc::now(),
            });
        }
        let overall = if checks.iter().any(|c| matches!(c.status, ReadinessStatus::NotReady)) {
            ReadinessStatus::NotReady
        } else if checks.iter().any(|c| matches!(c.status, ReadinessStatus::Pending)) {
            ReadinessStatus::Pending
        } else if checks
            .iter()
            .any(|c| matches!(c.status, ReadinessStatus::Degraded))
        {
            ReadinessStatus::Degraded
        } else {
            ReadinessStatus::Ready
        };
        let report = ReadinessReport {
            status: overall,
            checks,
            generated_at: Utc::now(),
        };
        {
            let mut cached = self.cached.write().await;
            *cached = Some(report.clone());
        }
        info!(status = ?overall, "已生成就绪报告");
        report
    }

    /// 强制刷新缓存。
    pub async fn invalidate(&self) {
        let mut cached = self.cached.write().await;
        *cached = None;
    }
}

impl Default for ServerReadiness {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// 常用检查
// ---------------------------------------------------------------------------

/// 简单的"总是就绪"占位检查。
pub struct AlwaysReadyCheck {
    name: &'static str,
}

impl AlwaysReadyCheck {
    /// 创建一个总是就绪的检查。
    pub fn new(name: &'static str) -> Self {
        Self { name }
    }
}

#[async_trait::async_trait]
impl ReadinessCheckFn for AlwaysReadyCheck {
    fn name(&self) -> &'static str {
        self.name
    }

    async fn check(&self) -> (ReadinessStatus, Option<String>) {
        (ReadinessStatus::Ready, None)
    }
}

/// 简单的 ping 检查：执行 `ping` 命令并验证返回码。
pub struct PingCheck {
    name: &'static str,
    target: String,
}

impl PingCheck {
    /// 创建一个 ping 检查。
    pub fn new(name: &'static str, target: impl Into<String>) -> Self {
        Self {
            name,
            target: target.into(),
        }
    }
}

#[async_trait::async_trait]
impl ReadinessCheckFn for PingCheck {
    fn name(&self) -> &'static str {
        self.name
    }

    async fn check(&self) -> (ReadinessStatus, Option<String>) {
        let output = std::process::Command::new("ping")
            .args(&["-n", "1", "-w", "1000", &self.target])
            .output();
        match output {
            Ok(o) if o.status.success() => (ReadinessStatus::Ready, None),
            Ok(o) => (
                ReadinessStatus::NotReady,
                Some(format!("ping {} failed with {:?}", self.target, o.status)),
            ),
            Err(e) => {
                warn!(error = %e, "ping 检查失败");
                (ReadinessStatus::NotReady, Some(e.to_string()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_always_ready_check() {
        let check = AlwaysReadyCheck::new("always");
        let (status, _) = check.check().await;
        assert_eq!(status, ReadinessStatus::Ready);
    }

    #[tokio::test]
    async fn test_readiness_report() {
        let mut readiness = ServerReadiness::new();
        readiness.register(Arc::new(AlwaysReadyCheck::new("a")));
        readiness.register(Arc::new(AlwaysReadyCheck::new("b")));
        let report = readiness.report().await;
        assert_eq!(report.status, ReadinessStatus::Ready);
        assert_eq!(report.checks.len(), 2);
        assert!(report.is_ready());
    }
}
