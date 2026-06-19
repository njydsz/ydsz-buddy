//! # 分析数据收集服务
//!
//! ## 模块职责
//!
//! 本模块负责 Remi 系统中关键业务事件的记录、存储与使用统计聚合。
//! 通过 [`AnalyticsService`] 提供统一的事件采集入口，支持异步并发安全的事件写入，
//! 并自动根据事件类型更新全局使用统计（如线程数、Turn 数、Provider 调用分布等）。
//!
//! ## 核心类型
//!
//! - [`AnalyticsEventType`]：定义系统中所有可追踪的业务事件类型，
//!   涵盖线程生命周期、Turn 执行流程、Provider 调用、检查点操作及会话管理。
//! - [`AnalyticsEvent`]：单次业务事件的完整数据载体，包含事件 ID、类型、
//!   关联线程、Provider/模型信息、时间戳及可扩展的元数据字段。
//! - [`UsageStats`]：聚合后的使用统计快照，提供总量指标与按 Provider/模型维度的分布数据。
//! - [`AnalyticsService`]：分析服务的核心实现，封装事件存储与统计更新逻辑，
//!   对外暴露事件记录、统计查询、历史检索及清理等 API。
//!
//! ## 使用场景
//!
//! 1. **产品分析**：追踪用户与 AI 对话线程的创建、删除、交互频次，
//!    统计各 Provider 和模型的使用热度，辅助产品迭代与资源规划决策。
//! 2. **行为回溯**：通过事件历史查询（支持按时间倒序与数量限制），
//!    还原特定时间段内的用户操作路径，支撑问题排查与用户行为研究。
//! 3. **会话监控**：记录会话启动/停止事件，结合 Turn 执行状态，
//!    评估会话活跃度与异常中断率。
//!
//! ## 并发安全
//!
//! [`AnalyticsService`] 内部通过 `Arc<RwLock<_>>` 保护事件列表与统计状态，
//! 支持在 Tokio 异步运行时中跨任务安全共享。多个任务可同时记录事件，
//! 读写操作通过读写锁互斥，保证数据一致性。

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use remi_core::models::ThreadId;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::{debug, info};

use crate::error::TelemetryResult;

/// # 事件类型枚举
///
/// 定义遥测子系统中所有可追踪的业务事件类型。每个变体对应系统运行过程中
/// 一个具有分析价值的关键节点。
///
/// ## 序列化约定
///
/// 通过 `#[serde(rename_all = "snake_case")]` 将变体名称序列化为蛇形命名格式
/// （如 `ThreadCreated` → `"thread_created"`），便于与外部分析系统对接。
///
/// ## 变体分类
///
/// ### 线程生命周期
/// - [`ThreadCreated`](AnalyticsEventType::ThreadCreated)：对话线程创建
/// - [`ThreadDeleted`](AnalyticsEventType::ThreadDeleted)：对话线程删除
///
/// ### Turn 执行流程
/// - [`TurnStarted`](AnalyticsEventType::TurnStarted)：Turn（单轮对话交互）开始
/// - [`TurnCompleted`](AnalyticsEventType::TurnCompleted)：Turn 正常完成
/// - [`TurnInterrupted`](AnalyticsEventType::TurnInterrupted)：Turn 被用户或系统中断
///
/// ### Provider 调用
/// - [`ProviderInvoked`](AnalyticsEventType::ProviderInvoked)：LLM Provider 被调用
///
/// ### 检查点操作
/// - [`CheckpointCreated`](AnalyticsEventType::CheckpointCreated)：线程检查点创建
/// - [`CheckpointReverted`](AnalyticsEventType::CheckpointReverted)：线程回滚至检查点
///
/// ### 会话管理
/// - [`SessionStarted`](AnalyticsEventType::SessionStarted)：用户会话启动
/// - [`SessionStopped`](AnalyticsEventType::SessionStopped)：用户会话停止
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalyticsEventType {
    /// 线程创建事件。
    ///
    /// 当用户发起新的对话线程时触发。记录后会使 [`UsageStats::total_threads`] 自增。
    ThreadCreated,
    /// 线程删除事件。
    ///
    /// 当用户主动删除或系统自动清理对话线程时触发。
    ThreadDeleted,
    /// Turn 开始事件。
    ///
    /// 当一轮对话交互（Turn）开始执行时触发。记录后会使 [`UsageStats::total_turns`] 自增。
    TurnStarted,
    /// Turn 完成事件。
    ///
    /// 当一轮对话交互正常执行完毕时触发。记录后会使 [`UsageStats::total_turns`] 自增。
    TurnCompleted,
    /// Turn 中断事件。
    ///
    /// 当一轮对话交互被用户手动取消或因异常被系统中断时触发。
    TurnInterrupted,
    /// Provider 调用事件。
    ///
    /// 当系统调用 LLM Provider（如 OpenAI、Anthropic 等）时触发。
    /// 记录后会使 [`UsageStats::total_provider_calls`] 自增，
    /// 并同步更新 [`UsageStats::by_provider`] 与 [`UsageStats::by_model`] 分布统计。
    ProviderInvoked,
    /// 检查点创建事件。
    ///
    /// 当为对话线程创建状态检查点（用于后续回滚）时触发。
    /// 记录后会使 [`UsageStats::total_checkpoints`] 自增。
    CheckpointCreated,
    /// 检查点恢复事件。
    ///
    /// 当对话线程回滚至先前创建的检查点状态时触发。
    CheckpointReverted,
    /// 会话启动事件。
    ///
    /// 当用户建立与系统的交互会话时触发。
    SessionStarted,
    /// 会话停止事件。
    ///
    /// 当用户会话结束（主动退出或超时断开）时触发。
    SessionStopped,
}

/// # 分析事件数据结构
///
/// 单次业务事件的完整数据载体，封装了事件标识、类型、关联上下文及扩展信息。
/// 所有字段均为公共可见，支持序列化/反序列化以便持久化或跨服务传输。
///
/// ## 字段说明
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `id` | `String` | 事件全局唯一标识，由 UUID v4 生成 |
/// | `event_type` | `AnalyticsEventType` | 事件业务类型 |
/// | `thread_id` | `Option<ThreadId>` | 关联的对话线程 ID，部分全局事件（如会话启动）可能为空 |
/// | `provider` | `Option<String>` | 触发事件的 LLM Provider 名称（如 `"openai"`），仅 Provider 相关事件有值 |
/// | `model` | `Option<String>` | 触发事件的模型名称（如 `"gpt-4"`），仅 Provider 相关事件有值 |
/// | `timestamp` | `DateTime<Utc>` | 事件发生的 UTC 时间戳 |
/// | `metadata` | `HashMap<String, String>` | 可扩展的键值对元数据，用于携带业务自定义的附加信息 |
///
/// ## 使用场景
///
/// - 通过 [`AnalyticsService::record_event`] 写入服务进行持久化与统计聚合。
/// - 通过 [`AnalyticsService::get_events`] 按时间倒序检索历史事件。
/// - 序列化为 JSON 后上报至外部分析平台（如 Kafka、数据仓库等）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsEvent {
    /// 事件全局唯一标识，采用 UUID v4 格式生成，确保分布式环境下的唯一性。
    pub id: String,
    /// 事件业务类型，决定该事件在统计聚合时的处理逻辑。
    pub event_type: AnalyticsEventType,
    /// 关联的对话线程 ID。对于线程级事件（如 Turn 开始、检查点创建）必填；
    /// 对于全局事件（如会话启动）可为 `None`。
    pub thread_id: Option<ThreadId>,
    /// 触发事件的 LLM Provider 名称（如 `"openai"`、`"anthropic"`）。
    /// 仅在 `ProviderInvoked`、`TurnStarted` 等 Provider 相关事件中携带。
    pub provider: Option<String>,
    /// 触发事件的具体模型名称（如 `"gpt-4"`、`"claude-3-opus"`）。
    /// 仅在 `ProviderInvoked`、`TurnStarted` 等 Provider 相关事件中携带。
    pub model: Option<String>,
    /// 事件发生的 UTC 时间戳，采用 ISO 8601 格式序列化。
    pub timestamp: DateTime<Utc>,
    /// 可扩展的键值对元数据，用于携带业务自定义的附加信息（如用户 ID、地域、实验分组等）。
    /// 默认为空 Map，调用方可按需填充。
    pub metadata: HashMap<String, String>,
}

/// # 使用统计数据结构
///
/// 聚合后的系统使用统计快照，提供总量指标与多维度分布数据。
/// 由 [`AnalyticsService`] 在事件记录过程中自动增量更新。
///
/// ## 字段说明
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `total_threads` | `u64` | 累计创建的对话线程总数 |
/// | `total_turns` | `u64` | 累计执行的 Turn（单轮对话交互）总数 |
/// | `total_provider_calls` | `u64` | 累计调用 LLM Provider 的总次数 |
/// | `total_checkpoints` | `u64` | 累计创建的检查点总数 |
/// | `by_provider` | `HashMap<String, u64>` | 按 Provider 名称分组的调用次数分布 |
/// | `by_model` | `HashMap<String, u64>` | 按模型名称分组的调用次数分布 |
///
/// ## 更新时机
///
/// - `total_threads`：在记录 [`AnalyticsEventType::ThreadCreated`] 事件时自增。
/// - `total_turns`：在记录 [`AnalyticsEventType::TurnStarted`] 或
///   [`AnalyticsEventType::TurnCompleted`] 事件时自增。
/// - `total_provider_calls`、`by_provider`、`by_model`：在记录
///   [`AnalyticsEventType::ProviderInvoked`] 事件时同步更新。
/// - `total_checkpoints`：在记录 [`AnalyticsEventType::CheckpointCreated`] 事件时自增。
///
/// ## 使用场景
///
/// 通过 [`AnalyticsService::get_usage_stats`] 获取当前统计快照，
/// 用于仪表盘展示、定期上报或 SLA 评估。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UsageStats {
    /// 累计创建的对话线程总数。每次记录 `ThreadCreated` 事件时自增 1。
    pub total_threads: u64,
    /// 累计执行的 Turn（单轮对话交互）总数。每次记录 `TurnStarted` 或 `TurnCompleted` 事件时自增 1。
    pub total_turns: u64,
    /// 累计调用 LLM Provider 的总次数。每次记录 `ProviderInvoked` 事件时自增 1。
    pub total_provider_calls: u64,
    /// 累计创建的检查点总数。每次记录 `CheckpointCreated` 事件时自增 1。
    pub total_checkpoints: u64,
    /// 按 Provider 名称分组的调用次数分布。
    /// 键为 Provider 标识（如 `"openai"`），值为对应的累计调用次数。
    pub by_provider: HashMap<String, u64>,
    /// 按模型名称分组的调用次数分布。
    /// 键为模型标识（如 `"gpt-4"`），值为对应的累计调用次数。
    pub by_model: HashMap<String, u64>,
}

/// # 分析服务
///
/// 遥测子系统的核心服务之一，负责业务事件的异步记录、持久化存储与使用统计自动聚合。
///
/// ## 内部状态
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `events` | `Arc<RwLock<Vec<AnalyticsEvent>>>` | 事件历史列表，按写入顺序存储，支持并发读写 |
/// | `stats` | `Arc<RwLock<UsageStats>>` | 使用统计快照，根据事件类型自动增量更新 |
///
/// ## 并发安全
///
/// 所有内部状态均通过 `Arc<RwLock<_>>` 保护，支持在 Tokio 异步运行时中
/// 跨任务安全共享。多个任务可同时调用 `record_event` 写入事件，
/// 读写操作通过读写锁互斥，保证数据一致性。
///
/// ## 使用示例
///
/// ```rust,ignore
/// use remi_telemetry::analytics::AnalyticsService;
///
/// let service = AnalyticsService::new();
///
/// // 记录线程创建事件
/// let event = AnalyticsService::create_thread_created_event(thread_id);
/// service.record_event(event).await?;
///
/// // 查询使用统计
/// let stats = service.get_usage_stats().await?;
/// println!("总线程数: {}", stats.total_threads);
/// ```
pub struct AnalyticsService {
    /// 事件历史列表，按写入顺序存储所有已记录的分析事件。
    /// 通过 `Arc<RwLock<_>>` 保护，支持异步并发安全访问。
    events: Arc<RwLock<Vec<AnalyticsEvent>>>,
    /// 使用统计快照，根据事件类型自动增量更新。
    /// 通过 `Arc<RwLock<_>>` 保护，支持异步并发安全访问。
    stats: Arc<RwLock<UsageStats>>,
}

impl AnalyticsService {
    /// # 创建新的分析服务实例
    ///
    /// 初始化一个空的 [`AnalyticsService`]，事件历史与使用统计均为默认空状态。
    ///
    /// ## 返回值
    ///
    /// 返回一个新构建的 `AnalyticsService` 实例，内部状态通过 `Arc<RwLock<_>>` 管理，
    /// 可安全地在异步任务间共享。
    ///
    /// ## 使用场景
    ///
    /// 通常在应用启动时创建单例，并通过 `Arc` 或直接克隆（内部 `Arc` 支持浅拷贝）
    /// 注入到需要记录事件的各个业务组件中。
    pub fn new() -> Self {
        Self {
            events: Arc::new(RwLock::new(Vec::new())),
            stats: Arc::new(RwLock::new(UsageStats::default())),
        }
    }

    /// # 记录分析事件
    ///
    /// 将指定的分析事件持久化到内部事件列表，并根据事件类型自动更新使用统计。
    ///
    /// ## 参数
    ///
    /// - `event`: [`AnalyticsEvent`] —— 待记录的分析事件，包含事件类型、关联上下文及元数据。
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`：事件记录与统计更新均成功。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，但保留错误返回类型以兼容未来扩展
    ///   （如持久化到外部存储时的 IO 失败）。
    ///
    /// ## 统计更新规则
    ///
    /// | 事件类型 | 统计字段更新 |
    /// |----------|--------------|
    /// | `ThreadCreated` | `total_threads += 1` |
    /// | `TurnStarted` / `TurnCompleted` | `total_turns += 1` |
    /// | `ProviderInvoked` | `total_provider_calls += 1`，同步更新 `by_provider` 与 `by_model` |
    /// | `CheckpointCreated` | `total_checkpoints += 1` |
    /// | 其他事件 | 仅存储事件，不更新统计 |
    ///
    /// ## 并发行为
    ///
    /// 方法内部先后获取事件列表的写锁与统计快照的写锁。在高并发场景下，
    /// 锁持有时间极短（仅内存操作），不会成为性能瓶颈。
    pub async fn record_event(&self, event: AnalyticsEvent) -> TelemetryResult<()> {
        debug!("记录分析事件: {:?}", event.event_type);

        // 将事件追加到内部事件历史列表。
        {
            let mut events = self.events.write().await;
            events.push(event.clone());
        }

        // 根据事件类型增量更新使用统计快照。
        {
            let mut stats = self.stats.write().await;
            match event.event_type {
                AnalyticsEventType::ThreadCreated => {
                    stats.total_threads += 1;
                }
                AnalyticsEventType::TurnStarted | AnalyticsEventType::TurnCompleted => {
                    stats.total_turns += 1;
                }
                AnalyticsEventType::ProviderInvoked => {
                    stats.total_provider_calls += 1;
                    // 按 Provider 维度聚合调用次数。
                    if let Some(provider) = &event.provider {
                        *stats.by_provider.entry(provider.clone()).or_insert(0) += 1;
                    }
                    // 按模型维度聚合调用次数。
                    if let Some(model) = &event.model {
                        *stats.by_model.entry(model.clone()).or_insert(0) += 1;
                    }
                }
                AnalyticsEventType::CheckpointCreated => {
                    stats.total_checkpoints += 1;
                }
                // 其他事件类型（如 ThreadDeleted、SessionStarted 等）仅存储，不更新统计。
                _ => {}
            }
        }

        Ok(())
    }

    /// # 获取使用统计快照
    ///
    /// 返回当前 [`UsageStats`] 的克隆副本，包含所有已聚合的总量指标与分布数据。
    ///
    /// ## 返回值
    ///
    /// - `Ok(UsageStats)`：当前使用统计快照。由于返回的是克隆副本，
    ///   调用方对返回值的修改不会影响服务内部状态。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，保留错误返回类型以兼容未来扩展。
    ///
    /// ## 使用场景
    ///
    /// 用于仪表盘实时展示、定期上报至监控系统或生成使用报告。
    pub async fn get_usage_stats(&self) -> TelemetryResult<UsageStats> {
        let stats = self.stats.read().await;
        Ok(stats.clone())
    }

    /// # 获取事件历史列表
    ///
    /// 按时间倒序（最新事件在前）返回指定数量的分析事件。
    ///
    /// ## 参数
    ///
    /// - `limit`: `usize` —— 返回事件的最大数量。若实际事件数少于 `limit`，
    ///   则返回全部事件；若为 0，则返回空列表。
    ///
    /// ## 返回值
    ///
    /// - `Ok(Vec<AnalyticsEvent>)`：按时间倒序排列的事件列表，长度不超过 `limit`。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，保留错误返回类型以兼容未来扩展。
    ///
    /// ## 使用场景
    ///
    /// 用于事件审计、用户行为回溯、问题排查等场景。结合 `limit` 参数可实现分页查询。
    pub async fn get_events(&self, limit: usize) -> TelemetryResult<Vec<AnalyticsEvent>> {
        let events = self.events.read().await;
        // 反向迭代（最新事件在前），取前 `limit` 条，收集为 Vec。
        let result: Vec<AnalyticsEvent> = events.iter().rev().take(limit).cloned().collect();
        Ok(result)
    }

    /// # 清除事件历史
    ///
    /// 清空内部事件列表中的所有已记录事件，并输出一条 INFO 级别日志。
    /// 注意：此操作仅清除事件历史，**不会**重置使用统计（[`UsageStats`]）。
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`：清除成功。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，保留错误返回类型以兼容未来扩展。
    ///
    /// ## 使用场景
    ///
    /// 用于定期清理内存占用、测试环境重置或在事件已上报至外部存储后释放本地缓存。
    pub async fn clear_events(&self) -> TelemetryResult<()> {
        let mut events = self.events.write().await;
        events.clear();
        info!("已清除分析事件历史");
        Ok(())
    }

    /// # 创建线程创建事件
    ///
    /// 构造一个 [`AnalyticsEventType::ThreadCreated`] 类型的 [`AnalyticsEvent`] 实例。
    /// 事件 ID 由 UUID v4 自动生成，时间戳为当前 UTC 时间，`provider`/`model`/`metadata` 均为空。
    ///
    /// ## 参数
    ///
    /// - `thread_id`: [`ThreadId`] —— 新创建的对话线程的唯一标识。
    ///
    /// ## 返回值
    ///
    /// 返回一个构造完成的 [`AnalyticsEvent`]，可直接传入 [`AnalyticsService::record_event`] 进行记录。
    pub fn create_thread_created_event(thread_id: ThreadId) -> AnalyticsEvent {
        AnalyticsEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: AnalyticsEventType::ThreadCreated,
            thread_id: Some(thread_id),
            provider: None,
            model: None,
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        }
    }

    /// # 创建 Turn 开始事件
    ///
    /// 构造一个 [`AnalyticsEventType::TurnStarted`] 类型的 [`AnalyticsEvent`] 实例。
    /// 事件 ID 由 UUID v4 自动生成，时间戳为当前 UTC 时间，`metadata` 为空。
    ///
    /// ## 参数
    ///
    /// - `thread_id`: [`ThreadId`] —— 当前 Turn 所属的对话线程标识。
    /// - `provider`: [`String`] —— 本次 Turn 调用的 LLM Provider 名称（如 `"openai"`）。
    /// - `model`: [`String`] —— 本次 Turn 使用的具体模型名称（如 `"gpt-4"`）。
    ///
    /// ## 返回值
    ///
    /// 返回一个构造完成的 [`AnalyticsEvent`]，可直接传入 [`AnalyticsService::record_event`] 进行记录。
    pub fn create_turn_started_event(
        thread_id: ThreadId,
        provider: String,
        model: String,
    ) -> AnalyticsEvent {
        AnalyticsEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: AnalyticsEventType::TurnStarted,
            thread_id: Some(thread_id),
            provider: Some(provider),
            model: Some(model),
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        }
    }

    /// # 创建 Provider 调用事件
    ///
    /// 构造一个 [`AnalyticsEventType::ProviderInvoked`] 类型的 [`AnalyticsEvent`] 实例。
    /// 事件 ID 由 UUID v4 自动生成，时间戳为当前 UTC 时间，`metadata` 为空。
    ///
    /// ## 参数
    ///
    /// - `thread_id`: [`ThreadId`] —— 触发 Provider 调用的对话线程标识。
    /// - `provider`: [`String`] —— 被调用的 LLM Provider 名称（如 `"anthropic"`）。
    /// - `model`: [`String`] —— 被调用的具体模型名称（如 `"claude-3-opus"`）。
    ///
    /// ## 返回值
    ///
    /// 返回一个构造完成的 [`AnalyticsEvent`]，可直接传入 [`AnalyticsService::record_event`] 进行记录。
    /// 记录后会自动更新 [`UsageStats::total_provider_calls`]、[`UsageStats::by_provider`]
    /// 与 [`UsageStats::by_model`]。
    pub fn create_provider_invoked_event(
        thread_id: ThreadId,
        provider: String,
        model: String,
    ) -> AnalyticsEvent {
        AnalyticsEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: AnalyticsEventType::ProviderInvoked,
            thread_id: Some(thread_id),
            provider: Some(provider),
            model: Some(model),
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        }
    }
}

/// # AnalyticsService 的 Default 实现
///
/// 委托给 [`AnalyticsService::new`]，返回一个空状态的分析服务实例。
/// 便于在结构体派生 `Default` 时自动初始化遥测字段。
impl Default for AnalyticsService {
    fn default() -> Self {
        Self::new()
    }
}
