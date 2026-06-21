//! # Git 状态广播器
//!
//! 本模块提供 Git 仓库状态的实时监控和事件广播功能，是前端 UI 获取仓库状态变更的核心组件。
//!
//! ## 模块职责
//!
//! - **状态缓存**：缓存各个仓库的 Git 状态，避免频繁执行 Git 命令
//! - **定时刷新**：后台定时任务周期性刷新仓库状态
//! - **事件广播**：通过 `tokio::sync::broadcast` 机制向所有订阅者推送状态变更事件
//! - **按需查询**：支持即时查询仓库状态（优先返回缓存，过期则刷新）
//!
//! ## 核心组件
//!
//! | 组件 | 职责 |
//! |------|------|
//! | `GitStatusBroadcaster` | 主服务结构体，管理缓存、定时任务和事件广播 |
//! | `GitStatusStreamEvent` | 状态变更事件，包含仓库路径、新状态和时间戳 |
//! | `CachedStatus` | 内部缓存结构，存储状态和更新时间 |
//!
//! ## 使用场景
//!
//! - **前端 UI 实时更新**：IDE 插件订阅状态事件，实时显示分支、文件变更等信息
//! - **多仓库监控**：同时监控多个 Git 仓库的状态变化
//! - **性能优化**：通过缓存机制减少 Git 命令执行频率
//!
//! ## 工作流程
//!
//! 1. 创建 `GitStatusBroadcaster` 实例，配置刷新间隔
//! 2. 调用 `run_refresh_loop` 启动后台定时刷新任务
//! 3. 前端通过 `stream_status` 订阅状态变更事件
//! 4. 每次状态刷新后，自动广播 `GitStatusStreamEvent` 给所有订阅者
//! 5. 订阅者接收事件并更新 UI
//!
//! ## 典型用法
//!
//!```rust,ignore
//! #[tokio::main]
//! async fn main() {
//! use std::sync::Arc;
//! use std::time::Duration;
//! use remi_git::{GitCore, GitStatusBroadcaster};
//! 
//! let core = Arc::new(GitCore::new());
//! let broadcaster = GitStatusBroadcaster::new(core, Duration::from_secs(5));
//! 
//! // 启动后台刷新循环
//! let shutdown_tx = broadcaster.shutdown_channel();
//! tokio::spawn(broadcaster.run_refresh_loop('/path/to/repo'.to_string(), shutdown_tx.subscribe()));
//! 
//! // 订阅状态变更
//! let mut receiver = broadcaster.stream_status();
//! tokio::spawn(async move {
//!
while let Ok(event) = receiver.recv().await {
//!         println!('仓库 {} 状态更新: {:?}', event.cwd, event.status.current_branch);
//!
}
//! });
//! }

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info, warn};

use crate::core::{GitCore, GitStatusResult};
use crate::error::GitResult;

/// Git 状态变更事件
///
/// 当仓库状态刷新时，通过广播通道发送给所有订阅者的事件消息。
/// 包含仓库路径、最新状态和更新时间。
///
/// # 字段说明
///
/// - `cwd`: 仓库工作目录的绝对路径，用于标识事件来源
/// - `status`: 最新的 Git 仓库状态（分支、文件变更等）
/// - `updated_at`: 状态更新的时间戳（UTC 时间）
///
/// # 使用场景
///
/// - 前端 UI 监听此事件，实时更新仓库状态显示
/// - 日志系统记录状态变更历史
/// - 触发基于状态变化的自动化操作（如自动提交、自动推送）
///
/// # 订阅方式
///
/// 通过 `GitStatusBroadcaster::stream_status()` 获取 `broadcast::Receiver<GitStatusStreamEvent>`。
#[derive(Debug, Clone)]
pub struct GitStatusStreamEvent {
    /// 仓库工作目录路径
    pub cwd: String,
    /// 最新的 Git 状态
    pub status: GitStatusResult,
    /// 状态更新时间（UTC）
    pub updated_at: DateTime<Utc>,
}

/// 缓存的状态条目（内部使用）
///
/// 存储单个仓库的 Git 状态及其缓存时间戳。
/// 用于判断缓存是否过期，避免频繁执行 Git 命令。
///
/// # 字段说明
///
/// - `status`: 缓存的 Git 状态
/// - `updated_at`: 状态缓存的时间戳
///
/// # 缓存策略
///
/// 缓存有效期由 `GitStatusBroadcaster::refresh_interval` 控制。
/// 如果当前时间与 `updated_at` 的差值小于 `refresh_interval`，则认为缓存有效。
#[derive(Debug, Clone)]
struct CachedStatus {
    /// 缓存的 Git 状态
    status: GitStatusResult,
    /// 缓存时间戳
    updated_at: DateTime<Utc>,
}

/// Git 状态广播器
///
/// 管理多个仓库的 Git 状态缓存、定时刷新和事件广播。
/// 本结构体是线程安全的，可以在多个异步任务中共享（通过 `Arc`）。
///
/// # 字段说明
///
/// - `core`: Git 核心服务，用于执行 Git 命令
/// - `cache`: 仓库状态缓存表，键为仓库路径，值为缓存的状态
/// - `event_tx`: 广播通道的发送端，用于发送状态变更事件
/// - `refresh_interval`: 状态刷新间隔，控制缓存有效期和定时任务频率
///
/// # 设计特点
///
/// - **读写锁分离**：使用 `RwLock` 保护缓存，允许多个读操作并发
/// - **广播机制**：使用 `broadcast` 通道，支持多个订阅者同时接收事件
/// - **缓存优先**：查询状态时优先返回缓存，减少 Git 命令执行次数
/// - **优雅关闭**：支持通过 shutdown 信号停止后台刷新循环
///
/// # 使用示例
///
///```rust,ignore
/// #[tokio::main]
/// async fn main() {
/// use std::sync::Arc;
/// use std::time::Duration;
/// use remi_git::{GitCore, GitStatusBroadcaster};
/// 
/// let core = Arc::new(GitCore::new());
/// let broadcaster = GitStatusBroadcaster::new(core, Duration::from_secs(5));
/// 
/// // 查询状态（自动缓存）
/// let status = broadcaster.get_status('/path/to/repo').await?;
/// 
/// // 手动刷新状态
/// let status = broadcaster.refresh_status('/path/to/repo').await?;
/// }
pub struct GitStatusBroadcaster {
    /// Git 核心服务实例
    core: Arc<GitCore>,
    /// 仓库状态缓存（路径 -> 缓存状态）
    cache: Arc<RwLock<HashMap<String, CachedStatus>>>,
    /// 事件广播通道发送端
    event_tx: broadcast::Sender<GitStatusStreamEvent>,
    /// 状态刷新间隔
    refresh_interval: Duration,
}

impl GitStatusBroadcaster {
    /// 创建新的状态广播器实例
    ///
    /// # 参数
    ///
    /// - `core`: Git 核心服务，通常包装在 `Arc` 中供多个组件共享
    /// - `refresh_interval`: 状态刷新间隔，控制缓存有效期和定时任务频率
    ///
    /// # 返回值
    ///
    /// 返回一个新的 `GitStatusBroadcaster` 实例。
    ///
    /// # 实现细节
    ///
    /// - 创建容量为 10000 的广播通道（可容纳 10000 条未消费的事件）
    /// - 初始化空的缓存表
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// let core = Arc::new(GitCore::new());
    /// let broadcaster = GitStatusBroadcaster::new(core, Duration::from_secs(5));
    /// ```
    pub fn new(core: Arc<GitCore>, refresh_interval: Duration) -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            core,
            cache: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
            refresh_interval,
        }
    }

    /// 获取仓库状态（优先从缓存读取）
    ///
    /// 查询指定仓库的 Git 状态。如果缓存有效（未过期），直接返回缓存的状态；
    /// 否则执行 Git 命令刷新状态并更新缓存。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    ///
    /// # 返回值
    ///
    /// - `Ok(GitStatusResult)`: 仓库的当前状态
    /// - `Err(GitError)`: 状态查询失败
    ///
    /// # 缓存策略
    ///
    /// 1. 检查缓存中是否存在该路径的条目
    /// 2. 如果存在，计算缓存年龄（当前时间 - 更新时间）
    /// 3. 如果年龄 < `refresh_interval`，返回缓存的状态
    /// 4. 否则调用 `refresh_status` 刷新状态
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// let status = broadcaster.get_status('/path/to/repo').await?;
    /// println!('当前分支: {:?}', status.current_branch);
    /// }
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

    /// 刷新本地仓库状态
    ///
    /// 强制执行 Git 命令获取最新状态，更新缓存并广播事件。
    /// 即使缓存有效也会重新查询。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    ///
    /// # 返回值
    ///
    /// - `Ok(GitStatusResult)`: 最新的仓库状态
    /// - `Err(GitError)`: 状态查询失败
    ///
    /// # 实现细节
    ///
    /// 1. 调用 `core.status(cwd)` 获取最新状态
    /// 2. 更新缓存表
    /// 3. 通过 `event_tx` 广播 `GitStatusStreamEvent`
    /// 4. 返回最新状态
    ///
    /// # 使用场景
    ///
    /// - 用户手动触发状态刷新（如点击'刷新'按钮）
    /// - 执行 Git 操作后强制更新状态（如提交、推送后）
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

    /// 刷新仓库状态（`refresh_local_status` 的别名）
    ///
    /// 提供语义化的方法名，便于在不同场景下使用。
    ///
    /// # 参数
    ///
    /// - `cwd`: 仓库工作目录的绝对路径
    ///
    /// # 返回值
    ///
    /// - `Ok(GitStatusResult)`: 最新的仓库状态
    /// - `Err(GitError)`: 状态查询失败
    pub async fn refresh_status(&self, cwd: &str) -> GitResult<GitStatusResult> {
        self.refresh_local_status(cwd).await
    }

    /// 订阅状态变更事件流
    ///
    /// 返回一个广播通道的接收端，用于接收 `GitStatusStreamEvent` 事件。
    /// 多个调用者可以同时订阅，每个订阅者都会收到所有事件。
    ///
    /// # 返回值
    ///
    /// 返回 `broadcast::Receiver<GitStatusStreamEvent>`，可通过 `.recv().await` 接收事件。
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// #[tokio::main]
    /// async fn main() {
    /// let mut receiver = broadcaster.stream_status();
    /// tokio::spawn(async move {
    ///     while let Ok(event) = receiver.recv().await {
    ///         println!("状态更新: {:?}", event.status.current_branch);
    ///     }
    /// });
    /// }
    ///
    /// # 注意事项
    ///
    /// - 如果订阅者处理事件的速度慢于事件产生速度，可能会错过旧事件（广播通道特性）
    /// - 订阅者应该在独立的异步任务中运行，避免阻塞主流程
    pub fn stream_status(&self) -> broadcast::Receiver<GitStatusStreamEvent> {
        self.event_tx.subscribe()
    }

    /// 启动定时刷新循环
    ///
    /// 在后台周期性刷新指定仓库的 Git 状态，直到收到关闭信号。
    /// 通常通过 `tokio::spawn` 在独立的异步任务中运行。
    ///
    /// # 参数
    ///
    /// - `cwd`: 要监控的仓库工作目录
    /// - `shutdown`: 关闭信号接收端，当收到信号时停止刷新循环
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 正常关闭
    /// - `Err(GitError)`: 刷新过程中发生错误（但循环会继续运行）
    ///
    /// # 实现细节
    ///
    /// - 使用 `tokio::time::interval` 创建定时器，间隔为 `refresh_interval`
    /// - 使用 `tokio::select!` 同时监听关闭信号和定时器
    /// - 刷新失败时记录警告日志，但不中断循环
    ///
    /// # 使用示例
    ///
    ///```rust,ignore
    /// let (shutdown_tx, shutdown_rx) = broadcast::channel(1);
    /// let cwd = '/path/to/repo'.to_string();
    ///
    /// tokio::spawn(broadcaster.run_refresh_loop(cwd, shutdown_rx));
    ///
    /// // 停止刷新循环
    /// let _ = shutdown_tx.send(());
    /// ```
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

    /// 清除所有仓库的状态缓存
    ///
    /// 清空缓存表，下次查询任何仓库时都会强制执行 Git 命令。
    ///
    /// # 使用场景
    ///
    /// - 仓库配置发生重大变化
    /// - 需要强制刷新所有仓库状态
    /// - 调试时排除缓存影响
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }

    /// 清除指定仓库的状态缓存
    ///
    /// 从缓存表中移除指定路径的条目，下次查询该仓库时会强制执行 Git 命令。
    ///
    /// # 参数
    ///
    /// - `cwd`: 要清除缓存的仓库工作目录路径
    ///
    /// # 使用场景
    ///
    /// - 执行 Git 操作后强制刷新特定仓库状态
    /// - 仓库被删除或移动后清理缓存
    pub async fn clear_cache_for(&self, cwd: &str) {
        let mut cache = self.cache.write().await;
        cache.remove(cwd);
    }
}
