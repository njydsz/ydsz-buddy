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
 * 这些类型在 Web 端和 Server 端之间共享，用于 WS/Native API 通信。
 */
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
type ProviderSessionStatus = "connecting" | "ready" | "running" | "error" | "closed";

/**
 * Provider 会话信息
 *
 * 表示一个活跃的 Provider 会话，包含会话状态、当前线程、模型配置等信息。
 * 用于跟踪会话的完整生命周期状态。
 */
export interface ProviderSession {
  /** Provider 类型（如 codex、claudeAgent 等） */
  provider: ProviderKind;
  /** 当前会话状态 */
  status: ProviderSessionStatus;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 工作目录 */
  cwd?: TrimmedNonEmptyString;
  /** 当前使用的模型 */
  model?: TrimmedNonEmptyString;
  /** 当前线程 ID */
  threadId: ThreadId;
  /** 恢复游标，用于会话恢复 */
  resumeCursor?: unknown;
  /** 当前活跃的轮次 ID */
  activeTurnId?: TurnId;
  /** 会话创建时间 */
  createdAt: IsoDateTime;
  /** 会话最后更新时间 */
  updatedAt: IsoDateTime;
  /** 最后发生的错误信息 */
  lastError?: TrimmedNonEmptyString;
}

/**
 * 启动 Provider 会话的输入参数
 *
 * 包含启动会话所需的所有配置选项，如线程 ID、Provider 类型、工作目录、
 * 模型选择、审批策略、沙箱模式等。
 */
export interface ProviderSessionStartInput {
  /** 线程 ID */
  threadId: ThreadId;
  /** Provider 类型，可选 */
  provider?: ProviderKind;
  /** 工作目录 */
  cwd?: TrimmedNonEmptyString;
  /** 模型选择配置 */
  modelSelection?: ModelSelection;
  /** 恢复游标，用于恢复之前的会话 */
  resumeCursor?: unknown;
  /** 审批策略配置 */
  approvalPolicy?: ProviderApprovalPolicy;
  /** 沙箱模式配置 */
  sandboxMode?: ProviderSandboxMode;
  /** Provider 特定的启动选项 */
  providerOptions?: ProviderStartOptions;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
}

/**
 * 发送对话轮次的输入参数
 *
 * 用于向 Provider 发送用户消息，支持文本输入、附件、技能引用、@提及等。
 * 输入内容受最大字符数和附件数量限制。
 */
export interface ProviderSendTurnInput {
  /** 线程 ID */
  threadId: ThreadId;
  /** 用户输入文本，受最大字符数限制 */
  input?: TrimmedNonEmptyString;
  /** 附件列表，受最大数量限制 */
  attachments?: Array<ChatAttachment>;
  /** 技能引用列表 */
  skills?: Array<ProviderSkillReference>;
  /** @提及引用列表 */
  mentions?: Array<ProviderMentionReference>;
  /** 模型选择配置 */
  modelSelection?: ModelSelection;
  /** 交互模式 */
  interactionMode?: ProviderInteractionMode;
}

/** 引导轮次输入，结构与发送轮次相同 */
export type ProviderSteerTurnInput = ProviderSendTurnInput;

/**
 * 分叉线程的输入参数
 *
 * 用于从现有线程创建新线程，可以指定不同的工作目录、模型配置等。
 * 分叉后的线程会继承源线程的部分上下文。
 */
export interface ProviderForkThreadInput {
  /** 源线程 ID */
  sourceThreadId: ThreadId;
  /** 新线程 ID */
  threadId: ThreadId;
  /** 源线程的恢复游标 */
  sourceResumeCursor?: unknown;
  /** 新线程的工作目录 */
  cwd?: TrimmedNonEmptyString;
  /** 新线程的模型选择 */
  modelSelection?: ModelSelection;
  /** Provider 特定选项 */
  providerOptions?: ProviderStartOptions;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
}

/** 分叉线程操作的结果 */
export interface ProviderForkThreadResult {
  /** 新创建的线程 ID */
  threadId: ThreadId;
  /** 新线程的恢复游标 */
  resumeCursor?: unknown;
}

/** 轮次启动操作的结果 */
export interface ProviderTurnStartResult {
  /** 线程 ID */
  threadId: ThreadId;
  /** 轮次 ID */
  turnId: TurnId;
  /** 恢复游标 */
  resumeCursor?: unknown;
}

/** 启动代码审查的输入参数 */
export interface ProviderStartReviewInput {
  /** 线程 ID */
  threadId: ThreadId;
  /** 审查目标 */
  target: ProviderReviewTarget;
}

/** 中断当前轮次的输入参数 */
export interface ProviderInterruptTurnInput {
  /** 线程 ID */
  threadId: ThreadId;
  /** 可选的轮次 ID，用于指定中断特定轮次 */
  turnId?: TurnId;
  /** Provider 线程 ID，用于底层通信 */
  providerThreadId?: TrimmedNonEmptyString;
}

/** 停止会话的输入参数 */
export interface ProviderStopSessionInput {
  /** 要停止的线程 ID */
  threadId: ThreadId;
}

/** 压缩线程上下文的输入参数 */
export interface ProviderCompactThreadInput {
  /** 要压缩的线程 ID */
  threadId: ThreadId;
}

/** 响应审批请求的输入参数 */
export interface ProviderRespondToRequestInput {
  /** 线程 ID */
  threadId: ThreadId;
  /** 请求 ID */
  requestId: ApprovalRequestId;
  /** 用户的审批决策 */
  decision: ProviderApprovalDecision;
}

/** 响应用户输入请求的输入参数 */
export interface ProviderRespondToUserInputInput {
  /** 线程 ID */
  threadId: ThreadId;
  /** 请求 ID */
  requestId: ApprovalRequestId;
  /** 用户的答案 */
  answers: ProviderUserInputAnswers;
}

/** Provider 事件类型枚举 */
type ProviderEventKind = "session" | "notification" | "request" | "error";

/**
 * Provider 事件
 *
 * 表示 Provider 产生的事件，包含事件的基本信息（ID、类型、时间戳）
 * 以及可选的详细数据（文本增量、负载、请求信息等）。
 * 事件用于在 Web 端和 Server 端之间传递 Provider 的状态变化和数据流。
 */
export interface ProviderEvent {
  /** 事件 ID */
  id: EventId;
  /** 事件类型 */
  kind: ProviderEventKind;
  /** Provider 类型 */
  provider: ProviderKind;
  /** 线程 ID */
  threadId: ThreadId;
  /** 事件创建时间 */
  createdAt: IsoDateTime;
  /** 事件方法名 */
  method: TrimmedNonEmptyString;
  /** 事件消息 */
  message?: TrimmedNonEmptyString;
  /** 轮次 ID */
  turnId?: TurnId;
  /** 父轮次 ID */
  parentTurnId?: TurnId;
  /** 项目 ID */
  itemId?: ProviderItemId;
  /** 请求 ID */
  requestId?: ApprovalRequestId;
  /** 请求类型 */
  requestKind?: ProviderRequestKind;
  /** Provider 线程 ID */
  providerThreadId?: TrimmedNonEmptyString;
  /** Provider 父线程 ID */
  providerParentThreadId?: TrimmedNonEmptyString;
  /** 文本增量，用于流式输出 */
  textDelta?: string;
  /** 事件负载数据 */
  payload?: unknown;
}
