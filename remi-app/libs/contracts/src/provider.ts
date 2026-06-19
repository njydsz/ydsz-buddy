/**
 * Provider 会话管理契约
 *
 * 定义 Provider 会话的生命周期管理数据结构，包括：
 * - 会话启动、停止、状态管理
 * - 对话轮次（Turn）的发送、引导、中断
 * - 线程（Thread）的创建与分叉
 * - 审批请求的用户响应
 * - Provider 事件流的数据结构
 *
 * 这些 Schema 在 Web 端和 Server 端之间共享，用于 WS/Native API 通信。
 */
import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";
import {
  ApprovalRequestId,
  EventId,
  IsoDateTime,
  ProviderItemId,
  ThreadId,
  TurnId,
} from "./baseSchemas";
import {
  ChatAttachment,
  ModelSelection,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  ProviderApprovalDecision,
  ProviderApprovalPolicy,
  ProviderInteractionMode,
  ProviderKind,
  ProviderRequestKind,
  ProviderReviewTarget,
  ProviderSandboxMode,
  ProviderStartOptions,
  ProviderUserInputAnswers,
  RuntimeMode,
} from "./orchestration";
import { ProviderMentionReference, ProviderSkillReference } from "./providerDiscovery";

/** Provider 会话状态枚举：连接中、就绪、运行中、错误、已关闭 */
const ProviderSessionStatus = Schema.Literals([
  "connecting",
  "ready",
  "running",
  "error",
  "closed",
]);

/**
 * Provider 会话信息
 *
 * 表示一个活跃的 Provider 会话，包含会话状态、当前线程、模型配置等信息。
 * 用于跟踪会话的完整生命周期状态。
 */
export const ProviderSession = Schema.Struct({
  /** Provider 类型（如 codex、claudeAgent 等） */
  provider: ProviderKind,
  /** 当前会话状态 */
  status: ProviderSessionStatus,
  /** 运行时模式 */
  runtimeMode: RuntimeMode,
  /** 工作目录 */
  cwd: Schema.optional(TrimmedNonEmptyString),
  /** 当前使用的模型 */
  model: Schema.optional(TrimmedNonEmptyString),
  /** 当前线程 ID */
  threadId: ThreadId,
  /** 恢复游标，用于会话恢复 */
  resumeCursor: Schema.optional(Schema.Unknown),
  /** 当前活跃的轮次 ID */
  activeTurnId: Schema.optional(TurnId),
  /** 会话创建时间 */
  createdAt: IsoDateTime,
  /** 会话最后更新时间 */
  updatedAt: IsoDateTime,
  /** 最后发生的错误信息 */
  lastError: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderSession = typeof ProviderSession.Type;

/**
 * 启动 Provider 会话的输入参数
 *
 * 包含启动会话所需的所有配置选项，如线程 ID、Provider 类型、工作目录、
 * 模型选择、审批策略、沙箱模式等。
 */
export const ProviderSessionStartInput = Schema.Struct({
  /** 线程 ID */
  threadId: ThreadId,
  /** Provider 类型，可选 */
  provider: Schema.optional(ProviderKind),
  /** 工作目录 */
  cwd: Schema.optional(TrimmedNonEmptyString),
  /** 模型选择配置 */
  modelSelection: Schema.optional(ModelSelection),
  /** 恢复游标，用于恢复之前的会话 */
  resumeCursor: Schema.optional(Schema.Unknown),
  /** 审批策略配置 */
  approvalPolicy: Schema.optional(ProviderApprovalPolicy),
  /** 沙箱模式配置 */
  sandboxMode: Schema.optional(ProviderSandboxMode),
  /** Provider 特定的启动选项 */
  providerOptions: Schema.optional(ProviderStartOptions),
  /** 运行时模式 */
  runtimeMode: RuntimeMode,
});
export type ProviderSessionStartInput = typeof ProviderSessionStartInput.Type;

/**
 * 发送对话轮次的输入参数
 *
 * 用于向 Provider 发送用户消息，支持文本输入、附件、技能引用、@提及等。
 * 输入内容受最大字符数和附件数量限制。
 */
export const ProviderSendTurnInput = Schema.Struct({
  /** 线程 ID */
  threadId: ThreadId,
  /** 用户输入文本，受最大字符数限制 */
  input: Schema.optional(
    TrimmedNonEmptyString.check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_INPUT_CHARS)),
  ),
  /** 附件列表，受最大数量限制 */
  attachments: Schema.optional(
    Schema.Array(ChatAttachment).check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS)),
  ),
  /** 技能引用列表 */
  skills: Schema.optional(Schema.Array(ProviderSkillReference)),
  /** @提及引用列表 */
  mentions: Schema.optional(Schema.Array(ProviderMentionReference)),
  /** 模型选择配置 */
  modelSelection: Schema.optional(ModelSelection),
  /** 交互模式 */
  interactionMode: Schema.optional(ProviderInteractionMode),
});
export type ProviderSendTurnInput = typeof ProviderSendTurnInput.Type;

/** 引导轮次输入，结构与发送轮次相同 */
export const ProviderSteerTurnInput = ProviderSendTurnInput;
export type ProviderSteerTurnInput = typeof ProviderSteerTurnInput.Type;

/**
 * 分叉线程的输入参数
 *
 * 用于从现有线程创建新线程，可以指定不同的工作目录、模型配置等。
 * 分叉后的线程会继承源线程的部分上下文。
 */
export const ProviderForkThreadInput = Schema.Struct({
  /** 源线程 ID */
  sourceThreadId: ThreadId,
  /** 新线程 ID */
  threadId: ThreadId,
  /** 源线程的恢复游标 */
  sourceResumeCursor: Schema.optional(Schema.Unknown),
  /** 新线程的工作目录 */
  cwd: Schema.optional(TrimmedNonEmptyString),
  /** 新线程的模型选择 */
  modelSelection: Schema.optional(ModelSelection),
  /** Provider 特定选项 */
  providerOptions: Schema.optional(ProviderStartOptions),
  /** 运行时模式 */
  runtimeMode: RuntimeMode,
});
export type ProviderForkThreadInput = typeof ProviderForkThreadInput.Type;

/** 分叉线程操作的结果 */
export const ProviderForkThreadResult = Schema.Struct({
  /** 新创建的线程 ID */
  threadId: ThreadId,
  /** 新线程的恢复游标 */
  resumeCursor: Schema.optional(Schema.Unknown),
});
export type ProviderForkThreadResult = typeof ProviderForkThreadResult.Type;

/** 轮次启动操作的结果 */
export const ProviderTurnStartResult = Schema.Struct({
  /** 线程 ID */
  threadId: ThreadId,
  /** 轮次 ID */
  turnId: TurnId,
  /** 恢复游标 */
  resumeCursor: Schema.optional(Schema.Unknown),
});
export type ProviderTurnStartResult = typeof ProviderTurnStartResult.Type;

/** 启动代码审查的输入参数 */
export const ProviderStartReviewInput = Schema.Struct({
  /** 线程 ID */
  threadId: ThreadId,
  /** 审查目标 */
  target: ProviderReviewTarget,
});
export type ProviderStartReviewInput = typeof ProviderStartReviewInput.Type;

/** 中断当前轮次的输入参数 */
export const ProviderInterruptTurnInput = Schema.Struct({
  /** 线程 ID */
  threadId: ThreadId,
  /** 可选的轮次 ID，用于指定中断特定轮次 */
  turnId: Schema.optional(TurnId),
  /** Provider 线程 ID，用于底层通信 */
  providerThreadId: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderInterruptTurnInput = typeof ProviderInterruptTurnInput.Type;

/** 停止会话的输入参数 */
export const ProviderStopSessionInput = Schema.Struct({
  /** 要停止的线程 ID */
  threadId: ThreadId,
});
export type ProviderStopSessionInput = typeof ProviderStopSessionInput.Type;

/** 压缩线程上下文的输入参数 */
export const ProviderCompactThreadInput = Schema.Struct({
  /** 要压缩的线程 ID */
  threadId: ThreadId,
});
export type ProviderCompactThreadInput = typeof ProviderCompactThreadInput.Type;

/** 响应审批请求的输入参数 */
export const ProviderRespondToRequestInput = Schema.Struct({
  /** 线程 ID */
  threadId: ThreadId,
  /** 请求 ID */
  requestId: ApprovalRequestId,
  /** 用户的审批决策 */
  decision: ProviderApprovalDecision,
});
export type ProviderRespondToRequestInput = typeof ProviderRespondToRequestInput.Type;

/** 响应用户输入请求的输入参数 */
export const ProviderRespondToUserInputInput = Schema.Struct({
  /** 线程 ID */
  threadId: ThreadId,
  /** 请求 ID */
  requestId: ApprovalRequestId,
  /** 用户的答案 */
  answers: ProviderUserInputAnswers,
});
export type ProviderRespondToUserInputInput = typeof ProviderRespondToUserInputInput.Type;

/** Provider 事件类型枚举 */
const ProviderEventKind = Schema.Literals(["session", "notification", "request", "error"]);

/**
 * Provider 事件
 *
 * 表示 Provider 产生的事件，包含事件的基本信息（ID、类型、时间戳）
 * 以及可选的详细数据（文本增量、负载、请求信息等）。
 * 事件用于在 Web 端和 Server 端之间传递 Provider 的状态变化和数据流。
 */
export const ProviderEvent = Schema.Struct({
  /** 事件 ID */
  id: EventId,
  /** 事件类型 */
  kind: ProviderEventKind,
  /** Provider 类型 */
  provider: ProviderKind,
  /** 线程 ID */
  threadId: ThreadId,
  /** 事件创建时间 */
  createdAt: IsoDateTime,
  /** 事件方法名 */
  method: TrimmedNonEmptyString,
  /** 事件消息 */
  message: Schema.optional(TrimmedNonEmptyString),
  /** 轮次 ID */
  turnId: Schema.optional(TurnId),
  /** 父轮次 ID */
  parentTurnId: Schema.optional(TurnId),
  /** 项目 ID */
  itemId: Schema.optional(ProviderItemId),
  /** 请求 ID */
  requestId: Schema.optional(ApprovalRequestId),
  /** 请求类型 */
  requestKind: Schema.optional(ProviderRequestKind),
  /** Provider 线程 ID */
  providerThreadId: Schema.optional(TrimmedNonEmptyString),
  /** Provider 父线程 ID */
  providerParentThreadId: Schema.optional(TrimmedNonEmptyString),
  /** 文本增量，用于流式输出 */
  textDelta: Schema.optional(Schema.String),
  /** 事件负载数据 */
  payload: Schema.optional(Schema.Unknown),
});
export type ProviderEvent = typeof ProviderEvent.Type;
