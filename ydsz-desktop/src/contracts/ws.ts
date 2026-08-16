/**
 * @file WebSocket 通信契约模块
 *
 * 本模块定义了 ydsz 工作区中 WebSocket 通信的所有契约，
 * 涵盖请求、响应、推送事件、通道等核心概念。
 *
 * ## 核心契约
 *
 * - `WS_METHODS`：所有 WebSocket RPC 方法名称常量
 * - `WS_CHANNELS`：所有 WebSocket 推送通道名称常量
 * - `WebSocketRequest`：WebSocket 请求结构
 * - `WebSocketResponse`：WebSocket 响应结构
 * - `WsPushSequence`：推送消息序列号
 * - `WsWelcomePayload`：连接成功后的欢迎信息
 * - `WsPushPayloadByChannel`：各通道的推送 payload 类型映射
 * - `WsPushChannel`：推送通道联合类型
 * - `WsPush`：所有推送消息的联合类型
 * - `WsResponse`：所有服务端→客户端消息的联合类型
 *
 * ## 协议设计
 *
 * - **请求-响应模式**：客户端发起请求，服务端返回响应
 * - **推送模式**：服务端主动推送事件到客户端
 * - **通道隔离**：不同类型的推送走不同的通道，避免混淆
 * - **序列号**：`WsPushSequence` 用于推送消息的排序
 *
 * ## 推送通道
 *
 * - `gitActionProgress`：Git 操作进度事件
 * - `terminalEvent`：终端事件
 * - `serverWelcome`：服务端欢迎消息
 * - `serverMaintenanceUpdated`：服务端维护状态更新
 * - `serverConfigUpdated`：服务端配置更新
 * - `serverProviderStatusesUpdated`：Provider 状态更新
 * - `serverSettingsUpdated`：服务端设置更新
 * - `orchestration.domainEvent`：编排层领域事件
 * - `orchestration.shellEvent`：编排层 Shell 事件
 * - `orchestration.threadEvent`：编排层 Thread 事件
 *
 * ## 使用场景
 *
 * - WebSocket 客户端发起 RPC 调用
 * - WebSocket 客户端订阅推送事件
 * - 服务端实现 WebSocket 处理器
 */

import { Schema } from "effect";
import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

import {
  ClientOrchestrationCommand,
  OrchestrationEvent,
  OrchestrationImportThreadInput,
  OrchestrationShellStreamItem,
  OrchestrationSubscribeShellInput,
  OrchestrationSubscribeThreadInput,
  OrchestrationThreadStreamItem,
  OrchestrationUnsubscribeShellInput,
  OrchestrationUnsubscribeThreadInput,
  ORCHESTRATION_WS_CHANNELS,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetShellSnapshotInput,
  OrchestrationRepairStateInput,
  ORCHESTRATION_WS_METHODS,
  OrchestrationGetSnapshotInput,
  OrchestrationGetTurnDiffInput,
  OrchestrationReplayEventsInput,
} from "./orchestration";
import {
  GitActionProgressEvent,
  GitAuthStatusInput,
  GitCheckoutInput,
  GitClosePullRequestInput,
  GitCommentPullRequestInput,
  GitCreateBranchInput,
  GitCreateDetachedWorktreeInput,
  GitCreatePullRequestInput,
  GitCreateWorktreeInput,
  GitDiffPullRequestInput,
  GitHandoffThreadInput,
  GitInitInput,
  GitListBranchesInput,
  GitListPullRequestsInput,
  GitMergePullRequestInput,
  GitPreparePullRequestThreadInput,
  GitPullInput,
  GitPullRequestRefInput,
  GitReadWorkingTreeDiffInput,
  GitReconcileWorktreesInput,
  GitRemoveWorktreeInput,
  GitRemoveIndexLockInput,
  GitReopenPullRequestInput,
  GitRunStackedActionInput,
  GitStashAndCheckoutInput,
  GitStashDropInput,
  GitStashInfoInput,
  GitStatusInput,
  GitSummarizeDiffInput,
  GitViewPullRequestInput,
} from "./git";
import {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalWriteInput,
} from "./terminal";
import { KeybindingRule } from "./keybindings";
import {
  ProjectListDirectoriesInput,
  ProjectSearchEntriesInput,
  ProjectSearchLocalEntriesInput,
  ProjectWriteFileInput,
} from "./project";
import { FilesystemBrowseInput } from "./filesystem";
import { OpenInEditorInputSchema } from "./editor";
import {
  AstGrepCompilePatternInput,
  AstGrepFindByNameInput,
  AstGrepFindByNodeKindInput,
  AstGrepFindByQueryInput,
  AstGrepListPresetsInput,
  AstGrepRewriteInput,
} from "./astGrep";
import {
  ServerConfigUpdatedPayload,
  ServerLifecycleStreamEvent,
  ServerProviderUpdateInput,
  ServerUpdateSettingsInput,
  ServerGetProviderUsageSnapshotInput,
  ServerProviderStatusesUpdatedPayload,
  ServerSettingsUpdatedPayload,
  ServerVoiceTranscriptionInput,
} from "./server";
import {
  ProviderListCommandsInput,
  ProviderGetComposerCapabilitiesInput,
  ProviderListPluginsInput,
  ProviderListModelsInput,
  ProviderListAgentsInput,
  ProviderReadPluginInput,
  ProviderListSkillsInput,
  ListLocalUserSkillsInput,
} from "./providerDiscovery";
import { ProviderCompactThreadInput } from "./provider";
import { UrlPreviewFetchMetadataInput } from "./urlPreview";
import {
  LinearSetApiKeyInput,
  LinearListTasksInput,
  LinearSearchTasksInput,
  LinearGetTaskInput,
  LinearCreateThreadFromTaskInput,
  LinearUpdateTaskStatusInput,
} from "./linear";

// ── WebSocket RPC Method Names ───────────────────────────────────────

/**
 * WebSocket RPC 方法名称常量集合。
 * 包含项目管理、Git、终端、Server、Provider Discovery 等所有可调用的 RPC 方法。
 */
export const WS_METHODS = {
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsListDirectories: "projects.listDirectories",
  projectsSearchEntries: "projects.searchEntries",
  projectsSearchLocalEntries: "projects.searchLocalEntries",
  projectsWriteFile: "projects.writeFile",

  // Filesystem browse methods
  filesystemBrowse: "filesystem.browse",

  // Shell methods
  shellOpenInEditor: "shell.openInEditor",

  // Git methods
  gitPull: "git.pull",
  gitStatus: "git.status",
  gitReadWorkingTreeDiff: "git.readWorkingTreeDiff",
  gitSummarizeDiff: "git.summarizeDiff",
  gitRunStackedAction: "git.runStackedAction",
  gitApply: "git.apply",
  gitListBranches: "git.listBranches",
  gitCreateWorktree: "git.createWorktree",
  gitCreateDetachedWorktree: "git.createDetachedWorktree",
  gitRemoveWorktree: "git.removeWorktree",
  gitReconcileWorktrees: "git.reconcileWorktrees",
  gitCreateBranch: "git.createBranch",
  gitCheckout: "git.checkout",
  gitStashAndCheckout: "git.stashAndCheckout",
  gitStashDrop: "git.stashDrop",
  gitStashInfo: "git.stashInfo",
  gitRemoveIndexLock: "git.removeIndexLock",
  gitInit: "git.init",
  gitHandoffThread: "git.handoffThread",
  gitResolvePullRequest: "git.resolvePullRequest",
  gitPreparePullRequestThread: "git.preparePullRequestThread",
  // GitHub PR 管理 RPC（对应后端 GitHubCli 方法）
  gitListPullRequests: "git.listPullRequests",
  gitViewPullRequest: "git.viewPullRequest",
  gitMergePullRequest: "git.mergePullRequest",
  gitCommentPullRequest: "git.commentPullRequest",
  gitDiffPullRequest: "git.diffPullRequest",
  gitClosePullRequest: "git.closePullRequest",
  gitReopenPullRequest: "git.reopenPullRequest",
  gitAuthStatus: "git.authStatus",
  gitCreatePullRequest: "git.createPullRequest",

  // Terminal methods
  terminalOpen: "terminal.open",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",

  // Server meta
  serverGetConfig: "server.getConfig",
  serverGetEnvironment: "server.getEnvironment",
  serverGetSettings: "server.getSettings",
  serverUpdateSettings: "server.updateSettings",
  serverRefreshProviders: "server.refreshProviders",
  serverUpdateProvider: "server.updateProvider",
  serverListWorktrees: "server.listWorktrees",
  serverGetProviderUsageSnapshot: "server.getProviderUsageSnapshot",
  serverGetDiagnostics: "server.getDiagnostics",
  serverTranscribeVoice: "server.transcribeVoice",
  serverUpsertKeybinding: "server.upsertKeybinding",
  subscribeServerLifecycle: "server.subscribeLifecycle",
  subscribeServerConfig: "server.subscribeConfig",
  subscribeServerProviderStatuses: "server.subscribeProviderStatuses",
  subscribeServerSettings: "server.subscribeSettings",

  // Streaming subscriptions
  subscribeTerminalEvents: "terminal.subscribeEvents",
  subscribeOrchestrationDomainEvents: "orchestration.subscribeDomainEvents",
  subscribeGitActionProgress: "git.subscribeActionProgress",

  // Provider discovery
  providerGetComposerCapabilities: "provider.getComposerCapabilities",
  providerCompactThread: "provider.compactThread",
  providerListCommands: "provider.listCommands",
  providerListSkills: "provider.listSkills",
  providerListPlugins: "provider.listPlugins",
  providerReadPlugin: "provider.readPlugin",
  providerListModels: "provider.listModels",
  providerListAgents: "provider.listAgents",

  // Local user skills (home-dir scan, independent of provider)
  skillsListLocal: "skills.listLocal",

  // Goal Mode (目标模式) methods
  goalStart: "goal_start",
  goalAbort: "goal_abort",
  goalListActive: "goal_list_active",
  goalGet: "goal_get",
  goalCleanup: "goal_cleanup",

  // Quest Mode (多步骤任务) methods
  questCreate: "quest_create",
  questStart: "quest_start",
  questPause: "quest_pause",
  questResume: "quest_resume",
  questAbort: "quest_abort",
  questGet: "quest_get",
  questListActive: "quest_list_active",
  questSkipStep: "quest_skip_step",
  questRetryStep: "quest_retry_step",
  questCleanup: "quest_cleanup",

  // Skill marketplace methods
  skillMarketplaceList: "skill_marketplace.list",
  skillMarketplaceTrending: "skill_marketplace.trending",
  skillMarketplaceSearch: "skill_marketplace.search",
  skillMarketplaceCategories: "skill_marketplace.categories",
  skillMarketplaceLookup: "skill_marketplace.lookup",
  skillMarketplaceInstall: "skill_marketplace.install",
  skillMarketplaceUninstall: "skill_marketplace.uninstall",
  skillMarketplaceListInstalled: "skill_marketplace.list_installed",
  skillMarketplaceLoadBody: "skill_marketplace.load_body",
  skillMarketplaceStatus: "skill_marketplace.status",
  skillMarketplaceRefresh: "skill_marketplace.refresh",
  skillMarketplaceSetUrl: "skill_marketplace.set_url",

  // Voice polish methods
  voicePolishText: "voice_polish.text",

  // URL 预览后端化（P0-3：fetch_metadata 抓取 OG meta + 30 分钟缓存）
  urlPreviewFetchMetadata: "url_preview.fetch_metadata",

  // Linear 集成（P3-1：Linear API 对接 + 从 task 创建 worktree 线程）
  linearSetApiKey: "linear.setApiKey",
  linearGetAuthStatus: "linear.getAuthStatus",
  linearClearApiKey: "linear.clearApiKey",
  linearListTasks: "linear.listTasks",
  linearSearchTasks: "linear.searchTasks",
  linearGetTask: "linear.getTask",
  linearCreateThreadFromTask: "linear.createThreadFromTask",
  linearUpdateTaskStatus: "linear.updateTaskStatus",

  // Indexer (AST-Grep 结构搜索) methods
  // 对应后端 `indexer.astGrep*` RPC，详见
  // ydsz-server/src/rpc_methods/handlers/indexer.rs。
  indexerAstGrepFindByNodeKind: "indexer.astGrepFindByNodeKind",
  indexerAstGrepFindByQuery: "indexer.astGrepFindByQuery",
  indexerAstGrepFindByName: "indexer.astGrepFindByName",
  indexerAstGrepListPresets: "indexer.astGrepListPresets",
  indexerAstGrepCompilePattern: "indexer.astGrepCompilePattern",
  indexerAstGrepRewrite: "indexer.astGrepRewrite",
} as const;

// ── Push Event Channels ──────────────────────────────────────────────

/**
 * WebSocket 推送通道名称常量集合。
 * 服务端通过这些通道主动向客户端推送事件。
 */
export const WS_CHANNELS = {
  gitActionProgress: "git.actionProgress",
  terminalEvent: "terminal.event",
  serverWelcome: "server.welcome",
  serverMaintenanceUpdated: "server.maintenanceUpdated",
  serverConfigUpdated: "server.configUpdated",
  serverProviderStatusesUpdated: "server.providerStatusesUpdated",
  serverSettingsUpdated: "server.settingsUpdated",
} as const;

// -- Tagged Union of all request body schemas ─────────────────────────

const tagRequestBody = <const Tag extends string, const Fields extends Schema.Struct.Fields>(
  tag: Tag,
  schema: Schema.Struct<Fields>,
) => Schema.extend(schema, Schema.Struct({ _tag: Schema.Literal(tag) }));

const WebSocketRequestBody = Schema.Union(
  // Orchestration methods
  tagRequestBody(
    ORCHESTRATION_WS_METHODS.dispatchCommand,
    Schema.Struct({ command: ClientOrchestrationCommand }),
  ),
  tagRequestBody(ORCHESTRATION_WS_METHODS.importThread, OrchestrationImportThreadInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getSnapshot, OrchestrationGetSnapshotInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getShellSnapshot, OrchestrationGetShellSnapshotInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.repairState, OrchestrationRepairStateInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getTurnDiff, OrchestrationGetTurnDiffInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getFullThreadDiff, OrchestrationGetFullThreadDiffInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getTurnAiShareSnapshot, Schema.Struct({})),
  tagRequestBody(ORCHESTRATION_WS_METHODS.replayEvents, OrchestrationReplayEventsInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.subscribeShell, OrchestrationSubscribeShellInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.unsubscribeShell, OrchestrationUnsubscribeShellInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.subscribeThread, OrchestrationSubscribeThreadInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.unsubscribeThread, OrchestrationUnsubscribeThreadInput),

  // Project Search
  tagRequestBody(WS_METHODS.projectsListDirectories, ProjectListDirectoriesInput),
  tagRequestBody(WS_METHODS.projectsSearchEntries, ProjectSearchEntriesInput),
  tagRequestBody(WS_METHODS.projectsSearchLocalEntries, ProjectSearchLocalEntriesInput),
  tagRequestBody(WS_METHODS.projectsWriteFile, ProjectWriteFileInput),

  // Filesystem browse
  tagRequestBody(WS_METHODS.filesystemBrowse, FilesystemBrowseInput),

  // Shell methods
  tagRequestBody(WS_METHODS.shellOpenInEditor, OpenInEditorInputSchema),

  // Git methods
  tagRequestBody(WS_METHODS.gitPull, GitPullInput),
  tagRequestBody(WS_METHODS.gitStatus, GitStatusInput),
  tagRequestBody(WS_METHODS.gitReadWorkingTreeDiff, GitReadWorkingTreeDiffInput),
  tagRequestBody(WS_METHODS.gitSummarizeDiff, GitSummarizeDiffInput),
  tagRequestBody(WS_METHODS.gitRunStackedAction, GitRunStackedActionInput),
  tagRequestBody(WS_METHODS.gitListBranches, GitListBranchesInput),
  tagRequestBody(WS_METHODS.gitCreateWorktree, GitCreateWorktreeInput),
  tagRequestBody(WS_METHODS.gitCreateDetachedWorktree, GitCreateDetachedWorktreeInput),
  tagRequestBody(WS_METHODS.gitRemoveWorktree, GitRemoveWorktreeInput),
  tagRequestBody(WS_METHODS.gitReconcileWorktrees, GitReconcileWorktreesInput),
  tagRequestBody(WS_METHODS.gitCreateBranch, GitCreateBranchInput),
  tagRequestBody(WS_METHODS.gitCheckout, GitCheckoutInput),
  tagRequestBody(WS_METHODS.gitStashAndCheckout, GitStashAndCheckoutInput),
  tagRequestBody(WS_METHODS.gitStashDrop, GitStashDropInput),
  tagRequestBody(WS_METHODS.gitStashInfo, GitStashInfoInput),
  tagRequestBody(WS_METHODS.gitRemoveIndexLock, GitRemoveIndexLockInput),
  tagRequestBody(WS_METHODS.gitInit, GitInitInput),
  tagRequestBody(WS_METHODS.gitHandoffThread, GitHandoffThreadInput),
  tagRequestBody(WS_METHODS.gitResolvePullRequest, GitPullRequestRefInput),
  tagRequestBody(WS_METHODS.gitPreparePullRequestThread, GitPreparePullRequestThreadInput),
  // GitHub PR 管理 RPC
  tagRequestBody(WS_METHODS.gitListPullRequests, GitListPullRequestsInput),
  tagRequestBody(WS_METHODS.gitViewPullRequest, GitViewPullRequestInput),
  tagRequestBody(WS_METHODS.gitMergePullRequest, GitMergePullRequestInput),
  tagRequestBody(WS_METHODS.gitCommentPullRequest, GitCommentPullRequestInput),
  tagRequestBody(WS_METHODS.gitDiffPullRequest, GitDiffPullRequestInput),
  tagRequestBody(WS_METHODS.gitClosePullRequest, GitClosePullRequestInput),
  tagRequestBody(WS_METHODS.gitReopenPullRequest, GitReopenPullRequestInput),
  tagRequestBody(WS_METHODS.gitAuthStatus, GitAuthStatusInput),
  tagRequestBody(WS_METHODS.gitCreatePullRequest, GitCreatePullRequestInput),

  // Terminal methods
  tagRequestBody(WS_METHODS.terminalOpen, TerminalOpenInput),
  tagRequestBody(WS_METHODS.terminalWrite, TerminalWriteInput),
  tagRequestBody(WS_METHODS.terminalResize, TerminalResizeInput),
  tagRequestBody(WS_METHODS.terminalClear, TerminalClearInput),
  tagRequestBody(WS_METHODS.terminalRestart, TerminalRestartInput),
  tagRequestBody(WS_METHODS.terminalClose, TerminalCloseInput),

  // Server meta
  tagRequestBody(WS_METHODS.serverGetConfig, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverGetEnvironment, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverGetSettings, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverUpdateSettings, ServerUpdateSettingsInput),
  tagRequestBody(WS_METHODS.serverRefreshProviders, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverUpdateProvider, ServerProviderUpdateInput),
  tagRequestBody(WS_METHODS.serverListWorktrees, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverGetProviderUsageSnapshot, ServerGetProviderUsageSnapshotInput),
  tagRequestBody(WS_METHODS.serverGetDiagnostics, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverTranscribeVoice, ServerVoiceTranscriptionInput),
  tagRequestBody(WS_METHODS.serverUpsertKeybinding, KeybindingRule),

  // Provider discovery
  tagRequestBody(WS_METHODS.providerGetComposerCapabilities, ProviderGetComposerCapabilitiesInput),
  tagRequestBody(WS_METHODS.providerCompactThread, ProviderCompactThreadInput),
  tagRequestBody(WS_METHODS.providerListCommands, ProviderListCommandsInput),
  tagRequestBody(WS_METHODS.providerListSkills, ProviderListSkillsInput),
  tagRequestBody(WS_METHODS.providerListPlugins, ProviderListPluginsInput),
  tagRequestBody(WS_METHODS.providerReadPlugin, ProviderReadPluginInput),
  tagRequestBody(WS_METHODS.providerListModels, ProviderListModelsInput),
  tagRequestBody(WS_METHODS.providerListAgents, ProviderListAgentsInput),
  tagRequestBody(WS_METHODS.skillsListLocal, ListLocalUserSkillsInput),

  // Goal Mode
  tagRequestBody(WS_METHODS.goalStart, Schema.Struct({ threadId: Schema.String, description: Schema.String })),
  tagRequestBody(WS_METHODS.goalAbort, Schema.Struct({ goalId: Schema.String, reason: Schema.optional(Schema.String) })),
  tagRequestBody(WS_METHODS.goalListActive, Schema.Struct({})),
  tagRequestBody(WS_METHODS.goalGet, Schema.Struct({ goalId: Schema.String })),
  tagRequestBody(WS_METHODS.goalCleanup, Schema.Struct({})),

  // Quest Mode
  tagRequestBody(WS_METHODS.questCreate, Schema.Struct({
    threadId: Schema.String,
    title: Schema.String,
    description: Schema.optional(Schema.String),
    steps: Schema.optional(Schema.Array(Schema.Struct({
      title: Schema.String,
      description: Schema.optional(Schema.String),
    }))),
  })),
  tagRequestBody(WS_METHODS.questStart, Schema.Struct({ questId: Schema.String })),
  tagRequestBody(WS_METHODS.questPause, Schema.Struct({ questId: Schema.String })),
  tagRequestBody(WS_METHODS.questResume, Schema.Struct({ questId: Schema.String })),
  tagRequestBody(WS_METHODS.questAbort, Schema.Struct({ questId: Schema.String, reason: Schema.optional(Schema.String) })),
  tagRequestBody(WS_METHODS.questGet, Schema.Struct({ questId: Schema.String })),
  tagRequestBody(WS_METHODS.questListActive, Schema.Struct({})),
  tagRequestBody(WS_METHODS.questSkipStep, Schema.Struct({ questId: Schema.String })),
  tagRequestBody(WS_METHODS.questRetryStep, Schema.Struct({ questId: Schema.String })),
  tagRequestBody(WS_METHODS.questCleanup, Schema.Struct({})),

  // Skill marketplace
  tagRequestBody(WS_METHODS.skillMarketplaceList, Schema.Struct({ tag: Schema.optional(Schema.Union(Schema.String, Schema.Null)), runtime: Schema.optional(Schema.Union(Schema.String, Schema.Null)) })),
  tagRequestBody(WS_METHODS.skillMarketplaceTrending, Schema.Struct({ limit: Schema.optional(Schema.Number) })),
  tagRequestBody(WS_METHODS.skillMarketplaceSearch, Schema.Struct({ query: Schema.String, category: Schema.optional(Schema.String) })),
  tagRequestBody(WS_METHODS.skillMarketplaceCategories, Schema.Struct({})),
  tagRequestBody(WS_METHODS.skillMarketplaceLookup, Schema.Struct({ slug: Schema.String })),
  tagRequestBody(WS_METHODS.skillMarketplaceInstall, Schema.Struct({ source: Schema.String })),
  tagRequestBody(WS_METHODS.skillMarketplaceUninstall, Schema.Struct({ name: Schema.String })),
  tagRequestBody(WS_METHODS.skillMarketplaceListInstalled, Schema.Struct({})),
  tagRequestBody(WS_METHODS.skillMarketplaceLoadBody, Schema.Struct({ name: Schema.String })),
  tagRequestBody(WS_METHODS.skillMarketplaceStatus, Schema.Struct({})),
  tagRequestBody(WS_METHODS.skillMarketplaceRefresh, Schema.Struct({})),
  tagRequestBody(WS_METHODS.skillMarketplaceSetUrl, Schema.Struct({ url: Schema.optional(Schema.Union(Schema.String, Schema.Null)), refresh: Schema.optional(Schema.Boolean) })),

  // Indexer AST-Grep 结构搜索
  tagRequestBody(WS_METHODS.indexerAstGrepFindByNodeKind, AstGrepFindByNodeKindInput),
  tagRequestBody(WS_METHODS.indexerAstGrepFindByQuery, AstGrepFindByQueryInput),
  tagRequestBody(WS_METHODS.indexerAstGrepFindByName, AstGrepFindByNameInput),
  tagRequestBody(WS_METHODS.indexerAstGrepListPresets, AstGrepListPresetsInput),
  tagRequestBody(WS_METHODS.indexerAstGrepCompilePattern, AstGrepCompilePatternInput),
  tagRequestBody(WS_METHODS.indexerAstGrepRewrite, AstGrepRewriteInput),

  // URL 预览后端化（P0-3）
  tagRequestBody(WS_METHODS.urlPreviewFetchMetadata, UrlPreviewFetchMetadataInput),

  // Linear 集成（P3-1）
  tagRequestBody(WS_METHODS.linearSetApiKey, LinearSetApiKeyInput),
  tagRequestBody(WS_METHODS.linearListTasks, LinearListTasksInput),
  tagRequestBody(WS_METHODS.linearSearchTasks, LinearSearchTasksInput),
  tagRequestBody(WS_METHODS.linearGetTask, LinearGetTaskInput),
  tagRequestBody(WS_METHODS.linearCreateThreadFromTask, LinearCreateThreadFromTaskInput),
  tagRequestBody(WS_METHODS.linearUpdateTaskStatus, LinearUpdateTaskStatusInput),
);

/** WebSocket 请求结构，包含请求 ID 和请求体 */
export const WebSocketRequest = Schema.Struct({
  id: TrimmedNonEmptyString,
  body: WebSocketRequestBody,
});
export type WebSocketRequest = typeof WebSocketRequest.Type;

/** WebSocket 响应结构，包含请求 ID、结果或错误信息 */
export const WebSocketResponse = Schema.Struct({
  id: TrimmedNonEmptyString,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      message: Schema.String,
    }),
  ),
});
export type WebSocketResponse = typeof WebSocketResponse.Type;

/** 推送消息序列号，用于保证推送消息的顺序 */
export const WsPushSequence = NonNegativeInt;
export type WsPushSequence = typeof WsPushSequence.Type;

/**
 * 连接成功后的欢迎信息负载。
 * 包含当前工作目录、用户主目录、项目信息和引导线程信息。
 */
export const WsWelcomePayload = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  homeDir: Schema.optional(TrimmedNonEmptyString),
  projectName: TrimmedNonEmptyString,
  bootstrapProjectId: Schema.optional(ProjectId),
  bootstrapThreadId: Schema.optional(ThreadId),
});
export type WsWelcomePayload = typeof WsWelcomePayload.Type;

/**
 * 各推送通道对应的 payload 类型映射。
 * 用于在 TypeScript 中实现类型安全的通道分发。
 */
export interface WsPushPayloadByChannel {
  readonly [WS_CHANNELS.serverWelcome]: WsWelcomePayload;
  readonly [WS_CHANNELS.serverMaintenanceUpdated]: ServerLifecycleStreamEvent;
  readonly [WS_CHANNELS.serverConfigUpdated]: typeof ServerConfigUpdatedPayload.Type;
  readonly [WS_CHANNELS.serverProviderStatusesUpdated]: typeof ServerProviderStatusesUpdatedPayload.Type;
  readonly [WS_CHANNELS.serverSettingsUpdated]: typeof ServerSettingsUpdatedPayload.Type;
  readonly [WS_CHANNELS.gitActionProgress]: typeof GitActionProgressEvent.Type;
  readonly [WS_CHANNELS.terminalEvent]: typeof TerminalEvent.Type;
  readonly [ORCHESTRATION_WS_CHANNELS.domainEvent]: OrchestrationEvent;
  readonly [ORCHESTRATION_WS_CHANNELS.shellEvent]: OrchestrationShellStreamItem;
  readonly [ORCHESTRATION_WS_CHANNELS.threadEvent]: OrchestrationThreadStreamItem;
}

/** 推送通道联合类型 */
export type WsPushChannel = keyof WsPushPayloadByChannel;
/** 根据通道类型获取对应的 payload 类型 */
export type WsPushData<C extends WsPushChannel> = WsPushPayloadByChannel[C];

const makeWsPushSchema = <const Channel extends string, Payload extends Schema.Schema.Any>(
  channel: Channel,
  payload: Payload,
) =>
  Schema.Struct({
    type: Schema.Literal("push"),
    sequence: WsPushSequence,
    channel: Schema.Literal(channel),
    data: payload,
  });

/** 服务端欢迎消息推送 */
export const WsPushServerWelcome = makeWsPushSchema(WS_CHANNELS.serverWelcome, WsWelcomePayload);
/** 服务端维护状态更新推送 */
export const WsPushServerMaintenanceUpdated = makeWsPushSchema(
  WS_CHANNELS.serverMaintenanceUpdated,
  ServerLifecycleStreamEvent,
);
/** 服务端配置更新推送 */
export const WsPushServerConfigUpdated = makeWsPushSchema(
  WS_CHANNELS.serverConfigUpdated,
  ServerConfigUpdatedPayload,
);
/** Provider 状态更新推送 */
export const WsPushServerProviderStatusesUpdated = makeWsPushSchema(
  WS_CHANNELS.serverProviderStatusesUpdated,
  ServerProviderStatusesUpdatedPayload,
);
/** 服务端设置更新推送 */
export const WsPushServerSettingsUpdated = makeWsPushSchema(
  WS_CHANNELS.serverSettingsUpdated,
  ServerSettingsUpdatedPayload,
);
/** Git 操作进度推送 */
export const WsPushGitActionProgress = makeWsPushSchema(
  WS_CHANNELS.gitActionProgress,
  GitActionProgressEvent,
);
/** 终端事件推送 */
export const WsPushTerminalEvent = makeWsPushSchema(WS_CHANNELS.terminalEvent, TerminalEvent);
/** 编排层领域事件推送 */
export const WsPushOrchestrationDomainEvent = makeWsPushSchema(
  ORCHESTRATION_WS_CHANNELS.domainEvent,
  OrchestrationEvent,
);
/** 编排层 Shell 事件推送 */
export const WsPushOrchestrationShellEvent = makeWsPushSchema(
  ORCHESTRATION_WS_CHANNELS.shellEvent,
  OrchestrationShellStreamItem,
);
/** 编排层 Thread 事件推送 */
export const WsPushOrchestrationThreadEvent = makeWsPushSchema(
  ORCHESTRATION_WS_CHANNELS.threadEvent,
  OrchestrationThreadStreamItem,
);

/** 推送通道 Schema 联合类型 */
export const WsPushChannelSchema = Schema.Literal(
  WS_CHANNELS.gitActionProgress,
  WS_CHANNELS.serverWelcome,
  WS_CHANNELS.serverMaintenanceUpdated,
  WS_CHANNELS.serverConfigUpdated,
  WS_CHANNELS.serverProviderStatusesUpdated,
  WS_CHANNELS.serverSettingsUpdated,
  WS_CHANNELS.terminalEvent,
  ORCHESTRATION_WS_CHANNELS.domainEvent,
  ORCHESTRATION_WS_CHANNELS.shellEvent,
  ORCHESTRATION_WS_CHANNELS.threadEvent,
);
export type WsPushChannelSchema = typeof WsPushChannelSchema.Type;

/**
 * 所有推送消息的联合类型。
 * 客户端根据 `channel` 字段分发到不同的处理器。
 */
export const WsPush = Schema.Union(
  WsPushServerWelcome,
  WsPushServerMaintenanceUpdated,
  WsPushServerConfigUpdated,
  WsPushServerProviderStatusesUpdated,
  WsPushServerSettingsUpdated,
  WsPushGitActionProgress,
  WsPushTerminalEvent,
  WsPushOrchestrationDomainEvent,
  WsPushOrchestrationShellEvent,
  WsPushOrchestrationThreadEvent,
);
export type WsPush = typeof WsPush.Type;

/**
 * 根据通道类型提取对应的推送消息类型。
 * @example
 * type WelcomeMessage = WsPushMessage<"server.welcome">;
 */
export type WsPushMessage<C extends WsPushChannel> = Extract<WsPush, { channel: C }>;

/** 推送消息信封基础结构（data 字段为未知类型） */
export const WsPushEnvelopeBase = Schema.Struct({
  type: Schema.Literal("push"),
  sequence: WsPushSequence,
  channel: WsPushChannelSchema,
  data: Schema.Unknown,
});
export type WsPushEnvelopeBase = typeof WsPushEnvelopeBase.Type;

// ── Union of all server → client messages ─────────────────────────────

/**
 * 所有服务端→客户端消息的联合类型。
 * 包括 RPC 响应和推送消息。
 */
export const WsResponse = Schema.Union(WebSocketResponse, WsPush);
export type WsResponse = typeof WsResponse.Type;
