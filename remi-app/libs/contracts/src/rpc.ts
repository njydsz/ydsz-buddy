/**
 * WebSocket RPC 方法定义。
 * 使用 effect/rpc 库定义所有通过 WebSocket 暴露的远程过程调用方法，
 * 包括编排、项目、文件系统、Git、终端、服务器管理、Provider 发现等功能。
 */
import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { OpenInEditorInput } from "./editor";
import { FilesystemBrowseInput, FilesystemBrowseResult } from "./filesystem";
import {
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
import { KeybindingRule } from "./keybindings";
import {
  ClientOrchestrationCommand,
  ORCHESTRATION_WS_METHODS,
  OrchestrationEvent,
  OrchestrationImportThreadInput,
  OrchestrationImportThreadResult,
  OrchestrationRpcSchemas,
  OrchestrationShellStreamItem,
  OrchestrationThreadStreamItem,
} from "./orchestration";
import { ProviderCompactThreadInput } from "./provider";
import {
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
import {
  ProjectListDirectoriesInput,
  ProjectListDirectoriesResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectSearchLocalEntriesInput,
  ProjectSearchLocalEntriesResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
import {
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
import {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal";
import { WS_METHODS } from "./ws";

/** WebSocket RPC 通用错误类型 */
export class WsRpcError extends Schema.TaggedErrorClass<WsRpcError>()("WsRpcError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

// ── 编排相关 RPC 方法 ───────────────────────────────────────────────

/** 派发编排命令 */
export const WsOrchestrationDispatchCommandRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.dispatchCommand,
  {
    payload: ClientOrchestrationCommand,
    success: OrchestrationRpcSchemas.dispatchCommand.output,
    error: WsRpcError,
  },
);

/** 导入外部线程 */
export const WsOrchestrationImportThreadRpc = Rpc.make(ORCHESTRATION_WS_METHODS.importThread, {
  payload: OrchestrationImportThreadInput,
  success: OrchestrationImportThreadResult,
  error: WsRpcError,
});

/** 获取编排状态快照 */
export const WsOrchestrationGetSnapshotRpc = Rpc.make(ORCHESTRATION_WS_METHODS.getSnapshot, {
  payload: OrchestrationRpcSchemas.getSnapshot.input,
  success: OrchestrationRpcSchemas.getSnapshot.output,
  error: WsRpcError,
});

/** 获取 Shell 状态快照 */
export const WsOrchestrationGetShellSnapshotRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getShellSnapshot,
  {
    payload: OrchestrationRpcSchemas.getShellSnapshot.input,
    success: OrchestrationRpcSchemas.getShellSnapshot.output,
    error: WsRpcError,
  },
);

/** 修复编排状态 */
export const WsOrchestrationRepairStateRpc = Rpc.make(ORCHESTRATION_WS_METHODS.repairState, {
  payload: OrchestrationRpcSchemas.repairState.input,
  success: OrchestrationRpcSchemas.repairState.output,
  error: WsRpcError,
});

/** 获取单轮对话的差异 */
export const WsOrchestrationGetTurnDiffRpc = Rpc.make(ORCHESTRATION_WS_METHODS.getTurnDiff, {
  payload: OrchestrationRpcSchemas.getTurnDiff.input,
  success: OrchestrationRpcSchemas.getTurnDiff.output,
  error: WsRpcError,
});

/** 获取整个线程的差异 */
export const WsOrchestrationGetFullThreadDiffRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getFullThreadDiff,
  {
    payload: OrchestrationRpcSchemas.getFullThreadDiff.input,
    success: OrchestrationRpcSchemas.getFullThreadDiff.output,
    error: WsRpcError,
  },
);

/** 重放编排事件（用于恢复状态） */
export const WsOrchestrationReplayEventsRpc = Rpc.make(ORCHESTRATION_WS_METHODS.replayEvents, {
  payload: OrchestrationRpcSchemas.replayEvents.input,
  success: OrchestrationRpcSchemas.replayEvents.output,
  error: WsRpcError,
});

/** 订阅 Shell 事件流 */
export const WsOrchestrationSubscribeShellRpc = Rpc.make(ORCHESTRATION_WS_METHODS.subscribeShell, {
  payload: OrchestrationRpcSchemas.subscribeShell.input,
  success: OrchestrationShellStreamItem,
  error: WsRpcError,
  stream: true,
});

/** 取消订阅 Shell 事件 */
export const WsOrchestrationUnsubscribeShellRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.unsubscribeShell,
  {
    payload: OrchestrationRpcSchemas.unsubscribeShell.input,
    success: Schema.Void,
    error: WsRpcError,
  },
);

/** 订阅线程事件流 */
export const WsOrchestrationSubscribeThreadRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.subscribeThread,
  {
    payload: OrchestrationRpcSchemas.subscribeThread.input,
    success: OrchestrationThreadStreamItem,
    error: WsRpcError,
    stream: true,
  },
);

/** 订阅编排领域事件流 */
export const WsOrchestrationSubscribeDomainEventsRpc = Rpc.make(
  WS_METHODS.subscribeOrchestrationDomainEvents,
  {
    payload: Schema.Struct({}),
    success: OrchestrationEvent,
    error: WsRpcError,
    stream: true,
  },
);

/** 取消订阅线程事件 */
export const WsOrchestrationUnsubscribeThreadRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.unsubscribeThread,
  {
    payload: OrchestrationRpcSchemas.unsubscribeThread.input,
    success: Schema.Void,
    error: WsRpcError,
  },
);

// ── 项目相关 RPC 方法 ───────────────────────────────────────────────

/** 列出项目目录 */
export const WsProjectsListDirectoriesRpc = Rpc.make(WS_METHODS.projectsListDirectories, {
  payload: ProjectListDirectoriesInput,
  success: ProjectListDirectoriesResult,
  error: WsRpcError,
});

/** 搜索项目条目 */
export const WsProjectsSearchEntriesRpc = Rpc.make(WS_METHODS.projectsSearchEntries, {
  payload: ProjectSearchEntriesInput,
  success: ProjectSearchEntriesResult,
  error: WsRpcError,
});

/** 搜索项目本地条目 */
export const WsProjectsSearchLocalEntriesRpc = Rpc.make(WS_METHODS.projectsSearchLocalEntries, {
  payload: ProjectSearchLocalEntriesInput,
  success: ProjectSearchLocalEntriesResult,
  error: WsRpcError,
});

/** 写入项目文件 */
export const WsProjectsWriteFileRpc = Rpc.make(WS_METHODS.projectsWriteFile, {
  payload: ProjectWriteFileInput,
  success: ProjectWriteFileResult,
  error: WsRpcError,
});

// ── 文件系统 RPC 方法 ───────────────────────────────────────────────

/** 浏览文件系统 */
export const WsFilesystemBrowseRpc = Rpc.make(WS_METHODS.filesystemBrowse, {
  payload: FilesystemBrowseInput,
  success: FilesystemBrowseResult,
  error: WsRpcError,
});

// ── Shell 相关 RPC 方法 ─────────────────────────────────────────────

/** 在编辑器中打开文件 */
export const WsShellOpenInEditorRpc = Rpc.make(WS_METHODS.shellOpenInEditor, {
  payload: OpenInEditorInput,
  success: Schema.Void,
  error: WsRpcError,
});

// ── Git 相关 RPC 方法 ───────────────────────────────────────────────

/** 获取 Git 状态 */
export const WsGitStatusRpc = Rpc.make(WS_METHODS.gitStatus, {
  payload: GitStatusInput,
  success: GitStatusResult,
  error: WsRpcError,
});

/** 读取工作树差异 */
export const WsGitReadWorkingTreeDiffRpc = Rpc.make(WS_METHODS.gitReadWorkingTreeDiff, {
  payload: GitReadWorkingTreeDiffInput,
  success: GitReadWorkingTreeDiffResult,
  error: WsRpcError,
});

/** 总结差异内容 */
export const WsGitSummarizeDiffRpc = Rpc.make(WS_METHODS.gitSummarizeDiff, {
  payload: GitSummarizeDiffInput,
  success: GitSummarizeDiffResult,
  error: WsRpcError,
});

/** 拉取远程更改 */
export const WsGitPullRpc = Rpc.make(WS_METHODS.gitPull, {
  payload: GitPullInput,
  success: GitPullResult,
  error: WsRpcError,
});

/** 运行堆叠操作（流式返回进度） */
export const WsGitRunStackedActionRpc = Rpc.make(WS_METHODS.gitRunStackedAction, {
  payload: GitRunStackedActionInput,
  success: GitActionProgressEvent,
  error: WsRpcError,
  stream: true,
});

/** 解析 Pull Request */
export const WsGitResolvePullRequestRpc = Rpc.make(WS_METHODS.gitResolvePullRequest, {
  payload: GitPullRequestRefInput,
  success: GitResolvePullRequestResult,
  error: WsRpcError,
});

/** 准备 Pull Request 线程 */
export const WsGitPreparePullRequestThreadRpc = Rpc.make(WS_METHODS.gitPreparePullRequestThread, {
  payload: GitPreparePullRequestThreadInput,
  success: GitPreparePullRequestThreadResult,
  error: WsRpcError,
});

/** 列出 Git 分支 */
export const WsGitListBranchesRpc = Rpc.make(WS_METHODS.gitListBranches, {
  payload: GitListBranchesInput,
  success: GitListBranchesResult,
  error: WsRpcError,
});

/** 创建 Worktree */
export const WsGitCreateWorktreeRpc = Rpc.make(WS_METHODS.gitCreateWorktree, {
  payload: GitCreateWorktreeInput,
  success: GitCreateWorktreeResult,
  error: WsRpcError,
});

/** 创建独立 Worktree */
export const WsGitCreateDetachedWorktreeRpc = Rpc.make(WS_METHODS.gitCreateDetachedWorktree, {
  payload: GitCreateDetachedWorktreeInput,
  success: GitCreateDetachedWorktreeResult,
  error: WsRpcError,
});

/** 删除 Worktree */
export const WsGitRemoveWorktreeRpc = Rpc.make(WS_METHODS.gitRemoveWorktree, {
  payload: GitRemoveWorktreeInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 创建新分支 */
export const WsGitCreateBranchRpc = Rpc.make(WS_METHODS.gitCreateBranch, {
  payload: GitCreateBranchInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 切换分支 */
export const WsGitCheckoutRpc = Rpc.make(WS_METHODS.gitCheckout, {
  payload: GitCheckoutInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 暂存并切换分支 */
export const WsGitStashAndCheckoutRpc = Rpc.make(WS_METHODS.gitStashAndCheckout, {
  payload: GitStashAndCheckoutInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 删除暂存 */
export const WsGitStashDropRpc = Rpc.make(WS_METHODS.gitStashDrop, {
  payload: GitStashDropInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 获取暂存信息 */
export const WsGitStashInfoRpc = Rpc.make(WS_METHODS.gitStashInfo, {
  payload: GitStashInfoInput,
  success: GitStashInfoResult,
  error: WsRpcError,
});

/** 删除 Git 索引锁 */
export const WsGitRemoveIndexLockRpc = Rpc.make(WS_METHODS.gitRemoveIndexLock, {
  payload: GitRemoveIndexLockInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 初始化 Git 仓库 */
export const WsGitInitRpc = Rpc.make(WS_METHODS.gitInit, {
  payload: GitInitInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 将线程移交给 Git 分支 */
export const WsGitHandoffThreadRpc = Rpc.make(WS_METHODS.gitHandoffThread, {
  payload: GitHandoffThreadInput,
  success: GitHandoffThreadResult,
  error: WsRpcError,
});

// ── 终端相关 RPC 方法 ───────────────────────────────────────────────

/** 打开终端会话 */
export const WsTerminalOpenRpc = Rpc.make(WS_METHODS.terminalOpen, {
  payload: TerminalOpenInput,
  success: TerminalSessionSnapshot,
  error: WsRpcError,
});

/** 向终端写入数据 */
export const WsTerminalWriteRpc = Rpc.make(WS_METHODS.terminalWrite, {
  payload: TerminalWriteInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 调整终端大小 */
export const WsTerminalResizeRpc = Rpc.make(WS_METHODS.terminalResize, {
  payload: TerminalResizeInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 清屏 */
export const WsTerminalClearRpc = Rpc.make(WS_METHODS.terminalClear, {
  payload: TerminalClearInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 重启终端 */
export const WsTerminalRestartRpc = Rpc.make(WS_METHODS.terminalRestart, {
  payload: TerminalRestartInput,
  success: TerminalSessionSnapshot,
  error: WsRpcError,
});

/** 关闭终端 */
export const WsTerminalCloseRpc = Rpc.make(WS_METHODS.terminalClose, {
  payload: TerminalCloseInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 订阅终端事件流 */
export const WsSubscribeTerminalEventsRpc = Rpc.make(WS_METHODS.subscribeTerminalEvents, {
  payload: Schema.Struct({}),
  success: TerminalEvent,
  error: WsRpcError,
  stream: true,
});

// ── 服务器管理 RPC 方法 ─────────────────────────────────────────────

/** 获取服务器配置 */
export const WsServerGetConfigRpc = Rpc.make(WS_METHODS.serverGetConfig, {
  payload: Schema.Struct({}),
  success: ServerConfig,
  error: WsRpcError,
});

/** 获取执行环境信息 */
export const WsServerGetEnvironmentRpc = Rpc.make(WS_METHODS.serverGetEnvironment, {
  payload: Schema.Struct({}),
  success: ServerGetEnvironmentResult,
  error: WsRpcError,
});

/** 获取服务器设置 */
export const WsServerGetSettingsRpc = Rpc.make(WS_METHODS.serverGetSettings, {
  payload: Schema.Struct({}),
  success: ServerGetSettingsResult,
  error: WsRpcError,
});

/** 更新服务器设置 */
export const WsServerUpdateSettingsRpc = Rpc.make(WS_METHODS.serverUpdateSettings, {
  payload: ServerUpdateSettingsInput,
  success: ServerUpdateSettingsResult,
  error: WsRpcError,
});

/** 刷新 Provider 状态 */
export const WsServerRefreshProvidersRpc = Rpc.make(WS_METHODS.serverRefreshProviders, {
  payload: Schema.Struct({}),
  success: ServerRefreshProvidersResult,
  error: WsRpcError,
});

/** 更新 Provider（如安装/升级） */
export const WsServerUpdateProviderRpc = Rpc.make(WS_METHODS.serverUpdateProvider, {
  payload: ServerProviderUpdateInput,
  success: ServerProviderUpdateResult,
  error: ServerProviderUpdateError,
});

/** 列出所有 Worktree */
export const WsServerListWorktreesRpc = Rpc.make(WS_METHODS.serverListWorktrees, {
  payload: Schema.Struct({}),
  success: ServerListWorktreesResult,
  error: WsRpcError,
});

/** 获取 Provider 使用量快照 */
export const WsServerGetProviderUsageSnapshotRpc = Rpc.make(
  WS_METHODS.serverGetProviderUsageSnapshot,
  {
    payload: ServerGetProviderUsageSnapshotInput,
    success: ServerGetProviderUsageSnapshotResult,
    error: WsRpcError,
  },
);

/** 获取服务器诊断信息 */
export const WsServerGetDiagnosticsRpc = Rpc.make(WS_METHODS.serverGetDiagnostics, {
  payload: Schema.Struct({}),
  success: ServerDiagnosticsResult,
  error: WsRpcError,
});

/** 语音转录 */
export const WsServerTranscribeVoiceRpc = Rpc.make(WS_METHODS.serverTranscribeVoice, {
  payload: ServerVoiceTranscriptionInput,
  success: ServerVoiceTranscriptionResult,
  error: WsRpcError,
});

/** 新增或更新快捷键 */
export const WsServerUpsertKeybindingRpc = Rpc.make(WS_METHODS.serverUpsertKeybinding, {
  payload: KeybindingRule,
  success: ServerUpsertKeybindingResult,
  error: WsRpcError,
});

// ── 服务器事件订阅 RPC 方法 ─────────────────────────────────────────

/** 订阅服务器生命周期事件流 */
export const WsSubscribeServerLifecycleRpc = Rpc.make(WS_METHODS.subscribeServerLifecycle, {
  payload: Schema.Struct({}),
  success: ServerLifecycleStreamEvent,
  error: WsRpcError,
  stream: true,
});

/** 订阅服务器配置变更流 */
export const WsSubscribeServerConfigRpc = Rpc.make(WS_METHODS.subscribeServerConfig, {
  payload: Schema.Struct({}),
  success: ServerConfigStreamEvent,
  error: WsRpcError,
  stream: true,
});

/** 订阅 Provider 状态变更流 */
export const WsSubscribeServerProviderStatusesRpc = Rpc.make(
  WS_METHODS.subscribeServerProviderStatuses,
  {
    payload: Schema.Struct({}),
    success: ServerRefreshProvidersResult,
    error: WsRpcError,
    stream: true,
  },
);

/** 订阅服务器设置变更流 */
export const WsSubscribeServerSettingsRpc = Rpc.make(WS_METHODS.subscribeServerSettings, {
  payload: Schema.Struct({}),
  success: Schema.Struct({ settings: ServerGetSettingsResult }),
  error: WsRpcError,
  stream: true,
});

// ── Provider 发现 RPC 方法 ──────────────────────────────────────────

/** 获取 Provider 的 Composer 能力 */
export const WsProviderGetComposerCapabilitiesRpc = Rpc.make(
  WS_METHODS.providerGetComposerCapabilities,
  {
    payload: ProviderGetComposerCapabilitiesInput,
    success: ProviderComposerCapabilities,
    error: WsRpcError,
  },
);

/** 压缩线程上下文 */
export const WsProviderCompactThreadRpc = Rpc.make(WS_METHODS.providerCompactThread, {
  payload: ProviderCompactThreadInput,
  success: Schema.Void,
  error: WsRpcError,
});

/** 列出 Provider 支持的命令 */
export const WsProviderListCommandsRpc = Rpc.make(WS_METHODS.providerListCommands, {
  payload: ProviderListCommandsInput,
  success: ProviderListCommandsResult,
  error: WsRpcError,
});

/** 列出 Provider 支持的技能 */
export const WsProviderListSkillsRpc = Rpc.make(WS_METHODS.providerListSkills, {
  payload: ProviderListSkillsInput,
  success: ProviderListSkillsResult,
  error: WsRpcError,
});

/** 列出本地用户技能 */
export const WsSkillsListLocalRpc = Rpc.make(WS_METHODS.skillsListLocal, {
  payload: ListLocalUserSkillsInput,
  success: ListLocalUserSkillsResult,
  error: WsRpcError,
});

/** 列出 Provider 支持的插件 */
export const WsProviderListPluginsRpc = Rpc.make(WS_METHODS.providerListPlugins, {
  payload: ProviderListPluginsInput,
  success: ProviderListPluginsResult,
  error: WsRpcError,
});

/** 读取插件详情 */
export const WsProviderReadPluginRpc = Rpc.make(WS_METHODS.providerReadPlugin, {
  payload: ProviderReadPluginInput,
  success: ProviderReadPluginResult,
  error: WsRpcError,
});

/** 列出 Provider 支持的模型 */
export const WsProviderListModelsRpc = Rpc.make(WS_METHODS.providerListModels, {
  payload: ProviderListModelsInput,
  success: ProviderListModelsResult,
  error: WsRpcError,
});

/** 列出 Provider 支持的 Agent */
export const WsProviderListAgentsRpc = Rpc.make(WS_METHODS.providerListAgents, {
  payload: ProviderListAgentsInput,
  success: ProviderListAgentsResult,
  error: WsRpcError,
});

/** 所有 WebSocket RPC 方法的分组，用于注册到 RPC 服务器 */
export const WsRpcGroup = RpcGroup.make(
  WsOrchestrationDispatchCommandRpc,
  WsOrchestrationImportThreadRpc,
  WsOrchestrationGetSnapshotRpc,
  WsOrchestrationGetShellSnapshotRpc,
  WsOrchestrationRepairStateRpc,
  WsOrchestrationGetTurnDiffRpc,
  WsOrchestrationGetFullThreadDiffRpc,
  WsOrchestrationReplayEventsRpc,
  WsOrchestrationSubscribeShellRpc,
  WsOrchestrationUnsubscribeShellRpc,
  WsOrchestrationSubscribeThreadRpc,
  WsOrchestrationUnsubscribeThreadRpc,
  WsOrchestrationSubscribeDomainEventsRpc,
  WsProjectsListDirectoriesRpc,
  WsProjectsSearchEntriesRpc,
  WsProjectsSearchLocalEntriesRpc,
  WsProjectsWriteFileRpc,
  WsFilesystemBrowseRpc,
  WsShellOpenInEditorRpc,
  WsGitStatusRpc,
  WsGitReadWorkingTreeDiffRpc,
  WsGitSummarizeDiffRpc,
  WsGitPullRpc,
  WsGitRunStackedActionRpc,
  WsGitResolvePullRequestRpc,
  WsGitPreparePullRequestThreadRpc,
  WsGitListBranchesRpc,
  WsGitCreateWorktreeRpc,
  WsGitCreateDetachedWorktreeRpc,
  WsGitRemoveWorktreeRpc,
  WsGitCreateBranchRpc,
  WsGitCheckoutRpc,
  WsGitStashAndCheckoutRpc,
  WsGitStashDropRpc,
  WsGitStashInfoRpc,
  WsGitRemoveIndexLockRpc,
  WsGitInitRpc,
  WsGitHandoffThreadRpc,
  WsTerminalOpenRpc,
  WsTerminalWriteRpc,
  WsTerminalResizeRpc,
  WsTerminalClearRpc,
  WsTerminalRestartRpc,
  WsTerminalCloseRpc,
  WsSubscribeTerminalEventsRpc,
  WsServerGetConfigRpc,
  WsServerGetEnvironmentRpc,
  WsServerGetSettingsRpc,
  WsServerUpdateSettingsRpc,
  WsServerRefreshProvidersRpc,
  WsServerUpdateProviderRpc,
  WsServerListWorktreesRpc,
  WsServerGetProviderUsageSnapshotRpc,
  WsServerGetDiagnosticsRpc,
  WsServerTranscribeVoiceRpc,
  WsServerUpsertKeybindingRpc,
  WsSubscribeServerLifecycleRpc,
  WsSubscribeServerConfigRpc,
  WsSubscribeServerProviderStatusesRpc,
  WsSubscribeServerSettingsRpc,
  WsProviderGetComposerCapabilitiesRpc,
  WsProviderCompactThreadRpc,
  WsProviderListCommandsRpc,
  WsProviderListSkillsRpc,
  WsProviderListPluginsRpc,
  WsProviderReadPluginRpc,
  WsProviderListModelsRpc,
  WsProviderListAgentsRpc,
  WsSkillsListLocalRpc,
);
