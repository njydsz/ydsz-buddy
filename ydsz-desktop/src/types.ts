/**
 * @file 应用类型定义模块
 * @description 定义 ydsz-buddy 应用的核心运行时类型，包括线程、项目、聊天消息、
 *              终端布局、侧边栏摘要等数据模型。本模块导出的类型被 store、路由和组件广泛使用。
 */

import type {
  ModelSelection,
  OrchestrationMessageSource,
  TurnDispatchMode,
  OrchestrationLatestTurn,
  OrchestrationThreadPullRequest,
  OrchestrationProposedPlanId,
  OrchestrationSessionStatus,
  OrchestrationThreadActivity,
  ThreadHandoff,
  ProjectScript as ContractProjectScript,
  ThreadId,
  ProjectId,
  TurnId,
  MessageId,
  ProviderKind,
  CheckpointRef,
  ProviderInteractionMode,
  ProjectKind,
  RuntimeMode,
  ThreadEnvironmentMode,
} from "@ydsz-buddy/contracts";

/** 会话阶段，表示与服务器的连接状态 */
export type SessionPhase = "disconnected" | "connecting" | "ready" | "running";
/** 默认运行时模式为代码模式 */
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "code";
/** 默认交互模式为代理模式 */
export const DEFAULT_INTERACTION_MODE: ProviderInteractionMode = "agent";
/** 线程终端默认高度（像素） */
export const DEFAULT_THREAD_TERMINAL_HEIGHT = 280;
/** 默认线程终端 ID */
export const DEFAULT_THREAD_TERMINAL_ID = "default";
/** 每个终端组最大终端数量 */
export const MAX_TERMINALS_PER_GROUP = 6;
/** 线程终端展示模式：抽屉式或工作区模式 */
export type ThreadTerminalPresentationMode = "drawer" | "workspace";
/** 线程终端工作区标签页类型 */
export type ThreadTerminalWorkspaceTab = "terminal" | "chat";
/** 线程终端工作区布局类型 */
export type ThreadTerminalWorkspaceLayout = "both" | "terminal-only";
/** 线程主面板类型：聊天或终端 */
export type ThreadPrimarySurface = "chat" | "terminal";
/** 项目脚本类型别名 */
export type ProjectScript = ContractProjectScript;
/** 线程终端分割方向：水平或垂直 */
export type ThreadTerminalSplitDirection = "horizontal" | "vertical";
/** 线程终端分割位置：上、右、下、左 */
export type ThreadTerminalSplitPosition = "top" | "right" | "bottom" | "left";

/**
 * 线程终端叶子节点，表示包含终端的面板
 * @interface ThreadTerminalLeafNode
 */
export interface ThreadTerminalLeafNode {
  type: "terminal";
  paneId: string;
  terminalIds: string[];
  activeTerminalId: string;
}

/**
 * 线程终端分割节点，表示水平和垂直分割的容器
 * @interface ThreadTerminalSplitNode
 */
export interface ThreadTerminalSplitNode {
  type: "split";
  id: string;
  direction: ThreadTerminalSplitDirection;
  children: ThreadTerminalLayoutNode[];
  weights: number[];
}

/** 线程终端布局节点类型（叶子节点或分割节点） */
export type ThreadTerminalLayoutNode = ThreadTerminalLeafNode | ThreadTerminalSplitNode;

/**
 * 线程终端组，包含多个终端及其布局
 * @interface ThreadTerminalGroup
 */
export interface ThreadTerminalGroup {
  id: string;
  activeTerminalId: string;
  layout: ThreadTerminalLayoutNode;
}

/**
 * 聊天图片附件
 * @interface ChatImageAttachment
 */
export interface ChatImageAttachment {
  type: "image";
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
}

/**
 * 聊天助手选区附件
 * @interface ChatAssistantSelectionAttachment
 */
export interface ChatAssistantSelectionAttachment {
  type: "assistant-selection";
  id: string;
  assistantMessageId: string;
  text: string;
}

/** 聊天附件类型（图片或选区） */
export type ChatAttachment = ChatImageAttachment | ChatAssistantSelectionAttachment;

/**
 * 聊天消息
 * @interface ChatMessage
 */
export interface ChatMessage {
  id: MessageId;
  role: "user" | "assistant" | "system";
  text: string;
  attachments?: ChatAttachment[];
  dispatchMode?: TurnDispatchMode;
  turnId?: TurnId | null;
  createdAt: string;
  completedAt?: string | undefined;
  streaming: boolean;
  source?: OrchestrationMessageSource;
}

/**
 * AI 提议的执行计划
 * @interface ProposedPlan
 */
export interface ProposedPlan {
  id: OrchestrationProposedPlanId;
  turnId: TurnId | null;
  planMarkdown: string;
  implementedAt: string | null;
  implementationThreadId: ThreadId | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 单个文件的变更摘要
 * @interface TurnDiffFileChange
 */
export interface TurnDiffFileChange {
  path: string;
  kind?: string | undefined;
  additions?: number | undefined;
  deletions?: number | undefined;
  /**
   * 文件级 author;缺省按 "ai" 兜底
   * - "ai"    - AI 生成
   * - "user"  - 用户手工改写
   * - "mixed" - 混合归属
   */
  author?: "ai" | "user" | "mixed" | undefined;
}

/**
 * 轮次差异摘要
 * @interface TurnDiffSummary
 */
export interface TurnDiffSummary {
  turnId: TurnId;
  completedAt: string;
  status?: string | undefined;
  files: TurnDiffFileChange[];
  checkpointRef?: CheckpointRef | undefined;
  assistantMessageId?: MessageId | undefined;
  checkpointTurnCount?: number | undefined;
}

/**
 * 项目
 * @interface Project
 */
export interface Project {
  id: ProjectId;
  kind: ProjectKind;
  name: string;
  remoteName: string;
  folderName: string;
  localName: string | null;
  cwd: string;
  defaultModelSelection: ModelSelection | null;
  expanded: boolean;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  scripts: ProjectScript[];
}

/**
 * 线程工作区状态
 * @interface ThreadWorkspaceState
 */
export interface ThreadWorkspaceState {
  envMode?: ThreadEnvironmentMode | undefined;
  branch: string | null;
  worktreePath: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
  createBranchFlowCompleted?: boolean;
}

/** 线程工作区状态补丁，用于部分更新 */
export interface ThreadWorkspacePatch {
  envMode?: ThreadEnvironmentMode | undefined;
  branch?: string | null;
  worktreePath?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
  createBranchFlowCompleted?: boolean;
}

/**
 * 聊天线程，包含消息、会话、计划等完整状态
 * @interface Thread
 */
export interface Thread extends ThreadWorkspaceState {
  id: ThreadId;
  codexThreadId: string | null;
  projectId: ProjectId;
  title: string;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  session: ThreadSession | null;
  messages: ChatMessage[];
  proposedPlans: ProposedPlan[];
  error: string | null;
  createdAt: string;
  archivedAt?: string | null;
  updatedAt?: string | undefined;
  isPinned?: boolean;
  latestTurn: OrchestrationLatestTurn | null;
  pendingSourceProposedPlan?: OrchestrationLatestTurn["sourceProposedPlan"];
  lastVisitedAt?: string | undefined;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: string | null;
  subagentNickname?: string | null;
  subagentRole?: string | null;
  forkSourceThreadId?: ThreadId | null;
  sidechatSourceThreadId?: ThreadId | null;
  handoff?: ThreadHandoff | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  latestUserMessageAt?: string | null;
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
  hasActionableProposedPlan?: boolean;
  turnDiffSummaries: TurnDiffSummary[];
  activities: OrchestrationThreadActivity[];
}

/**
 * 线程外壳，仅包含轻量级元数据用于列表展示
 * @interface ThreadShell
 */
export interface ThreadShell extends ThreadWorkspaceState {
  id: ThreadId;
  codexThreadId: string | null;
  projectId: ProjectId;
  title: string;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  error: string | null;
  createdAt: string;
  archivedAt?: string | null;
  updatedAt?: string | undefined;
  isPinned?: boolean;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: string | null;
  subagentNickname?: string | null;
  subagentRole?: string | null;
  forkSourceThreadId?: ThreadId | null;
  sidechatSourceThreadId?: ThreadId | null;
  handoff?: ThreadHandoff | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  latestUserMessageAt?: string | null;
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
  hasActionableProposedPlan?: boolean;
  lastVisitedAt?: string | undefined;
}

/**
 * 线程轮次状态
 * @interface ThreadTurnState
 */
export interface ThreadTurnState {
  latestTurn: OrchestrationLatestTurn | null;
  pendingSourceProposedPlan?: OrchestrationLatestTurn["sourceProposedPlan"];
}

/**
 * 侧边栏线程摘要，用于列表展示
 * @interface SidebarThreadSummary
 */
export interface SidebarThreadSummary {
  id: ThreadId;
  projectId: ProjectId;
  title: string;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  envMode?: ThreadEnvironmentMode | undefined;
  branch: string | null;
  worktreePath: string | null;
  session: ThreadSession | null;
  createdAt: string;
  archivedAt?: string | null;
  updatedAt?: string | undefined;
  isPinned?: boolean;
  latestTurn: OrchestrationLatestTurn | null;
  lastVisitedAt?: string | undefined;
  parentThreadId?: ThreadId | null;
  subagentAgentId?: string | null;
  subagentNickname?: string | null;
  subagentRole?: string | null;
  latestUserMessageAt: string | null;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
  hasActionableProposedPlan: boolean;
  hasLiveTailWork: boolean;
  forkSourceThreadId?: ThreadId | null;
  sidechatSourceThreadId?: ThreadId | null;
  handoff?: ThreadHandoff | null;
  lastKnownPr?: OrchestrationThreadPullRequest | null;
}

/**
 * 线程会话状态
 * @interface ThreadSession
 */
export interface ThreadSession {
  provider: ProviderKind;
  status: SessionPhase | "error" | "closed";
  activeTurnId?: TurnId | undefined;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  orchestrationStatus: OrchestrationSessionStatus;
}
