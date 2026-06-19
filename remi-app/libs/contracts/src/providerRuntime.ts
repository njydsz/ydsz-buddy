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
import type { Option } from "effect";
import type {
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
import type { ProviderKind } from "./orchestration";

type UnknownRecord = Record<string, unknown>;

/** 运行时事件原始来源，标识事件来自哪个 Provider 的哪种通信渠道 */
type RuntimeEventRawSource =
  | "codex.app-server.notification"
  | "codex.app-server.request"
  | "codex.eventmsg"
  | "claude.sdk.message"
  | "claude.sdk.permission"
  | "codex.sdk.thread-event"
  | "gemini.acp.message"
  | "gemini.acp.stdout"
  | "gemini.acp.stderr"
  | "acp.jsonrpc"
  | "acp.cursor.extension"
  | "kilo.sdk.event"
  | "opencode.sdk.event"
  | "pi.sdk.event";

/** 运行时原始事件，包含来源、方法、消息类型和负载数据 */
export interface RuntimeEventRaw {
  /** 事件来源 */
  source: RuntimeEventRawSource;
  /** 方法名 */
  method?: TrimmedNonEmptyString;
  /** 消息类型 */
  messageType?: TrimmedNonEmptyString;
  /** 负载数据 */
  payload: unknown;
}

/** Provider 请求 ID 类型 */
type ProviderRequestId = TrimmedNonEmptyString;

/** Provider 引用信息，用于关联 Provider 层的线程、轮次、项目等 */
export interface ProviderRefs {
  /** Provider 线程 ID */
  providerThreadId?: TrimmedNonEmptyString;
  /** Provider 父线程 ID */
  providerParentThreadId?: TrimmedNonEmptyString;
  /** Provider 轮次 ID */
  providerTurnId?: TrimmedNonEmptyString;
  /** 父轮次的 Provider 轮次 ID */
  parentProviderTurnId?: TrimmedNonEmptyString;
  /** Provider 项目 ID */
  providerItemId?: ProviderItemId;
  /** Provider 请求 ID */
  providerRequestId?: ProviderRequestId;
}

/** 运行时会话状态枚举：启动中、就绪、运行中、等待、已停止、错误 */
type RuntimeSessionState = "starting" | "ready" | "running" | "waiting" | "stopped" | "error";

/** 运行时线程状态枚举：活跃、空闲、已归档、已关闭、已压缩、错误 */
type RuntimeThreadState = "active" | "idle" | "archived" | "closed" | "compacted" | "error";

/** 运行时轮次状态枚举：已完成、失败、已中断、已取消 */
type RuntimeTurnState = "completed" | "failed" | "interrupted" | "cancelled";

/** 运行时任务状态枚举：待处理、进行中、已完成 */
type RuntimeTaskStatus = "pending" | "inProgress" | "completed";

/** 运行时项目状态枚举：进行中、已完成、失败、已拒绝 */
type RuntimeItemStatus = "inProgress" | "completed" | "failed" | "declined";

/** 运行时内容流类型枚举：助手文本、推理文本、推理摘要、计划文本、命令输出、文件变更输出、未知 */
type RuntimeContentStreamKind =
  | "assistant_text"
  | "reasoning_text"
  | "reasoning_summary_text"
  | "plan_text"
  | "command_output"
  | "file_change_output"
  | "unknown";

/** 运行时会话退出类型枚举：优雅退出、错误退出 */
type RuntimeSessionExitKind = "graceful" | "error";

/** 运行时错误分类枚举：提供者错误、传输错误、权限错误、验证错误、未知错误 */
type RuntimeErrorClass =
  | "provider_error"
  | "transport_error"
  | "permission_error"
  | "validation_error"
  | "unknown";

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
export type ToolLifecycleItemType = (typeof TOOL_LIFECYCLE_ITEM_TYPES)[number];

/** 判断是否为工具生命周期项目类型 */
export function isToolLifecycleItemType(value: string): value is ToolLifecycleItemType {
  return TOOL_LIFECYCLE_ITEM_TYPES.includes(value as ToolLifecycleItemType);
}

/** 规范项目类型枚举：用户消息、助手消息、推理、计划、工具生命周期项目、审查进入、审查退出、上下文压缩、错误、未知 */
export type CanonicalItemType =
  | "user_message"
  | "assistant_message"
  | "reasoning"
  | "plan"
  | ToolLifecycleItemType
  | "review_entered"
  | "review_exited"
  | "context_compaction"
  | "error"
  | "unknown";

/** 规范请求类型枚举：命令执行审批、文件读取审批、文件变更审批、应用补丁审批、执行命令审批、工具用户输入、动态工具调用、认证令牌刷新、未知 */
export type CanonicalRequestType =
  | "command_execution_approval"
  | "file_read_approval"
  | "file_change_approval"
  | "apply_patch_approval"
  | "exec_command_approval"
  | "tool_user_input"
  | "dynamic_tool_call"
  | "auth_tokens_refresh"
  | "unknown";

/** Provider 运行时事件类型枚举，包含所有可能的事件类型 */
type ProviderRuntimeEventType =
  // 会话事件
  | "session.started"
  | "session.configured"
  | "session.state.changed"
  | "session.exited"
  // 线程事件
  | "thread.started"
  | "thread.state.changed"
  | "thread.metadata.updated"
  | "thread.token-usage.updated"
  | "thread.realtime.started"
  | "thread.realtime.item-added"
  | "thread.realtime.audio.delta"
  | "thread.realtime.error"
  | "thread.realtime.closed"
  // 轮次事件
  | "turn.started"
  | "turn.completed"
  | "turn.aborted"
  | "turn.tasks.updated"
  | "turn.proposed.delta"
  | "turn.proposed.completed"
  | "turn.diff.updated"
  // 项目事件
  | "item.started"
  | "item.updated"
  | "item.completed"
  // 内容事件
  | "content.delta"
  // 请求事件
  | "request.opened"
  | "request.resolved"
  // 用户输入事件
  | "user-input.requested"
  | "user-input.resolved"
  // 任务事件
  | "task.started"
  | "task.progress"
  | "task.completed"
  // 钩子事件
  | "hook.started"
  | "hook.progress"
  | "hook.completed"
  // 工具事件
  | "tool.progress"
  | "tool.summary"
  // 认证事件
  | "auth.status"
  // 账户事件
  | "account.updated"
  | "account.rate-limits.updated"
  // MCP 事件
  | "mcp.status.updated"
  | "mcp.oauth.completed"
  // 模型事件
  | "model.rerouted"
  // 配置事件
  | "config.warning"
  | "deprecation.notice"
  // 文件事件
  | "files.persisted"
  // 运行时事件
  | "runtime.warning"
  | "runtime.error";

/**
 * Provider 运行时事件基础结构
 *
 * 所有运行时事件的公共基础字段，包含事件 ID、提供者、线程、时间戳等信息。
 */
export interface ProviderRuntimeEventBase {
  /** 事件 ID */
  eventId: EventId;
  /** Provider 类型 */
  provider: ProviderKind;
  /** 线程 ID */
  threadId: ThreadId;
  /** 事件创建时间 */
  createdAt: IsoDateTime;
  /** 轮次 ID */
  turnId?: TurnId;
  /** 父轮次 ID */
  parentTurnId?: TurnId;
  /** 项目 ID */
  itemId?: RuntimeItemId;
  /** 请求 ID */
  requestId?: RuntimeRequestId;
  /** Provider 引用信息 */
  providerRefs?: ProviderRefs;
  /** 原始事件数据 */
  raw?: RuntimeEventRaw;
}

/** 会话启动事件负载 */
export interface SessionStartedPayload {
  /** 启动消息 */
  message?: TrimmedNonEmptyString;
  /** 恢复信息 */
  resume?: unknown;
}

/** 会话配置事件负载 */
export interface SessionConfiguredPayload {
  /** 配置信息 */
  config: UnknownRecord;
}

/** 会话状态变化事件负载 */
export interface SessionStateChangedPayload {
  /** 新状态 */
  state: RuntimeSessionState;
  /** 变化原因 */
  reason?: TrimmedNonEmptyString;
  /** 详细信息 */
  detail?: unknown;
}

/** 会话退出事件负载 */
export interface SessionExitedPayload {
  /** 退出原因 */
  reason?: TrimmedNonEmptyString;
  /** 是否可恢复 */
  recoverable?: boolean;
  /** 退出类型 */
  exitKind?: RuntimeSessionExitKind;
}

/** 线程启动事件负载 */
export interface ThreadStartedPayload {
  /** Provider 线程 ID */
  providerThreadId?: TrimmedNonEmptyString;
}

/** 线程状态变化事件负载 */
export interface ThreadStateChangedPayload {
  /** 新状态 */
  state: RuntimeThreadState;
  /** 详细信息 */
  detail?: unknown;
}

/** 线程元数据更新事件负载 */
export interface ThreadMetadataUpdatedPayload {
  /** 线程名称 */
  name?: TrimmedNonEmptyString;
  /** 元数据 */
  metadata?: UnknownRecord;
}

/**
 * 线程 Token 使用量快照
 *
 * 记录线程的 Token 使用情况，包括已使用 Token 数、百分比、各类 Token 统计等。
 */
export interface ThreadTokenUsageSnapshot {
  /** 已使用的 Token 数 */
  usedTokens: NonNegativeInt;
  /** 已使用百分比 */
  usedPercent?: number;
  /** 总处理 Token 数 */
  totalProcessedTokens?: NonNegativeInt;
  /** 最大 Token 数 */
  maxTokens?: PositiveInt;
  /** 输入 Token 数 */
  inputTokens?: NonNegativeInt;
  /** 缓存输入 Token 数 */
  cachedInputTokens?: NonNegativeInt;
  /** 输出 Token 数 */
  outputTokens?: NonNegativeInt;
  /** 推理输出 Token 数 */
  reasoningOutputTokens?: NonNegativeInt;
  /** 上次使用的 Token 数 */
  lastUsedTokens?: NonNegativeInt;
  /** 上次输入 Token 数 */
  lastInputTokens?: NonNegativeInt;
  /** 上次缓存输入 Token 数 */
  lastCachedInputTokens?: NonNegativeInt;
  /** 上次输出 Token 数 */
  lastOutputTokens?: NonNegativeInt;
  /** 上次推理输出 Token 数 */
  lastReasoningOutputTokens?: NonNegativeInt;
  /** 工具使用次数 */
  toolUses?: NonNegativeInt;
  /** 持续时间（毫秒） */
  durationMs?: NonNegativeInt;
  /** 是否自动压缩 */
  compactsAutomatically?: boolean;
}

/** 线程 Token 使用量更新事件负载 */
export interface ThreadTokenUsageUpdatedPayload {
  /** Token 使用量快照 */
  usage: ThreadTokenUsageSnapshot;
}

/** 线程实时会话启动事件负载 */
export interface ThreadRealtimeStartedPayload {
  /** 实时会话 ID */
  realtimeSessionId?: TrimmedNonEmptyString;
}

/** 线程实时会话新增项目事件负载 */
export interface ThreadRealtimeItemAddedPayload {
  /** 新增的项目数据 */
  item: unknown;
}

/** 线程实时会话音频增量事件负载 */
export interface ThreadRealtimeAudioDeltaPayload {
  /** 音频数据 */
  audio: unknown;
}

/** 线程实时会话错误事件负载 */
export interface ThreadRealtimeErrorPayload {
  /** 错误消息 */
  message: TrimmedNonEmptyString;
}

/** 线程实时会话关闭事件负载 */
export interface ThreadRealtimeClosedPayload {
  /** 关闭原因 */
  reason?: TrimmedNonEmptyString;
}

/** 轮次启动事件负载 */
export interface TurnStartedPayload {
  /** 使用的模型 */
  model?: TrimmedNonEmptyString;
  /** 推理努力程度 */
  effort?: TrimmedNonEmptyString;
}

/** 轮次完成事件负载 */
export interface TurnCompletedPayload {
  /** 最终状态 */
  state: RuntimeTurnState;
  /** 停止原因 */
  stopReason?: TrimmedNonEmptyString | null;
  /** 使用情况 */
  usage?: unknown;
  /** 模型使用情况 */
  modelUsage?: UnknownRecord;
  /** 本次费用（美元） */
  totalCostUsd?: number;
  /** 累计费用（美元） */
  cumulativeCostUsd?: number;
  /** 错误消息 */
  errorMessage?: TrimmedNonEmptyString;
}

/** 轮次中止事件负载 */
export interface TurnAbortedPayload {
  /** 中止原因 */
  reason: TrimmedNonEmptyString;
}

/** 运行时任务列表项 */
export interface RuntimeTaskListItem {
  /** 任务描述 */
  task: TrimmedNonEmptyString;
  /** 任务状态 */
  status: RuntimeTaskStatus;
}

/** 轮次任务更新事件负载 */
export interface TurnTasksUpdatedPayload {
  /** 任务说明 */
  explanation?: TrimmedNonEmptyString | null;
  /** 任务列表 */
  tasks: RuntimeTaskListItem[];
}

/** 轮次提议增量事件负载 */
export interface TurnProposedDeltaPayload {
  /** 增量文本 */
  delta: string;
}

/** 轮次提议完成事件负载 */
export interface TurnProposedCompletedPayload {
  /** 计划 Markdown 内容 */
  planMarkdown: TrimmedNonEmptyString;
}

/** 轮次差异更新事件负载 */
export interface TurnDiffUpdatedPayload {
  /** 统一差异格式 */
  unifiedDiff: string;
}

/**
 * 项目生命周期负载
 *
 * 描述项目（Item）在生命周期中的状态变化，包括类型、状态、标题等。
 * 用于 item.started、item.updated、item.completed 事件。
 */
export interface ItemLifecyclePayload {
  /** 项目类型 */
  itemType: CanonicalItemType;
  /** 项目状态 */
  status?: RuntimeItemStatus;
  /** 项目标题 */
  title?: TrimmedNonEmptyString;
  /** 项目详情 */
  detail?: TrimmedNonEmptyString;
  /** 项目数据 */
  data?: unknown;
}

/** Codex 生成图片的产物类型常量 */
export const CODEX_GENERATED_IMAGE_ARTIFACT_KIND = "codex.generated_image" as const;

/**
 * Codex 生成图片的产物描述
 *
 * 描述 Codex 生成的图片产物，包含本地文件路径和调用 ID。
 */
export interface CodexGeneratedImageArtifact {
  /** 产物类型 */
  kind: typeof CODEX_GENERATED_IMAGE_ARTIFACT_KIND;
  /** 本地文件路径 */
  path: TrimmedNonEmptyString;
  /** 调用 ID */
  callId?: TrimmedNonEmptyString;
}

/**
 * 内容增量负载
 *
 * 描述流式输出的文本增量，包括流类型、增量文本和索引信息。
 * 用于 content.delta 事件。
 */
export interface ContentDeltaPayload {
  /** 流类型 */
  streamKind: RuntimeContentStreamKind;
  /** 增量文本 */
  delta: string;
  /** 内容索引 */
  contentIndex?: number;
  /** 摘要索引 */
  summaryIndex?: number;
}

/**
 * 请求打开负载
 *
 * 描述审批请求的开启，包括请求类型、详情和参数。
 * 用于 request.opened 事件。
 */
export interface RequestOpenedPayload {
  /** 请求类型 */
  requestType: CanonicalRequestType;
  /** 请求详情 */
  detail?: TrimmedNonEmptyString;
  /** 请求参数 */
  args?: unknown;
}

/**
 * 请求解决负载
 *
 * 描述审批请求的解决结果，包括请求类型、决策和解决方案。
 * 用于 request.resolved 事件。
 */
export interface RequestResolvedPayload {
  /** 请求类型 */
  requestType: CanonicalRequestType;
  /** 用户决策 */
  decision?: TrimmedNonEmptyString;
  /** 解决方案 */
  resolution?: unknown;
}

/** 用户输入问题选项 */
export interface UserInputQuestionOption {
  /** 选项标签 */
  label: TrimmedNonEmptyString;
  /** 选项描述 */
  description: TrimmedNonEmptyString;
}

/**
 * 用户输入问题
 *
 * 描述需要用户回答的问题，包括问题 ID、标题、问题文本和选项列表。
 * 用于 user-input.requested 事件。
 */
export interface UserInputQuestion {
  /** 问题 ID */
  id: TrimmedNonEmptyString;
  /** 问题标题 */
  header: TrimmedNonEmptyString;
  /** 问题文本 */
  question: TrimmedNonEmptyString;
  /** 选项列表 */
  options: UserInputQuestionOption[];
  /** 是否多选 */
  multiSelect?: boolean;
}

/** 用户输入请求事件负载 */
export interface UserInputRequestedPayload {
  /** 问题列表 */
  questions: UserInputQuestion[];
}

/** 用户输入解决事件负载 */
export interface UserInputResolvedPayload {
  /** 用户答案 */
  answers: UnknownRecord;
}

/** 任务启动事件负载 */
export interface TaskStartedPayload {
  /** 任务 ID */
  taskId: RuntimeTaskId;
  /** 任务描述 */
  description?: TrimmedNonEmptyString;
  /** 任务类型 */
  taskType?: TrimmedNonEmptyString;
}

/** 任务进度事件负载 */
export interface TaskProgressPayload {
  /** 任务 ID */
  taskId: RuntimeTaskId;
  /** 进度描述 */
  description: TrimmedNonEmptyString;
  /** 进度摘要 */
  summary?: TrimmedNonEmptyString;
  /** 使用情况 */
  usage?: unknown;
  /** 最后使用的工具名称 */
  lastToolName?: TrimmedNonEmptyString;
}

/** 任务完成事件负载 */
export interface TaskCompletedPayload {
  /** 任务 ID */
  taskId: RuntimeTaskId;
  /** 完成状态 */
  status: "completed" | "failed" | "stopped";
  /** 完成摘要 */
  summary?: TrimmedNonEmptyString;
  /** 使用情况 */
  usage?: unknown;
}

/** 钩子启动事件负载 */
export interface HookStartedPayload {
  /** 钩子 ID */
  hookId: TrimmedNonEmptyString;
  /** 钩子名称 */
  hookName: TrimmedNonEmptyString;
  /** 钩子事件 */
  hookEvent: TrimmedNonEmptyString;
}

/** 钩子进度事件负载 */
export interface HookProgressPayload {
  /** 钩子 ID */
  hookId: TrimmedNonEmptyString;
  /** 输出内容 */
  output?: string;
  /** 标准输出 */
  stdout?: string;
  /** 标准错误 */
  stderr?: string;
}

/** 钩子完成事件负载 */
export interface HookCompletedPayload {
  /** 钩子 ID */
  hookId: TrimmedNonEmptyString;
  /** 完成结果 */
  outcome: "success" | "error" | "cancelled";
  /** 输出内容 */
  output?: string;
  /** 标准输出 */
  stdout?: string;
  /** 标准错误 */
  stderr?: string;
  /** 退出码 */
  exitCode?: number;
}

/** 工具进度事件负载 */
export interface ToolProgressPayload {
  /** 工具使用 ID */
  toolUseId?: TrimmedNonEmptyString;
  /** 工具名称 */
  toolName?: TrimmedNonEmptyString;
  /** 进度摘要 */
  summary?: TrimmedNonEmptyString;
  /** 已用时间（秒） */
  elapsedSeconds?: number;
}

/** 工具摘要事件负载 */
export interface ToolSummaryPayload {
  /** 摘要内容 */
  summary: TrimmedNonEmptyString;
  /** 前置工具使用 ID 列表 */
  precedingToolUseIds?: TrimmedNonEmptyString[];
}

/** 认证状态事件负载 */
export interface AuthStatusPayload {
  /** 是否正在认证 */
  isAuthenticating?: boolean;
  /** 输出信息 */
  output?: string[];
  /** 错误信息 */
  error?: TrimmedNonEmptyString;
}

/** 账户更新事件负载 */
export interface AccountUpdatedPayload {
  /** 账户信息 */
  account: unknown;
}

/** 账户速率限制更新事件负载 */
export interface AccountRateLimitsUpdatedPayload {
  /** 速率限制信息 */
  rateLimits: unknown;
}

/** MCP 状态更新事件负载 */
export interface McpStatusUpdatedPayload {
  /** MCP 状态信息 */
  status: unknown;
}

/** MCP OAuth 完成事件负载 */
export interface McpOauthCompletedPayload {
  /** 是否成功 */
  success: boolean;
  /** 名称 */
  name?: TrimmedNonEmptyString;
  /** 错误信息 */
  error?: TrimmedNonEmptyString;
}

/** 模型重路由事件负载 */
export interface ModelReroutedPayload {
  /** 原模型 */
  fromModel: TrimmedNonEmptyString;
  /** 新模型 */
  toModel: TrimmedNonEmptyString;
  /** 重路由原因 */
  reason: TrimmedNonEmptyString;
}

/** 配置警告事件负载 */
export interface ConfigWarningPayload {
  /** 警告摘要 */
  summary: TrimmedNonEmptyString;
  /** 详细信息 */
  details?: TrimmedNonEmptyString;
  /** 配置路径 */
  path?: TrimmedNonEmptyString;
  /** 配置范围 */
  range?: unknown;
}

/** 弃用通知事件负载 */
export interface DeprecationNoticePayload {
  /** 通知摘要 */
  summary: TrimmedNonEmptyString;
  /** 详细信息 */
  details?: TrimmedNonEmptyString;
}

/** 文件持久化事件负载 */
export interface FilesPersistedPayload {
  /** 成功持久化的文件列表 */
  files: Array<{
    /** 文件名 */
    filename: TrimmedNonEmptyString;
    /** 文件 ID */
    fileId: TrimmedNonEmptyString;
  }>;
  /** 失败的文件列表 */
  failed?: Array<{
    /** 文件名 */
    filename: TrimmedNonEmptyString;
    /** 错误信息 */
    error: TrimmedNonEmptyString;
  }>;
}

/** 运行时警告事件负载 */
export interface RuntimeWarningPayload {
  /** 警告消息 */
  message: TrimmedNonEmptyString;
  /** 详细信息 */
  detail?: unknown;
}

/** 运行时错误事件负载 */
export interface RuntimeErrorPayload {
  /** 错误消息 */
  message: TrimmedNonEmptyString;
  /** 错误分类 */
  class?: RuntimeErrorClass;
  /** 详细信息 */
  detail?: unknown;
}

// 事件类型定义
type SessionStartedType = "session.started";
type SessionConfiguredType = "session.configured";
type SessionStateChangedType = "session.state.changed";
type SessionExitedType = "session.exited";
type ThreadStartedType = "thread.started";
type ThreadStateChangedType = "thread.state.changed";
type ThreadMetadataUpdatedType = "thread.metadata.updated";
type ThreadTokenUsageUpdatedType = "thread.token-usage.updated";
type ThreadRealtimeStartedType = "thread.realtime.started";
type ThreadRealtimeItemAddedType = "thread.realtime.item-added";
type ThreadRealtimeAudioDeltaType = "thread.realtime.audio.delta";
type ThreadRealtimeErrorType = "thread.realtime.error";
type ThreadRealtimeClosedType = "thread.realtime.closed";
type TurnStartedType = "turn.started";
type TurnCompletedType = "turn.completed";
type TurnAbortedType = "turn.aborted";
type TurnTasksUpdatedType = "turn.tasks.updated";
type TurnProposedDeltaType = "turn.proposed.delta";
type TurnProposedCompletedType = "turn.proposed.completed";
type TurnDiffUpdatedType = "turn.diff.updated";
type ItemStartedType = "item.started";
type ItemUpdatedType = "item.updated";
type ItemCompletedType = "item.completed";
type ContentDeltaType = "content.delta";
type RequestOpenedType = "request.opened";
type RequestResolvedType = "request.resolved";
type UserInputRequestedType = "user-input.requested";
type UserInputResolvedType = "user-input.resolved";
type TaskStartedType = "task.started";
type TaskProgressType = "task.progress";
type TaskCompletedType = "task.completed";
type HookStartedType = "hook.started";
type HookProgressType = "hook.progress";
type HookCompletedType = "hook.completed";
type ToolProgressType = "tool.progress";
type ToolSummaryType = "tool.summary";
type AuthStatusType = "auth.status";
type AccountUpdatedType = "account.updated";
type AccountRateLimitsUpdatedType = "account.rate-limits.updated";
type McpStatusUpdatedType = "mcp.status.updated";
type McpOauthCompletedType = "mcp.oauth.completed";
type ModelReroutedType = "model.rerouted";
type ConfigWarningType = "config.warning";
type DeprecationNoticeType = "deprecation.notice";
type FilesPersistedType = "files.persisted";
type RuntimeWarningType = "runtime.warning";
type RuntimeErrorType = "runtime.error";

/** 会话启动事件 */
export interface ProviderRuntimeSessionStartedEvent extends ProviderRuntimeEventBase {
  type: SessionStartedType;
  payload: SessionStartedPayload;
}

/** 会话配置事件 */
export interface ProviderRuntimeSessionConfiguredEvent extends ProviderRuntimeEventBase {
  type: SessionConfiguredType;
  payload: SessionConfiguredPayload;
}

/** 会话状态变化事件 */
export interface ProviderRuntimeSessionStateChangedEvent extends ProviderRuntimeEventBase {
  type: SessionStateChangedType;
  payload: SessionStateChangedPayload;
}

/** 会话退出事件 */
export interface ProviderRuntimeSessionExitedEvent extends ProviderRuntimeEventBase {
  type: SessionExitedType;
  payload: SessionExitedPayload;
}

/** 线程启动事件 */
export interface ProviderRuntimeThreadStartedEvent extends ProviderRuntimeEventBase {
  type: ThreadStartedType;
  payload: ThreadStartedPayload;
}

/** 线程状态变化事件 */
export interface ProviderRuntimeThreadStateChangedEvent extends ProviderRuntimeEventBase {
  type: ThreadStateChangedType;
  payload: ThreadStateChangedPayload;
}

/** 线程元数据更新事件 */
export interface ProviderRuntimeThreadMetadataUpdatedEvent extends ProviderRuntimeEventBase {
  type: ThreadMetadataUpdatedType;
  payload: ThreadMetadataUpdatedPayload;
}

/** 线程 Token 使用量更新事件 */
export interface ProviderRuntimeThreadTokenUsageUpdatedEvent extends ProviderRuntimeEventBase {
  type: ThreadTokenUsageUpdatedType;
  payload: ThreadTokenUsageUpdatedPayload;
}

/** 实时会话启动事件 */
export interface ProviderRuntimeThreadRealtimeStartedEvent extends ProviderRuntimeEventBase {
  type: ThreadRealtimeStartedType;
  payload: ThreadRealtimeStartedPayload;
}

/** 实时会话新增项目事件 */
export interface ProviderRuntimeThreadRealtimeItemAddedEvent extends ProviderRuntimeEventBase {
  type: ThreadRealtimeItemAddedType;
  payload: ThreadRealtimeItemAddedPayload;
}

/** 实时会话音频增量事件 */
export interface ProviderRuntimeThreadRealtimeAudioDeltaEvent extends ProviderRuntimeEventBase {
  type: ThreadRealtimeAudioDeltaType;
  payload: ThreadRealtimeAudioDeltaPayload;
}

/** 实时会话错误事件 */
export interface ProviderRuntimeThreadRealtimeErrorEvent extends ProviderRuntimeEventBase {
  type: ThreadRealtimeErrorType;
  payload: ThreadRealtimeErrorPayload;
}

/** 实时会话关闭事件 */
export interface ProviderRuntimeThreadRealtimeClosedEvent extends ProviderRuntimeEventBase {
  type: ThreadRealtimeClosedType;
  payload: ThreadRealtimeClosedPayload;
}

/** 轮次启动事件 */
export interface ProviderRuntimeTurnStartedEvent extends ProviderRuntimeEventBase {
  type: TurnStartedType;
  payload: TurnStartedPayload;
}

/** 轮次完成事件 */
export interface ProviderRuntimeTurnCompletedEvent extends ProviderRuntimeEventBase {
  type: TurnCompletedType;
  payload: TurnCompletedPayload;
}

/** 轮次中止事件 */
export interface ProviderRuntimeTurnAbortedEvent extends ProviderRuntimeEventBase {
  type: TurnAbortedType;
  payload: TurnAbortedPayload;
}

/** 轮次任务更新事件 */
export interface ProviderRuntimeTurnTasksUpdatedEvent extends ProviderRuntimeEventBase {
  type: TurnTasksUpdatedType;
  payload: TurnTasksUpdatedPayload;
}

/** 轮次提议增量事件 */
export interface ProviderRuntimeTurnProposedDeltaEvent extends ProviderRuntimeEventBase {
  type: TurnProposedDeltaType;
  payload: TurnProposedDeltaPayload;
}

/** 轮次提议完成事件 */
export interface ProviderRuntimeTurnProposedCompletedEvent extends ProviderRuntimeEventBase {
  type: TurnProposedCompletedType;
  payload: TurnProposedCompletedPayload;
}

/** 轮次差异更新事件 */
export interface ProviderRuntimeTurnDiffUpdatedEvent extends ProviderRuntimeEventBase {
  type: TurnDiffUpdatedType;
  payload: TurnDiffUpdatedPayload;
}

/** 项目启动事件 */
export interface ProviderRuntimeItemStartedEvent extends ProviderRuntimeEventBase {
  type: ItemStartedType;
  payload: ItemLifecyclePayload;
}

/** 项目更新事件 */
export interface ProviderRuntimeItemUpdatedEvent extends ProviderRuntimeEventBase {
  type: ItemUpdatedType;
  payload: ItemLifecyclePayload;
}

/** 项目完成事件 */
export interface ProviderRuntimeItemCompletedEvent extends ProviderRuntimeEventBase {
  type: ItemCompletedType;
  payload: ItemLifecyclePayload;
}

/** 内容增量事件 */
export interface ProviderRuntimeContentDeltaEvent extends ProviderRuntimeEventBase {
  type: ContentDeltaType;
  payload: ContentDeltaPayload;
}

/** 请求打开事件 */
export interface ProviderRuntimeRequestOpenedEvent extends ProviderRuntimeEventBase {
  type: RequestOpenedType;
  payload: RequestOpenedPayload;
}

/** 请求解决事件 */
export interface ProviderRuntimeRequestResolvedEvent extends ProviderRuntimeEventBase {
  type: RequestResolvedType;
  payload: RequestResolvedPayload;
}

/** 用户输入请求事件 */
export interface ProviderRuntimeUserInputRequestedEvent extends ProviderRuntimeEventBase {
  type: UserInputRequestedType;
  payload: UserInputRequestedPayload;
}

/** 用户输入解决事件 */
export interface ProviderRuntimeUserInputResolvedEvent extends ProviderRuntimeEventBase {
  type: UserInputResolvedType;
  payload: UserInputResolvedPayload;
}

/** 任务启动事件 */
export interface ProviderRuntimeTaskStartedEvent extends ProviderRuntimeEventBase {
  type: TaskStartedType;
  payload: TaskStartedPayload;
}

/** 任务进度事件 */
export interface ProviderRuntimeTaskProgressEvent extends ProviderRuntimeEventBase {
  type: TaskProgressType;
  payload: TaskProgressPayload;
}

/** 任务完成事件 */
export interface ProviderRuntimeTaskCompletedEvent extends ProviderRuntimeEventBase {
  type: TaskCompletedType;
  payload: TaskCompletedPayload;
}

/** 钩子启动事件 */
export interface ProviderRuntimeHookStartedEvent extends ProviderRuntimeEventBase {
  type: HookStartedType;
  payload: HookStartedPayload;
}

/** 钩子进度事件 */
export interface ProviderRuntimeHookProgressEvent extends ProviderRuntimeEventBase {
  type: HookProgressType;
  payload: HookProgressPayload;
}

/** 钩子完成事件 */
export interface ProviderRuntimeHookCompletedEvent extends ProviderRuntimeEventBase {
  type: HookCompletedType;
  payload: HookCompletedPayload;
}

/** 工具进度事件 */
export interface ProviderRuntimeToolProgressEvent extends ProviderRuntimeEventBase {
  type: ToolProgressType;
  payload: ToolProgressPayload;
}

/** 工具摘要事件 */
export interface ProviderRuntimeToolSummaryEvent extends ProviderRuntimeEventBase {
  type: ToolSummaryType;
  payload: ToolSummaryPayload;
}

/** 认证状态事件 */
export interface ProviderRuntimeAuthStatusEvent extends ProviderRuntimeEventBase {
  type: AuthStatusType;
  payload: AuthStatusPayload;
}

/** 账户更新事件 */
export interface ProviderRuntimeAccountUpdatedEvent extends ProviderRuntimeEventBase {
  type: AccountUpdatedType;
  payload: AccountUpdatedPayload;
}

/** 账户速率限制更新事件 */
export interface ProviderRuntimeAccountRateLimitsUpdatedEvent extends ProviderRuntimeEventBase {
  type: AccountRateLimitsUpdatedType;
  payload: AccountRateLimitsUpdatedPayload;
}

/** MCP 状态更新事件 */
export interface ProviderRuntimeMcpStatusUpdatedEvent extends ProviderRuntimeEventBase {
  type: McpStatusUpdatedType;
  payload: McpStatusUpdatedPayload;
}

/** MCP OAuth 完成事件 */
export interface ProviderRuntimeMcpOauthCompletedEvent extends ProviderRuntimeEventBase {
  type: McpOauthCompletedType;
  payload: McpOauthCompletedPayload;
}

/** 模型重路由事件 */
export interface ProviderRuntimeModelReroutedEvent extends ProviderRuntimeEventBase {
  type: ModelReroutedType;
  payload: ModelReroutedPayload;
}

/** 配置警告事件 */
export interface ProviderRuntimeConfigWarningEvent extends ProviderRuntimeEventBase {
  type: ConfigWarningType;
  payload: ConfigWarningPayload;
}

/** 弃用通知事件 */
export interface ProviderRuntimeDeprecationNoticeEvent extends ProviderRuntimeEventBase {
  type: DeprecationNoticeType;
  payload: DeprecationNoticePayload;
}

/** 文件持久化事件 */
export interface ProviderRuntimeFilesPersistedEvent extends ProviderRuntimeEventBase {
  type: FilesPersistedType;
  payload: FilesPersistedPayload;
}

/** 运行时警告事件 */
export interface ProviderRuntimeWarningEvent extends ProviderRuntimeEventBase {
  type: RuntimeWarningType;
  payload: RuntimeWarningPayload;
}

/** 运行时错误事件 */
export interface ProviderRuntimeErrorEvent extends ProviderRuntimeEventBase {
  type: RuntimeErrorType;
  payload: RuntimeErrorPayload;
}

/**
 * Provider 运行时事件联合类型
 *
 * 包含所有可能的运行时事件类型，用于类型安全的运行时事件处理。
 */
export type ProviderRuntimeEventV2 =
  | ProviderRuntimeSessionStartedEvent
  | ProviderRuntimeSessionConfiguredEvent
  | ProviderRuntimeSessionStateChangedEvent
  | ProviderRuntimeSessionExitedEvent
  | ProviderRuntimeThreadStartedEvent
  | ProviderRuntimeThreadStateChangedEvent
  | ProviderRuntimeThreadMetadataUpdatedEvent
  | ProviderRuntimeThreadTokenUsageUpdatedEvent
  | ProviderRuntimeThreadRealtimeStartedEvent
  | ProviderRuntimeThreadRealtimeItemAddedEvent
  | ProviderRuntimeThreadRealtimeAudioDeltaEvent
  | ProviderRuntimeThreadRealtimeErrorEvent
  | ProviderRuntimeThreadRealtimeClosedEvent
  | ProviderRuntimeTurnStartedEvent
  | ProviderRuntimeTurnCompletedEvent
  | ProviderRuntimeTurnAbortedEvent
  | ProviderRuntimeTurnTasksUpdatedEvent
  | ProviderRuntimeTurnProposedDeltaEvent
  | ProviderRuntimeTurnProposedCompletedEvent
  | ProviderRuntimeTurnDiffUpdatedEvent
  | ProviderRuntimeItemStartedEvent
  | ProviderRuntimeItemUpdatedEvent
  | ProviderRuntimeItemCompletedEvent
  | ProviderRuntimeContentDeltaEvent
  | ProviderRuntimeRequestOpenedEvent
  | ProviderRuntimeRequestResolvedEvent
  | ProviderRuntimeUserInputRequestedEvent
  | ProviderRuntimeUserInputResolvedEvent
  | ProviderRuntimeTaskStartedEvent
  | ProviderRuntimeTaskProgressEvent
  | ProviderRuntimeTaskCompletedEvent
  | ProviderRuntimeHookStartedEvent
  | ProviderRuntimeHookProgressEvent
  | ProviderRuntimeHookCompletedEvent
  | ProviderRuntimeToolProgressEvent
  | ProviderRuntimeToolSummaryEvent
  | ProviderRuntimeAuthStatusEvent
  | ProviderRuntimeAccountUpdatedEvent
  | ProviderRuntimeAccountRateLimitsUpdatedEvent
  | ProviderRuntimeMcpStatusUpdatedEvent
  | ProviderRuntimeMcpOauthCompletedEvent
  | ProviderRuntimeModelReroutedEvent
  | ProviderRuntimeConfigWarningEvent
  | ProviderRuntimeDeprecationNoticeEvent
  | ProviderRuntimeFilesPersistedEvent
  | ProviderRuntimeWarningEvent
  | ProviderRuntimeErrorEvent;

/**
 * Provider 运行时事件
 *
 * 当前版本的运行时事件类型，等同于 ProviderRuntimeEventV2。
 */
export type ProviderRuntimeEvent = ProviderRuntimeEventV2;

// Compatibility aliases for call sites still importing legacy names.
/** 兼容性别名：消息增量事件 -> 内容增量事件 */
export type ProviderRuntimeMessageDeltaEvent = ProviderRuntimeContentDeltaEvent;

/** 兼容性别名：消息完成事件 -> 项目完成事件 */
export type ProviderRuntimeMessageCompletedEvent = ProviderRuntimeItemCompletedEvent;

/** 兼容性别名：工具启动事件 -> 项目启动事件 */
export type ProviderRuntimeToolStartedEvent = ProviderRuntimeItemStartedEvent;

/** 兼容性别名：工具完成事件 -> 项目完成事件 */
export type ProviderRuntimeToolCompletedEvent = ProviderRuntimeItemCompletedEvent;

/** 兼容性别名：审批请求事件 -> 请求打开事件 */
export type ProviderRuntimeApprovalRequestedEvent = ProviderRuntimeRequestOpenedEvent;

/** 兼容性别名：审批解决事件 -> 请求解决事件 */
export type ProviderRuntimeApprovalResolvedEvent = ProviderRuntimeRequestResolvedEvent;

// Legacy helper aliases retained for adapters/tests.
/** 兼容性别名：Provider 工具类型，用于适配器和测试 */
export type ProviderRuntimeToolKind = "command" | "file-read" | "file-change" | "other";

/** 兼容性别名：Provider 轮次状态，用于适配器和测试 */
export type ProviderRuntimeTurnStatus = RuntimeTurnState;
