//! Provider 会话目录模块
//!
//! 本模块提�?Provider 会话的持久化存储管理功能�?//!
//! # 核心功能
//!
//! - **会话存储**：管理会话的持久化信息（Provider 类型、状态等�?//! - **绑定查询**：根据线�?ID 查询关联�?Provider
//! - **生命周期管理**：支持会话的创建、更新、删�?//!
//! # 使用场景
//!
//! - 恢复中断的会�?//! - 查询线程关联�?Provider
//! - 清理过期会话

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::{debug, warn};

use remi_core::provider::ProviderKind;
use remi_core::models::RuntimeMode;
use crate::error::{ProviderError, ProviderResult};

/// 会话运行时状�?#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    /// 启动�?    Starting,
    /// 运行�?    Running,
    /// 已停�?    Stopped,
    /// 错误状�?    Error,
}

/// Provider 运行时绑�?///
/// 记录会话�?Provider 的关联信息�?#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRuntimeBinding {
    /// 线程 ID
    pub thread_id: String,
    /// Provider 类型
    pub provider: ProviderKind,
    /// 适配器键（用于区分同一 Provider 的不同实例）
    pub adapter_key: String,
    /// 运行时模�?    pub runtime_mode: RuntimeMode,
    /// 会话状�?    pub status: SessionStatus,
    /// 最后活跃时间（ISO 8601 格式�?    pub last_seen_at: String,
    /// 恢复游标（用于断点续传）
    pub resume_cursor: Option<String>,
    /// 运行时载荷（适配器特定的元数据）
    pub runtime_payload: Option<serde_json::Value>,
}

/// Provider 会话目录
///
/// 管理所有活跃的 Provider 会话绑定�?pub struct ProviderSessionDirectory {
    /// 会话绑定存储
    bindings: Arc<RwLock<HashMap<String, ProviderRuntimeBinding>>>,
}

impl ProviderSessionDirectory {
    /// 创建新的会话目录
    pub fn new() -> Self {
        Self {
            bindings: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 获取会话绑定
    pub async fn get_binding(
        &self,
        thread_id: &str,
    ) -> ProviderResult<Option<ProviderRuntimeBinding>> {
        let bindings = self.bindings.read().await;
        Ok(bindings.get(thread_id).cloned())
    }

    /// 获取 Provider 类型
    pub async fn get_provider(&self, thread_id: &str) -> ProviderResult<ProviderKind> {
        let binding = self
            .get_binding(thread_id)
            .await?
            .ok_or_else(|| {
                ProviderError::SessionNotFound(format!(
                    "未找到线�?'{}' �?Provider 绑定",
                    thread_id
                ))
            })?;

        Ok(binding.provider)
    }

    /// 创建或更新会话绑�?    pub async fn upsert(&self, binding: ProviderRuntimeBinding) -> ProviderResult<()> {
        let thread_id = binding.thread_id.clone();
        let mut bindings = self.bindings.write().await;

        debug!(
            "更新会话绑定: thread_id={}, provider={:?}",
            thread_id, binding.provider
        );

        bindings.insert(thread_id, binding);
        Ok(())
    }

    /// 删除会话绑定
    pub async fn remove(&self, thread_id: &str) -> ProviderResult<()> {
        let mut bindings = self.bindings.write().await;

        if bindings.remove(thread_id).is_some() {
            debug!("删除会话绑定: thread_id={}", thread_id);
        } else {
            warn!("尝试删除不存在的会话绑定: thread_id={}", thread_id);
        }

        Ok(())
    }

    /// 列出所有线�?ID
    pub async fn list_thread_ids(&self) -> ProviderResult<Vec<String>> {
        let bindings = self.bindings.read().await;
        Ok(bindings.keys().cloned().collect())
    }

    /// 列出所有绑�?    pub async fn list_bindings(&self) -> ProviderResult<Vec<ProviderRuntimeBinding>> {
        let bindings = self.bindings.read().await;
        Ok(bindings.values().cloned().collect())
    }

    /// 更新会话状�?    pub async fn update_status(
        &self,
        thread_id: &str,
        status: SessionStatus,
    ) -> ProviderResult<()> {
        let mut bindings = self.bindings.write().await;

        if let Some(binding) = bindings.get_mut(thread_id) {
            binding.status = status;
            binding.last_seen_at = chrono::Utc::now().to_rfc3339();
            debug!(
                "更新会话状�? thread_id={}, status={:?}",
                thread_id, status
            );
            Ok(())
        } else {
            Err(ProviderError::SessionNotFound(format!(
                "未找到线�?'{}' 的会话绑�?,
                thread_id
            )))
        }
    }

    /// 更新恢复游标
    pub async fn update_resume_cursor(
        &self,
        thread_id: &str,
        cursor: Option<String>,
    ) -> ProviderResult<()> {
        let mut bindings = self.bindings.write().await;

        if let Some(binding) = bindings.get_mut(thread_id) {
            binding.resume_cursor = cursor;
            binding.last_seen_at = chrono::Utc::now().to_rfc3339();
            debug!("更新恢复游标: thread_id={}", thread_id);
            Ok(())
        } else {
            Err(ProviderError::SessionNotFound(format!(
                "未找到线�?'{}' 的会话绑�?,
                thread_id
            )))
        }
    }

    /// 更新运行时载�?    pub async fn update_runtime_payload(
        &self,
        thread_id: &str,
        payload: Option<serde_json::Value>,
    ) -> ProviderResult<()> {
        let mut bindings = self.bindings.write().await;

        if let Some(binding) = bindings.get_mut(thread_id) {
            // 合并载荷
            if let Some(new_payload) = payload {
                if let Some(existing) = &mut binding.runtime_payload {
                    if let (Some(existing_obj), Some(new_obj)) =
                        (existing.as_object_mut(), new_payload.as_object())
                    {
                        for (k, v) in new_obj {
                            existing_obj.insert(k.clone(), v.clone());
                        }
                    } else {
                        binding.runtime_payload = Some(new_payload);
                    }
                } else {
                    binding.runtime_payload = Some(new_payload);
                }
            }

            binding.last_seen_at = chrono::Utc::now().to_rfc3339();
            debug!("更新运行时载�? thread_id={}", thread_id);
            Ok(())
        } else {
            Err(ProviderError::SessionNotFound(format!(
                "未找到线�?'{}' 的会话绑�?,
                thread_id
            )))
        }
    }

    /// 清理过期会话
    ///
    /// 删除最后活跃时间超过指定秒数的会话�?    pub async fn cleanup_stale_sessions(&self, max_age_seconds: i64) -> ProviderResult<usize> {
        let mut bindings = self.bindings.write().await;
        let now = chrono::Utc::now();
        let mut removed = 0;

        bindings.retain(|thread_id, binding| {
            if let Ok(last_seen) = chrono::DateTime::parse_from_rfc3339(&binding.last_seen_at) {
                let age = now.signed_duration_since(last_seen);
                if age.num_seconds() > max_age_seconds {
                    debug!("清理过期会话: thread_id={}, age={}s", thread_id, age.num_seconds());
                    removed += 1;
                    return false;
                }
            }
            true
        });

        if removed > 0 {
            debug!("清理�?{} 个过期会�?, removed);
        }

        Ok(removed)
    }
}

impl Default for ProviderSessionDirectory {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_session_directory() {
        let directory = ProviderSessionDirectory::new();

        // 创建绑定
        let binding = ProviderRuntimeBinding {
            thread_id: "thread-1".to_string(),
            provider: ProviderKind::ClaudeAgent,
            adapter_key: "claude".to_string(),
            runtime_mode: RuntimeMode::Code,
            status: SessionStatus::Running,
            last_seen_at: chrono::Utc::now().to_rfc3339(),
            resume_cursor: None,
            runtime_payload: None,
        };

        directory.upsert(binding).await.unwrap();

        // 查询绑定
        let retrieved = directory.get_binding("thread-1").await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().provider, ProviderKind::ClaudeAgent);

        // 查询 Provider
        let provider = directory.get_provider("thread-1").await.unwrap();
        assert_eq!(provider, ProviderKind::ClaudeAgent);

        // 列出线程
        let thread_ids = directory.list_thread_ids().await.unwrap();
        assert_eq!(thread_ids.len(), 1);
        assert_eq!(thread_ids[0], "thread-1");

        // 更新状�?        directory
            .update_status("thread-1", SessionStatus::Stopped)
            .await
            .unwrap();

        let updated = directory.get_binding("thread-1").await.unwrap().unwrap();
        assert_eq!(updated.status, SessionStatus::Stopped);

        // 删除绑定
        directory.remove("thread-1").await.unwrap();

        let deleted = directory.get_binding("thread-1").await.unwrap();
        assert!(deleted.is_none());
    }
}
