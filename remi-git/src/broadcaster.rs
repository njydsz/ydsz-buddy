//! Git 状态广播器

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info, warn};

use crate::core::{GitCore, GitStatusResult};
use crate::error::GitResult;

/// Git 状态事件
#[derive(Debug, Clone)]
pub struct GitStatusStreamEvent {
    /// 工作目录
    pub cwd: String,
    /// 状态
    pub status: GitStatusResult,
    /// 更新时间
    pub updated_at: DateTime<Utc>,
}

/// 缓存的状态
#[derive(Debug, Clone)]
struct CachedStatus {
    status: GitStatusResult,
    updated_at: DateTime<Utc>,
}

/// Git 状态广播器
pub struct GitStatusBroadcaster {
    core: Arc<GitCore>,
    cache: Arc<RwLock<HashMap<String, CachedStatus>>>,
    event_tx: broadcast::Sender<GitStatusStreamEvent>,
    refresh_interval: Duration,
}

impl GitStatusBroadcaster {
    /// 创建新的状态广播器
    pub fn new(core: Arc<GitCore>, refresh_interval: Duration) -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            core,
            cache: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
            refresh_interval,
        }
    }

    /// 获取状态（优先从缓存读取）
    pub async fn get_status(&self, cwd: &str) -> GitResult<GitStatusResult> {
        // 检查缓存
        {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.get(cwd) {
                let age = Utc::now().signed_duration_since(cached.updated_at);
                if age.to_std().unwrap_or(Duration::ZERO) < self.refresh_interval {
                    debug!("使用缓存的 Git 状态: {}", cwd);
                    return Ok(cached.status.clone());
                }
            }
        }

        // 缓存过期或不存在，刷新状态
        self.refresh_status(cwd).await
    }

    /// 刷新本地状态
    pub async fn refresh_local_status(&self, cwd: &str) -> GitResult<GitStatusResult> {
        info!("刷新 Git 状态: {}", cwd);

        let status = self.core.status(cwd).await?;
        let now = Utc::now();

        // 更新缓存
        {
            let mut cache = self.cache.write().await;
            cache.insert(
                cwd.to_string(),
                CachedStatus {
                    status: status.clone(),
                    updated_at: now,
                },
            );
        }

        // 广播事件
        let _ = self.event_tx.send(GitStatusStreamEvent {
            cwd: cwd.to_string(),
            status: status.clone(),
            updated_at: now,
        });

        Ok(status)
    }

    /// 刷新状态（别名）
    pub async fn refresh_status(&self, cwd: &str) -> GitResult<GitStatusResult> {
        self.refresh_local_status(cwd).await
    }

    /// 订阅状态流
    pub fn stream_status(&self) -> broadcast::Receiver<GitStatusStreamEvent> {
        self.event_tx.subscribe()
    }

    /// 启动定时刷新任务
    pub async fn run_refresh_loop(
        &self,
        cwd: String,
        mut shutdown: broadcast::Receiver<()>,
    ) -> GitResult<()> {
        info!("启动 Git 状态刷新循环: {}", cwd);

        let mut interval = tokio::time::interval(self.refresh_interval);

        loop {
            tokio::select! {
                _ = shutdown.recv() => {
                    info!("Git 状态刷新循环收到关闭信号");
                    break;
                }
                _ = interval.tick() => {
                    if let Err(e) = self.refresh_local_status(&cwd).await {
                        warn!("刷新 Git 状态失败: {}", e);
                    }
                }
            }
        }

        info!("Git 状态刷新循环已停止: {}", cwd);
        Ok(())
    }

    /// 清除缓存
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }

    /// 清除指定目录的缓存
    pub async fn clear_cache_for(&self, cwd: &str) {
        let mut cache = self.cache.write().await;
        cache.remove(cwd);
    }
}
