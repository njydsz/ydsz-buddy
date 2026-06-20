/**
 * @file orchestration.ts
 * @description 编排系统核心定义。定义了项目、线程、消息、轮次、检查点等核心概念，
 * 以及编排命令、事件、状态快照等数据结构。
 *
 * 核心职责：
 * - 定义 Provider 类型（Codex、Claude、Cursor、Gemini 等）和模型选择
 * - 定义项目、线程、消息、轮次的完整数据结构
 * - 定义编排命令（创建项目/线程、启动轮次、审批响应等）
 * - 定义编排事件（项目创建、线程更新、消息发送等）
 * - 定义状态快照和流式事件推送格式
 *
 * 使用场景：
 * - 前端通过编排系统管理项目和线程
 * - 后端处理编排命令并生成事件
 * - WebSocket 通信使用这些类型进行序列化/反序列化
 */

import {
  ClaudeModelOptions,
  CodexModelOptions,
  CursorModelOptions,
  GeminiModelOptions,
  GrokModelOptions,
  OpenCodeModelOptions,
  PiModelOptions,
} from "./model";
import { ProviderMentionReference, ProviderSkillReference } from "./providerDiscovery";
import { ProjectKind } from "./project";
import {
  ApprovalRequestId,
  CheckpointRef,
  CommandId,
  EventId,
  IsoDateTime,
  MessageId,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  ProviderItemId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "./baseSchemas";

/** 编排系统 WebSocket RPC 方法名映射 */
export const ORCHESTRATION_WS_METHODS = {
  /** 获取完整状态快照 */
  getSnapshot: "orchestration.getSnapshot",
  /** 获取 Shell 快照（轻量级） */
  getShellSnapshot: "orchestration.getShellSnapshot",
  /** 分发编排命令 */
  dispatchCommand: "orchestration.dispatchCommand",
  /** 导入外部线程 */
  importThread: "orchestration.importThread",
  /** 修复状态 */
  repairState: "orchestration.repairState",
  /** 获取轮次差异 */
  getTurnDiff: "orchestration.getTurnDiff",
  /** 获取完整线程差异 */
  getFullThreadDiff: "orchestration.getFullThreadDiff",
  /** 重放事件 */
  replayEvents: "orchestration.replayEvents",
  /** 订阅 Shell 事件流 */
  subscribeShell: "orchestration.subscribeShell",
  /** 取消订阅 Shell 事件流 */
  unsubscribeShell: "orchestration.unsubscribeShell",
  /** 订阅线程事件流 */
  subscribeThread: "orchestration.subscribeThread",
  /** 取消订阅线程事件流 */
  unsubscribeThread: "orchestration.unsubscribeThread",
} as const;

/** 编排系统 WebSocket 推送通道名映射 */
export const ORCHESTRATION_WS_CHANNELS = {
  /** 领域事件通道（项目/线程级别事件） */
  domainEvent: "orchestration.domainEvent",
  /** Shell 事件通道（项目/线程的轻量级更新） */
  shellEvent: "orchestration.shellEvent",
  /** 线程事件通道（单个线程的详细事件流） */
  threadEvent: "orchestration.threadEvent",
} as const;

/** Provider 类型枚举 */
export type ProviderKind =
  | "codex"        // OpenAI Codex
  | "claudeAgent"  // Anthropic Claude
  | "cursor"       // Cursor
  | "gemini"       // Google Gemini
  | "grok"         // xAI Grok
  | "kilo"         // Kilo (基于 OpenCode)
  | "opencode"     // OpenCode
  | "pi";          // Pi

/** 默认 Provider 类型 */
export const DEFAULT_PROVIDER_KIND: ProviderKind = "codex";

/** Provider 审批策略 */
export type ProviderApprovalPolicy = 
  | "untrusted"    // 不信任，需要审批
  | "on-failure"   // 失败时审批
  | "on-request"   // 请求时审批
  | "never";       // 从不审批

/** Provider 沙箱模式 */
export type ProviderSandboxMode = 
  | "read-only"           // 只读模式
  | "workspace-write"     // 工作区写入模式
  | "danger-full-access"; // 危险：完全访问模式

/** Codex Provider 模型选择 */
export interface CodexModelSelection {
  /** Provider 类型标识 */
  provider: "codex";
  /** 模型名称 */
  model: TrimmedNonEmptyString;
  /** 模型选项（可选） */
  options?: CodexModelOptions;
}

/** Claude Provider 模型选择 */
export interface ClaudeModelSelection {
  /** Provider 类型标识 */
  provider: "claudeAgent";
  /** 模型名称 */
  model: TrimmedNonEmptyString;
  /** 模型选项（可选） */
  options?: ClaudeModelOptions;
}

/** Cursor Provider 模型选择 */
export interface CursorModelSelection {
  /** Provider 类型标识 */
  provider: "cursor";
  /** 模型名称 */
  model: TrimmedNonEmptyString;
  /** 模型选项（可选） */
  options?: CursorModelOptions;
}

/** Gemini Provider 模型选择 */
export interface GeminiModelSelection {
  /** Provider 类型标识 */
  provider: "gemini";
  /** 模型名称 */
  model: TrimmedNonEmptyString;
  /** 模型选项（可选） */
  options?: GeminiModelOptions;
}

/** Grok Provider 模型选择 */
export interface GrokModelSelection {
  /** Provider 类型标识 */
  provider: "grok";
  /** 模型名称 */
  model: TrimmedNonEmptyString;
  /** 模型选项（可选） */
  options?: GrokModelOptions;
}

/** OpenCode Provider 模型选择 */
export interface OpenCodeModelSelection {
  /** Provider 类型标识 */
  provider: "opencode";
  /** 模型名称 */
  model: TrimmedNonEmptyString;
  /** 模型选项（可选） */
  options?: OpenCodeModelOptions;
}

/** Kilo Provider 模型选择（基于 OpenCode） */
export interface KiloModelSelection {
  /** Provider 类型标识 */
  provider: "kilo";
  /** 模型名称 */
  model: TrimmedNonEmptyString;
  /** 模型选项（可选，使用 OpenCode 选项） */
  options?: OpenCodeModelOptions;
}

/** Pi Provider 模型选择 */
export interface PiModelSelection {
  /** Provider 类型标识 */
  provider: "pi";
  /** 模型名称 */
  model: TrimmedNonEmptyString;
  /** 模型选项（可选） */
  options?: PiModelOptions;
}

/** 模型选择联合类型，支持所有 Provider */
export type ModelSelection =
  | CodexModelSelection
  | ClaudeModelSelection
  | CursorModelSelection
  | GeminiModelSelection
  | GrokModelSelection
  | KiloModelSelection
  | OpenCodeModelSelection
  | PiModelSelection;

/** Codex Provider 启动选项 */
export interface CodexProviderStartOptions {
  /** 二进制文件路径（可选） */
  binaryPath?: TrimmedNonEmptyString;
  /** Codex 主目录路径（可选） */
  homePath?: TrimmedNonEmptyString;
}

/** Claude Provider 启动选项 */
export interface ClaudeProviderStartOptions {
  /** 二进制文件路径（可选） */
  binaryPath?: TrimmedNonEmptyString;
  /** 权限模式（可选） */
  permissionMode?: TrimmedNonEmptyString;
  /** 最大思考 token 数（可选） */
  maxThinkingTokens?: NonNegativeInt;
}

/** Gemini Provider 启动选项 */
export interface GeminiProviderStartOptions {
  /** 二进制文件路径（可选） */
  binaryPath?: TrimmedNonEmptyString;
}

/** Cursor Provider 启动选项 */
export interface CursorProviderStartOptions {
  /** 二进制文件路径（可选） */
  binaryPath?: TrimmedNonEmptyString;
  /** API 端点（可选） */
  apiEndpoint?: TrimmedNonEmptyString;
}

/** Grok Provider 启动选项 */
export interface GrokProviderStartOptions {
  /** 二进制文件路径（可选） */
  binaryPath?: TrimmedNonEmptyString;
}

/** OpenCode Provider 启动选项 */
export interface OpenCodeProviderStartOptions {
  /** 二进制文件路径（可选） */
  binaryPath?: TrimmedNonEmptyString;
  /** 服务器 URL（可选） */
  serverUrl?: TrimmedNonEmptyString;
  /** 服务器密码（可选） */
  serverPassword?: TrimmedNonEmptyString;
}

/** Kilo Provider 启动选项 */
export interface KiloProviderStartOptions {
  /** 二进制文件路径（可选） */
  binaryPath?: TrimmedNonEmptyString;
  /** 服务器 URL（可选） */
  serverUrl?: TrimmedNonEmptyString;
  /** 服务器密码（可选） */
  serverPassword?: TrimmedNonEmptyString;
}

/** Pi Provider 启动选项 */
export interface PiProviderStartOptions {
  /** 二进制文件路径（可选） */
  binaryPath?: TrimmedNonEmptyString;
  /** 代理目录（可选） */
  agentDir?: TrimmedNonEmptyString;
}

/** Provider 启动选项集合，按 Provider 类型分组 */
export interface ProviderStartOptions {
  /** Codex Provider 启动选项 */
  codex?: CodexProviderStartOptions;
  /** Claude Provider 启动选项 */
  claudeAgent?: ClaudeProviderStartOptions;
  /** Cursor Provider 启动选项 */
  cursor?: CursorProviderStartOptions;
  /** Gemini Provider 启动选项 */
  gemini?: GeminiProviderStartOptions;
  /** Grok Provider 启动选项 */
  grok?: GrokProviderStartOptions;
  /** Kilo Provider 启动选项 */
  kilo?: KiloProviderStartOptions;
  /** OpenCode Provider 启动选项 */
  opencode?: OpenCodeProviderStartOptions;
  /** Pi Provider 启动选项 */
  pi?: PiProviderStartOptions;
}

/** 运行时模式 */
export type RuntimeMode = 
  | "approval-required"  // 需要审批模式
  | "full-access";       // 完全访问模式

/** 默认运行时模式 */
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";

/** Provider 交互模式 */
export type ProviderInteractionMode = 
  | "default"   // 默认模式
  | "plan";     // 计划模式

/** 默认 Provider 交互模式 */
export const DEFAULT_PROVIDER_INTERACTION_MODE: ProviderInteractionMode = "default";

/** Provider 请求类型 */
export type ProviderRequestKind = 
  | "command"      // 命令执行
  | "file-read"    // 文件读取
  | "file-change"; // 文件修改

/** 助手消息交付模式 */
export type AssistantDeliveryMode = 
  | "buffered"   // 缓冲模式（完整消息）
  | "streaming"; // 流式模式（逐字输出）

/** 轮次分发模式 */
export type TurnDispatchMode = 
  | "queue"   // 队列模式（排队执行）
  | "steer";  // 引导模式（立即执行）

/** 默认轮次分发模式 */
export const DEFAULT_TURN_DISPATCH_MODE: TurnDispatchMode = "queue";

/** Provider 审查目标 */
export type ProviderReviewTarget =
  | { type: "uncommittedChanges" }  // 未提交的更改
  | { type: "baseBranch"; branch: TrimmedNonEmptyString };  // 基础分支

/** Provider 审批决策 */
export type ProviderApprovalDecision = 
  | "accept"            // 接受
  | "acceptForSession"  // 接受本次会话
  | "decline"           // 拒绝
  | "cancel";          // 取消

/** Provider 用户输入答案类型 */
export type ProviderUserInputAnswer = string | Array<string> | null;

/** Provider 用户输入答案集合 */
export type ProviderUserInputAnswers = Record<string, ProviderUserInputAnswer>;

/** 线程移交引导状态 */
export type ThreadHandoffBootstrapStatus = 
  | "pending"    // 待处理
  | "completed"; // 已完成

/** 线程环境模式 */
export type ThreadEnvironmentMode = 
  | "local"     // 本地环境
  | "worktree"; // 工作树环境

/** 编排消息来源 */
export type OrchestrationMessageSource = 
  | "native"        // 原生消息
  | "handoff-import" // 移交导入
  | "fork-import";  // 分叉导入

/** Provider 发送轮次最大输入字符数 */
export const PROVIDER_SEND_TURN_MAX_INPUT_CHARS = 120_000;

/** Provider 发送轮次最大附件数 */
export const PROVIDER_SEND_TURN_MAX_ATTACHMENTS = 8;

/** Provider 发送轮次最大图片字节数（10MB） */
export const PROVIDER_SEND_TURN_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Provider 发送轮次最大图片 Data URL 字符数（14MB） */
const PROVIDER_SEND_TURN_MAX_IMAGE_DATA_URL_CHARS = 14_000_000;

/** 聊天附件 ID 最大字符数 */
const CHAT_ATTACHMENT_ID_MAX_CHARS = 128;

/** 聊天助手选择文本最大字符数 */
export const CHAT_ASSISTANT_SELECTION_TEXT_MAX_CHARS = 4_000;

/** 关联 ID 类型（等同于命令 ID） */
export type CorrelationId = CommandId;

/** 聊天附件 ID 类型 */
type ChatAttachmentId = TrimmedNonEmptyString;

/** 聊天图片附件 */
export interface ChatImageAttachment {
  /** 附件类型标识 */
  type: "image";
  /** 附件唯一标识 */
  id: ChatAttachmentId;
  /** 图片名称 */
  name: TrimmedNonEmptyString;
  /** MIME 类型（如 image/png） */
  mimeType: TrimmedNonEmptyString;
  /** 文件大小（字节） */
  sizeBytes: NonNegativeInt;
}

/** 聊天助手选择附件 */
export interface ChatAssistantSelectionAttachment {
  /** 附件类型标识 */
  type: "assistant-selection";
  /** 附件唯一标识 */
  id: ChatAttachmentId;
  /** 关联的助手消息 ID */
  assistantMessageId: MessageId;
  /** 选中的文本内容 */
  text: TrimmedNonEmptyString;
}

/** 上传聊天图片附件（客户端使用） */
export interface UploadChatImageAttachment {
  /** 附件类型标识 */
  type: "image";
  /** 图片名称 */
  name: TrimmedNonEmptyString;
  /** MIME 类型 */
  mimeType: TrimmedNonEmptyString;
  /** 文件大小（字节） */
  sizeBytes: NonNegativeInt;
  /** Data URL 格式的图片数据 */
  dataUrl: TrimmedNonEmptyString;
}

/** 上传聊天助手选择附件（客户端使用） */
export interface UploadChatAssistantSelectionAttachment {
  /** 附件类型标识 */
  type: "assistant-selection";
  /** 关联的助手消息 ID */
  assistantMessageId: MessageId;
  /** 选中的文本内容 */
  text: TrimmedNonEmptyString;
}

/** 聊天附件联合类型 */
export type ChatAttachment = ChatImageAttachment | ChatAssistantSelectionAttachment;

/** 上传聊天附件联合类型（内部使用） */
type UploadChatAttachment = UploadChatImageAttachment | UploadChatAssistantSelectionAttachment;

/** 项目脚本图标类型 */
export type ProjectScriptIcon = 
  | "play"       // 播放
  | "test"       // 测试
  | "lint"       // 代码检查
  | "configure"  // 配置
  | "build"      // 构建
  | "debug";     // 调试

/** 项目脚本定义 */
export interface ProjectScript {
  /** 脚本唯一标识 */
  id: TrimmedNonEmptyString;
  /** 脚本显示名称 */
  name: TrimmedNonEmptyString;
  /** 脚本执行命令 */
  command: TrimmedNonEmptyString;
  /** 脚本图标 */
  icon: ProjectScriptIcon;
  /** 是否在工作树创建时运行 */
  runOnWorktreeCreate: boolean;
}

/** 编排项目定义 */
export interface OrchestrationProject {
  /** 项目唯一标识 */
  id: ProjectId;
  /** 项目类型（可选） */
  kind?: ProjectKind;
  /** 项目标题 */
  title: TrimmedNonEmptyString;
  /** 工作区根路径 */
  workspaceRoot: TrimmedNonEmptyString;
  /** 默认模型选择 */
  defaultModelSelection: ModelSelection | null;
  /** 项目脚本列表 */
  scripts: Array<ProjectScript>;
  /** 创建时间 */
  createdAt: IsoDateTime;
  /** 更新时间 */
  updatedAt: IsoDateTime;
  /** 删除时间（null 表示未删除） */
  deletedAt: IsoDateTime | null;
}

/** 编排项目 Shell（轻量级版本，用于列表展示） */
export interface OrchestrationProjectShell {
  /** 项目唯一标识 */
  id: ProjectId;
  /** 项目类型（可选） */
  kind?: ProjectKind;
  /** 项目标题 */
  title: TrimmedNonEmptyString;
  /** 工作区根路径 */
  workspaceRoot: TrimmedNonEmptyString;
  /** 默认模型选择 */
  defaultModelSelection: ModelSelection | null;
  /** 项目脚本列表 */
  scripts: Array<ProjectScript>;
  /** 创建时间 */
  createdAt: IsoDateTime;
  /** 更新时间 */
  updatedAt: IsoDateTime;
}

/** 编排消息角色 */
export type OrchestrationMessageRole = "user" | "assistant" | "system";

/** 编排消息定义 */
export interface OrchestrationMessage {
  /** 消息唯一标识 */
  id: MessageId;
  /** 消息角色（user/assistant/system） */
  role: OrchestrationMessageRole;
  /** 消息文本内容 */
  text: string;
  /** 消息附件列表（可选） */
  attachments?: Array<ChatAttachment>;
  /** 引用的技能列表（可选） */
  skills?: Array<ProviderSkillReference>;
  /** 提及的代理列表（可选） */
  mentions?: Array<ProviderMentionReference>;
  /** 分发模式（可选） */
  dispatchMode?: TurnDispatchMode;
  /** 关联的轮次 ID（null 表示未关联） */
  turnId: TurnId | null;
  /** 是否正在流式传输 */
  streaming: boolean;
  /** 消息来源 */
  source: OrchestrationMessageSource;
  /** 创建时间 */
  createdAt: IsoDateTime;
  /** 更新时间 */
  updatedAt: IsoDateTime;
}

/** 线程移交信息 */
export interface ThreadHandoff {
  /** 源线程 ID */
  sourceThreadId: ThreadId;
  /** 源 Provider 类型 */
  sourceProvider: ProviderKind;
  /** 导入时间 */
  importedAt: IsoDateTime;
  /** 引导状态 */
  bootstrapStatus: ThreadHandoffBootstrapStatus;
}

/** 编排建议计划 ID 类型 */
export type OrchestrationProposedPlanId = TrimmedNonEmptyString;

/** 编排建议计划定义 */
export interface OrchestrationProposedPlan {
  /** 计划唯一标识 */
  id: OrchestrationProposedPlanId;
  /** 关联的轮次 ID（可选） */
  turnId: TurnId | null;
  /** 计划 Markdown 内容 */
  planMarkdown: TrimmedNonEmptyString;
  /** 实现时间（null 表示未实现） */
  implementedAt: IsoDateTime | null;
  /** 实现该计划的线程 ID（可选） */
  implementationThreadId: ThreadId | null;
  /** 创建时间 */
  createdAt: IsoDateTime;
  /** 更新时间 */
  updatedAt: IsoDateTime;
}

/** 源建议计划引用（内部使用） */
interface SourceProposedPlanReference {
  /** 线程 ID */
  threadId: ThreadId;
  /** 计划 ID */
  planId: OrchestrationProposedPlanId;
}

/** 编排会话状态 */
export type OrchestrationSessionStatus =
  | "idle"         // 空闲
  | "starting"     // 启动中
  | "running"      // 运行中
  | "ready"        // 就绪
  | "interrupted"  // 已中断
  | "stopped"      // 已停止
  | "error";       // 错误

/** 编排会话定义 */
export interface OrchestrationSession {
  /** 关联的线程 ID */
  threadId: ThreadId;
  /** 会话状态 */
  status: OrchestrationSessionStatus;
  /** Provider 名称（可选） */
  providerName: TrimmedNonEmptyString | null;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 当前活跃的轮次 ID（可选） */
  activeTurnId: TurnId | null;
  /** 最后错误信息（可选） */
  lastError: TrimmedNonEmptyString | null;
  /** 更新时间 */
  updatedAt: IsoDateTime;
}

/** 编排检查点文件信息 */
export interface OrchestrationCheckpointFile {
  /** 文件路径 */
  path: TrimmedNonEmptyString;
  /** 文件类型/种类 */
  kind: TrimmedNonEmptyString;
  /** 新增行数 */
  additions: NonNegativeInt;
  /** 删除行数 */
  deletions: NonNegativeInt;
}

/** 编排检查点状态 */
export type OrchestrationCheckpointStatus = 
  | "ready"    // 就绪
  | "missing"  // 缺失
  | "error";   // 错误

/** 编排检查点摘要 */
export interface OrchestrationCheckpointSummary {
  /** 关联的轮次 ID */
  turnId: TurnId;
  /** 检查点轮次计数 */
  checkpointTurnCount: NonNegativeInt;
  /** 检查点引用标识 */
  checkpointRef: CheckpointRef;
  /** 检查点状态 */
  status: OrchestrationCheckpointStatus;
  /** 检查点文件列表 */
  files: Array<OrchestrationCheckpointFile>;
  /** 关联的助手消息 ID（可选） */
  assistantMessageId: MessageId | null;
  /** 完成时间 */
  completedAt: IsoDateTime;
}

/** 编排线程活动色调 */
export type OrchestrationThreadActivityTone = 
  | "info"      // 信息
  | "tool"      // 工具
  | "approval"  // 审批
  | "error";    // 错误

/** 编排线程活动定义 */
export interface OrchestrationThreadActivity {
  /** 活动唯一标识 */
  id: EventId;
  /** 活动色调（用于 UI 显示） */
  tone: OrchestrationThreadActivityTone;
  /** 活动类型标识 */
  kind: TrimmedNonEmptyString;
  /** 活动摘要描述 */
  summary: TrimmedNonEmptyString;
  /** 活动负载数据 */
  payload: unknown;
  /** 关联的轮次 ID（可选） */
  turnId: TurnId | null;
  /** 序列号（可选） */
  sequence?: NonNegativeInt;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 编排最新轮次状态（内部使用） */
type OrchestrationLatestTurnState = 
  | "running"      // 运行中
  | "interrupted"  // 已中断
  | "completed"    // 已完成
  | "error";       // 错误

/** 编排最新轮次信息 */
export interface OrchestrationLatestTurn {
  /** 轮次唯一标识 */
  turnId: TurnId;
  /** 轮次状态 */
  state: OrchestrationLatestTurnState;
  /** 请求时间 */
  requestedAt: IsoDateTime;
  /** 开始时间（可选） */
  startedAt: IsoDateTime | null;
  /** 完成时间（可选） */
  completedAt: IsoDateTime | null;
  /** 关联的助手消息 ID（可选） */
  assistantMessageId: MessageId | null;
  /** 源建议计划引用（可选） */
  sourceProposedPlan?: SourceProposedPlanReference;
}

/** 编排线程 Pull Request 信息 */
export interface OrchestrationThreadPullRequest {
  /** PR 编号 */
  number: PositiveInt;
  /** PR 标题 */
  title: TrimmedNonEmptyString;
  /** PR URL */
  url: string;
  /** 基础分支 */
  baseBranch: TrimmedNonEmptyString;
  /** 头部分支 */
  headBranch: TrimmedNonEmptyString;
  /** PR 状态 */
  state: "open" | "closed" | "merged";
}

/** 编排线程完整定义 */
export interface OrchestrationThread {
  /** 线程唯一标识 */
  id: ThreadId;
  /** 所属项目 ID */
  projectId: ProjectId;
  /** 线程标题 */
  title: TrimmedNonEmptyString;
  /** 模型选择配置 */
  modelSelection: ModelSelection;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 环境模式（可选） */
  envMode?: ThreadEnvironmentMode;
  /** 关联的 Git 分支 */
  branch: TrimmedNonEmptyString | null;
  /** 工作树路径 */
  worktreePath: TrimmedNonEmptyString | null;
  /** 关联工作树路径（可选） */
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  /** 关联工作树分支（可选） */
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  /** 关联工作树引用（可选） */
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  /** 分支创建流程是否完成（可选） */
  createBranchFlowCompleted?: boolean;
  /** 是否置顶（可选） */
  isPinned?: boolean;
  /** 父线程 ID（可选，用于线程树） */
  parentThreadId?: ThreadId | null;
  /** 子代理 ID（可选） */
  subagentAgentId?: TrimmedNonEmptyString | null;
  /** 子代理昵称（可选） */
  subagentNickname?: TrimmedNonEmptyString | null;
  /** 子代理角色（可选） */
  subagentRole?: TrimmedNonEmptyString | null;
  /** 分叉源线程 ID（可选） */
  forkSourceThreadId?: ThreadId | null;
  /** 侧聊源线程 ID（可选） */
  sidechatSourceThreadId?: ThreadId | null;
  /** 最后已知的 PR 信息（可选） */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  /** 最新轮次信息 */
  latestTurn: OrchestrationLatestTurn | null;
  /** 最后用户消息时间（可选） */
  latestUserMessageAt?: IsoDateTime | null;
  /** 是否有待审批项（可选） */
  hasPendingApprovals?: boolean;
  /** 是否有待用户输入（可选） */
  hasPendingUserInput?: boolean;
  /** 是否有可执行的建议计划（可选） */
  hasActionableProposedPlan?: boolean;
  /** 创建时间 */
  createdAt: IsoDateTime;
  /** 更新时间 */
  updatedAt: IsoDateTime;
  /** 归档时间（可选） */
  archivedAt?: IsoDateTime | null;
  /** 删除时间（null 表示未删除） */
  deletedAt: IsoDateTime | null;
  /** 线程移交信息 */
  handoff: ThreadHandoff | null;
  /** 消息列表 */
  messages: Array<OrchestrationMessage>;
  /** 建议计划列表 */
  proposedPlans: Array<OrchestrationProposedPlan>;
  /** 活动列表 */
  activities: Array<OrchestrationThreadActivity>;
  /** 检查点列表 */
  checkpoints: Array<OrchestrationCheckpointSummary>;
  /** 会话信息 */
  session: OrchestrationSession | null;
}

/** 编排线程 Shell（轻量级版本，用于列表展示） */
export interface OrchestrationThreadShell {
  /** 线程唯一标识 */
  id: ThreadId;
  /** 所属项目 ID */
  projectId: ProjectId;
  /** 线程标题 */
  title: TrimmedNonEmptyString;
  /** 模型选择配置 */
  modelSelection: ModelSelection;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 环境模式（可选） */
  envMode?: ThreadEnvironmentMode;
  /** 关联的 Git 分支 */
  branch: TrimmedNonEmptyString | null;
  /** 工作树路径 */
  worktreePath: TrimmedNonEmptyString | null;
  /** 关联工作树路径（可选） */
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  /** 关联工作树分支（可选） */
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  /** 关联工作树引用（可选） */
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  /** 分支创建流程是否完成（可选） */
  createBranchFlowCompleted?: boolean;
  /** 是否置顶（可选） */
  isPinned?: boolean;
  /** 父线程 ID（可选） */
  parentThreadId?: ThreadId | null;
  /** 子代理 ID（可选） */
  subagentAgentId?: TrimmedNonEmptyString | null;
  /** 子代理昵称（可选） */
  subagentNickname?: TrimmedNonEmptyString | null;
  /** 子代理角色（可选） */
  subagentRole?: TrimmedNonEmptyString | null;
  /** 分叉源线程 ID（可选） */
  forkSourceThreadId?: ThreadId | null;
  /** 侧聊源线程 ID（可选） */
  sidechatSourceThreadId?: ThreadId | null;
  /** 最后已知的 PR 信息（可选） */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  /** 最新轮次信息 */
  latestTurn: OrchestrationLatestTurn | null;
  /** 最后用户消息时间（可选） */
  latestUserMessageAt?: IsoDateTime | null;
  /** 是否有待审批项（可选） */
  hasPendingApprovals?: boolean;
  /** 是否有待用户输入（可选） */
  hasPendingUserInput?: boolean;
  /** 是否有可执行的建议计划（可选） */
  hasActionableProposedPlan?: boolean;
  /** 创建时间 */
  createdAt: IsoDateTime;
  /** 更新时间 */
  updatedAt: IsoDateTime;
  /** 归档时间（可选） */
  archivedAt?: IsoDateTime | null;
  /** 线程移交信息 */
  handoff: ThreadHandoff | null;
  /** 会话信息 */
  session: OrchestrationSession | null;
}

/** 编排读取模型（完整状态快照） */
export interface OrchestrationReadModel {
  /** 快照序列号 */
  snapshotSequence: NonNegativeInt;
  /** 项目列表 */
  projects: Array<OrchestrationProject>;
  /** 线程列表 */
  threads: Array<OrchestrationThread>;
  /** 更新时间 */
  updatedAt: IsoDateTime;
}

/** 编排 Shell 快照（轻量级状态快照） */
export interface OrchestrationShellSnapshot {
  /** 快照序列号 */
  snapshotSequence: NonNegativeInt;
  /** 项目 Shell 列表 */
  projects: Array<OrchestrationProjectShell>;
  /** 线程 Shell 列表 */
  threads: Array<OrchestrationThreadShell>;
  /** 更新时间 */
  updatedAt: IsoDateTime;
}

/** 编排 Shell 流事件（轻量级更新事件） */
export type OrchestrationShellStreamEvent =
  | {
      /** 事件类型：项目新增/更新 */
      kind: "project-upserted";
      /** 事件序列号 */
      sequence: NonNegativeInt;
      /** 项目 Shell 数据 */
      project: OrchestrationProjectShell;
    }
  | {
      /** 事件类型：项目删除 */
      kind: "project-removed";
      /** 事件序列号 */
      sequence: NonNegativeInt;
      /** 被删除的项目 ID */
      projectId: ProjectId;
    }
  | {
      /** 事件类型：线程新增/更新 */
      kind: "thread-upserted";
      /** 事件序列号 */
      sequence: NonNegativeInt;
      /** 线程 Shell 数据 */
      thread: OrchestrationThreadShell;
    }
  | {
      /** 事件类型：线程删除 */
      kind: "thread-removed";
      /** 事件序列号 */
      sequence: NonNegativeInt;
      /** 被删除的线程 ID */
      threadId: ThreadId;
    };

/** 编排 Shell 流条目（快照或事件） */
export type OrchestrationShellStreamItem =
  | {
      /** 条目类型：完整快照 */
      kind: "snapshot";
      /** Shell 快照数据 */
      snapshot: OrchestrationShellSnapshot;
    }
  | OrchestrationShellStreamEvent;

/** 项目创建命令 */
export interface ProjectCreateCommand {
  /** 命令类型标识 */
  type: "project.create";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 项目 ID */
  projectId: ProjectId;
  /** 项目类型（可选） */
  kind?: ProjectKind;
  /** 项目标题 */
  title: TrimmedNonEmptyString;
  /** 工作区根路径 */
  workspaceRoot: TrimmedNonEmptyString;
  /** 工作区根路径不存在时是否自动创建（可选） */
  createWorkspaceRootIfMissing?: boolean;
  /** 默认模型选择（可选） */
  defaultModelSelection?: ModelSelection | null;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 项目元数据更新命令（内部使用） */
interface ProjectMetaUpdateCommand {
  /** 命令类型标识 */
  type: "project.meta.update";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 项目 ID */
  projectId: ProjectId;
  /** 项目类型（可选） */
  kind?: ProjectKind;
  /** 项目标题（可选） */
  title?: TrimmedNonEmptyString;
  /** 工作区根路径（可选） */
  workspaceRoot?: TrimmedNonEmptyString;
  /** 默认模型选择（可选） */
  defaultModelSelection?: ModelSelection | null;
  /** 项目脚本列表（可选） */
  scripts?: Array<ProjectScript>;
}

/** 项目删除命令（内部使用） */
interface ProjectDeleteCommand {
  /** 命令类型标识 */
  type: "project.delete";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 项目 ID */
  projectId: ProjectId;
}

/** 线程创建命令（内部使用） */
interface ThreadCreateCommand {
  /** 命令类型标识 */
  type: "thread.create";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 所属项目 ID */
  projectId: ProjectId;
  /** 线程标题 */
  title: TrimmedNonEmptyString;
  /** 模型选择配置 */
  modelSelection: ModelSelection;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 环境模式（可选） */
  envMode?: ThreadEnvironmentMode;
  /** 关联的 Git 分支 */
  branch: TrimmedNonEmptyString | null;
  /** 工作树路径 */
  worktreePath: TrimmedNonEmptyString | null;
  /** 关联工作树路径（可选） */
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  /** 关联工作树分支（可选） */
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  /** 关联工作树引用（可选） */
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  /** 分支创建流程是否完成（可选） */
  createBranchFlowCompleted?: boolean;
  /** 是否置顶（可选） */
  isPinned?: boolean;
  /** 父线程 ID（可选） */
  parentThreadId?: ThreadId | null;
  /** 子代理 ID（可选） */
  subagentAgentId?: TrimmedNonEmptyString | null;
  /** 子代理昵称（可选） */
  subagentNickname?: TrimmedNonEmptyString | null;
  /** 子代理角色（可选） */
  subagentRole?: TrimmedNonEmptyString | null;
  /** 最后已知的 PR 信息（可选） */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程移交导入的消息定义 */
export interface ThreadHandoffImportedMessage {
  /** 消息 ID */
  messageId: MessageId;
  /** 消息角色（用户或助手） */
  role: "user" | "assistant";
  /** 消息文本内容 */
  text: string;
  /** 消息附件列表（可选） */
  attachments?: Array<ChatAttachment>;
  /** 创建时间 */
  createdAt: IsoDateTime;
  /** 更新时间 */
  updatedAt: IsoDateTime;
}

/** 线程移交创建命令（内部使用） */
interface ThreadHandoffCreateCommand {
  /** 命令类型标识 */
  type: "thread.handoff.create";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 新线程 ID */
  threadId: ThreadId;
  /** 源线程 ID */
  sourceThreadId: ThreadId;
  /** 所属项目 ID */
  projectId: ProjectId;
  /** 线程标题 */
  title: TrimmedNonEmptyString;
  /** 模型选择配置 */
  modelSelection: ModelSelection;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 环境模式（可选） */
  envMode?: ThreadEnvironmentMode;
  /** 关联的 Git 分支 */
  branch: TrimmedNonEmptyString | null;
  /** 工作树路径 */
  worktreePath: TrimmedNonEmptyString | null;
  /** 关联工作树路径（可选） */
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  /** 关联工作树分支（可选） */
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  /** 关联工作树引用（可选） */
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  /** 分支创建流程是否完成（可选） */
  createBranchFlowCompleted?: boolean;
  /** 导入的消息列表 */
  importedMessages: Array<ThreadHandoffImportedMessage>;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程分叉创建命令（内部使用） */
interface ThreadForkCreateCommand {
  /** 命令类型标识 */
  type: "thread.fork.create";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 新线程 ID */
  threadId: ThreadId;
  /** 源线程 ID */
  sourceThreadId: ThreadId;
  /** 所属项目 ID */
  projectId: ProjectId;
  /** 线程标题 */
  title: TrimmedNonEmptyString;
  /** 模型选择配置 */
  modelSelection: ModelSelection;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 环境模式（可选） */
  envMode?: ThreadEnvironmentMode;
  /** 关联的 Git 分支 */
  branch: TrimmedNonEmptyString | null;
  /** 工作树路径 */
  worktreePath: TrimmedNonEmptyString | null;
  /** 关联工作树路径（可选） */
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  /** 关联工作树分支（可选） */
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  /** 关联工作树引用（可选） */
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  /** 分支创建流程是否完成（可选） */
  createBranchFlowCompleted?: boolean;
  /** 侧聊源线程 ID（可选） */
  sidechatSourceThreadId?: ThreadId | null;
  /** 导入的消息列表 */
  importedMessages: Array<ThreadHandoffImportedMessage>;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程删除命令（内部使用） */
interface ThreadDeleteCommand {
  /** 命令类型标识 */
  type: "thread.delete";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
}

/** 线程归档命令（内部使用） */
interface ThreadArchiveCommand {
  /** 命令类型标识 */
  type: "thread.archive";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
}

/** 线程取消归档命令（内部使用） */
interface ThreadUnarchiveCommand {
  /** 命令类型标识 */
  type: "thread.unarchive";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
}

/** 线程元数据更新命令（内部使用） */
interface ThreadMetaUpdateCommand {
  /** 命令类型标识 */
  type: "thread.meta.update";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 线程标题（可选） */
  title?: TrimmedNonEmptyString;
  /** 模型选择配置（可选） */
  modelSelection?: ModelSelection;
  /** 环境模式（可选） */
  envMode?: ThreadEnvironmentMode;
  /** 关联的 Git 分支（可选） */
  branch?: TrimmedNonEmptyString | null;
  /** 工作树路径（可选） */
  worktreePath?: TrimmedNonEmptyString | null;
  /** 关联工作树路径（可选） */
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  /** 关联工作树分支（可选） */
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  /** 关联工作树引用（可选） */
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  /** 分支创建流程是否完成（可选） */
  createBranchFlowCompleted?: boolean;
  /** 是否置顶（可选） */
  isPinned?: boolean;
  /** 父线程 ID（可选） */
  parentThreadId?: ThreadId | null;
  /** 子代理 ID（可选） */
  subagentAgentId?: TrimmedNonEmptyString | null;
  /** 子代理昵称（可选） */
  subagentNickname?: TrimmedNonEmptyString | null;
  /** 子代理角色（可选） */
  subagentRole?: TrimmedNonEmptyString | null;
  /** 线程移交信息（可选） */
  handoff?: ThreadHandoff | null;
  /** 最后已知的 PR 信息（可选） */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
}

/** 线程运行时模式设置命令（内部使用） */
interface ThreadRuntimeModeSetCommand {
  /** 命令类型标识 */
  type: "thread.runtime-mode.set";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程交互模式设置命令（内部使用） */
interface ThreadInteractionModeSetCommand {
  /** 命令类型标识 */
  type: "thread.interaction-mode.set";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程轮次启动命令（导出） */
export interface ThreadTurnStartCommand {
  /** 命令类型标识 */
  type: "thread.turn.start";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 用户消息 */
  message: {
    /** 消息 ID */
    messageId: MessageId;
    /** 消息角色（固定为 user） */
    role: "user";
    /** 消息文本内容 */
    text: string;
    /** 消息附件列表 */
    attachments: Array<ChatAttachment>;
    /** 引用的技能列表（可选） */
    skills?: Array<ProviderSkillReference>;
    /** 提及的代理列表（可选） */
    mentions?: Array<ProviderMentionReference>;
  };
  /** 模型选择配置（可选） */
  modelSelection?: ModelSelection;
  /** Provider 启动选项（可选） */
  providerOptions?: ProviderStartOptions;
  /** 审查目标（可选） */
  reviewTarget?: ProviderReviewTarget;
  /** 助手消息交付模式（可选） */
  assistantDeliveryMode?: AssistantDeliveryMode;
  /** 轮次分发模式（可选） */
  dispatchMode?: TurnDispatchMode;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 源建议计划引用（可选） */
  sourceProposedPlan?: SourceProposedPlanReference;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 客户端线程轮次启动命令（内部使用） */
interface ClientThreadTurnStartCommand {
  /** 命令类型标识 */
  type: "thread.turn.start";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 用户消息 */
  message: {
    /** 消息 ID */
    messageId: MessageId;
    /** 消息角色（固定为 user） */
    role: "user";
    /** 消息文本内容 */
    text: string;
    /** 消息附件列表（上传格式） */
    attachments: Array<UploadChatAttachment>;
    /** 引用的技能列表（可选） */
    skills?: Array<ProviderSkillReference>;
    /** 提及的代理列表（可选） */
    mentions?: Array<ProviderMentionReference>;
  };
  /** 模型选择配置（可选） */
  modelSelection?: ModelSelection;
  /** Provider 启动选项（可选） */
  providerOptions?: ProviderStartOptions;
  /** 审查目标（可选） */
  reviewTarget?: ProviderReviewTarget;
  /** 助手消息交付模式（可选） */
  assistantDeliveryMode?: AssistantDeliveryMode;
  /** 轮次分发模式（可选） */
  dispatchMode?: TurnDispatchMode;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 源建议计划引用（可选） */
  sourceProposedPlan?: SourceProposedPlanReference;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程轮次中断命令（内部使用） */
interface ThreadTurnInterruptCommand {
  /** 命令类型标识 */
  type: "thread.turn.interrupt";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 轮次 ID（可选，不指定则中断当前轮次） */
  turnId?: TurnId;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程分发排队轮次命令（内部使用） */
interface ThreadDispatchQueuedTurnCommand {
  /** 命令类型标识 */
  type: "thread.turn.dispatch-queued";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 消息 ID */
  messageId: MessageId;
  /** 模型选择配置（可选） */
  modelSelection?: ModelSelection;
  /** Provider 启动选项（可选） */
  providerOptions?: ProviderStartOptions;
  /** 审查目标（可选） */
  reviewTarget?: ProviderReviewTarget;
  /** 助手消息交付模式（可选） */
  assistantDeliveryMode?: AssistantDeliveryMode;
  /** 轮次分发模式（可选） */
  dispatchMode?: TurnDispatchMode;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 源建议计划引用（可选） */
  sourceProposedPlan?: SourceProposedPlanReference;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程审批响应命令（内部使用） */
interface ThreadApprovalRespondCommand {
  /** 命令类型标识 */
  type: "thread.approval.respond";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 审批请求 ID */
  requestId: ApprovalRequestId;
  /** 审批决策 */
  decision: ProviderApprovalDecision;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程用户输入响应命令（内部使用） */
interface ThreadUserInputRespondCommand {
  /** 命令类型标识 */
  type: "thread.user-input.respond";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 审批请求 ID */
  requestId: ApprovalRequestId;
  /** 用户输入答案 */
  answers: ProviderUserInputAnswers;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程检查点回退命令（内部使用） */
interface ThreadCheckpointRevertCommand {
  /** 命令类型标识 */
  type: "thread.checkpoint.revert";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 回退的轮次数 */
  turnCount: NonNegativeInt;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程对话回滚命令（内部使用） */
interface ThreadConversationRollbackCommand {
  /** 命令类型标识 */
  type: "thread.conversation.rollback";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 消息 ID */
  messageId: MessageId;
  /** 回滚的轮次数 */
  numTurns: NonNegativeInt;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程消息编辑并重新发送命令（内部使用） */
interface ThreadMessageEditAndResendCommand {
  /** 命令类型标识 */
  type: "thread.message.edit-and-resend";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 消息 ID */
  messageId: MessageId;
  /** 编辑后的文本 */
  text: TrimmedNonEmptyString;
  /** 模型选择配置（可选） */
  modelSelection?: ModelSelection;
  /** Provider 启动选项（可选） */
  providerOptions?: ProviderStartOptions;
  /** 助手消息交付模式（可选） */
  assistantDeliveryMode?: AssistantDeliveryMode;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程会话停止命令（内部使用） */
interface ThreadSessionStopCommand {
  /** 命令类型标识 */
  type: "thread.session.stop";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程活动追加命令（内部使用） */
interface ThreadActivityAppendCommand {
  /** 命令类型标识 */
  type: "thread.activity.append";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 活动数据 */
  activity: OrchestrationThreadActivity;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 可分发的客户端编排命令联合类型 */
export type DispatchableClientOrchestrationCommand =
  | ProjectCreateCommand
  | ProjectMetaUpdateCommand
  | ProjectDeleteCommand
  | ThreadCreateCommand
  | ThreadHandoffCreateCommand
  | ThreadForkCreateCommand
  | ThreadDeleteCommand
  | ThreadArchiveCommand
  | ThreadUnarchiveCommand
  | ThreadMetaUpdateCommand
  | ThreadRuntimeModeSetCommand
  | ThreadInteractionModeSetCommand
  | ThreadTurnStartCommand
  | ThreadTurnInterruptCommand
  | ThreadApprovalRespondCommand
  | ThreadUserInputRespondCommand
  | ThreadCheckpointRevertCommand
  | ThreadMessageEditAndResendCommand
  | ThreadActivityAppendCommand
  | ThreadSessionStopCommand;

/** 客户端编排命令联合类型（包含所有客户端可发送的命令） */
export type ClientOrchestrationCommand =
  | ProjectCreateCommand
  | ProjectMetaUpdateCommand
  | ProjectDeleteCommand
  | ThreadCreateCommand
  | ThreadHandoffCreateCommand
  | ThreadForkCreateCommand
  | ThreadDeleteCommand
  | ThreadArchiveCommand
  | ThreadUnarchiveCommand
  | ThreadMetaUpdateCommand
  | ThreadRuntimeModeSetCommand
  | ThreadInteractionModeSetCommand
  | ClientThreadTurnStartCommand
  | ThreadTurnInterruptCommand
  | ThreadApprovalRespondCommand
  | ThreadUserInputRespondCommand
  | ThreadCheckpointRevertCommand
  | ThreadMessageEditAndResendCommand
  | ThreadActivityAppendCommand
  | ThreadSessionStopCommand;

/** 线程会话设置命令（内部使用） */
interface ThreadSessionSetCommand {
  /** 命令类型标识 */
  type: "thread.session.set";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 会话数据 */
  session: OrchestrationSession;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程消息导入命令（内部使用） */
interface ThreadMessagesImportCommand {
  /** 命令类型标识 */
  type: "thread.messages.import";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 导入的消息列表 */
  messages: Array<ThreadHandoffImportedMessage>;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程助手消息增量更新命令（内部使用） */
interface ThreadMessageAssistantDeltaCommand {
  /** 命令类型标识 */
  type: "thread.message.assistant.delta";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 消息 ID */
  messageId: MessageId;
  /** 增量文本 */
  delta: string;
  /** 轮次 ID（可选） */
  turnId?: TurnId;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程助手消息完成命令（内部使用） */
interface ThreadMessageAssistantCompleteCommand {
  /** 命令类型标识 */
  type: "thread.message.assistant.complete";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 消息 ID */
  messageId: MessageId;
  /** 轮次 ID（可选） */
  turnId?: TurnId;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程建议计划新增/更新命令（内部使用） */
interface ThreadProposedPlanUpsertCommand {
  /** 命令类型标识 */
  type: "thread.proposed-plan.upsert";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 建议计划数据 */
  proposedPlan: OrchestrationProposedPlan;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程轮次差异完成命令（内部使用） */
interface ThreadTurnDiffCompleteCommand {
  /** 命令类型标识 */
  type: "thread.turn.diff.complete";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 轮次 ID */
  turnId: TurnId;
  /** 完成时间 */
  completedAt: IsoDateTime;
  /** 检查点引用 */
  checkpointRef: CheckpointRef;
  /** 检查点状态 */
  status: OrchestrationCheckpointStatus;
  /** 检查点文件列表 */
  files: Array<OrchestrationCheckpointFile>;
  /** 助手消息 ID（可选） */
  assistantMessageId?: MessageId;
  /** 检查点轮次计数 */
  checkpointTurnCount: NonNegativeInt;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程回退完成命令（内部使用） */
interface ThreadRevertCompleteCommand {
  /** 命令类型标识 */
  type: "thread.revert.complete";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 回退的轮次数 */
  turnCount: NonNegativeInt;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 线程对话回滚完成命令（内部使用） */
interface ThreadConversationRollbackCompleteCommand {
  /** 命令类型标识 */
  type: "thread.conversation.rollback.complete";
  /** 命令唯一标识 */
  commandId: CommandId;
  /** 线程 ID */
  threadId: ThreadId;
  /** 消息 ID */
  messageId: MessageId;
  /** 回滚的轮次数 */
  numTurns: NonNegativeInt;
  /** 移除的轮次 ID 列表（可选） */
  removedTurnIds?: Array<TurnId>;
  /** 是否跳过附件清理（可选） */
  skipAttachmentPrune?: boolean;
  /** 创建时间 */
  createdAt: IsoDateTime;
}

/** 内部编排命令联合类型 */
export type InternalOrchestrationCommand =
  | ThreadSessionSetCommand
  | ThreadMessagesImportCommand
  | ThreadMessageAssistantDeltaCommand
  | ThreadMessageAssistantCompleteCommand
  | ThreadProposedPlanUpsertCommand
  | ThreadTurnDiffCompleteCommand
  | ThreadActivityAppendCommand
  | ThreadRevertCompleteCommand
  | ThreadConversationRollbackCommand
  | ThreadConversationRollbackCompleteCommand
  | ThreadDispatchQueuedTurnCommand;

/** 编排命令联合类型（包含所有内部和客户端命令） */
export type OrchestrationCommand = DispatchableClientOrchestrationCommand | InternalOrchestrationCommand;

/** 编排事件类型枚举 */
export type OrchestrationEventType =
  | "project.created"
  | "project.meta-updated"
  | "project.deleted"
  | "thread.created"
  | "thread.deleted"
  | "thread.archived"
  | "thread.unarchived"
  | "thread.meta-updated"
  | "thread.runtime-mode-set"
  | "thread.interaction-mode-set"
  | "thread.message-sent"
  | "thread.turn-queued"
  | "thread.turn-start-requested"
  | "thread.turn-interrupt-requested"
  | "thread.approval-response-requested"
  | "thread.user-input-response-requested"
  | "thread.checkpoint-revert-requested"
  | "thread.reverted"
  | "thread.conversation-rollback-requested"
  | "thread.conversation-rolled-back"
  | "thread.message-edit-resend-requested"
  | "thread.session-stop-requested"
  | "thread.session-set"
  | "thread.proposed-plan-upserted"
  | "thread.turn-diff-completed"
  | "thread.activity-appended";

/** 编排聚合根类型：项目或线程 */
export type OrchestrationAggregateKind = "project" | "thread";
/** 编排参与者类型：客户端、服务端或提供者 */
export type OrchestrationActorKind = "client" | "server" | "provider";

/** 项目创建事件负载 */
export interface ProjectCreatedPayload {
  projectId: ProjectId;
  kind?: ProjectKind;
  title: TrimmedNonEmptyString;
  workspaceRoot: TrimmedNonEmptyString;
  defaultModelSelection: ModelSelection | null;
  scripts: Array<ProjectScript>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** 项目元数据更新事件负载 */
export interface ProjectMetaUpdatedPayload {
  projectId: ProjectId;
  kind?: ProjectKind;
  title?: TrimmedNonEmptyString;
  workspaceRoot?: TrimmedNonEmptyString;
  defaultModelSelection?: ModelSelection | null;
  scripts?: Array<ProjectScript>;
  updatedAt: IsoDateTime;
}

/** 项目删除事件负载 */
export interface ProjectDeletedPayload {
  projectId: ProjectId;
  deletedAt: IsoDateTime;
}

/** 线程创建事件负载 */
export interface ThreadCreatedPayload {
  threadId: ThreadId;
  projectId: ProjectId;
  title: TrimmedNonEmptyString;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  envMode?: ThreadEnvironmentMode;
  branch: TrimmedNonEmptyString | null;
  worktreePath: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  isPinned?: boolean;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: TrimmedNonEmptyString | null;
  subagentNickname?: TrimmedNonEmptyString | null;
  subagentRole?: TrimmedNonEmptyString | null;
  forkSourceThreadId?: ThreadId | null;
  sidechatSourceThreadId?: ThreadId | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  handoff: ThreadHandoff | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** 线程删除事件负载 */
export interface ThreadDeletedPayload {
  threadId: ThreadId;
  deletedAt: IsoDateTime;
}

/** 线程归档事件负载 */
export interface ThreadArchivedPayload {
  threadId: ThreadId;
  archivedAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
}

/** 线程取消归档事件负载 */
export interface ThreadUnarchivedPayload {
  threadId: ThreadId;
  unarchivedAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
}

/** 线程元数据更新事件负载 */
export interface ThreadMetaUpdatedPayload {
  threadId: ThreadId;
  title?: TrimmedNonEmptyString;
  modelSelection?: ModelSelection;
  envMode?: ThreadEnvironmentMode;
  branch?: TrimmedNonEmptyString | null;
  worktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreePath?: TrimmedNonEmptyString | null;
  associatedWorktreeBranch?: TrimmedNonEmptyString | null;
  associatedWorktreeRef?: TrimmedNonEmptyString | null;
  createBranchFlowCompleted?: boolean;
  isPinned?: boolean;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: TrimmedNonEmptyString | null;
  subagentNickname?: TrimmedNonEmptyString | null;
  subagentRole?: TrimmedNonEmptyString | null;
  handoff?: ThreadHandoff | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  updatedAt: IsoDateTime;
}

/** 线程运行时模式设置事件负载 */
export interface ThreadRuntimeModeSetPayload {
  threadId: ThreadId;
  runtimeMode: RuntimeMode;
  updatedAt: IsoDateTime;
}

/** 线程交互模式设置事件负载 */
export interface ThreadInteractionModeSetPayload {
  threadId: ThreadId;
  interactionMode: ProviderInteractionMode;
  updatedAt: IsoDateTime;
}

/** 线程消息发送事件负载 */
export interface ThreadMessageSentPayload {
  threadId: ThreadId;
  messageId: MessageId;
  role: OrchestrationMessageRole;
  text: string;
  attachments?: Array<ChatAttachment>;
  skills?: Array<ProviderSkillReference>;
  mentions?: Array<ProviderMentionReference>;
  dispatchMode?: TurnDispatchMode;
  turnId: TurnId | null;
  streaming: boolean;
  source: OrchestrationMessageSource;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** 线程轮次启动请求事件负载 */
export interface ThreadTurnStartRequestedPayload {
  threadId: ThreadId;
  messageId: MessageId;
  modelSelection?: ModelSelection;
  providerOptions?: ProviderStartOptions;
  reviewTarget?: ProviderReviewTarget;
  assistantDeliveryMode?: AssistantDeliveryMode;
  dispatchMode: TurnDispatchMode;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  sourceProposedPlan?: SourceProposedPlanReference;
  createdAt: IsoDateTime;
}

/** 线程轮次排队事件负载，结构与轮次启动请求相同 */
export type ThreadTurnQueuedPayload = ThreadTurnStartRequestedPayload;

/** 线程轮次中断请求事件负载 */
export interface ThreadTurnInterruptRequestedPayload {
  threadId: ThreadId;
  turnId?: TurnId;
  createdAt: IsoDateTime;
}

/** 线程审批响应请求事件负载 */
export interface ThreadApprovalResponseRequestedPayload {
  threadId: ThreadId;
  requestId: ApprovalRequestId;
  decision: ProviderApprovalDecision;
  createdAt: IsoDateTime;
}

/** 线程用户输入响应请求事件负载（内部使用） */
interface ThreadUserInputResponseRequestedPayload {
  threadId: ThreadId;
  requestId: ApprovalRequestId;
  answers: ProviderUserInputAnswers;
  createdAt: IsoDateTime;
}

/** 线程检查点回退请求事件负载 */
export interface ThreadCheckpointRevertRequestedPayload {
  threadId: ThreadId;
  turnCount: NonNegativeInt;
  createdAt: IsoDateTime;
}

/** 线程回退完成事件负载 */
export interface ThreadRevertedPayload {
  threadId: ThreadId;
  turnCount: NonNegativeInt;
}

/** 线程对话回滚请求事件负载 */
export interface ThreadConversationRollbackRequestedPayload {
  threadId: ThreadId;
  messageId: MessageId;
  numTurns: NonNegativeInt;
  createdAt: IsoDateTime;
}

/** 线程对话回滚完成事件负载 */
export interface ThreadConversationRolledBackPayload {
  threadId: ThreadId;
  messageId: MessageId;
  numTurns: NonNegativeInt;
  removedTurnIds?: Array<TurnId>;
  skipAttachmentPrune?: boolean;
}

/** 线程消息编辑并重新发送请求事件负载 */
export interface ThreadMessageEditResendRequestedPayload {
  threadId: ThreadId;
  messageId: MessageId;
  text: TrimmedNonEmptyString;
  rollbackTurnCount?: NonNegativeInt;
  removedTurnIds?: Array<TurnId>;
  modelSelection?: ModelSelection;
  providerOptions?: ProviderStartOptions;
  assistantDeliveryMode?: AssistantDeliveryMode;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  createdAt: IsoDateTime;
}

/** 线程会话停止请求事件负载 */
export interface ThreadSessionStopRequestedPayload {
  threadId: ThreadId;
  createdAt: IsoDateTime;
}

/** 线程会话设置事件负载 */
export interface ThreadSessionSetPayload {
  threadId: ThreadId;
  session: OrchestrationSession;
}

/** 线程建议计划新增/更新事件负载 */
export interface ThreadProposedPlanUpsertedPayload {
  threadId: ThreadId;
  proposedPlan: OrchestrationProposedPlan;
}

/** 线程轮次差异完成事件负载 */
export interface ThreadTurnDiffCompletedPayload {
  threadId: ThreadId;
  turnId: TurnId;
  checkpointTurnCount: NonNegativeInt;
  checkpointRef: CheckpointRef;
  status: OrchestrationCheckpointStatus;
  files: Array<OrchestrationCheckpointFile>;
  assistantMessageId: MessageId | null;
  completedAt: IsoDateTime;
}

/** 线程活动追加事件负载 */
export interface ThreadActivityAppendedPayload {
  threadId: ThreadId;
  activity: OrchestrationThreadActivity;
}

/** 编排事件元数据，包含 Provider 关联信息和适配器上下文 */
export interface OrchestrationEventMetadata {
  /** Provider 轮次 ID，用于关联 Provider 层的轮次 */
  providerTurnId?: TrimmedNonEmptyString;
  /** Provider 项目 ID，用于关联 Provider 层的项目 */
  providerItemId?: ProviderItemId;
  /** 适配器键名，标识处理该事件的适配器 */
  adapterKey?: TrimmedNonEmptyString;
  /** 请求 ID，用于关联审批请求 */
  requestId?: ApprovalRequestId;
  /** 事件摄入时间，记录事件被系统接收的时间 */
  ingestedAt?: IsoDateTime;
}

/** 事件基础字段，所有编排事件的公共属性 */
interface EventBaseFields {
  /** 事件序列号（单调递增） */
  sequence: NonNegativeInt;
  /** 事件唯一标识 */
  eventId: EventId;
  /** 聚合根类型（项目或线程） */
  aggregateKind: OrchestrationAggregateKind;
  /** 聚合根 ID（项目 ID 或线程 ID） */
  aggregateId: ProjectId | ThreadId;
  /** 事件发生时间 */
  occurredAt: IsoDateTime;
  /** 触发该事件的命令 ID，非命令触发时为 null */
  commandId: CommandId | null;
  /** 因果事件 ID，无因果关系时为 null */
  causationEventId: EventId | null;
  /** 关联命令 ID，用于追踪请求-响应链，无关联时为 null */
  correlationId: CommandId | null;
  /** 事件元数据 */
  metadata: OrchestrationEventMetadata;
}

/** 编排事件联合类型，包含所有可能的领域事件 */
export type OrchestrationEvent =
  | (EventBaseFields & { type: "project.created"; payload: ProjectCreatedPayload })
  | (EventBaseFields & { type: "project.meta-updated"; payload: ProjectMetaUpdatedPayload })
  | (EventBaseFields & { type: "project.deleted"; payload: ProjectDeletedPayload })
  | (EventBaseFields & { type: "thread.created"; payload: ThreadCreatedPayload })
  | (EventBaseFields & { type: "thread.deleted"; payload: ThreadDeletedPayload })
  | (EventBaseFields & { type: "thread.archived"; payload: ThreadArchivedPayload })
  | (EventBaseFields & { type: "thread.unarchived"; payload: ThreadUnarchivedPayload })
  | (EventBaseFields & { type: "thread.meta-updated"; payload: ThreadMetaUpdatedPayload })
  | (EventBaseFields & { type: "thread.runtime-mode-set"; payload: ThreadRuntimeModeSetPayload })
  | (EventBaseFields & {
    type: "thread.interaction-mode-set";
    payload: ThreadInteractionModeSetPayload;
  })
  | (EventBaseFields & { type: "thread.message-sent"; payload: ThreadMessageSentPayload })
  | (EventBaseFields & { type: "thread.turn-queued"; payload: ThreadTurnQueuedPayload })
  | (EventBaseFields & {
    type: "thread.turn-start-requested";
    payload: ThreadTurnStartRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.turn-interrupt-requested";
    payload: ThreadTurnInterruptRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.approval-response-requested";
    payload: ThreadApprovalResponseRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.user-input-response-requested";
    payload: ThreadUserInputResponseRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.checkpoint-revert-requested";
    payload: ThreadCheckpointRevertRequestedPayload;
  })
  | (EventBaseFields & { type: "thread.reverted"; payload: ThreadRevertedPayload })
  | (EventBaseFields & {
    type: "thread.conversation-rollback-requested";
    payload: ThreadConversationRollbackRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.conversation-rolled-back";
    payload: ThreadConversationRolledBackPayload;
  })
  | (EventBaseFields & {
    type: "thread.message-edit-resend-requested";
    payload: ThreadMessageEditResendRequestedPayload;
  })
  | (EventBaseFields & {
    type: "thread.session-stop-requested";
    payload: ThreadSessionStopRequestedPayload;
  })
  | (EventBaseFields & { type: "thread.session-set"; payload: ThreadSessionSetPayload })
  | (EventBaseFields & {
    type: "thread.proposed-plan-upserted";
    payload: ThreadProposedPlanUpsertedPayload;
  })
  | (EventBaseFields & {
    type: "thread.turn-diff-completed";
    payload: ThreadTurnDiffCompletedPayload;
  })
  | (EventBaseFields & {
    type: "thread.activity-appended";
    payload: ThreadActivityAppendedPayload;
  });

/** 线程详情快照，包含完整线程数据和快照序列号 */
export interface OrchestrationThreadDetailSnapshot {
  snapshotSequence: NonNegativeInt;
  thread: OrchestrationThread;
}

/** 线程事件流条目：完整快照或增量事件 */
export type OrchestrationThreadStreamItem =
  | {
      kind: "snapshot";
      snapshot: OrchestrationThreadDetailSnapshot;
    }
  | {
      kind: "event";
      event: OrchestrationEvent;
    };

/** 编排命令回执状态：已接受或已拒绝 */
export type OrchestrationCommandReceiptStatus = "accepted" | "rejected";

/** 轮次计数范围，用于差异查询时指定起止轮次 */
export interface TurnCountRange {
  fromTurnCount: NonNegativeInt;
  toTurnCount: NonNegativeInt;
}

/** 线程轮次差异，包含线程 ID、轮次范围和统一差异文本 */
export interface ThreadTurnDiff extends TurnCountRange {
  threadId: ThreadId;
  diff: string;
}

/** Provider 会话运行时状态枚举 */
export type ProviderSessionRuntimeStatus = "starting" | "running" | "stopped" | "error";

/** 投影线程轮次状态枚举 */
export type ProjectionThreadTurnStatus = "running" | "completed" | "interrupted" | "error";

/** 投影检查点行，用于持久化存储检查点信息 */
export interface ProjectionCheckpointRow {
  /** 线程 ID */
  threadId: ThreadId;
  /** 轮次 ID */
  turnId: TurnId;
  /** 检查点轮次计数 */
  checkpointTurnCount: NonNegativeInt;
  /** 检查点引用标识 */
  checkpointRef: CheckpointRef;
  /** 检查点状态 */
  status: OrchestrationCheckpointStatus;
  /** 检查点文件列表 */
  files: Array<OrchestrationCheckpointFile>;
  /** 关联的助手消息 ID，无关联时为 null */
  assistantMessageId: MessageId | null;
  /** 检查点完成时间 */
  completedAt: IsoDateTime;
}

/** 投影待审批状态枚举 */
export type ProjectionPendingApprovalStatus = "pending" | "resolved";
/** 投影待审批决策类型 */
export type ProjectionPendingApprovalDecision = ProviderApprovalDecision | null;

/** 命令分发结果，返回事件序列号 */
export interface DispatchResult {
  /** 分发后的事件序列号 */
  sequence: NonNegativeInt;
}

/** 获取编排状态快照的输入参数（空） */
export interface OrchestrationGetSnapshotInput {}
/** 获取编排状态快照的结果 */
export type OrchestrationGetSnapshotResult = OrchestrationReadModel;

/** 获取 Shell 快照的输入参数（空） */
export interface OrchestrationGetShellSnapshotInput {}
/** 获取 Shell 快照的结果 */
export type OrchestrationGetShellSnapshotResult = OrchestrationShellSnapshot;

/** 修复编排状态的输入参数（空） */
export interface OrchestrationRepairStateInput {}
/** 修复编排状态的结果 */
export type OrchestrationRepairStateResult = OrchestrationReadModel;

/** 获取轮次差异的输入参数 */
export interface OrchestrationGetTurnDiffInput extends TurnCountRange {
  threadId: ThreadId;
  /** 是否忽略空白差异 */
  ignoreWhitespace?: boolean;
}
/** 获取轮次差异的结果 */
export type OrchestrationGetTurnDiffResult = ThreadTurnDiff;

/** 获取完整线程差异的输入参数 */
export interface OrchestrationGetFullThreadDiffInput {
  threadId: ThreadId;
  /** 目标轮次计数 */
  toTurnCount: NonNegativeInt;
  /** 是否忽略空白差异 */
  ignoreWhitespace?: boolean;
}
/** 获取完整线程差异的结果 */
export type OrchestrationGetFullThreadDiffResult = ThreadTurnDiff;

/** 重放编排事件的输入参数 */
export interface OrchestrationReplayEventsInput {
  /** 起始序列号（不含），从该序列号之后开始重放 */
  fromSequenceExclusive: NonNegativeInt;
}
/** 重放编排事件的结果 */
export type OrchestrationReplayEventsResult = Array<OrchestrationEvent>;

/** 订阅 Shell 事件的输入参数（空） */
export interface OrchestrationSubscribeShellInput {}

/** 取消订阅 Shell 事件的输入参数（空） */
export interface OrchestrationUnsubscribeShellInput {}

/** 订阅线程事件的输入参数 */
export interface OrchestrationSubscribeThreadInput {
  threadId: ThreadId;
}

/** 导入外部线程的输入参数 */
export interface OrchestrationImportThreadInput {
  threadId: ThreadId;
  externalId: TrimmedNonEmptyString;
}

/** 导入外部线程的结果 */
export interface OrchestrationImportThreadResult {
  threadId: ThreadId;
}

/** 取消订阅线程事件的输入参数 */
export interface OrchestrationUnsubscribeThreadInput {
  threadId: ThreadId;
}

/**
 * 编排 RPC Schema 映射
 *
 * @description 将每个编排 RPC 方法映射到其输入和输出类型，
 * 用于 WebSocket RPC 框架的类型安全调用。
 */
export const OrchestrationRpcSchemas = {
  getSnapshot: {
    input: {} as OrchestrationGetSnapshotInput,
    output: {} as OrchestrationGetSnapshotResult,
  },
  getShellSnapshot: {
    input: {} as OrchestrationGetShellSnapshotInput,
    output: {} as OrchestrationGetShellSnapshotResult,
  },
  repairState: {
    input: {} as OrchestrationRepairStateInput,
    output: {} as OrchestrationRepairStateResult,
  },
  dispatchCommand: {
    input: {} as ClientOrchestrationCommand,
    output: {} as DispatchResult,
  },
  importThread: {
    input: {} as OrchestrationImportThreadInput,
    output: {} as OrchestrationImportThreadResult,
  },
  getTurnDiff: {
    input: {} as OrchestrationGetTurnDiffInput,
    output: {} as OrchestrationGetTurnDiffResult,
  },
  getFullThreadDiff: {
    input: {} as OrchestrationGetFullThreadDiffInput,
    output: {} as OrchestrationGetFullThreadDiffResult,
  },
  replayEvents: {
    input: {} as OrchestrationReplayEventsInput,
    output: {} as OrchestrationReplayEventsResult,
  },
  subscribeShell: {
    input: {} as OrchestrationSubscribeShellInput,
    output: undefined as void,
  },
  unsubscribeShell: {
    input: {} as OrchestrationUnsubscribeShellInput,
    output: undefined as void,
  },
  subscribeThread: {
    input: {} as OrchestrationSubscribeThreadInput,
    output: undefined as void,
  },
  unsubscribeThread: {
    input: {} as OrchestrationUnsubscribeThreadInput,
    output: undefined as void,
  },
} as const;
