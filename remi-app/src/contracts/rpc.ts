/**
 * @file rpc.ts
 * @description WebSocket RPC 方法定义。
 * 定义所有通过 WebSocket 暴露的远程过程调用方法的类型，
 * 包括编排、项目、文件系统、Git、终端、服务器管理、Provider 发现等功能。
 */
import type { OpenInEditorInput } from "./editor";
import type { FilesystemBrowseInput, FilesystemBrowseResult } from "./filesystem";
import type {
  GitCheckoutInput,
  GitActionProgressEvent,
  GitCreateBranchInput,
  GitCreateDetachedWorktreeInput,
  GitCreateDetachedWorktreeResult,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitHandoffThreadInput,
  GitHandoffThreadResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullInput,
  GitPullRequestRefInput,
  GitPullResult,
  GitReadWorkingTreeDiffInput,
  GitReadWorkingTreeDiffResult,
  GitRemoveIndexLockInput,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  GitStashAndCheckoutInput,
  GitStashDropInput,
  GitStashInfoInput,
  GitStashInfoResult,
  GitStatusInput,
  GitStatusResult,
  GitSummarizeDiffInput,
  GitSummarizeDiffResult,
} from "./git";
import type { KeybindingRule } from "./keybindings";
import type {
  ClientOrchestrationCommand,
  OrchestrationEvent,
  OrchestrationImportThreadInput,
  OrchestrationImportThreadResult,
  OrchestrationShellStreamItem,
  OrchestrationThreadStreamItem,
  OrchestrationGetSnapshotInput,
  OrchestrationGetSnapshotResult,
  OrchestrationGetShellSnapshotInput,
  OrchestrationGetShellSnapshotResult,
  OrchestrationRepairStateInput,
  OrchestrationRepairStateResult,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetFullThreadDiffResult,
  OrchestrationReplayEventsInput,
  OrchestrationReplayEventsResult,
  OrchestrationSubscribeShellInput,
  OrchestrationUnsubscribeShellInput,
  OrchestrationSubscribeThreadInput,
  OrchestrationUnsubscribeThreadInput,
} from "./orchestration";
import type { ProviderCompactThreadInput } from "./provider";
import type {
  ProviderGetComposerCapabilitiesInput,
  ProviderComposerCapabilities,
  ProviderListAgentsInput,
  ProviderListAgentsResult,
  ProviderListCommandsInput,
  ProviderListCommandsResult,
  ProviderListModelsInput,
  ProviderListModelsResult,
  ProviderListPluginsInput,
  ProviderListPluginsResult,
  ProviderListSkillsInput,
  ProviderListSkillsResult,
  ListLocalUserSkillsResult,
  ListLocalUserSkillsInput,
  ProviderReadPluginInput,
  ProviderReadPluginResult,
} from "./providerDiscovery";
import type {
  ProjectListDirectoriesInput,
  ProjectListDirectoriesResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectSearchLocalEntriesInput,
  ProjectSearchLocalEntriesResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
import type {
  ServerConfig,
  ServerConfigStreamEvent,
  ServerDiagnosticsResult,
  ServerGetEnvironmentResult,
  ServerGetProviderUsageSnapshotInput,
  ServerGetProviderUsageSnapshotResult,
  ServerLifecycleStreamEvent,
  ServerGetSettingsResult,
  ServerListWorktreesResult,
  ServerProviderUpdateError,
  ServerProviderUpdateInput,
  ServerProviderUpdateResult,
  ServerRefreshProvidersResult,
  ServerUpdateSettingsInput,
  ServerUpdateSettingsResult,
  ServerUpsertKeybindingResult,
  ServerVoiceTranscriptionInput,
  ServerVoiceTranscriptionResult,
} from "./server";
import type {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal";
import type { WS_METHODS } from "./ws";
import type { ORCHESTRATION_WS_METHODS } from "./orchestration";

/** WebSocket RPC 通用错误类型 */
export interface WsRpcError {
  _tag: "WsRpcError";
  message: string;
  cause?: unknown;
}

// ── 编排相关 RPC 方法类型定义 ─────────────────────────────────────────

/** 派发编排命令 */
export interface WsOrchestrationDispatchCommandRpc {
  method: typeof ORCHESTRATION_WS_METHODS.dispatchCommand;
  payload: ClientOrchestrationCommand;
  success: unknown;
  error: WsRpcError;
}

/** 导入外部线程 */
export interface WsOrchestrationImportThreadRpc {
  method: typeof ORCHESTRATION_WS_METHODS.importThread;
  payload: OrchestrationImportThreadInput;
  success: OrchestrationImportThreadResult;
  error: WsRpcError;
}

/** 获取编排状态快照 */
export interface WsOrchestrationGetSnapshotRpc {
  method: typeof ORCHESTRATION_WS_METHODS.getSnapshot;
  payload: OrchestrationGetSnapshotInput;
  success: OrchestrationGetSnapshotResult;
  error: WsRpcError;
}

/** 获取 Shell 状态快照 */
export interface WsOrchestrationGetShellSnapshotRpc {
  method: typeof ORCHESTRATION_WS_METHODS.getShellSnapshot;
  payload: OrchestrationGetShellSnapshotInput;
  success: OrchestrationGetShellSnapshotResult;
  error: WsRpcError;
}

/** 修复编排状态 */
export interface WsOrchestrationRepairStateRpc {
  method: typeof ORCHESTRATION_WS_METHODS.repairState;
  payload: OrchestrationRepairStateInput;
  success: OrchestrationRepairStateResult;
  error: WsRpcError;
}

/** 获取单轮对话的差异 */
export interface WsOrchestrationGetTurnDiffRpc {
  method: typeof ORCHESTRATION_WS_METHODS.getTurnDiff;
  payload: OrchestrationGetTurnDiffInput;
  success: OrchestrationGetTurnDiffResult;
  error: WsRpcError;
}

/** 获取整个线程的差异 */
export interface WsOrchestrationGetFullThreadDiffRpc {
  method: typeof ORCHESTRATION_WS_METHODS.getFullThreadDiff;
  payload: OrchestrationGetFullThreadDiffInput;
  success: OrchestrationGetFullThreadDiffResult;
  error: WsRpcError;
}

/** 重放编排事件（用于恢复状态） */
export interface WsOrchestrationReplayEventsRpc {
  method: typeof ORCHESTRATION_WS_METHODS.replayEvents;
  payload: OrchestrationReplayEventsInput;
  success: OrchestrationReplayEventsResult;
  error: WsRpcError;
}

/** 订阅 Shell 事件流 */
export interface WsOrchestrationSubscribeShellRpc {
  method: typeof ORCHESTRATION_WS_METHODS.subscribeShell;
  payload: OrchestrationSubscribeShellInput;
  success: OrchestrationShellStreamItem;
  error: WsRpcError;
  stream: true;
}

/** 取消订阅 Shell 事件 */
export interface WsOrchestrationUnsubscribeShellRpc {
  method: typeof ORCHESTRATION_WS_METHODS.unsubscribeShell;
  payload: OrchestrationUnsubscribeShellInput;
  success: void;
  error: WsRpcError;
}

/** 订阅线程事件流 */
export interface WsOrchestrationSubscribeThreadRpc {
  method: typeof ORCHESTRATION_WS_METHODS.subscribeThread;
  payload: OrchestrationSubscribeThreadInput;
  success: OrchestrationThreadStreamItem;
  error: WsRpcError;
  stream: true;
}

/** 订阅编排领域事件流 */
export interface WsOrchestrationSubscribeDomainEventsRpc {
  method: typeof WS_METHODS.subscribeOrchestrationDomainEvents;
  payload: Record<string, never>;
  success: OrchestrationEvent;
  error: WsRpcError;
  stream: true;
}

/** 取消订阅线程事件 */
export interface WsOrchestrationUnsubscribeThreadRpc {
  method: typeof ORCHESTRATION_WS_METHODS.unsubscribeThread;
  payload: OrchestrationUnsubscribeThreadInput;
  success: void;
  error: WsRpcError;
}

// ── 项目相关 RPC 方法类型定义 ─────────────────────────────────────────

/** 列出项目目录 */
export interface WsProjectsListDirectoriesRpc {
  method: typeof WS_METHODS.projectsListDirectories;
  payload: ProjectListDirectoriesInput;
  success: ProjectListDirectoriesResult;
  error: WsRpcError;
}

/** 搜索项目条目 */
export interface WsProjectsSearchEntriesRpc {
  method: typeof WS_METHODS.projectsSearchEntries;
  payload: ProjectSearchEntriesInput;
  success: ProjectSearchEntriesResult;
  error: WsRpcError;
}

/** 搜索项目本地条目 */
export interface WsProjectsSearchLocalEntriesRpc {
  method: typeof WS_METHODS.projectsSearchLocalEntries;
  payload: ProjectSearchLocalEntriesInput;
  success: ProjectSearchLocalEntriesResult;
  error: WsRpcError;
}

/** 写入项目文件 */
export interface WsProjectsWriteFileRpc {
  method: typeof WS_METHODS.projectsWriteFile;
  payload: ProjectWriteFileInput;
  success: ProjectWriteFileResult;
  error: WsRpcError;
}

// ── 文件系统 RPC 方法类型定义 ─────────────────────────────────────────

/** 浏览文件系统 */
export interface WsFilesystemBrowseRpc {
  method: typeof WS_METHODS.filesystemBrowse;
  payload: FilesystemBrowseInput;
  success: FilesystemBrowseResult;
  error: WsRpcError;
}

// ── Shell 相关 RPC 方法类型定义 ───────────────────────────────────────

/** 在编辑器中打开文件 */
export interface WsShellOpenInEditorRpc {
  method: typeof WS_METHODS.shellOpenInEditor;
  payload: OpenInEditorInput;
  success: void;
  error: WsRpcError;
}

// ── Git 相关 RPC 方法类型定义 ─────────────────────────────────────────

/** 获取 Git 状态 */
export interface WsGitStatusRpc {
  method: typeof WS_METHODS.gitStatus;
  payload: GitStatusInput;
  success: GitStatusResult;
  error: WsRpcError;
}

/** 读取工作树差异 */
export interface WsGitReadWorkingTreeDiffRpc {
  method: typeof WS_METHODS.gitReadWorkingTreeDiff;
  payload: GitReadWorkingTreeDiffInput;
  success: GitReadWorkingTreeDiffResult;
  error: WsRpcError;
}

/** 总结差异内容 */
export interface WsGitSummarizeDiffRpc {
  method: typeof WS_METHODS.gitSummarizeDiff;
  payload: GitSummarizeDiffInput;
  success: GitSummarizeDiffResult;
  error: WsRpcError;
}

/** 拉取远程更改 */
export interface WsGitPullRpc {
  method: typeof WS_METHODS.gitPull;
  payload: GitPullInput;
  success: GitPullResult;
  error: WsRpcError;
}

/** 运行堆叠操作（流式返回进度） */
export interface WsGitRunStackedActionRpc {
  method: typeof WS_METHODS.gitRunStackedAction;
  payload: GitRunStackedActionInput;
  success: GitActionProgressEvent;
  error: WsRpcError;
  stream: true;
}

/** 解析 Pull Request */
export interface WsGitResolvePullRequestRpc {
  method: typeof WS_METHODS.gitResolvePullRequest;
  payload: GitPullRequestRefInput;
  success: GitResolvePullRequestResult;
  error: WsRpcError;
}

/** 准备 Pull Request 线程 */
export interface WsGitPreparePullRequestThreadRpc {
  method: typeof WS_METHODS.gitPreparePullRequestThread;
  payload: GitPreparePullRequestThreadInput;
  success: GitPreparePullRequestThreadResult;
  error: WsRpcError;
}

/** 列出 Git 分支 */
export interface WsGitListBranchesRpc {
  method: typeof WS_METHODS.gitListBranches;
  payload: GitListBranchesInput;
  success: GitListBranchesResult;
  error: WsRpcError;
}

/** 创建 Worktree */
export interface WsGitCreateWorktreeRpc {
  method: typeof WS_METHODS.gitCreateWorktree;
  payload: GitCreateWorktreeInput;
  success: GitCreateWorktreeResult;
  error: WsRpcError;
}

/** 创建独立 Worktree */
export interface WsGitCreateDetachedWorktreeRpc {
  method: typeof WS_METHODS.gitCreateDetachedWorktree;
  payload: GitCreateDetachedWorktreeInput;
  success: GitCreateDetachedWorktreeResult;
  error: WsRpcError;
}

/** 删除 Worktree */
export interface WsGitRemoveWorktreeRpc {
  method: typeof WS_METHODS.gitRemoveWorktree;
  payload: GitRemoveWorktreeInput;
  success: void;
  error: WsRpcError;
}

/** 创建新分支 */
export interface WsGitCreateBranchRpc {
  method: typeof WS_METHODS.gitCreateBranch;
  payload: GitCreateBranchInput;
  success: void;
  error: WsRpcError;
}

/** 切换分支 */
export interface WsGitCheckoutRpc {
  method: typeof WS_METHODS.gitCheckout;
  payload: GitCheckoutInput;
  success: void;
  error: WsRpcError;
}

/** 暂存并切换分支 */
export interface WsGitStashAndCheckoutRpc {
  method: typeof WS_METHODS.gitStashAndCheckout;
  payload: GitStashAndCheckoutInput;
  success: void;
  error: WsRpcError;
}

/** 删除暂存 */
export interface WsGitStashDropRpc {
  method: typeof WS_METHODS.gitStashDrop;
  payload: GitStashDropInput;
  success: void;
  error: WsRpcError;
}

/** 获取暂存信息 */
export interface WsGitStashInfoRpc {
  method: typeof WS_METHODS.gitStashInfo;
  payload: GitStashInfoInput;
  success: GitStashInfoResult;
  error: WsRpcError;
}

/** 删除 Git 索引锁 */
export interface WsGitRemoveIndexLockRpc {
  method: typeof WS_METHODS.gitRemoveIndexLock;
  payload: GitRemoveIndexLockInput;
  success: void;
  error: WsRpcError;
}

/** 初始化 Git 仓库 */
export interface WsGitInitRpc {
  method: typeof WS_METHODS.gitInit;
  payload: GitInitInput;
  success: void;
  error: WsRpcError;
}

/** 将线程移交给 Git 分支 */
export interface WsGitHandoffThreadRpc {
  method: typeof WS_METHODS.gitHandoffThread;
  payload: GitHandoffThreadInput;
  success: GitHandoffThreadResult;
  error: WsRpcError;
}

// ── 终端相关 RPC 方法类型定义 ─────────────────────────────────────────

/** 打开终端会话 */
export interface WsTerminalOpenRpc {
  method: typeof WS_METHODS.terminalOpen;
  payload: TerminalOpenInput;
  success: TerminalSessionSnapshot;
  error: WsRpcError;
}

/** 向终端写入数据 */
export interface WsTerminalWriteRpc {
  method: typeof WS_METHODS.terminalWrite;
  payload: TerminalWriteInput;
  success: void;
  error: WsRpcError;
}

/** 调整终端大小 */
export interface WsTerminalResizeRpc {
  method: typeof WS_METHODS.terminalResize;
  payload: TerminalResizeInput;
  success: void;
  error: WsRpcError;
}

/** 清屏 */
export interface WsTerminalClearRpc {
  method: typeof WS_METHODS.terminalClear;
  payload: TerminalClearInput;
  success: void;
  error: WsRpcError;
}

/** 重启终端 */
export interface WsTerminalRestartRpc {
  method: typeof WS_METHODS.terminalRestart;
  payload: TerminalRestartInput;
  success: TerminalSessionSnapshot;
  error: WsRpcError;
}

/** 关闭终端 */
export interface WsTerminalCloseRpc {
  method: typeof WS_METHODS.terminalClose;
  payload: TerminalCloseInput;
  success: void;
  error: WsRpcError;
}

/** 订阅终端事件流 */
export interface WsSubscribeTerminalEventsRpc {
  method: typeof WS_METHODS.subscribeTerminalEvents;
  payload: Record<string, never>;
  success: TerminalEvent;
  error: WsRpcError;
  stream: true;
}

// ── 服务器管理 RPC 方法类型定义 ───────────────────────────────────────

/** 获取服务器配置 */
export interface WsServerGetConfigRpc {
  method: typeof WS_METHODS.serverGetConfig;
  payload: Record<string, never>;
  success: ServerConfig;
  error: WsRpcError;
}

/** 获取执行环境信息 */
export interface WsServerGetEnvironmentRpc {
  method: typeof WS_METHODS.serverGetEnvironment;
  payload: Record<string, never>;
  success: ServerGetEnvironmentResult;
  error: WsRpcError;
}

/** 获取服务器设置 */
export interface WsServerGetSettingsRpc {
  method: typeof WS_METHODS.serverGetSettings;
  payload: Record<string, never>;
  success: ServerGetSettingsResult;
  error: WsRpcError;
}

/** 更新服务器设置 */
export interface WsServerUpdateSettingsRpc {
  method: typeof WS_METHODS.serverUpdateSettings;
  payload: ServerUpdateSettingsInput;
  success: ServerUpdateSettingsResult;
  error: WsRpcError;
}

/** 刷新 Provider 状态 */
export interface WsServerRefreshProvidersRpc {
  method: typeof WS_METHODS.serverRefreshProviders;
  payload: Record<string, never>;
  success: ServerRefreshProvidersResult;
  error: WsRpcError;
}

/** 更新 Provider（如安装/升级） */
export interface WsServerUpdateProviderRpc {
  method: typeof WS_METHODS.serverUpdateProvider;
  payload: ServerProviderUpdateInput;
  success: ServerProviderUpdateResult;
  error: ServerProviderUpdateError;
}

/** 列出所有 Worktree */
export interface WsServerListWorktreesRpc {
  method: typeof WS_METHODS.serverListWorktrees;
  payload: Record<string, never>;
  success: ServerListWorktreesResult;
  error: WsRpcError;
}

/** 获取 Provider 使用量快照 */
export interface WsServerGetProviderUsageSnapshotRpc {
  method: typeof WS_METHODS.serverGetProviderUsageSnapshot;
  payload: ServerGetProviderUsageSnapshotInput;
  success: ServerGetProviderUsageSnapshotResult;
  error: WsRpcError;
}

/** 获取服务器诊断信息 */
export interface WsServerGetDiagnosticsRpc {
  method: typeof WS_METHODS.serverGetDiagnostics;
  payload: Record<string, never>;
  success: ServerDiagnosticsResult;
  error: WsRpcError;
}

/** 语音转录 */
export interface WsServerTranscribeVoiceRpc {
  method: typeof WS_METHODS.serverTranscribeVoice;
  payload: ServerVoiceTranscriptionInput;
  success: ServerVoiceTranscriptionResult;
  error: WsRpcError;
}

/** 新增或更新快捷键 */
export interface WsServerUpsertKeybindingRpc {
  method: typeof WS_METHODS.serverUpsertKeybinding;
  payload: KeybindingRule;
  success: ServerUpsertKeybindingResult;
  error: WsRpcError;
}

// ── 服务器事件订阅 RPC 方法类型定义 ───────────────────────────────────

/** 订阅服务器生命周期事件流 */
export interface WsSubscribeServerLifecycleRpc {
  method: typeof WS_METHODS.subscribeServerLifecycle;
  payload: Record<string, never>;
  success: ServerLifecycleStreamEvent;
  error: WsRpcError;
  stream: true;
}

/** 订阅服务器配置变更流 */
export interface WsSubscribeServerConfigRpc {
  method: typeof WS_METHODS.subscribeServerConfig;
  payload: Record<string, never>;
  success: ServerConfigStreamEvent;
  error: WsRpcError;
  stream: true;
}

/** 订阅 Provider 状态变更流 */
export interface WsSubscribeServerProviderStatusesRpc {
  method: typeof WS_METHODS.subscribeServerProviderStatuses;
  payload: Record<string, never>;
  success: ServerRefreshProvidersResult;
  error: WsRpcError;
  stream: true;
}

/** 订阅服务器设置变更流 */
export interface WsSubscribeServerSettingsRpc {
  method: typeof WS_METHODS.subscribeServerSettings;
  payload: Record<string, never>;
  success: { settings: ServerGetSettingsResult };
  error: WsRpcError;
  stream: true;
}

// ── Provider 发现 RPC 方法类型定义 ────────────────────────────────────

/** 获取 Provider 的 Composer 能力 */
export interface WsProviderGetComposerCapabilitiesRpc {
  method: typeof WS_METHODS.providerGetComposerCapabilities;
  payload: ProviderGetComposerCapabilitiesInput;
  success: ProviderComposerCapabilities;
  error: WsRpcError;
}

/** 压缩线程上下文 */
export interface WsProviderCompactThreadRpc {
  method: typeof WS_METHODS.providerCompactThread;
  payload: ProviderCompactThreadInput;
  success: void;
  error: WsRpcError;
}

/** 列出 Provider 支持的命令 */
export interface WsProviderListCommandsRpc {
  method: typeof WS_METHODS.providerListCommands;
  payload: ProviderListCommandsInput;
  success: ProviderListCommandsResult;
  error: WsRpcError;
}

/** 列出 Provider 支持的技能 */
export interface WsProviderListSkillsRpc {
  method: typeof WS_METHODS.providerListSkills;
  payload: ProviderListSkillsInput;
  success: ProviderListSkillsResult;
  error: WsRpcError;
}

/** 列出本地用户技能 */
export interface WsSkillsListLocalRpc {
  method: typeof WS_METHODS.skillsListLocal;
  payload: ListLocalUserSkillsInput;
  success: ListLocalUserSkillsResult;
  error: WsRpcError;
}

/** 列出 Provider 支持的插件 */
export interface WsProviderListPluginsRpc {
  method: typeof WS_METHODS.providerListPlugins;
  payload: ProviderListPluginsInput;
  success: ProviderListPluginsResult;
  error: WsRpcError;
}

/** 读取插件详情 */
export interface WsProviderReadPluginRpc {
  method: typeof WS_METHODS.providerReadPlugin;
  payload: ProviderReadPluginInput;
  success: ProviderReadPluginResult;
  error: WsRpcError;
}

/** 列出 Provider 支持的模型 */
export interface WsProviderListModelsRpc {
  method: typeof WS_METHODS.providerListModels;
  payload: ProviderListModelsInput;
  success: ProviderListModelsResult;
  error: WsRpcError;
}

/** 列出 Provider 支持的 Agent */
export interface WsProviderListAgentsRpc {
  method: typeof WS_METHODS.providerListAgents;
  payload: ProviderListAgentsInput;
  success: ProviderListAgentsResult;
  error: WsRpcError;
}

/** 所有 WebSocket RPC 方法的联合类型 */
export type WsRpcMethod =
  | WsOrchestrationDispatchCommandRpc
  | WsOrchestrationImportThreadRpc
  | WsOrchestrationGetSnapshotRpc
  | WsOrchestrationGetShellSnapshotRpc
  | WsOrchestrationRepairStateRpc
  | WsOrchestrationGetTurnDiffRpc
  | WsOrchestrationGetFullThreadDiffRpc
  | WsOrchestrationReplayEventsRpc
  | WsOrchestrationSubscribeShellRpc
  | WsOrchestrationUnsubscribeShellRpc
  | WsOrchestrationSubscribeThreadRpc
  | WsOrchestrationUnsubscribeThreadRpc
  | WsOrchestrationSubscribeDomainEventsRpc
  | WsProjectsListDirectoriesRpc
  | WsProjectsSearchEntriesRpc
  | WsProjectsSearchLocalEntriesRpc
  | WsProjectsWriteFileRpc
  | WsFilesystemBrowseRpc
  | WsShellOpenInEditorRpc
  | WsGitStatusRpc
  | WsGitReadWorkingTreeDiffRpc
  | WsGitSummarizeDiffRpc
  | WsGitPullRpc
  | WsGitRunStackedActionRpc
  | WsGitResolvePullRequestRpc
  | WsGitPreparePullRequestThreadRpc
  | WsGitListBranchesRpc
  | WsGitCreateWorktreeRpc
  | WsGitCreateDetachedWorktreeRpc
  | WsGitRemoveWorktreeRpc
  | WsGitCreateBranchRpc
  | WsGitCheckoutRpc
  | WsGitStashAndCheckoutRpc
  | WsGitStashDropRpc
  | WsGitStashInfoRpc
  | WsGitRemoveIndexLockRpc
  | WsGitInitRpc
  | WsGitHandoffThreadRpc
  | WsTerminalOpenRpc
  | WsTerminalWriteRpc
  | WsTerminalResizeRpc
  | WsTerminalClearRpc
  | WsTerminalRestartRpc
  | WsTerminalCloseRpc
  | WsSubscribeTerminalEventsRpc
  | WsServerGetConfigRpc
  | WsServerGetEnvironmentRpc
  | WsServerGetSettingsRpc
  | WsServerUpdateSettingsRpc
  | WsServerRefreshProvidersRpc
  | WsServerUpdateProviderRpc
  | WsServerListWorktreesRpc
  | WsServerGetProviderUsageSnapshotRpc
  | WsServerGetDiagnosticsRpc
  | WsServerTranscribeVoiceRpc
  | WsServerUpsertKeybindingRpc
  | WsSubscribeServerLifecycleRpc
  | WsSubscribeServerConfigRpc
  | WsSubscribeServerProviderStatusesRpc
  | WsSubscribeServerSettingsRpc
  | WsProviderGetComposerCapabilitiesRpc
  | WsProviderCompactThreadRpc
  | WsProviderListCommandsRpc
  | WsProviderListSkillsRpc
  | WsProviderListPluginsRpc
  | WsProviderReadPluginRpc
  | WsProviderListModelsRpc
  | WsProviderListAgentsRpc
  | WsSkillsListLocalRpc;
