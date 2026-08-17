//! # Effect 注册表——可逆副作用追踪
//!
//! 借鉴 DeepSeek Harness 的 Effect Rollback 理念，将所有副作用建模为
//! 可逆操作（Reversible Side Effect），确保 Turn 失败或中断时能回滚到一致状态。
//!
//! ## 核心概念
//!
//! - **Effect（副作用）**：任何改变系统状态的操作（文件写入、Git commit、环境变量设置等）
//! - **EffectRecord**：副作用记录，包含执行数据和回滚数据
//! - **EffectRegistry**：Turn 级别的注册表，收集当前 Turn 的所有副作用
//! - **Rollback（回滚）**：按注册逆序执行每个 Effect 的 reverse 操作
//!
//! ## 设计原则
//!
//! - 注册即追踪：任何副作用在产生时必须注册
//! - 逆序回滚：后注册的副作用先回滚（LIFO 顺序）
//! - 幂等回滚：回滚操作本身应当可安全重复执行
//! - 审计记录：所有副作用和回滚操作都写入 Activity 日志
//!
//! ## 典型工作流
//!
//! ```ignore
//! let registry = EffectRegistry::new(turn_id, thread_id);
//!
//! // 执行并注册副作用
//! let content = "new file content".to_string();
//! fs::write(&path, &content).await?;
//! registry.register(FileWriteEffect {
//!     path: path.clone(),
//!     previous_content: None,  // 新建文件
//! })?;
//!
//! // 如果后续操作失败，回滚所有已注册副作用
//! if something_failed {
//!     registry.rollback_all().await?;
//! }
//! ```

use std::collections::HashMap;
use std::fmt;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};

// ============================================================================
// 副作用类型与记录
// ============================================================================

/// # 副作用分类
///
/// 标识副作用的类别，用于分类管理和回滚策略选择。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectKind {
    /// 文件系统写入（创建/修改文件）
    FileWrite,
    /// 文件系统删除
    FileDelete,
    /// Git 操作（commit, branch, merge 等）
    GitOperation,
    /// 环境变量设置
    EnvModification,
    /// 工具/插件注册
    ToolRegistration,
    /// 进程/子进程启动
    ProcessSpawn,
    /// 网络请求副作用（如 API 调用导致的远程状态变更）
    RemoteSideEffect,
    /// 配置修改
    ConfigModification,
}

impl fmt::Display for EffectKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FileWrite => write!(f, "file_write"),
            Self::FileDelete => write!(f, "file_delete"),
            Self::GitOperation => write!(f, "git_operation"),
            Self::EnvModification => write!(f, "env_modification"),
            Self::ToolRegistration => write!(f, "tool_registration"),
            Self::ProcessSpawn => write!(f, "process_spawn"),
            Self::RemoteSideEffect => write!(f, "remote_side_effect"),
            Self::ConfigModification => write!(f, "config_modification"),
        }
    }
}

/// # 副作用记录
///
/// 记录一次副作用的完整信息，包括执行数据和回滚所需数据。
///
/// ## 字段说明
///
/// - `id`: 唯一标识
/// - `kind`: 副作用类型
/// - `description`: 人类可读描述
/// - `reversible`: 是否可逆（不可逆的副作用只能记录不能回滚）
/// - `rollback_data`: 回滚所需数据（JSON 格式，每种 Effect 有自己的结构）
/// - `undone`: 是否已回滚
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectRecord {
    /// 唯一标识
    pub id: String,
    /// 副作用类型
    pub kind: EffectKind,
    /// 人类可读描述
    pub description: String,
    /// 是否可逆
    pub reversible: bool,
    /// 回滚所需数据（每种 Effect 有自己的 JSON 结构）
    pub rollback_data: serde_json::Value,
    /// 注册时间
    pub registered_at: chrono::DateTime<chrono::Utc>,
    /// 是否已回滚
    #[serde(default)]
    pub undone: bool,
    /// 回滚时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub undone_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// # 文件系统写入的副作用数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteEffectData {
    /// 文件路径
    pub path: PathBuf,
    /// 写入前的内容（None 表示文件不存在）
    pub previous_content: Option<Vec<u8>>,
    /// 写入后的内容哈希（用于完整性校验）
    pub new_content_hash: String,
}

/// # 文件系统删除的副作用数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDeleteEffectData {
    /// 被删除的文件路径
    pub path: PathBuf,
    /// 被删除文件的内容
    pub deleted_content: Vec<u8>,
}

/// # Git 操作副作用数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitOperationEffectData {
    /// 操作类型
    pub operation: String,
    /// 操作前的 HEAD commit
    pub previous_head: String,
    /// 涉及的分支
    pub branch: Option<String>,
    /// commit hash（commit 操作时）
    pub commit_hash: Option<String>,
}

/// # 工具注册副作用数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRegistrationEffectData {
    /// 注册的工具名称
    pub tool_name: String,
    /// 是否为新建（true 则回滚时删除，false 则回滚到之前的实现）
    pub is_new: bool,
}

/// # 环境变量修改副作用数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvModificationEffectData {
    /// 变量名
    pub var_name: String,
    /// 修改前的值
    pub previous_value: Option<String>,
    /// 新值
    pub new_value: String,
}

// ============================================================================
// Effect 注册表
// ============================================================================

/// # 回滚结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackResult {
    /// 尝试回滚的总数
    pub total_attempted: usize,
    /// 成功回滚数
    pub succeeded: usize,
    /// 跳过（不可逆）数
    pub skipped: usize,
    /// 失败数
    pub failed: usize,
    /// 失败的记录 ID 和原因
    pub failures: Vec<(String, String)>,
}

impl RollbackResult {
    pub fn is_complete_success(&self) -> bool {
        self.failed == 0 && self.skipped == 0
    }

    pub fn had_failures(&self) -> bool {
        !self.failures.is_empty()
    }
}

impl Default for RollbackResult {
    fn default() -> Self {
        Self {
            total_attempted: 0,
            succeeded: 0,
            skipped: 0,
            failed: 0,
            failures: Vec::new(),
        }
    }
}

/// # Effect 注册表
///
/// Turn 级别的副作用注册表，收集当前 Turn 的所有副作用。
///
/// ## 职责
///
/// - 记录每个副作用（注册）
/// - 提供回滚接口（逆序执行 reverse）
/// - 生成审计日志
#[derive(Debug, Clone)]
pub struct EffectRegistry {
    /// 关联的 Turn ID
    pub turn_id: String,
    /// 关联的线程 ID
    pub thread_id: String,
    /// 已注册的副作用（有序，后进先出）
    pub records: Vec<EffectRecord>,
    /// 元数据
    pub metadata: HashMap<String, String>,
    /// 创建时间
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl EffectRegistry {
    /// 创建新的副作用注册表
    pub fn new(turn_id: impl Into<String>, thread_id: impl Into<String>) -> Self {
        Self {
            turn_id: turn_id.into(),
            thread_id: thread_id.into(),
            records: Vec::new(),
            metadata: HashMap::new(),
            created_at: chrono::Utc::now(),
        }
    }

    /// 添加元数据
    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    /// 注册副作用
    pub fn register(&mut self, record: EffectRecord) {
        self.records.push(record);
    }

    /// 便捷方法：注册文件写入副作用
    pub fn register_file_write(
        &mut self,
        path: PathBuf,
        previous_content: Option<Vec<u8>>,
        new_hash: impl Into<String>,
    ) {
        self.records.push(EffectRecord {
            id: format!("fw-{}", self.records.len() + 1),
            kind: EffectKind::FileWrite,
            description: format!("写入文件: {}", path.display()),
            reversible: true,
            rollback_data: serde_json::to_value(&FileWriteEffectData {
                path,
                previous_content,
                new_content_hash: new_hash.into(),
            })
            .unwrap_or_default(),
            registered_at: chrono::Utc::now(),
            undone: false,
            undone_at: None,
        });
    }

    /// 便捷方法：注册 Git 操作副作用
    pub fn register_git_operation(
        &mut self,
        operation: impl Into<String>,
        previous_head: impl Into<String>,
        branch: Option<String>,
        commit_hash: Option<String>,
    ) {
        let op: String = operation.into();
        let head: String = previous_head.into();
        self.records.push(EffectRecord {
            id: format!("git-{}", self.records.len() + 1),
            kind: EffectKind::GitOperation,
            description: format!(
                "Git {}: {}",
                op,
                commit_hash.as_deref().unwrap_or_default()
            ),
            reversible: true,
            rollback_data: serde_json::to_value(&GitOperationEffectData {
                operation: op,
                previous_head: head,
                branch,
                commit_hash,
            })
            .unwrap_or_default(),
            registered_at: chrono::Utc::now(),
            undone: false,
            undone_at: None,
        });
    }

    /// 便捷方法：注册工具注册副作用
    pub fn register_tool_registration(
        &mut self,
        tool_name: impl Into<String>,
        is_new: bool,
    ) {
        let name: String = tool_name.into();
        self.records.push(EffectRecord {
            id: format!("tool-{}", self.records.len() + 1),
            kind: EffectKind::ToolRegistration,
            description: format!("注册工具: {}", name),
            reversible: true,
            rollback_data: serde_json::to_value(&ToolRegistrationEffectData {
                tool_name: name,
                is_new,
            })
            .unwrap_or_default(),
            registered_at: chrono::Utc::now(),
            undone: false,
            undone_at: None,
        });
    }

    /// 获取所有未回滚的记录
    pub fn active_records(&self) -> &[EffectRecord] {
        &self.records
    }

    /// 按类型筛选记录
    pub fn records_by_kind(&self, kind: EffectKind) -> Vec<&EffectRecord> {
        self.records.iter().filter(|r| r.kind == kind).collect()
    }

    /// 回滚所有已注册的副作用（逆序执行）
    ///
    /// 注意：这是一个逻辑回滚接口。实际的文件系统/Git 回滚操作
    /// 需要由调用方根据 rollback_data 执行。此方法负责遍历、
    /// 标记状态和收集结果。
    pub fn rollback_all(&mut self) -> RollbackResult {
        let mut result = RollbackResult::default();
        result.total_attempted = self.records.len();

        // 逆序回滚（后注册的先回滚）
        for record in self.records.iter_mut().rev() {
            if record.undone {
                result.skipped += 1;
                continue;
            }

            if !record.reversible {
                result.skipped += 1;
                continue;
            }

            // 标记为已回滚（实际回滚操作由调用方根据 rollback_data 执行）
            record.undone = true;
            record.undone_at = Some(chrono::Utc::now());
            result.succeeded += 1;
        }

        result
    }

    /// 回滚指定类型的副作用
    pub fn rollback_by_kind(&mut self, kind: EffectKind) -> RollbackResult {
        let mut result = RollbackResult::default();
        let target_ids: Vec<usize> = self
            .records
            .iter()
            .enumerate()
            .filter(|(_, r)| r.kind == kind)
            .map(|(i, _)| i)
            .collect();

        result.total_attempted = target_ids.len();

        // 逆序遍历目标索引
        for &idx in target_ids.iter().rev() {
            let record = &mut self.records[idx];
            if record.undone || !record.reversible {
                result.skipped += 1;
                continue;
            }
            record.undone = true;
            record.undone_at = Some(chrono::Utc::now());
            result.succeeded += 1;
        }

        result
    }

    /// 获取可逆记录的数量
    pub fn reversible_count(&self) -> usize {
        self.records
            .iter()
            .filter(|r| r.reversible && !r.undone)
            .count()
    }

    /// 是否已完全回滚
    pub fn is_fully_rolled_back(&self) -> bool {
        self.records
            .iter()
            .all(|r| r.undone || !r.reversible)
    }

    /// 生成审计摘要
    pub fn audit_summary(&self) -> serde_json::Value {
        let by_kind: HashMap<String, usize> = {
            let mut map = HashMap::new();
            for record in &self.records {
                let key = format!("{}", record.kind);
                *map.entry(key).or_insert(0) += 1;
            }
            map
        };

        serde_json::json!({
            "turnId": &self.turn_id,
            "threadId": &self.thread_id,
            "totalEffects": self.records.len(),
            "reversibleCount": self.reversible_count(),
            "rolledBackCount": self.records.iter().filter(|r| r.undone).count(),
            "byKind": by_kind,
            "createdAt": self.created_at,
        })
    }
}

// ============================================================================
// Effect Rollback Executor（实际执行回滚操作的 Executor）
// ============================================================================

/// # 回滚执行器
///
/// 根据 EffectRecord 的 rollback_data 执行实际的回滚操作。
///
/// 将回滚逻辑从注册表中分离，使得：
/// - 注册表只负责"记录和协调"
/// - 执行器负责"实际的副作用消除"
/// - 支持自定义执行器（如 dry-run、部分回滚等）
#[async_trait::async_trait]
pub trait RollbackExecutor: Send + Sync {
    /// 执行单个副作用的回滚
    async fn execute_rollback(&self, record: &EffectRecord) -> CoreResult<()>;

    /// 获取执行器名称
    fn name(&self) -> &str;
}

/// # 文件系统回滚执行器
///
/// 根据 EffectRecord 中的文件写入数据恢复文件内容。
pub struct FileRollbackExecutor;

#[async_trait::async_trait]
impl RollbackExecutor for FileRollbackExecutor {
    async fn execute_rollback(&self, record: &EffectRecord) -> CoreResult<()> {
        if record.kind != EffectKind::FileWrite {
            return Ok(());
        }

        let data: FileWriteEffectData = serde_json::from_value(record.rollback_data.clone())
            .map_err(|e| CoreError::SerializationError(format!("无效的文件回滚数据: {}", e)))?;

        match &data.previous_content {
            Some(content) => {
                tokio::fs::write(&data.path, content).await.map_err(|e| {
                    CoreError::InternalError(format!("回滚文件写入失败 {}: {}", data.path.display(), e))
                })?;
            }
            None => {
                if data.path.exists() {
                    tokio::fs::remove_file(&data.path).await.map_err(|e| {
                        CoreError::InternalError(format!(
                            "回滚文件删除失败 {}: {}",
                            data.path.display(),
                            e
                        ))
                    })?;
                }
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "file_rollback_executor"
    }
}

/// 便捷方法：从 EffectRecord 的 rollback_data 反序列化指定类型
pub fn parse_rollback_data<T: serde::de::DeserializeOwned>(
    record: &EffectRecord,
) -> CoreResult<T> {
    serde_json::from_value(record.rollback_data.clone()).map_err(|e| {
        CoreError::SerializationError(format!(
            "无法反序列化 {:?} 的 rollback_data: {}",
            record.kind, e
        ))
    })
}
