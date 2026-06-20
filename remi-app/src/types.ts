/**
 * @file 共享视图模型类型定义
 * @description 定义 Web 应用层的运行时 UI 类型，包括线程、项目、终端布局、侧边栏摘要等，
 * 被 store、路由和组件广泛消费。
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
} from "@remi-code/contracts";

/** 会话阶段：disconnected → connecting → ready → running */
export type SessionPhase = "disconnected" | "connecting" | "ready" | "running";
/** 默认运行时模式：完全访问权限 */
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";

/** 默认交互模式 */
export const DEFAULT_INTERACTION_MODE: ProviderInteractionMode = "default";
/** 默认线程终端面板高度（像素） */
export const DEFAULT_THREAD_TERMINAL_HEIGHT = 280;
/** 默认终端面板 ID */
export const DEFAULT_THREAD_TERMINAL_ID = "default";
/** 每个终端分组允许的最大终端数量 */
export const MAX_TERMINALS_PER_GROUP = 6;
/** 终端面板的展示模式：drawer（抽屉式）或 workspace（工作区式） */
export type ThreadTerminalPresentationMode = "drawer" | "workspace";
/** 终端工作区标签页类型：terminal（终端）或 chat（聊天） */
export type ThreadTerminalWorkspaceTab = "terminal" | "chat";
/** 终端工作区布局模式：both（双面板）或 terminal-only（仅终端） */
export type ThreadTerminalWorkspaceLayout = "both" | "terminal-only";
/** 线程主界面：chat（聊天）或 terminal（终端） */
export type ThreadPrimarySurface = "chat" | "terminal";
/** 项目脚本配置，直接复用 contracts 中的定义 */
export type ProjectScript = ContractProjectScript;

/** 终端分屏方向：horizontal（水平）或 vertical（垂直） */
export type ThreadTerminalSplitDirection = "horizontal" | "vertical";
/** 终端分屏位置：top / right / bottom / left */
export type ThreadTerminalSplitPosition = "top" | "right" | "bottom" | "left";

/** 终端布局叶子节点，表示一个包含终端实例的面板 */
export interface ThreadTerminalLeafNode {
  /** 节点类型标识：终端叶子 */
  type: "terminal";
  /** 面板唯一 ID */
  paneId: string;
  /** 面板中包含的终端 ID 列表 */
  terminalIds: string[];
  /** 当前激活的终端 ID */
  activeTerminalId: string;
}

/** 终端布局分屏节点，表示一个可递归嵌套的分屏容器 */
export interface ThreadTerminalSplitNode {
  /** 节点类型标识：分屏 */
  type: "split";
  /** 分屏节点唯一 ID */
  id: string;
  /** 分屏方向 */
  direction: ThreadTerminalSplitDirection;
  /** 子节点列表，可嵌套叶子节点或分屏节点 */
  children: ThreadTerminalLayoutNode[];
  /** 各子节点的权重比例 */
  weights: number[];
}

/** 终端布局节点：叶子节点或分屏节点的联合类型 */
export type ThreadTerminalLayoutNode = ThreadTerminalLeafNode | ThreadTerminalSplitNode;

/** 终端分组，包含布局信息和当前激活的终端 */
export interface ThreadTerminalGroup {
  /** 分组唯一 ID */
  id: string;
  /** 当前激活的终端 ID */
  activeTerminalId: string;
  /** 分组的布局树 */
  layout: ThreadTerminalLayoutNode;
}

/** 聊天图片附件 */
export interface ChatImageAttachment {
  /** 附件类型：图片 */
  type: "image";
  /** 附件唯一 ID */
  id: string;
  /** 文件名 */
  name: string;
  /** MIME 类型 */
  mimeType: string;
  /** 文件大小（字节） */
  sizeBytes: number;
  /** 图片预览 URL，可选 */
  previewUrl?: string;
}

/** 聊天助手选择附件，引用助手消息中的文本片段 */
export interface ChatAssistantSelectionAttachment {
  /** 附件类型：助手选择 */
  type: "assistant-selection";
  /** 附件唯一 ID */
  id: string;
  /** 被引用的助手消息 ID */
  assistantMessageId: string;
  /** 选中的文本内容 */
  text: string;
}

/** 聊天附件：图片或助手文本选择的联合类型 */
export type ChatAttachment = ChatImageAttachment | ChatAssistantSelectionAttachment;

/** 聊天消息 */
export interface ChatMessage {
  /** 消息唯一 ID */
  id: MessageId;
  /** 消息角色：user（用户）、assistant（助手）、system（系统） */
  role: "user" | "assistant" | "system";
  /** 消息文本内容 */
  text: string;
  /** 附件列表 */
  attachments?: ChatAttachment[];
  /** 消息调度模式 */
  dispatchMode?: TurnDispatchMode;
  /** 所属回合 ID */
  turnId?: TurnId | null;
  /** 消息创建时间（ISO 字符串） */
  createdAt: string;
  /** 消息完成时间（ISO 字符串），流式消息完成后才有值 */
  completedAt?: string | undefined;
  /** 是否正在流式输出中 */
  streaming: boolean;
  /** 消息来源 */
  source?: OrchestrationMessageSource;
}

/** 提议的计划 */
export interface ProposedPlan {
  /** 计划唯一 ID */
  id: OrchestrationProposedPlanId;
  /** 关联的回合 ID，可为 null */
  turnId: TurnId | null;
  /** 计划的 Markdown 内容 */
  planMarkdown: string;
  /** 实施时间，未实施时为 null */
  implementedAt: string | null;
  /** 实施该计划的线程 ID，未实施时为 null */
  implementationThreadId: ThreadId | null;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/** 回合差异中的文件变更记录 */
export interface TurnDiffFileChange {
  /** 文件路径 */
  path: string;
  /** 变更类型（如 added/modified/deleted） */
  kind?: string | undefined;
  /** 新增行数 */
  additions?: number | undefined;
  /** 删除行数 */
  deletions?: number | undefined;
}

/** 回合差异摘要，记录一个回合的文件变更汇总 */
export interface TurnDiffSummary {
  /** 回合 ID */
  turnId: TurnId;
  /** 完成时间 */
  completedAt: string;
  /** 回合状态 */
  status?: string | undefined;
  /** 变更的文件列表 */
  files: TurnDiffFileChange[];
  /** 检查点引用，用于回退操作 */
  checkpointRef?: CheckpointRef | undefined;
  /** 关联的助手消息 ID */
  assistantMessageId?: MessageId | undefined;
  /** 检查点对应的回合序号 */
  checkpointTurnCount?: number | undefined;
}

/** 项目视图模型 */
export interface Project {
  /** 项目唯一 ID */
  id: ProjectId;
  /** 项目类型 */
  kind: ProjectKind;
  /** 本地展示名称（可能被用户重命名） */
  name: string;
  /** 远程仓库名称 */
  remoteName: string;
  /** 工作区文件夹名 */
  folderName: string;
  /** 用户自定义的本地名称，null 表示使用远程名称 */
  localName: string | null;
  /** 项目工作目录绝对路径 */
  cwd: string;
  /** 默认模型选择配置 */
  defaultModelSelection: ModelSelection | null;
  /** 侧边栏中是否展开 */
  expanded: boolean;
  /** 创建时间 */
  createdAt?: string | undefined;
  /** 更新时间 */
  updatedAt?: string | undefined;
  /** 项目脚本列表 */
  scripts: ProjectScript[];
}

/** 线程工作区状态 */
export interface ThreadWorkspaceState {
  /** 环境模式：local（本地）或 worktree（工作树） */
  envMode?: ThreadEnvironmentMode | undefined;
  /** 当前 Git 分支名 */
  branch: string | null;
  /** 工作树路径 */
  worktreePath: string | null;
  /** 关联的工作树路径 */
  associatedWorktreePath?: string | null;
  /** 关联的工作树分支 */
  associatedWorktreeBranch?: string | null;
  /** 关联的工作树引用 */
  associatedWorktreeRef?: string | null;
  /** 创建分支流程是否已完成 */
  createBranchFlowCompleted?: boolean;
}

/** 线程工作区补丁，用于部分更新工作区状态 */
export interface ThreadWorkspacePatch {
  envMode?: ThreadEnvironmentMode | undefined;
  branch?: string | null;
  worktreePath?: string | null;
  associatedWorktreePath?: string | null;
  associatedWorktreeBranch?: string | null;
  associatedWorktreeRef?: string | null;
  createBranchFlowCompleted?: boolean;
}

/** 线程视图模型，包含完整的线程详情 */
export interface Thread extends ThreadWorkspaceState {
  /** 线程唯一 ID */
  id: ThreadId;
  /** Codex 线程 ID，用于兼容旧版 */
  codexThreadId: string | null;
  /** 所属项目 ID */
  projectId: ProjectId;
  /** 线程标题 */
  title: string;
  /** 模型选择配置 */
  modelSelection: ModelSelection;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 当前会话信息 */
  session: ThreadSession | null;
  /** 聊天消息列表 */
  messages: ChatMessage[];
  /** 提议的计划列表 */
  proposedPlans: ProposedPlan[];
  /** 错误信息 */
  error: string | null;
  /** 创建时间 */
  createdAt: string;
  /** 归档时间，null 表示未归档 */
  archivedAt?: string | null;
  /** 更新时间 */
  updatedAt?: string | undefined;
  /** 是否置顶 */
  isPinned?: boolean;
  /** 最新回合信息 */
  latestTurn: OrchestrationLatestTurn | null;
  /** 待处理的来源提议计划 */
  pendingSourceProposedPlan?: OrchestrationLatestTurn["sourceProposedPlan"];
  /** 最后访问时间 */
  lastVisitedAt?: string | undefined;
  /** 父线程 ID（子代理场景） */
  parentThreadId?: ThreadId | null;
  /** 子代理 ID */
  subagentAgentId?: string | null;
  /** 子代理昵称 */
  subagentNickname?: string | null;
  /** 子代理角色 */
  subagentRole?: string | null;
  /** 分叉来源线程 ID */
  forkSourceThreadId?: ThreadId | null;
  /** 侧聊来源线程 ID */
  sidechatSourceThreadId?: ThreadId | null;
  /** 交接信息 */
  handoff?: ThreadHandoff | null;
  /** 最近已知的 Pull Request 信息 */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  /** 最新用户消息时间 */
  latestUserMessageAt?: string | null;
  /** 是否有待处理的审批 */
  hasPendingApprovals?: boolean;
  /** 是否有待处理的用户输入 */
  hasPendingUserInput?: boolean;
  /** 是否有可操作的提议计划 */
  hasActionableProposedPlan?: boolean;
  /** 回合差异摘要列表 */
  turnDiffSummaries: TurnDiffSummary[];
  /** 活动列表 */
  activities: OrchestrationThreadActivity[];
}

/** 线程外壳信息，不包含消息等重型数据，用于侧边栏等轻量场景 */
export interface ThreadShell extends ThreadWorkspaceState {
  /** 线程唯一 ID */
  id: ThreadId;
  /** Codex 线程 ID */
  codexThreadId: string | null;
  /** 所属项目 ID */
  projectId: ProjectId;
  /** 线程标题 */
  title: string;
  /** 模型选择配置 */
  modelSelection: ModelSelection;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 错误信息 */
  error: string | null;
  /** 创建时间 */
  createdAt: string;
  /** 归档时间 */
  archivedAt?: string | null;
  /** 更新时间 */
  updatedAt?: string | undefined;
  /** 是否置顶 */
  isPinned?: boolean;
  /** 父线程 ID */
  parentThreadId?: ThreadId | null;
  /** 子代理 ID */
  subagentAgentId?: string | null;
  /** 子代理昵称 */
  subagentNickname?: string | null;
  /** 子代理角色 */
  subagentRole?: string | null;
  /** 分叉来源线程 ID */
  forkSourceThreadId?: ThreadId | null;
  /** 侧聊来源线程 ID */
  sidechatSourceThreadId?: ThreadId | null;
  /** 交接信息 */
  handoff?: ThreadHandoff | null;
  /** 最近已知的 Pull Request 信息 */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
  /** 最新用户消息时间 */
  latestUserMessageAt?: string | null;
  /** 是否有待处理的审批 */
  hasPendingApprovals?: boolean;
  /** 是否有待处理的用户输入 */
  hasPendingUserInput?: boolean;
  /** 是否有可操作的提议计划 */
  hasActionableProposedPlan?: boolean;
  /** 最后访问时间 */
  lastVisitedAt?: string | undefined;
}

/** 线程回合状态，仅包含最新回合和待处理的提议计划 */
export interface ThreadTurnState {
  /** 最新回合信息 */
  latestTurn: OrchestrationLatestTurn | null;
  /** 待处理的来源提议计划 */
  pendingSourceProposedPlan?: OrchestrationLatestTurn["sourceProposedPlan"];
}

/** 侧边栏线程摘要，用于侧边栏列表行的轻量渲染 */
export interface SidebarThreadSummary {
  /** 线程唯一 ID */
  id: ThreadId;
  /** 所属项目 ID */
  projectId: ProjectId;
  /** 线程标题 */
  title: string;
  /** 模型选择配置 */
  modelSelection: ModelSelection;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 环境模式 */
  envMode?: ThreadEnvironmentMode | undefined;
  /** 当前 Git 分支名 */
  branch: string | null;
  /** 工作树路径 */
  worktreePath: string | null;
  /** 当前会话信息 */
  session: ThreadSession | null;
  /** 创建时间 */
  createdAt: string;
  /** 归档时间 */
  archivedAt?: string | null;
  /** 更新时间 */
  updatedAt?: string | undefined;
  /** 是否置顶 */
  isPinned?: boolean;
  /** 最新回合信息 */
  latestTurn: OrchestrationLatestTurn | null;
  /** 最后访问时间 */
  lastVisitedAt?: string | undefined;
  /** 父线程 ID */
  parentThreadId?: ThreadId | null;
  /** 子代理 ID */
  subagentAgentId?: string | null;
  /** 子代理昵称 */
  subagentNickname?: string | null;
  /** 子代理角色 */
  subagentRole?: string | null;
  /** 最新用户消息时间 */
  latestUserMessageAt: string | null;
  /** 是否有待处理的审批 */
  hasPendingApprovals: boolean;
  /** 是否有待处理的用户输入 */
  hasPendingUserInput: boolean;
  /** 是否有可操作的提议计划 */
  hasActionableProposedPlan: boolean;
  /** 是否有正在进行的尾部工作（如文件写入） */
  hasLiveTailWork: boolean;
  /** 分叉来源线程 ID */
  forkSourceThreadId?: ThreadId | null;
  /** 侧聊来源线程 ID */
  sidechatSourceThreadId?: ThreadId | null;
  /** 交接信息 */
  handoff?: ThreadHandoff | null;
  /** 最近已知的 Pull Request 信息 */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
}

/** 线程会话信息 */
export interface ThreadSession {
  /** 提供者类型 */
  provider: ProviderKind;
  /** 会话状态（含 legacy 状态映射） */
  status: SessionPhase | "error" | "closed";
  /** 当前活跃的回合 ID */
  activeTurnId?: TurnId | undefined;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 最近一次错误信息 */
  lastError?: string;
  /** 编排层会话状态 */
  orchestrationStatus: OrchestrationSessionStatus;
}
