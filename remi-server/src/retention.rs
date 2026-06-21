//! # 线程保留作业
//!
//! 定期清理过期或不活跃的线程,防止系统资源被过度占用。
//!
//! ## 核心功能
//!
//! - 定期扫描所有线程
//! - 根据最后活跃时间判断是否过期
//! - 清理过期线程及其关联资源
//! - 支持配置保留策略
//!
//! ## 使用场景
//!
//! 1. **资源管理**: 防止长期不活跃的线程占用内存和存储
//! 2. **性能优化**: 减少需要管理的线程数量
//! 3. **数据清理**: 自动清理无用的线程数据

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use remi_core::commands::{OrchestrationCommand, ThreadDeleteCommand};
use remi_orchestration::OrchestrationEngine;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use crate::error::{ServerError, ServerResult};

/// # 线程保留策略配置
///
/// 定义线程保留作业的行为参数。
#[derive(Debug, Clone)]
pub struct RetentionConfig {
    /// 检查间隔(秒)
    pub check_interval_secs: u64,
    /// 线程不活跃超时时间(秒)
    pub inactive_timeout_secs: u64,
    /// 是否启用自动清理
    pub auto_cleanup: bool,
    /// 最大保留线程数(0表示不限制)
    pub max_threads: usize,
}

impl Default for RetentionConfig {
    fn default() -> Self {
        Self {
            check_interval_secs: 3600, // 1小时检查一次
            inactive_timeout_secs: 86400, // 24小时不活跃则过期
            auto_cleanup: true,
            max_threads: 1000,
        }
    }
}

/// # 线程保留作业
///
/// 定期执行线程清理任务的管理器。
pub struct ThreadRetentionJob {
    /// 保留策略配置
    config: RetentionConfig,
    /// 编排引擎引用
    orchestration: Arc<OrchestrationEngine>,
    /// 作业运行状态
    running: Arc<RwLock<bool>>,
}

impl ThreadRetentionJob {
    /// 创建新的线程保留作业实例
    pub fn new(
        config: RetentionConfig,
        orchestration: Arc<OrchestrationEngine>,
    ) -> Self {
        Self {
            config,
            orchestration,
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// 启动保留作业
    ///
    /// 开始定期执行线程清理任务。
    pub async fn start(&self) -> ServerResult<()> {
        let mut running = self.running.write().await;
        if *running {
            return Err(ServerError::InternalError(
                "线程保留作业已在运行中".to_string(),
            ));
        }
        *running = true;
        drop(running);

        info!("线程保留作业已启动,检查间隔: {}秒", self.config.check_interval_secs);

        // 启动后台任务
        let config = self.config.clone();
        let orchestration = self.orchestration.clone();
        let running = self.running.clone();

        tokio::spawn(async move {
            loop {
                // 检查是否仍在运行
                {
                    let running = running.read().await;
                    if !*running {
                        info!("线程保留作业已停止");
                        break;
                    }
                }

                // 执行清理任务
                if let Err(e) = Self::run_cleanup(&config, &orchestration).await {
                    warn!("线程保留作业执行失败: {}", e);
                }

                // 等待下一次检查
                tokio::time::sleep(Duration::from_secs(config.check_interval_secs)).await;
            }
        });

        Ok(())
    }

    /// 停止保留作业
    pub async fn stop(&self) -> ServerResult<()> {
        let mut running = self.running.write().await;
        if !*running {
            return Ok(());
        }
        *running = false;
        info!("正在停止线程保留作业...");
        Ok(())
    }

    /// 执行一次清理任务
    async fn run_cleanup(
        config: &RetentionConfig,
        orchestration: &Arc<OrchestrationEngine>,
    ) -> ServerResult<()> {
        debug!("开始执行线程保留检查");

        // 获取快照
        let snapshot = orchestration.get_snapshot().await.map_err(|e| {
            ServerError::InternalError(format!("获取快照失败: {}", e))
        })?;

        let now = Utc::now();
        let mut cleaned_count = 0;

        // 检查每个线程的活跃状态
        for thread in &snapshot.threads {
            let thread_id = thread.id;
            
            // 获取线程的最后活跃时间
            let last_active = thread.latest_user_message_at.unwrap_or(now);
            
            // 计算不活跃时长
            let inactive_duration = now.signed_duration_since(last_active);
            let inactive_secs = inactive_duration.num_seconds() as u64;

            // 判断是否过期
            if inactive_secs > config.inactive_timeout_secs {
                if config.auto_cleanup {
                    info!(
                        "清理过期线程: {} (不活跃 {} 秒)",
                        thread_id, inactive_secs
                    );
                    
                    // 删除线程
                    let delete_cmd = OrchestrationCommand::ThreadDelete(ThreadDeleteCommand {
                        command_id: None,
                        thread_id,
                    });
                    
                    if let Err(e) = orchestration.dispatch(delete_cmd).await {
                        warn!("删除线程 {} 失败: {}", thread_id, e);
                    } else {
                        cleaned_count += 1;
                    }
                } else {
                    debug!(
                        "线程 {} 已过期 (不活跃 {} 秒),但自动清理已禁用",
                        thread_id, inactive_secs
                    );
                }
            }
        }

        // 检查线程数量限制
        if config.max_threads > 0 && snapshot.threads.len() > config.max_threads {
            let excess = snapshot.threads.len() - config.max_threads;
            warn!(
                "线程数量 ({}) 超过限制 ({}),需要清理 {} 个线程",
                snapshot.threads.len(),
                config.max_threads,
                excess
            );
            
            // 按最后活跃时间排序,清理最旧的线程
            let mut threads_sorted = snapshot.threads.clone();
            threads_sorted.sort_by(|a, b| {
                let a_time = a.latest_user_message_at.unwrap_or(now);
                let b_time = b.latest_user_message_at.unwrap_or(now);
                a_time.cmp(&b_time)
            });
            
            // 清理最旧的 excess 个线程
            for thread in threads_sorted.iter().take(excess) {
                if config.auto_cleanup {
                    info!("清理超龄线程: {} (超出数量限制)", thread.id);
                    
                    let delete_cmd = OrchestrationCommand::ThreadDelete(ThreadDeleteCommand {
                        command_id: None,
                        thread_id: thread.id,
                    });
                    
                    if let Err(e) = orchestration.dispatch(delete_cmd).await {
                        warn!("删除线程 {} 失败: {}", thread.id, e);
                    } else {
                        cleaned_count += 1;
                    }
                }
            }
        }

        if cleaned_count > 0 {
            info!("线程保留检查完成,清理了 {} 个过期线程", cleaned_count);
        } else {
            debug!("线程保留检查完成,无需清理");
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = RetentionConfig::default();
        assert_eq!(config.check_interval_secs, 3600);
        assert_eq!(config.inactive_timeout_secs, 86400);
        assert!(config.auto_cleanup);
        assert_eq!(config.max_threads, 1000);
    }
}
