/**
 * @file RPC 契约模块
 *
 * 本模块基于 Effect 的 `RpcGroup` 机制定义 Remi 系统的 RPC（远程过程调用）契约，
 * 用于在客户端（Web）与服务端（Rust）之间实现类型安全的 RPC 调用。
 *
 * ## 核心概念
 *
 * - **Rpc**：单个 RPC 方法定义（输入、输出、错误、流式）
 * - **RpcGroup**：RPC 方法的集合，类似于 API 控制器
 * - **Router**：RPC 路由器，负责将请求分发到对应处理器
 *
 * ## 核心契约
 *
 * - `RemiRpcGroup`：Remi 系统所有 RPC 方法的集合
 * - `RemiRpcRouter`：RPC 路由器，绑定所有方法的实现
 * - 各业务域的 RpcGroup：Auth / Git / Project / Provider / Terminal / Settings 等
 *
 * ## 使用场景
 *
 * - 客户端使用 `RemiRpcRouter` 发起类型安全的远程调用
 * - 服务端实现各 RpcGroup 并注册到 Router
 * - 跨语言互操作：客户端 TypeScript，服务端 Rust
 *
 * ## 与 WS/IPC 的区别
 *
 * - **WS**：双向流式通信，适合长连接、实时事件
 * - **IPC**：单次请求-响应，适合简单操作
 * - **RPC**：类型安全的远程调用，适合复杂业务逻辑
 *
 * ## 注意事项
 *
 * - RPC 调用在网络层走 WebSocket
 * - 错误通过 Effect 的 typed error 传递
 * - 流式响应通过 `Stream` 类型实现
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

export class WsRpcError extends Schema.TaggedErrorClass<WsRpcError>()("WsRpcError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export const WsOrchestrationDispatchCommandRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.dispatchCommand,
  {
    payload: ClientOrchestrationCommand,
    success: OrchestrationRpcSchemas.dispatchCommand.output,
    error: WsRpcError,
  },
);

export const WsOrchestrationImportThreadRpc = Rpc.make(ORCHESTRATION_WS_METHODS.importThread, {
  payload: OrchestrationImportThreadInput,
  success: OrchestrationImportThreadResult,
  error: WsRpcError,
});

export const WsOrchestrationGetSnapshotRpc = Rpc.make(ORCHESTRATION_WS_METHODS.getSnapshot, {
  payload: OrchestrationRpcSchemas.getSnapshot.input,
  success: OrchestrationRpcSchemas.getSnapshot.output,
  error: WsRpcError,
});

export const WsOrchestrationGetShellSnapshotRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getShellSnapshot,
  {
    payload: OrchestrationRpcSchemas.getShellSnapshot.input,
    success: OrchestrationRpcSchemas.getShellSnapshot.output,
    error: WsRpcError,
  },
);

export const WsOrchestrationRepairStateRpc = Rpc.make(ORCHESTRATION_WS_METHODS.repairState, {
  payload: OrchestrationRpcSchemas.repairState.input,
  success: OrchestrationRpcSchemas.repairState.output,
  error: WsRpcError,
});

export const WsOrchestrationGetTurnDiffRpc = Rpc.make(ORCHESTRATION_WS_METHODS.getTurnDiff, {
  payload: OrchestrationRpcSchemas.getTurnDiff.input,
  success: OrchestrationRpcSchemas.getTurnDiff.output,
  error: WsRpcError,
});

export const WsOrchestrationGetFullThreadDiffRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getFullThreadDiff,
  {
    payload: OrchestrationRpcSchemas.getFullThreadDiff.input,
    success: OrchestrationRpcSchemas.getFullThreadDiff.output,
    error: WsRpcError,
  },
);

export const WsOrchestrationReplayEventsRpc = Rpc.make(ORCHESTRATION_WS_METHODS.replayEvents, {
  payload: OrchestrationRpcSchemas.replayEvents.input,
  success: OrchestrationRpcSchemas.replayEvents.output,
  error: WsRpcError,
});

export const WsOrchestrationSubscribeShellRpc = Rpc.make(ORCHESTRATION_WS_METHODS.subscribeShell, {
  payload: OrchestrationRpcSchemas.subscribeShell.input,
  success: OrchestrationShellStreamItem,
  error: WsRpcError,
  stream: true,
});

export const WsOrchestrationUnsubscribeShellRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.unsubscribeShell,
  {
    payload: OrchestrationRpcSchemas.unsubscribeShell.input,
    success: Schema.Void,
    error: WsRpcError,
  },
);

export const WsOrchestrationSubscribeThreadRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.subscribeThread,
  {
    payload: OrchestrationRpcSchemas.subscribeThread.input,
    success: OrchestrationThreadStreamItem,
    error: WsRpcError,
    stream: true,
  },
);

export const WsOrchestrationSubscribeDomainEventsRpc = Rpc.make(
  WS_METHODS.subscribeOrchestrationDomainEvents,
  {
    payload: Schema.Struct({}),
    success: OrchestrationEvent,
    error: WsRpcError,
    stream: true,
  },
);

export const WsOrchestrationUnsubscribeThreadRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.unsubscribeThread,
  {
    payload: OrchestrationRpcSchemas.unsubscribeThread.input,
    success: Schema.Void,
    error: WsRpcError,
  },
);

export const WsProjectsListDirectoriesRpc = Rpc.make(WS_METHODS.projectsListDirectories, {
  payload: ProjectListDirectoriesInput,
  success: ProjectListDirectoriesResult,
  error: WsRpcError,
});

export const WsProjectsSearchEntriesRpc = Rpc.make(WS_METHODS.projectsSearchEntries, {
  payload: ProjectSearchEntriesInput,
  success: ProjectSearchEntriesResult,
  error: WsRpcError,
});

export const WsProjectsSearchLocalEntriesRpc = Rpc.make(WS_METHODS.projectsSearchLocalEntries, {
  payload: ProjectSearchLocalEntriesInput,
  success: ProjectSearchLocalEntriesResult,
  error: WsRpcError,
});

export const WsProjectsWriteFileRpc = Rpc.make(WS_METHODS.projectsWriteFile, {
  payload: ProjectWriteFileInput,
  success: ProjectWriteFileResult,
  error: WsRpcError,
});

export const WsFilesystemBrowseRpc = Rpc.make(WS_METHODS.filesystemBrowse, {
  payload: FilesystemBrowseInput,
  success: FilesystemBrowseResult,
  error: WsRpcError,
});

export const WsShellOpenInEditorRpc = Rpc.make(WS_METHODS.shellOpenInEditor, {
  payload: OpenInEditorInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitStatusRpc = Rpc.make(WS_METHODS.gitStatus, {
  payload: GitStatusInput,
  success: GitStatusResult,
  error: WsRpcError,
});

export const WsGitReadWorkingTreeDiffRpc = Rpc.make(WS_METHODS.gitReadWorkingTreeDiff, {
  payload: GitReadWorkingTreeDiffInput,
  success: GitReadWorkingTreeDiffResult,
  error: WsRpcError,
});

export const WsGitSummarizeDiffRpc = Rpc.make(WS_METHODS.gitSummarizeDiff, {
  payload: GitSummarizeDiffInput,
  success: GitSummarizeDiffResult,
  error: WsRpcError,
});

export const WsGitPullRpc = Rpc.make(WS_METHODS.gitPull, {
  payload: GitPullInput,
  success: GitPullResult,
  error: WsRpcError,
});

export const WsGitRunStackedActionRpc = Rpc.make(WS_METHODS.gitRunStackedAction, {
  payload: GitRunStackedActionInput,
  success: GitActionProgressEvent,
  error: WsRpcError,
  stream: true,
});

export const WsGitResolvePullRequestRpc = Rpc.make(WS_METHODS.gitResolvePullRequest, {
  payload: GitPullRequestRefInput,
  success: GitResolvePullRequestResult,
  error: WsRpcError,
});

export const WsGitPreparePullRequestThreadRpc = Rpc.make(WS_METHODS.gitPreparePullRequestThread, {
  payload: GitPreparePullRequestThreadInput,
  success: GitPreparePullRequestThreadResult,
  error: WsRpcError,
});

export const WsGitListBranchesRpc = Rpc.make(WS_METHODS.gitListBranches, {
  payload: GitListBranchesInput,
  success: GitListBranchesResult,
  error: WsRpcError,
});

export const WsGitCreateWorktreeRpc = Rpc.make(WS_METHODS.gitCreateWorktree, {
  payload: GitCreateWorktreeInput,
  success: GitCreateWorktreeResult,
  error: WsRpcError,
});

export const WsGitCreateDetachedWorktreeRpc = Rpc.make(WS_METHODS.gitCreateDetachedWorktree, {
  payload: GitCreateDetachedWorktreeInput,
  success: GitCreateDetachedWorktreeResult,
  error: WsRpcError,
});

export const WsGitRemoveWorktreeRpc = Rpc.make(WS_METHODS.gitRemoveWorktree, {
  payload: GitRemoveWorktreeInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitCreateBranchRpc = Rpc.make(WS_METHODS.gitCreateBranch, {
  payload: GitCreateBranchInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitCheckoutRpc = Rpc.make(WS_METHODS.gitCheckout, {
  payload: GitCheckoutInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitStashAndCheckoutRpc = Rpc.make(WS_METHODS.gitStashAndCheckout, {
  payload: GitStashAndCheckoutInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitStashDropRpc = Rpc.make(WS_METHODS.gitStashDrop, {
  payload: GitStashDropInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitStashInfoRpc = Rpc.make(WS_METHODS.gitStashInfo, {
  payload: GitStashInfoInput,
  success: GitStashInfoResult,
  error: WsRpcError,
});

export const WsGitRemoveIndexLockRpc = Rpc.make(WS_METHODS.gitRemoveIndexLock, {
  payload: GitRemoveIndexLockInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitInitRpc = Rpc.make(WS_METHODS.gitInit, {
  payload: GitInitInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsGitHandoffThreadRpc = Rpc.make(WS_METHODS.gitHandoffThread, {
  payload: GitHandoffThreadInput,
  success: GitHandoffThreadResult,
  error: WsRpcError,
});

export const WsTerminalOpenRpc = Rpc.make(WS_METHODS.terminalOpen, {
  payload: TerminalOpenInput,
  success: TerminalSessionSnapshot,
  error: WsRpcError,
});

export const WsTerminalWriteRpc = Rpc.make(WS_METHODS.terminalWrite, {
  payload: TerminalWriteInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsTerminalResizeRpc = Rpc.make(WS_METHODS.terminalResize, {
  payload: TerminalResizeInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsTerminalClearRpc = Rpc.make(WS_METHODS.terminalClear, {
  payload: TerminalClearInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsTerminalRestartRpc = Rpc.make(WS_METHODS.terminalRestart, {
  payload: TerminalRestartInput,
  success: TerminalSessionSnapshot,
  error: WsRpcError,
});

export const WsTerminalCloseRpc = Rpc.make(WS_METHODS.terminalClose, {
  payload: TerminalCloseInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsSubscribeTerminalEventsRpc = Rpc.make(WS_METHODS.subscribeTerminalEvents, {
  payload: Schema.Struct({}),
  success: TerminalEvent,
  error: WsRpcError,
  stream: true,
});

export const WsServerGetConfigRpc = Rpc.make(WS_METHODS.serverGetConfig, {
  payload: Schema.Struct({}),
  success: ServerConfig,
  error: WsRpcError,
});

export const WsServerGetEnvironmentRpc = Rpc.make(WS_METHODS.serverGetEnvironment, {
  payload: Schema.Struct({}),
  success: ServerGetEnvironmentResult,
  error: WsRpcError,
});

export const WsServerGetSettingsRpc = Rpc.make(WS_METHODS.serverGetSettings, {
  payload: Schema.Struct({}),
  success: ServerGetSettingsResult,
  error: WsRpcError,
});

export const WsServerUpdateSettingsRpc = Rpc.make(WS_METHODS.serverUpdateSettings, {
  payload: ServerUpdateSettingsInput,
  success: ServerUpdateSettingsResult,
  error: WsRpcError,
});

export const WsServerRefreshProvidersRpc = Rpc.make(WS_METHODS.serverRefreshProviders, {
  payload: Schema.Struct({}),
  success: ServerRefreshProvidersResult,
  error: WsRpcError,
});

export const WsServerUpdateProviderRpc = Rpc.make(WS_METHODS.serverUpdateProvider, {
  payload: ServerProviderUpdateInput,
  success: ServerProviderUpdateResult,
  error: ServerProviderUpdateError,
});

export const WsServerListWorktreesRpc = Rpc.make(WS_METHODS.serverListWorktrees, {
  payload: Schema.Struct({}),
  success: ServerListWorktreesResult,
  error: WsRpcError,
});

export const WsServerGetProviderUsageSnapshotRpc = Rpc.make(
  WS_METHODS.serverGetProviderUsageSnapshot,
  {
    payload: ServerGetProviderUsageSnapshotInput,
    success: ServerGetProviderUsageSnapshotResult,
    error: WsRpcError,
  },
);

export const WsServerGetDiagnosticsRpc = Rpc.make(WS_METHODS.serverGetDiagnostics, {
  payload: Schema.Struct({}),
  success: ServerDiagnosticsResult,
  error: WsRpcError,
});

export const WsServerTranscribeVoiceRpc = Rpc.make(WS_METHODS.serverTranscribeVoice, {
  payload: ServerVoiceTranscriptionInput,
  success: ServerVoiceTranscriptionResult,
  error: WsRpcError,
});

export const WsServerUpsertKeybindingRpc = Rpc.make(WS_METHODS.serverUpsertKeybinding, {
  payload: KeybindingRule,
  success: ServerUpsertKeybindingResult,
  error: WsRpcError,
});

export const WsSubscribeServerLifecycleRpc = Rpc.make(WS_METHODS.subscribeServerLifecycle, {
  payload: Schema.Struct({}),
  success: ServerLifecycleStreamEvent,
  error: WsRpcError,
  stream: true,
});

export const WsSubscribeServerConfigRpc = Rpc.make(WS_METHODS.subscribeServerConfig, {
  payload: Schema.Struct({}),
  success: ServerConfigStreamEvent,
  error: WsRpcError,
  stream: true,
});

export const WsSubscribeServerProviderStatusesRpc = Rpc.make(
  WS_METHODS.subscribeServerProviderStatuses,
  {
    payload: Schema.Struct({}),
    success: ServerRefreshProvidersResult,
    error: WsRpcError,
    stream: true,
  },
);

export const WsSubscribeServerSettingsRpc = Rpc.make(WS_METHODS.subscribeServerSettings, {
  payload: Schema.Struct({}),
  success: Schema.Struct({ settings: ServerGetSettingsResult }),
  error: WsRpcError,
  stream: true,
});

export const WsProviderGetComposerCapabilitiesRpc = Rpc.make(
  WS_METHODS.providerGetComposerCapabilities,
  {
    payload: ProviderGetComposerCapabilitiesInput,
    success: ProviderComposerCapabilities,
    error: WsRpcError,
  },
);

export const WsProviderCompactThreadRpc = Rpc.make(WS_METHODS.providerCompactThread, {
  payload: ProviderCompactThreadInput,
  success: Schema.Void,
  error: WsRpcError,
});

export const WsProviderListCommandsRpc = Rpc.make(WS_METHODS.providerListCommands, {
  payload: ProviderListCommandsInput,
  success: ProviderListCommandsResult,
  error: WsRpcError,
});

export const WsProviderListSkillsRpc = Rpc.make(WS_METHODS.providerListSkills, {
  payload: ProviderListSkillsInput,
  success: ProviderListSkillsResult,
  error: WsRpcError,
});

export const WsSkillsListLocalRpc = Rpc.make(WS_METHODS.skillsListLocal, {
  payload: ListLocalUserSkillsInput,
  success: ListLocalUserSkillsResult,
  error: WsRpcError,
});

export const WsProviderListPluginsRpc = Rpc.make(WS_METHODS.providerListPlugins, {
  payload: ProviderListPluginsInput,
  success: ProviderListPluginsResult,
  error: WsRpcError,
});

export const WsProviderReadPluginRpc = Rpc.make(WS_METHODS.providerReadPlugin, {
  payload: ProviderReadPluginInput,
  success: ProviderReadPluginResult,
  error: WsRpcError,
});

export const WsProviderListModelsRpc = Rpc.make(WS_METHODS.providerListModels, {
  payload: ProviderListModelsInput,
  success: ProviderListModelsResult,
  error: WsRpcError,
});

export const WsProviderListAgentsRpc = Rpc.make(WS_METHODS.providerListAgents, {
  payload: ProviderListAgentsInput,
  success: ProviderListAgentsResult,
  error: WsRpcError,
});

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
