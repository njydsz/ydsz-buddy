/**
 * Provider 运行时事件契约
 *
 * 定义 Provider 运行时产生的各种事件数据结构，包括：
 * - 会话事件：启动、配置、状态变化、退出
 * - 线程事件：启动、状态变化、元数据更新、Token 使用量更新、实时会话
 * - 轮次事件：启动、完成、中止、任务更新、提议变更、差异更新
 * - 项目事件：启动、更新、完成
 * - 内容事件：文本增量
 * - 请求事件：审批请求打开、审批请求解决
 * - 用户输入事件：请求用户输入、用户输入解决
 * - 任务事件：任务启动、进度、完成
 * - 钩子事件：钩子启动、进度、完成
 * - 工具事件：工具进度、工具摘要
 * - 认证事件：认证状态
 * - 账户事件：账户更新、速率限制更新
 * - MCP 事件：MCP 状态更新、OAuth 完成
 * - 模型事件：模型重路由
 * - 配置事件：配置警告、弃用通知
 * - 文件事件：文件持久化
 * - 运行时事件：警告、错误
 *
 * 这些事件用于实时传递 Provider 的运行状态和数据流。
 */
import { Option, Schema } from "effect";
import {
  EventId,
  IsoDateTime,
  NonNegativeInt,
  ProviderItemId,
  PositiveInt,
  RuntimeItemId,
  RuntimeRequestId,
  RuntimeTaskId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "./baseSchemas";
import { ProviderKind } from "./orchestration";

const TrimmedNonEmptyStringSchema = TrimmedNonEmptyString;
const UnknownRecordSchema = Schema.Record(Schema.String, Schema.Unknown);

/** 运行时事件原始来源，标识事件来自哪个 Provider 的哪种通信渠道 */
const RuntimeEventRawSource = Schema.Literal(
  "codex.app-server.notification",
  "codex.app-server.request",
  "codex.eventmsg",
  "claude.sdk.message",
  "claude.sdk.permission",
  "codex.sdk.thread-event",
  "gemini.acp.message",
  "gemini.acp.stdout",
  "gemini.acp.stderr",
  "acp.jsonrpc",
  "acp.cursor.extension",
  "kilo.sdk.event",
  "opencode.sdk.event",
  "pi.sdk.event",
);
export type RuntimeEventRawSource = typeof RuntimeEventRawSource.Type;

/** 运行时原始事件，包含来源、方法、消息类型和负载数据 */
export const RuntimeEventRaw = Schema.Struct({
  /** 事件来源 */
  source: RuntimeEventRawSource,
  /** 方法名 */
  method: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 消息类型 */
  messageType: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 负载数据 */
  payload: Schema.Unknown,
});
export type RuntimeEventRaw = typeof RuntimeEventRaw.Type;

/** Provider 请求 ID 类型 */
const ProviderRequestId = TrimmedNonEmptyStringSchema;
export type ProviderRequestId = typeof ProviderRequestId.Type;

/** Provider 引用信息，用于关联 Provider 层的线程、轮次、项目等 */
const ProviderRefs = Schema.Struct({
  /** Provider 线程 ID */
  providerThreadId: Schema.optional(TrimmedNonEmptyStringSchema),
  /** Provider 父线程 ID */
  providerParentThreadId: Schema.optional(TrimmedNonEmptyStringSchema),
  /** Provider 轮次 ID */
  providerTurnId: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 父轮次的 Provider 轮次 ID */
  parentProviderTurnId: Schema.optional(TrimmedNonEmptyStringSchema),
  /** Provider 项目 ID */
  providerItemId: Schema.optional(ProviderItemId),
  /** Provider 请求 ID */
  providerRequestId: Schema.optional(ProviderRequestId),
});
export type ProviderRefs = typeof ProviderRefs.Type;

/** 运行时会话状态枚举：启动中、就绪、运行中、等待、已停止、错误 */
const RuntimeSessionState = Schema.Literal(
  "starting",
  "ready",
  "running",
  "waiting",
  "stopped",
  "error",
);
export type RuntimeSessionState = typeof RuntimeSessionState.Type;

/** 运行时线程状态枚举：活跃、空闲、已归档、已关闭、已压缩、错误 */
const RuntimeThreadState = Schema.Literal(
  "active",
  "idle",
  "archived",
  "closed",
  "compacted",
  "error",
);
export type RuntimeThreadState = typeof RuntimeThreadState.Type;

/** 运行时轮次状态枚举：已完成、失败、已中断、已取消 */
const RuntimeTurnState = Schema.Literal("completed", "failed", "interrupted", "cancelled");
export type RuntimeTurnState = typeof RuntimeTurnState.Type;

/** 运行时任务状态枚举：待处理、进行中、已完成 */
const RuntimeTaskStatus = Schema.Literal("pending", "inProgress", "completed");
export type RuntimeTaskStatus = typeof RuntimeTaskStatus.Type;

/** 运行时项目状态枚举：进行中、已完成、失败、已拒绝 */
const RuntimeItemStatus = Schema.Literals(["inProgress", "completed", "failed", "declined"]);
export type RuntimeItemStatus = typeof RuntimeItemStatus.Type;

/** 运行时内容流类型枚举：助手文本、推理文本、推理摘要、计划文本、命令输出、文件变更输出、未知 */
const RuntimeContentStreamKind = Schema.Literals([
  "assistant_text",
  "reasoning_text",
  "reasoning_summary_text",
  "plan_text",
  "command_output",
  "file_change_output",
  "unknown",
]);
export type RuntimeContentStreamKind = typeof RuntimeContentStreamKind.Type;

/** 运行时会话退出类型枚举：优雅退出、错误退出 */
const RuntimeSessionExitKind = Schema.Literals(["graceful", "error"]);
export type RuntimeSessionExitKind = typeof RuntimeSessionExitKind.Type;

/** 运行时错误分类枚举：提供者错误、传输错误、权限错误、验证错误、未知错误 */
const RuntimeErrorClass = Schema.Literals([
  "provider_error",
  "transport_error",
  "permission_error",
  "validation_error",
  "unknown",
]);
export type RuntimeErrorClass = typeof RuntimeErrorClass.Type;

/** 工具生命周期项目类型常量：命令执行、文件变更、MCP 工具调用、动态工具调用、协作代理工具调用、网页搜索、图片查看、图片生成 */
export const TOOL_LIFECYCLE_ITEM_TYPES = [
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "dynamic_tool_call",
  "collab_agent_tool_call",
  "web_search",
  "image_view",
  "image_generation",
] as const;

/** 工具生命周期项目类型 */
export const ToolLifecycleItemType = Schema.Literals(TOOL_LIFECYCLE_ITEM_TYPES);
export type ToolLifecycleItemType = typeof ToolLifecycleItemType.Type;

/** 判断是否为工具生命周期项目类型 */
export function isToolLifecycleItemType(value: string): value is ToolLifecycleItemType {
  return TOOL_LIFECYCLE_ITEM_TYPES.includes(value as ToolLifecycleItemType);
}

/** 规范项目类型枚举：用户消息、助手消息、推理、计划、工具生命周期项目、审查进入、审查退出、上下文压缩、错误、未知 */
export const CanonicalItemType = Schema.Literals([
  "user_message",
  "assistant_message",
  "reasoning",
  "plan",
  ...TOOL_LIFECYCLE_ITEM_TYPES,
  "review_entered",
  "review_exited",
  "context_compaction",
  "error",
  "unknown",
]);
export type CanonicalItemType = typeof CanonicalItemType.Type;

/** 规范请求类型枚举：命令执行审批、文件读取审批、文件变更审批、应用补丁审批、执行命令审批、工具用户输入、动态工具调用、认证令牌刷新、未知 */
export const CanonicalRequestType = Schema.Literals([
  "command_execution_approval",
  "file_read_approval",
  "file_change_approval",
  "apply_patch_approval",
  "exec_command_approval",
  "tool_user_input",
  "dynamic_tool_call",
  "auth_tokens_refresh",
  "unknown",
]);
export type CanonicalRequestType = typeof CanonicalRequestType.Type;

/** Provider 运行时事件类型枚举，包含所有可能的事件类型 */
const ProviderRuntimeEventType = Schema.Literals([
  // 会话事件
  "session.started",
  "session.configured",
  "session.state.changed",
  "session.exited",
  // 线程事件
  "thread.started",
  "thread.state.changed",
  "thread.metadata.updated",
  "thread.token-usage.updated",
  "thread.realtime.started",
  "thread.realtime.item-added",
  "thread.realtime.audio.delta",
  "thread.realtime.error",
  "thread.realtime.closed",
  // 轮次事件
  "turn.started",
  "turn.completed",
  "turn.aborted",
  "turn.tasks.updated",
  "turn.proposed.delta",
  "turn.proposed.completed",
  "turn.diff.updated",
  // 项目事件
  "item.started",
  "item.updated",
  "item.completed",
  // 内容事件
  "content.delta",
  // 请求事件
  "request.opened",
  "request.resolved",
  // 用户输入事件
  "user-input.requested",
  "user-input.resolved",
  // 任务事件
  "task.started",
  "task.progress",
  "task.completed",
  // 钩子事件
  "hook.started",
  "hook.progress",
  "hook.completed",
  // 工具事件
  "tool.progress",
  "tool.summary",
  // 认证事件
  "auth.status",
  // 账户事件
  "account.updated",
  "account.rate-limits.updated",
  // MCP 事件
  "mcp.status.updated",
  "mcp.oauth.completed",
  // 模型事件
  "model.rerouted",
  // 配置事件
  "config.warning",
  "deprecation.notice",
  // 文件事件
  "files.persisted",
  // 运行时事件
  "runtime.warning",
  "runtime.error",
]);
export type ProviderRuntimeEventType = typeof ProviderRuntimeEventType.Type;

/** 事件类型常量定义 */
const SessionStartedType = Schema.Literal("session.started");
const SessionConfiguredType = Schema.Literal("session.configured");
const SessionStateChangedType = Schema.Literal("session.state.changed");
const SessionExitedType = Schema.Literal("session.exited");
const ThreadStartedType = Schema.Literal("thread.started");
const ThreadStateChangedType = Schema.Literal("thread.state.changed");
const ThreadMetadataUpdatedType = Schema.Literal("thread.metadata.updated");
const ThreadTokenUsageUpdatedType = Schema.Literal("thread.token-usage.updated");
const ThreadRealtimeStartedType = Schema.Literal("thread.realtime.started");
const ThreadRealtimeItemAddedType = Schema.Literal("thread.realtime.item-added");
const ThreadRealtimeAudioDeltaType = Schema.Literal("thread.realtime.audio.delta");
const ThreadRealtimeErrorType = Schema.Literal("thread.realtime.error");
const ThreadRealtimeClosedType = Schema.Literal("thread.realtime.closed");
const TurnStartedType = Schema.Literal("turn.started");
const TurnCompletedType = Schema.Literal("turn.completed");
const TurnAbortedType = Schema.Literal("turn.aborted");
const TurnTasksUpdatedType = Schema.Literal("turn.tasks.updated");
const TurnProposedDeltaType = Schema.Literal("turn.proposed.delta");
const TurnProposedCompletedType = Schema.Literal("turn.proposed.completed");
const TurnDiffUpdatedType = Schema.Literal("turn.diff.updated");
const ItemStartedType = Schema.Literal("item.started");
const ItemUpdatedType = Schema.Literal("item.updated");
const ItemCompletedType = Schema.Literal("item.completed");
const ContentDeltaType = Schema.Literal("content.delta");
const RequestOpenedType = Schema.Literal("request.opened");
const RequestResolvedType = Schema.Literal("request.resolved");
const UserInputRequestedType = Schema.Literal("user-input.requested");
const UserInputResolvedType = Schema.Literal("user-input.resolved");
const TaskStartedType = Schema.Literal("task.started");
const TaskProgressType = Schema.Literal("task.progress");
const TaskCompletedType = Schema.Literal("task.completed");
const HookStartedType = Schema.Literal("hook.started");
const HookProgressType = Schema.Literal("hook.progress");
const HookCompletedType = Schema.Literal("hook.completed");
const ToolProgressType = Schema.Literal("tool.progress");
const ToolSummaryType = Schema.Literal("tool.summary");
const AuthStatusType = Schema.Literal("auth.status");
const AccountUpdatedType = Schema.Literal("account.updated");
const AccountRateLimitsUpdatedType = Schema.Literal("account.rate-limits.updated");
const McpStatusUpdatedType = Schema.Literal("mcp.status.updated");
const McpOauthCompletedType = Schema.Literal("mcp.oauth.completed");
const ModelReroutedType = Schema.Literal("model.rerouted");
const ConfigWarningType = Schema.Literal("config.warning");
const DeprecationNoticeType = Schema.Literal("deprecation.notice");
const FilesPersistedType = Schema.Literal("files.persisted");
const RuntimeWarningType = Schema.Literal("runtime.warning");
const RuntimeErrorType = Schema.Literal("runtime.error");

/**
 * Provider 运行时事件基础结构
 *
 * 所有运行时事件的公共基础字段，包含事件 ID、提供者、线程、时间戳等信息。
 */
const ProviderRuntimeEventBase = Schema.Struct({
  /** 事件 ID */
  eventId: EventId,
  /** Provider 类型 */
  provider: ProviderKind,
  /** 线程 ID */
  threadId: ThreadId,
  /** 事件创建时间 */
  createdAt: IsoDateTime,
  /** 轮次 ID */
  turnId: Schema.optional(TurnId),
  /** 父轮次 ID */
  parentTurnId: Schema.optional(TurnId),
  /** 项目 ID */
  itemId: Schema.optional(RuntimeItemId),
  /** 请求 ID */
  requestId: Schema.optional(RuntimeRequestId),
  /** Provider 引用信息 */
  providerRefs: Schema.optional(ProviderRefs),
  /** 原始事件数据 */
  raw: Schema.optional(RuntimeEventRaw),
});
export type ProviderRuntimeEventBase = typeof ProviderRuntimeEventBase.Type;

/** 会话启动事件负载 */
const SessionStartedPayload = Schema.Struct({
  /** 启动消息 */
  message: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 恢复信息 */
  resume: Schema.optional(Schema.Unknown),
});
export type SessionStartedPayload = typeof SessionStartedPayload.Type;

/** 会话配置事件负载 */
const SessionConfiguredPayload = Schema.Struct({
  /** 配置信息 */
  config: UnknownRecordSchema,
});
export type SessionConfiguredPayload = typeof SessionConfiguredPayload.Type;

/** 会话状态变化事件负载 */
const SessionStateChangedPayload = Schema.Struct({
  /** 新状态 */
  state: RuntimeSessionState,
  /** 变化原因 */
  reason: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 详细信息 */
  detail: Schema.optional(Schema.Unknown),
});
export type SessionStateChangedPayload = typeof SessionStateChangedPayload.Type;

/** 会话退出事件负载 */
const SessionExitedPayload = Schema.Struct({
  /** 退出原因 */
  reason: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 是否可恢复 */
  recoverable: Schema.optional(Schema.Boolean),
  /** 退出类型 */
  exitKind: Schema.optional(RuntimeSessionExitKind),
});
export type SessionExitedPayload = typeof SessionExitedPayload.Type;

/** 线程启动事件负载 */
const ThreadStartedPayload = Schema.Struct({
  /** Provider 线程 ID */
  providerThreadId: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type ThreadStartedPayload = typeof ThreadStartedPayload.Type;

/** 线程状态变化事件负载 */
const ThreadStateChangedPayload = Schema.Struct({
  /** 新状态 */
  state: RuntimeThreadState,
  /** 详细信息 */
  detail: Schema.optional(Schema.Unknown),
});
export type ThreadStateChangedPayload = typeof ThreadStateChangedPayload.Type;

/** 线程元数据更新事件负载 */
const ThreadMetadataUpdatedPayload = Schema.Struct({
  /** 线程名称 */
  name: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 元数据 */
  metadata: Schema.optional(UnknownRecordSchema),
});
export type ThreadMetadataUpdatedPayload = typeof ThreadMetadataUpdatedPayload.Type;

/**
 * 线程 Token 使用量快照
 *
 * 记录线程的 Token 使用情况，包括已使用 Token 数、百分比、各类 Token 统计等。
 */
export const ThreadTokenUsageSnapshot = Schema.Struct({
  /** 已使用的 Token 数 */
  usedTokens: NonNegativeInt,
  /** 已使用百分比 */
  usedPercent: Schema.optional(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(100)),
  ),
  /** 总处理 Token 数 */
  totalProcessedTokens: Schema.optional(NonNegativeInt),
  /** 最大 Token 数 */
  maxTokens: Schema.optional(PositiveInt),
  /** 输入 Token 数 */
  inputTokens: Schema.optional(NonNegativeInt),
  /** 缓存输入 Token 数 */
  cachedInputTokens: Schema.optional(NonNegativeInt),
  /** 输出 Token 数 */
  outputTokens: Schema.optional(NonNegativeInt),
  /** 推理输出 Token 数 */
  reasoningOutputTokens: Schema.optional(NonNegativeInt),
  /** 上次使用的 Token 数 */
  lastUsedTokens: Schema.optional(NonNegativeInt),
  /** 上次输入 Token 数 */
  lastInputTokens: Schema.optional(NonNegativeInt),
  /** 上次缓存输入 Token 数 */
  lastCachedInputTokens: Schema.optional(NonNegativeInt),
  /** 上次输出 Token 数 */
  lastOutputTokens: Schema.optional(NonNegativeInt),
  /** 上次推理输出 Token 数 */
  lastReasoningOutputTokens: Schema.optional(NonNegativeInt),
  /** 工具使用次数 */
  toolUses: Schema.optional(NonNegativeInt),
  /** 持续时间（毫秒） */
  durationMs: Schema.optional(NonNegativeInt),
  /** 是否自动压缩 */
  compactsAutomatically: Schema.optional(Schema.Boolean),
});
export type ThreadTokenUsageSnapshot = typeof ThreadTokenUsageSnapshot.Type;

/** 线程 Token 使用量更新事件负载 */
const ThreadTokenUsageUpdatedPayload = Schema.Struct({
  /** Token 使用量快照 */
  usage: ThreadTokenUsageSnapshot,
});
export type ThreadTokenUsageUpdatedPayload = typeof ThreadTokenUsageUpdatedPayload.Type;

/** 线程实时会话启动事件负载 */
const ThreadRealtimeStartedPayload = Schema.Struct({
  /** 实时会话 ID */
  realtimeSessionId: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type ThreadRealtimeStartedPayload = typeof ThreadRealtimeStartedPayload.Type;

/** 线程实时会话新增项目事件负载 */
const ThreadRealtimeItemAddedPayload = Schema.Struct({
  /** 新增的项目数据 */
  item: Schema.Unknown,
});
export type ThreadRealtimeItemAddedPayload = typeof ThreadRealtimeItemAddedPayload.Type;

/** 线程实时会话音频增量事件负载 */
const ThreadRealtimeAudioDeltaPayload = Schema.Struct({
  /** 音频数据 */
  audio: Schema.Unknown,
});
export type ThreadRealtimeAudioDeltaPayload = typeof ThreadRealtimeAudioDeltaPayload.Type;

/** 线程实时会话错误事件负载 */
const ThreadRealtimeErrorPayload = Schema.Struct({
  /** 错误消息 */
  message: TrimmedNonEmptyStringSchema,
});
export type ThreadRealtimeErrorPayload = typeof ThreadRealtimeErrorPayload.Type;

/** 线程实时会话关闭事件负载 */
const ThreadRealtimeClosedPayload = Schema.Struct({
  /** 关闭原因 */
  reason: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type ThreadRealtimeClosedPayload = typeof ThreadRealtimeClosedPayload.Type;

/** 轮次启动事件负载 */
const TurnStartedPayload = Schema.Struct({
  /** 使用的模型 */
  model: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 推理努力程度 */
  effort: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type TurnStartedPayload = typeof TurnStartedPayload.Type;

/** 轮次完成事件负载 */
const TurnCompletedPayload = Schema.Struct({
  /** 最终状态 */
  state: RuntimeTurnState,
  /** 停止原因 */
  stopReason: Schema.optional(Schema.NullOr(TrimmedNonEmptyStringSchema)),
  /** 使用情况 */
  usage: Schema.optional(Schema.Unknown),
  /** 模型使用情况 */
  modelUsage: Schema.optional(UnknownRecordSchema),
  /** 本次费用（美元） */
  totalCostUsd: Schema.optional(Schema.Number),
  /** 累计费用（美元） */
  cumulativeCostUsd: Schema.optional(Schema.Number),
  /** 错误消息 */
  errorMessage: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type TurnCompletedPayload = typeof TurnCompletedPayload.Type;

/** 轮次中止事件负载 */
const TurnAbortedPayload = Schema.Struct({
  /** 中止原因 */
  reason: TrimmedNonEmptyStringSchema,
});
export type TurnAbortedPayload = typeof TurnAbortedPayload.Type;

/** 运行时任务列表项 */
const RuntimeTaskListItem = Schema.Struct({
  /** 任务描述 */
  task: TrimmedNonEmptyStringSchema,
  /** 任务状态 */
  status: RuntimeTaskStatus,
});
export type RuntimeTaskListItem = typeof RuntimeTaskListItem.Type;

/** 轮次任务更新事件负载 */
const TurnTasksUpdatedPayload = Schema.Struct({
  /** 任务说明 */
  explanation: Schema.optional(Schema.NullOr(TrimmedNonEmptyStringSchema)),
  /** 任务列表 */
  tasks: Schema.Array(RuntimeTaskListItem),
});
export type TurnTasksUpdatedPayload = typeof TurnTasksUpdatedPayload.Type;

/** 轮次提议增量事件负载 */
const TurnProposedDeltaPayload = Schema.Struct({
  /** 增量文本 */
  delta: Schema.String,
});
export type TurnProposedDeltaPayload = typeof TurnProposedDeltaPayload.Type;

/** 轮次提议完成事件负载 */
const TurnProposedCompletedPayload = Schema.Struct({
  /** 计划 Markdown 内容 */
  planMarkdown: TrimmedNonEmptyStringSchema,
});
export type TurnProposedCompletedPayload = typeof TurnProposedCompletedPayload.Type;

/** 轮次差异更新事件负载 */
const TurnDiffUpdatedPayload = Schema.Struct({
  /** 统一差异格式 */
  unifiedDiff: Schema.String,
});
export type TurnDiffUpdatedPayload = typeof TurnDiffUpdatedPayload.Type;

/**
 * 项目生命周期负载
 *
 * 描述项目（Item）在生命周期中的状态变化，包括类型、状态、标题等。
 * 用于 item.started、item.updated、item.completed 事件。
 */
export const ItemLifecyclePayload = Schema.Struct({
  /** 项目类型 */
  itemType: CanonicalItemType,
  /** 项目状态 */
  status: Schema.optional(RuntimeItemStatus),
  /** 项目标题 */
  title: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 项目详情 */
  detail: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 项目数据 */
  data: Schema.optional(Schema.Unknown),
});
export type ItemLifecyclePayload = typeof ItemLifecyclePayload.Type;

/** Codex 生成图片的产物类型常量 */
export const CODEX_GENERATED_IMAGE_ARTIFACT_KIND = "codex.generated_image" as const;

/**
 * Codex 生成图片的产物描述
 *
 * 描述 Codex 生成的图片产物，包含本地文件路径和调用 ID。
 */
export const CodexGeneratedImageArtifact = Schema.Struct({
  /** 产物类型 */
  kind: Schema.Literal(CODEX_GENERATED_IMAGE_ARTIFACT_KIND),
  /** 本地文件路径 */
  path: TrimmedNonEmptyStringSchema,
  /** 调用 ID */
  callId: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type CodexGeneratedImageArtifact = typeof CodexGeneratedImageArtifact.Type;

/**
 * 内容增量负载
 *
 * 描述流式输出的文本增量，包括流类型、增量文本和索引信息。
 * 用于 content.delta 事件。
 */
const ContentDeltaPayload = Schema.Struct({
  /** 流类型 */
  streamKind: RuntimeContentStreamKind,
  /** 增量文本 */
  delta: Schema.String,
  /** 内容索引 */
  contentIndex: Schema.optional(Schema.Int),
  /** 摘要索引 */
  summaryIndex: Schema.optional(Schema.Int),
});
export type ContentDeltaPayload = typeof ContentDeltaPayload.Type;

/**
 * 请求打开负载
 *
 * 描述审批请求的开启，包括请求类型、详情和参数。
 * 用于 request.opened 事件。
 */
const RequestOpenedPayload = Schema.Struct({
  /** 请求类型 */
  requestType: CanonicalRequestType,
  /** 请求详情 */
  detail: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 请求参数 */
  args: Schema.optional(Schema.Unknown),
});
export type RequestOpenedPayload = typeof RequestOpenedPayload.Type;

/**
 * 请求解决负载
 *
 * 描述审批请求的解决结果，包括请求类型、决策和解决方案。
 * 用于 request.resolved 事件。
 */
const RequestResolvedPayload = Schema.Struct({
  /** 请求类型 */
  requestType: CanonicalRequestType,
  /** 用户决策 */
  decision: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 解决方案 */
  resolution: Schema.optional(Schema.Unknown),
});
export type RequestResolvedPayload = typeof RequestResolvedPayload.Type;

/** 用户输入问题选项 */
const UserInputQuestionOption = Schema.Struct({
  /** 选项标签 */
  label: TrimmedNonEmptyStringSchema,
  /** 选项描述 */
  description: TrimmedNonEmptyStringSchema,
});
export type UserInputQuestionOption = typeof UserInputQuestionOption.Type;

/**
 * 用户输入问题
 *
 * 描述需要用户回答的问题，包括问题 ID、标题、问题文本和选项列表。
 * 用于 user-input.requested 事件。
 */
export const UserInputQuestion = Schema.Struct({
  /** 问题 ID */
  id: TrimmedNonEmptyStringSchema,
  /** 问题标题 */
  header: TrimmedNonEmptyStringSchema,
  /** 问题文本 */
  question: TrimmedNonEmptyStringSchema,
  /** 选项列表 */
  options: Schema.Array(UserInputQuestionOption),
  /** 是否多选 */
  multiSelect: Schema.optional(Schema.Boolean).pipe(
    Schema.withConstructorDefault(() => Option.some(false)),
  ),
});
export type UserInputQuestion = typeof UserInputQuestion.Type;

/** 用户输入请求事件负载 */
const UserInputRequestedPayload = Schema.Struct({
  /** 问题列表 */
  questions: Schema.Array(UserInputQuestion),
});
export type UserInputRequestedPayload = typeof UserInputRequestedPayload.Type;

/** 用户输入解决事件负载 */
const UserInputResolvedPayload = Schema.Struct({
  /** 用户答案 */
  answers: UnknownRecordSchema,
});
export type UserInputResolvedPayload = typeof UserInputResolvedPayload.Type;

/** 任务启动事件负载 */
const TaskStartedPayload = Schema.Struct({
  /** 任务 ID */
  taskId: RuntimeTaskId,
  /** 任务描述 */
  description: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 任务类型 */
  taskType: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type TaskStartedPayload = typeof TaskStartedPayload.Type;

/** 任务进度事件负载 */
const TaskProgressPayload = Schema.Struct({
  /** 任务 ID */
  taskId: RuntimeTaskId,
  /** 进度描述 */
  description: TrimmedNonEmptyStringSchema,
  /** 进度摘要 */
  summary: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 使用情况 */
  usage: Schema.optional(Schema.Unknown),
  /** 最后使用的工具名称 */
  lastToolName: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type TaskProgressPayload = typeof TaskProgressPayload.Type;

/** 任务完成事件负载 */
const TaskCompletedPayload = Schema.Struct({
  /** 任务 ID */
  taskId: RuntimeTaskId,
  /** 完成状态 */
  status: Schema.Literals(["completed", "failed", "stopped"]),
  /** 完成摘要 */
  summary: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 使用情况 */
  usage: Schema.optional(Schema.Unknown),
});
export type TaskCompletedPayload = typeof TaskCompletedPayload.Type;

/** 钩子启动事件负载 */
const HookStartedPayload = Schema.Struct({
  /** 钩子 ID */
  hookId: TrimmedNonEmptyStringSchema,
  /** 钩子名称 */
  hookName: TrimmedNonEmptyStringSchema,
  /** 钩子事件 */
  hookEvent: TrimmedNonEmptyStringSchema,
});
export type HookStartedPayload = typeof HookStartedPayload.Type;

/** 钩子进度事件负载 */
const HookProgressPayload = Schema.Struct({
  /** 钩子 ID */
  hookId: TrimmedNonEmptyStringSchema,
  /** 输出内容 */
  output: Schema.optional(Schema.String),
  /** 标准输出 */
  stdout: Schema.optional(Schema.String),
  /** 标准错误 */
  stderr: Schema.optional(Schema.String),
});
export type HookProgressPayload = typeof HookProgressPayload.Type;

/** 钩子完成事件负载 */
const HookCompletedPayload = Schema.Struct({
  /** 钩子 ID */
  hookId: TrimmedNonEmptyStringSchema,
  /** 完成结果 */
  outcome: Schema.Literals(["success", "error", "cancelled"]),
  /** 输出内容 */
  output: Schema.optional(Schema.String),
  /** 标准输出 */
  stdout: Schema.optional(Schema.String),
  /** 标准错误 */
  stderr: Schema.optional(Schema.String),
  /** 退出码 */
  exitCode: Schema.optional(Schema.Int),
});
export type HookCompletedPayload = typeof HookCompletedPayload.Type;

/** 工具进度事件负载 */
const ToolProgressPayload = Schema.Struct({
  /** 工具使用 ID */
  toolUseId: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 工具名称 */
  toolName: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 进度摘要 */
  summary: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 已用时间（秒） */
  elapsedSeconds: Schema.optional(Schema.Number),
});
export type ToolProgressPayload = typeof ToolProgressPayload.Type;

/** 工具摘要事件负载 */
const ToolSummaryPayload = Schema.Struct({
  /** 摘要内容 */
  summary: TrimmedNonEmptyStringSchema,
  /** 前置工具使用 ID 列表 */
  precedingToolUseIds: Schema.optional(Schema.Array(TrimmedNonEmptyStringSchema)),
});
export type ToolSummaryPayload = typeof ToolSummaryPayload.Type;

/** 认证状态事件负载 */
const AuthStatusPayload = Schema.Struct({
  /** 是否正在认证 */
  isAuthenticating: Schema.optional(Schema.Boolean),
  /** 输出信息 */
  output: Schema.optional(Schema.Array(Schema.String)),
  /** 错误信息 */
  error: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type AuthStatusPayload = typeof AuthStatusPayload.Type;

/** 账户更新事件负载 */
const AccountUpdatedPayload = Schema.Struct({
  /** 账户信息 */
  account: Schema.Unknown,
});
export type AccountUpdatedPayload = typeof AccountUpdatedPayload.Type;

/** 账户速率限制更新事件负载 */
const AccountRateLimitsUpdatedPayload = Schema.Struct({
  /** 速率限制信息 */
  rateLimits: Schema.Unknown,
});
export type AccountRateLimitsUpdatedPayload = typeof AccountRateLimitsUpdatedPayload.Type;

/** MCP 状态更新事件负载 */
const McpStatusUpdatedPayload = Schema.Struct({
  /** MCP 状态信息 */
  status: Schema.Unknown,
});
export type McpStatusUpdatedPayload = typeof McpStatusUpdatedPayload.Type;

/** MCP OAuth 完成事件负载 */
const McpOauthCompletedPayload = Schema.Struct({
  /** 是否成功 */
  success: Schema.Boolean,
  /** 名称 */
  name: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 错误信息 */
  error: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type McpOauthCompletedPayload = typeof McpOauthCompletedPayload.Type;

/** 模型重路由事件负载 */
const ModelReroutedPayload = Schema.Struct({
  /** 原模型 */
  fromModel: TrimmedNonEmptyStringSchema,
  /** 新模型 */
  toModel: TrimmedNonEmptyStringSchema,
  /** 重路由原因 */
  reason: TrimmedNonEmptyStringSchema,
});
export type ModelReroutedPayload = typeof ModelReroutedPayload.Type;

/** 配置警告事件负载 */
const ConfigWarningPayload = Schema.Struct({
  /** 警告摘要 */
  summary: TrimmedNonEmptyStringSchema,
  /** 详细信息 */
  details: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 配置路径 */
  path: Schema.optional(TrimmedNonEmptyStringSchema),
  /** 配置范围 */
  range: Schema.optional(Schema.Unknown),
});
export type ConfigWarningPayload = typeof ConfigWarningPayload.Type;

/** 弃用通知事件负载 */
const DeprecationNoticePayload = Schema.Struct({
  /** 通知摘要 */
  summary: TrimmedNonEmptyStringSchema,
  /** 详细信息 */
  details: Schema.optional(TrimmedNonEmptyStringSchema),
});
export type DeprecationNoticePayload = typeof DeprecationNoticePayload.Type;

/** 文件持久化事件负载 */
const FilesPersistedPayload = Schema.Struct({
  /** 成功持久化的文件列表 */
  files: Schema.Array(
    Schema.Struct({
      /** 文件名 */
      filename: TrimmedNonEmptyStringSchema,
      /** 文件 ID */
      fileId: TrimmedNonEmptyStringSchema,
    }),
  ),
  /** 失败的文件列表 */
  failed: Schema.optional(
    Schema.Array(
      Schema.Struct({
        /** 文件名 */
        filename: TrimmedNonEmptyStringSchema,
        /** 错误信息 */
        error: TrimmedNonEmptyStringSchema,
      }),
    ),
  ),
});
export type FilesPersistedPayload = typeof FilesPersistedPayload.Type;

/** 运行时警告事件负载 */
const RuntimeWarningPayload = Schema.Struct({
  /** 警告消息 */
  message: TrimmedNonEmptyStringSchema,
  /** 详细信息 */
  detail: Schema.optional(Schema.Unknown),
});
export type RuntimeWarningPayload = typeof RuntimeWarningPayload.Type;

/** 运行时错误事件负载 */
const RuntimeErrorPayload = Schema.Struct({
  /** 错误消息 */
  message: TrimmedNonEmptyStringSchema,
  /** 错误分类 */
  class: Schema.optional(RuntimeErrorClass),
  /** 详细信息 */
  detail: Schema.optional(Schema.Unknown),
});
export type RuntimeErrorPayload = typeof RuntimeErrorPayload.Type;

/**
 * Provider 运行时事件定义
 *
 * 以下是所有具体的事件类型定义，每个事件都继承自 ProviderRuntimeEventBase，
 * 并包含特定类型的负载数据。事件类型包括：
 *
 * 会话事件：
 * - ProviderRuntimeSessionStartedEvent: 会话启动
 * - ProviderRuntimeSessionConfiguredEvent: 会话配置
 * - ProviderRuntimeSessionStateChangedEvent: 会话状态变化
 * - ProviderRuntimeSessionExitedEvent: 会话退出
 *
 * 线程事件：
 * - ProviderRuntimeThreadStartedEvent: 线程启动
 * - ProviderRuntimeThreadStateChangedEvent: 线程状态变化
 * - ProviderRuntimeThreadMetadataUpdatedEvent: 线程元数据更新
 * - ProviderRuntimeThreadTokenUsageUpdatedEvent: 线程 Token 使用量更新
 * - ProviderRuntimeThreadRealtimeStartedEvent: 实时会话启动
 * - ProviderRuntimeThreadRealtimeItemAddedEvent: 实时会话新增项目
 * - ProviderRuntimeThreadRealtimeAudioDeltaEvent: 实时会话音频增量
 * - ProviderRuntimeThreadRealtimeErrorEvent: 实时会话错误
 * - ProviderRuntimeThreadRealtimeClosedEvent: 实时会话关闭
 *
 * 轮次事件：
 * - ProviderRuntimeTurnStartedEvent: 轮次启动
 * - ProviderRuntimeTurnCompletedEvent: 轮次完成
 * - ProviderRuntimeTurnAbortedEvent: 轮次中止
 * - ProviderRuntimeTurnTasksUpdatedEvent: 轮次任务更新
 * - ProviderRuntimeTurnProposedDeltaEvent: 轮次提议增量
 * - ProviderRuntimeTurnProposedCompletedEvent: 轮次提议完成
 * - ProviderRuntimeTurnDiffUpdatedEvent: 轮次差异更新
 *
 * 项目事件：
 * - ProviderRuntimeItemStartedEvent: 项目启动
 * - ProviderRuntimeItemUpdatedEvent: 项目更新
 * - ProviderRuntimeItemCompletedEvent: 项目完成
 *
 * 内容事件：
 * - ProviderRuntimeContentDeltaEvent: 内容增量
 *
 * 请求事件：
 * - ProviderRuntimeRequestOpenedEvent: 请求打开
 * - ProviderRuntimeRequestResolvedEvent: 请求解决
 *
 * 用户输入事件：
 * - ProviderRuntimeUserInputRequestedEvent: 用户输入请求
 * - ProviderRuntimeUserInputResolvedEvent: 用户输入解决
 *
 * 任务事件：
 * - ProviderRuntimeTaskStartedEvent: 任务启动
 * - ProviderRuntimeTaskProgressEvent: 任务进度
 * - ProviderRuntimeTaskCompletedEvent: 任务完成
 *
 * 钩子事件：
 * - ProviderRuntimeHookStartedEvent: 钩子启动
 * - ProviderRuntimeHookProgressEvent: 钩子进度
 * - ProviderRuntimeHookCompletedEvent: 钩子完成
 *
 * 工具事件：
 * - ProviderRuntimeToolProgressEvent: 工具进度
 * - ProviderRuntimeToolSummaryEvent: 工具摘要
 *
 * 认证事件：
 * - ProviderRuntimeAuthStatusEvent: 认证状态
 *
 * 账户事件：
 * - ProviderRuntimeAccountUpdatedEvent: 账户更新
 * - ProviderRuntimeAccountRateLimitsUpdatedEvent: 账户速率限制更新
 *
 * MCP 事件：
 * - ProviderRuntimeMcpStatusUpdatedEvent: MCP 状态更新
 * - ProviderRuntimeMcpOauthCompletedEvent: MCP OAuth 完成
 *
 * 模型事件：
 * - ProviderRuntimeModelReroutedEvent: 模型重路由
 *
 * 配置事件：
 * - ProviderRuntimeConfigWarningEvent: 配置警告
 * - ProviderRuntimeDeprecationNoticeEvent: 弃用通知
 *
 * 文件事件：
 * - ProviderRuntimeFilesPersistedEvent: 文件持久化
 *
 * 运行时事件：
 * - ProviderRuntimeWarningEvent: 运行时警告
 * - ProviderRuntimeErrorEvent: 运行时错误
 */

/** 会话启动事件 */
const ProviderRuntimeSessionStartedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: SessionStartedType,
  payload: SessionStartedPayload,
});
export type ProviderRuntimeSessionStartedEvent = typeof ProviderRuntimeSessionStartedEvent.Type;

/** 会话配置事件 */
const ProviderRuntimeSessionConfiguredEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: SessionConfiguredType,
  payload: SessionConfiguredPayload,
});
export type ProviderRuntimeSessionConfiguredEvent =
  typeof ProviderRuntimeSessionConfiguredEvent.Type;

/** 会话状态变化事件 */
const ProviderRuntimeSessionStateChangedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: SessionStateChangedType,
  payload: SessionStateChangedPayload,
});
export type ProviderRuntimeSessionStateChangedEvent =
  typeof ProviderRuntimeSessionStateChangedEvent.Type;

/** 会话退出事件 */
const ProviderRuntimeSessionExitedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: SessionExitedType,
  payload: SessionExitedPayload,
});
export type ProviderRuntimeSessionExitedEvent = typeof ProviderRuntimeSessionExitedEvent.Type;

/** 线程启动事件 */
const ProviderRuntimeThreadStartedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ThreadStartedType,
  payload: ThreadStartedPayload,
});
export type ProviderRuntimeThreadStartedEvent = typeof ProviderRuntimeThreadStartedEvent.Type;

/** 线程状态变化事件 */
const ProviderRuntimeThreadStateChangedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ThreadStateChangedType,
  payload: ThreadStateChangedPayload,
});
export type ProviderRuntimeThreadStateChangedEvent =
  typeof ProviderRuntimeThreadStateChangedEvent.Type;

/** 线程元数据更新事件 */
const ProviderRuntimeThreadMetadataUpdatedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ThreadMetadataUpdatedType,
  payload: ThreadMetadataUpdatedPayload,
});
export type ProviderRuntimeThreadMetadataUpdatedEvent =
  typeof ProviderRuntimeThreadMetadataUpdatedEvent.Type;

/** 线程 Token 使用量更新事件 */
const ProviderRuntimeThreadTokenUsageUpdatedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ThreadTokenUsageUpdatedType,
  payload: ThreadTokenUsageUpdatedPayload,
});
export type ProviderRuntimeThreadTokenUsageUpdatedEvent =
  typeof ProviderRuntimeThreadTokenUsageUpdatedEvent.Type;

/** 实时会话启动事件 */
const ProviderRuntimeThreadRealtimeStartedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ThreadRealtimeStartedType,
  payload: ThreadRealtimeStartedPayload,
});
export type ProviderRuntimeThreadRealtimeStartedEvent =
  typeof ProviderRuntimeThreadRealtimeStartedEvent.Type;

/** 实时会话新增项目事件 */
const ProviderRuntimeThreadRealtimeItemAddedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ThreadRealtimeItemAddedType,
  payload: ThreadRealtimeItemAddedPayload,
});
export type ProviderRuntimeThreadRealtimeItemAddedEvent =
  typeof ProviderRuntimeThreadRealtimeItemAddedEvent.Type;

/** 实时会话音频增量事件 */
const ProviderRuntimeThreadRealtimeAudioDeltaEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ThreadRealtimeAudioDeltaType,
  payload: ThreadRealtimeAudioDeltaPayload,
});
export type ProviderRuntimeThreadRealtimeAudioDeltaEvent =
  typeof ProviderRuntimeThreadRealtimeAudioDeltaEvent.Type;

/** 实时会话错误事件 */
const ProviderRuntimeThreadRealtimeErrorEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ThreadRealtimeErrorType,
  payload: ThreadRealtimeErrorPayload,
});
export type ProviderRuntimeThreadRealtimeErrorEvent =
  typeof ProviderRuntimeThreadRealtimeErrorEvent.Type;

/** 实时会话关闭事件 */
const ProviderRuntimeThreadRealtimeClosedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ThreadRealtimeClosedType,
  payload: ThreadRealtimeClosedPayload,
});
export type ProviderRuntimeThreadRealtimeClosedEvent =
  typeof ProviderRuntimeThreadRealtimeClosedEvent.Type;

/** 轮次启动事件 */
const ProviderRuntimeTurnStartedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TurnStartedType,
  payload: TurnStartedPayload,
});
export type ProviderRuntimeTurnStartedEvent = typeof ProviderRuntimeTurnStartedEvent.Type;

/** 轮次完成事件 */
const ProviderRuntimeTurnCompletedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TurnCompletedType,
  payload: TurnCompletedPayload,
});
export type ProviderRuntimeTurnCompletedEvent = typeof ProviderRuntimeTurnCompletedEvent.Type;

/** 轮次中止事件 */
const ProviderRuntimeTurnAbortedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TurnAbortedType,
  payload: TurnAbortedPayload,
});
export type ProviderRuntimeTurnAbortedEvent = typeof ProviderRuntimeTurnAbortedEvent.Type;

/** 轮次任务更新事件 */
const ProviderRuntimeTurnTasksUpdatedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TurnTasksUpdatedType,
  payload: TurnTasksUpdatedPayload,
});
export type ProviderRuntimeTurnTasksUpdatedEvent = typeof ProviderRuntimeTurnTasksUpdatedEvent.Type;

/** 轮次提议增量事件 */
const ProviderRuntimeTurnProposedDeltaEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TurnProposedDeltaType,
  payload: TurnProposedDeltaPayload,
});
export type ProviderRuntimeTurnProposedDeltaEvent =
  typeof ProviderRuntimeTurnProposedDeltaEvent.Type;

/** 轮次提议完成事件 */
const ProviderRuntimeTurnProposedCompletedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TurnProposedCompletedType,
  payload: TurnProposedCompletedPayload,
});
export type ProviderRuntimeTurnProposedCompletedEvent =
  typeof ProviderRuntimeTurnProposedCompletedEvent.Type;

/** 轮次差异更新事件 */
const ProviderRuntimeTurnDiffUpdatedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TurnDiffUpdatedType,
  payload: TurnDiffUpdatedPayload,
});
export type ProviderRuntimeTurnDiffUpdatedEvent = typeof ProviderRuntimeTurnDiffUpdatedEvent.Type;

/** 项目启动事件 */
const ProviderRuntimeItemStartedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ItemStartedType,
  payload: ItemLifecyclePayload,
});
export type ProviderRuntimeItemStartedEvent = typeof ProviderRuntimeItemStartedEvent.Type;

/** 项目更新事件 */
const ProviderRuntimeItemUpdatedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ItemUpdatedType,
  payload: ItemLifecyclePayload,
});
export type ProviderRuntimeItemUpdatedEvent = typeof ProviderRuntimeItemUpdatedEvent.Type;

/** 项目完成事件 */
const ProviderRuntimeItemCompletedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ItemCompletedType,
  payload: ItemLifecyclePayload,
});
export type ProviderRuntimeItemCompletedEvent = typeof ProviderRuntimeItemCompletedEvent.Type;

/** 内容增量事件 */
const ProviderRuntimeContentDeltaEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ContentDeltaType,
  payload: ContentDeltaPayload,
});
export type ProviderRuntimeContentDeltaEvent = typeof ProviderRuntimeContentDeltaEvent.Type;

/** 请求打开事件 */
const ProviderRuntimeRequestOpenedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: RequestOpenedType,
  payload: RequestOpenedPayload,
});
export type ProviderRuntimeRequestOpenedEvent = typeof ProviderRuntimeRequestOpenedEvent.Type;

/** 请求解决事件 */
const ProviderRuntimeRequestResolvedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: RequestResolvedType,
  payload: RequestResolvedPayload,
});
export type ProviderRuntimeRequestResolvedEvent = typeof ProviderRuntimeRequestResolvedEvent.Type;

/** 用户输入请求事件 */
const ProviderRuntimeUserInputRequestedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: UserInputRequestedType,
  payload: UserInputRequestedPayload,
});
export type ProviderRuntimeUserInputRequestedEvent =
  typeof ProviderRuntimeUserInputRequestedEvent.Type;

/** 用户输入解决事件 */
const ProviderRuntimeUserInputResolvedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: UserInputResolvedType,
  payload: UserInputResolvedPayload,
});
export type ProviderRuntimeUserInputResolvedEvent =
  typeof ProviderRuntimeUserInputResolvedEvent.Type;

/** 任务启动事件 */
const ProviderRuntimeTaskStartedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TaskStartedType,
  payload: TaskStartedPayload,
});
export type ProviderRuntimeTaskStartedEvent = typeof ProviderRuntimeTaskStartedEvent.Type;

/** 任务进度事件 */
const ProviderRuntimeTaskProgressEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TaskProgressType,
  payload: TaskProgressPayload,
});
export type ProviderRuntimeTaskProgressEvent = typeof ProviderRuntimeTaskProgressEvent.Type;

/** 任务完成事件 */
const ProviderRuntimeTaskCompletedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: TaskCompletedType,
  payload: TaskCompletedPayload,
});
export type ProviderRuntimeTaskCompletedEvent = typeof ProviderRuntimeTaskCompletedEvent.Type;

/** 钩子启动事件 */
const ProviderRuntimeHookStartedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: HookStartedType,
  payload: HookStartedPayload,
});
export type ProviderRuntimeHookStartedEvent = typeof ProviderRuntimeHookStartedEvent.Type;

/** 钩子进度事件 */
const ProviderRuntimeHookProgressEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: HookProgressType,
  payload: HookProgressPayload,
});
export type ProviderRuntimeHookProgressEvent = typeof ProviderRuntimeHookProgressEvent.Type;

/** 钩子完成事件 */
const ProviderRuntimeHookCompletedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: HookCompletedType,
  payload: HookCompletedPayload,
});
export type ProviderRuntimeHookCompletedEvent = typeof ProviderRuntimeHookCompletedEvent.Type;

/** 工具进度事件 */
const ProviderRuntimeToolProgressEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ToolProgressType,
  payload: ToolProgressPayload,
});
export type ProviderRuntimeToolProgressEvent = typeof ProviderRuntimeToolProgressEvent.Type;

/** 工具摘要事件 */
const ProviderRuntimeToolSummaryEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ToolSummaryType,
  payload: ToolSummaryPayload,
});
export type ProviderRuntimeToolSummaryEvent = typeof ProviderRuntimeToolSummaryEvent.Type;

/** 认证状态事件 */
const ProviderRuntimeAuthStatusEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: AuthStatusType,
  payload: AuthStatusPayload,
});
export type ProviderRuntimeAuthStatusEvent = typeof ProviderRuntimeAuthStatusEvent.Type;

/** 账户更新事件 */
const ProviderRuntimeAccountUpdatedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: AccountUpdatedType,
  payload: AccountUpdatedPayload,
});
export type ProviderRuntimeAccountUpdatedEvent = typeof ProviderRuntimeAccountUpdatedEvent.Type;

/** 账户速率限制更新事件 */
const ProviderRuntimeAccountRateLimitsUpdatedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: AccountRateLimitsUpdatedType,
  payload: AccountRateLimitsUpdatedPayload,
});
export type ProviderRuntimeAccountRateLimitsUpdatedEvent =
  typeof ProviderRuntimeAccountRateLimitsUpdatedEvent.Type;

/** MCP 状态更新事件 */
const ProviderRuntimeMcpStatusUpdatedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: McpStatusUpdatedType,
  payload: McpStatusUpdatedPayload,
});
export type ProviderRuntimeMcpStatusUpdatedEvent = typeof ProviderRuntimeMcpStatusUpdatedEvent.Type;

/** MCP OAuth 完成事件 */
const ProviderRuntimeMcpOauthCompletedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: McpOauthCompletedType,
  payload: McpOauthCompletedPayload,
});
export type ProviderRuntimeMcpOauthCompletedEvent =
  typeof ProviderRuntimeMcpOauthCompletedEvent.Type;

/** 模型重路由事件 */
const ProviderRuntimeModelReroutedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ModelReroutedType,
  payload: ModelReroutedPayload,
});
export type ProviderRuntimeModelReroutedEvent = typeof ProviderRuntimeModelReroutedEvent.Type;

/** 配置警告事件 */
const ProviderRuntimeConfigWarningEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: ConfigWarningType,
  payload: ConfigWarningPayload,
});
export type ProviderRuntimeConfigWarningEvent = typeof ProviderRuntimeConfigWarningEvent.Type;

/** 弃用通知事件 */
const ProviderRuntimeDeprecationNoticeEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: DeprecationNoticeType,
  payload: DeprecationNoticePayload,
});
export type ProviderRuntimeDeprecationNoticeEvent =
  typeof ProviderRuntimeDeprecationNoticeEvent.Type;

/** 文件持久化事件 */
const ProviderRuntimeFilesPersistedEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: FilesPersistedType,
  payload: FilesPersistedPayload,
});
export type ProviderRuntimeFilesPersistedEvent = typeof ProviderRuntimeFilesPersistedEvent.Type;

/** 运行时警告事件 */
const ProviderRuntimeWarningEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: RuntimeWarningType,
  payload: RuntimeWarningPayload,
});
export type ProviderRuntimeWarningEvent = typeof ProviderRuntimeWarningEvent.Type;

/** 运行时错误事件 */
const ProviderRuntimeErrorEvent = Schema.Struct({
  ...ProviderRuntimeEventBase.fields,
  type: RuntimeErrorType,
  payload: RuntimeErrorPayload,
});
export type ProviderRuntimeErrorEvent = typeof ProviderRuntimeErrorEvent.Type;

/**
 * Provider 运行时事件联合类型
 *
 * 包含所有可能的运行时事件类型，用于类型安全的运行时事件处理。
 */
export const ProviderRuntimeEventV2 = Schema.Union([
  ProviderRuntimeSessionStartedEvent,
  ProviderRuntimeSessionConfiguredEvent,
  ProviderRuntimeSessionStateChangedEvent,
  ProviderRuntimeSessionExitedEvent,
  ProviderRuntimeThreadStartedEvent,
  ProviderRuntimeThreadStateChangedEvent,
  ProviderRuntimeThreadMetadataUpdatedEvent,
  ProviderRuntimeThreadTokenUsageUpdatedEvent,
  ProviderRuntimeThreadRealtimeStartedEvent,
  ProviderRuntimeThreadRealtimeItemAddedEvent,
  ProviderRuntimeThreadRealtimeAudioDeltaEvent,
  ProviderRuntimeThreadRealtimeErrorEvent,
  ProviderRuntimeThreadRealtimeClosedEvent,
  ProviderRuntimeTurnStartedEvent,
  ProviderRuntimeTurnCompletedEvent,
  ProviderRuntimeTurnAbortedEvent,
  ProviderRuntimeTurnTasksUpdatedEvent,
  ProviderRuntimeTurnProposedDeltaEvent,
  ProviderRuntimeTurnProposedCompletedEvent,
  ProviderRuntimeTurnDiffUpdatedEvent,
  ProviderRuntimeItemStartedEvent,
  ProviderRuntimeItemUpdatedEvent,
  ProviderRuntimeItemCompletedEvent,
  ProviderRuntimeContentDeltaEvent,
  ProviderRuntimeRequestOpenedEvent,
  ProviderRuntimeRequestResolvedEvent,
  ProviderRuntimeUserInputRequestedEvent,
  ProviderRuntimeUserInputResolvedEvent,
  ProviderRuntimeTaskStartedEvent,
  ProviderRuntimeTaskProgressEvent,
  ProviderRuntimeTaskCompletedEvent,
  ProviderRuntimeHookStartedEvent,
  ProviderRuntimeHookProgressEvent,
  ProviderRuntimeHookCompletedEvent,
  ProviderRuntimeToolProgressEvent,
  ProviderRuntimeToolSummaryEvent,
  ProviderRuntimeAuthStatusEvent,
  ProviderRuntimeAccountUpdatedEvent,
  ProviderRuntimeAccountRateLimitsUpdatedEvent,
  ProviderRuntimeMcpStatusUpdatedEvent,
  ProviderRuntimeMcpOauthCompletedEvent,
  ProviderRuntimeModelReroutedEvent,
  ProviderRuntimeConfigWarningEvent,
  ProviderRuntimeDeprecationNoticeEvent,
  ProviderRuntimeFilesPersistedEvent,
  ProviderRuntimeWarningEvent,
  ProviderRuntimeErrorEvent,
]);
export type ProviderRuntimeEventV2 = typeof ProviderRuntimeEventV2.Type;

/**
 * Provider 运行时事件
 *
 * 当前版本的运行时事件类型，等同于 ProviderRuntimeEventV2。
 */
export const ProviderRuntimeEvent = ProviderRuntimeEventV2;
export type ProviderRuntimeEvent = ProviderRuntimeEventV2;

// Compatibility aliases for call sites still importing legacy names.
/** 兼容性别名：消息增量事件 -> 内容增量事件 */
const ProviderRuntimeMessageDeltaEvent = ProviderRuntimeContentDeltaEvent;
export type ProviderRuntimeMessageDeltaEvent = ProviderRuntimeContentDeltaEvent;

/** 兼容性别名：消息完成事件 -> 项目完成事件 */
const ProviderRuntimeMessageCompletedEvent = ProviderRuntimeItemCompletedEvent;
export type ProviderRuntimeMessageCompletedEvent = ProviderRuntimeItemCompletedEvent;

/** 兼容性别名：工具启动事件 -> 项目启动事件 */
const ProviderRuntimeToolStartedEvent = ProviderRuntimeItemStartedEvent;
export type ProviderRuntimeToolStartedEvent = ProviderRuntimeItemStartedEvent;

/** 兼容性别名：工具完成事件 -> 项目完成事件 */
const ProviderRuntimeToolCompletedEvent = ProviderRuntimeItemCompletedEvent;
export type ProviderRuntimeToolCompletedEvent = ProviderRuntimeItemCompletedEvent;

/** 兼容性别名：审批请求事件 -> 请求打开事件 */
const ProviderRuntimeApprovalRequestedEvent = ProviderRuntimeRequestOpenedEvent;
export type ProviderRuntimeApprovalRequestedEvent = ProviderRuntimeRequestOpenedEvent;

/** 兼容性别名：审批解决事件 -> 请求解决事件 */
const ProviderRuntimeApprovalResolvedEvent = ProviderRuntimeRequestResolvedEvent;
export type ProviderRuntimeApprovalResolvedEvent = ProviderRuntimeRequestResolvedEvent;

// Legacy helper aliases retained for adapters/tests.
/** 兼容性别名：Provider 工具类型，用于适配器和测试 */
const ProviderRuntimeToolKind = Schema.Literals(["command", "file-read", "file-change", "other"]);
export type ProviderRuntimeToolKind = typeof ProviderRuntimeToolKind.Type;

/** 兼容性别名：Provider 轮次状态，用于适配器和测试 */
export const ProviderRuntimeTurnStatus = RuntimeTurnState;
export type ProviderRuntimeTurnStatus = RuntimeTurnState;
