/**
 * WebSocket 通信协议定义。
 * 包含 RPC 方法名常量、推送通道常量、请求/响应格式、推送消息类型，
 * 以及所有 WebSocket 消息的联合类型定义。
 */
import type { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

import type {
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
import type {
  GitActionProgressEvent,
  GitCheckoutInput,
  GitCreateBranchInput,
  GitCreateDetachedWorktreeInput,
  GitHandoffThreadInput,
  GitPreparePullRequestThreadInput,
  GitCreateWorktreeInput,
  GitInitInput,
  GitListBranchesInput,
  GitPullInput,
  GitPullRequestRefInput,
  GitReadWorkingTreeDiffInput,
  GitRemoveWorktreeInput,
  GitRemoveIndexLockInput,
  GitRunStackedActionInput,
  GitStashAndCheckoutInput,
  GitStashDropInput,
  GitStashInfoInput,
  GitStatusInput,
  GitSummarizeDiffInput,
} from "./git";
import type {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalWriteInput,
} from "./terminal";
import type { KeybindingRule } from "./keybindings";
import type {
  ProjectListDirectoriesInput,
  ProjectSearchEntriesInput,
  ProjectSearchLocalEntriesInput,
  ProjectWriteFileInput,
} from "./project";
import type { FilesystemBrowseInput } from "./filesystem";
import type { OpenInEditorInput } from "./editor";
import type {
  ServerConfigUpdatedPayload,
  ServerLifecycleStreamEvent,
  ServerProviderUpdateInput,
  ServerUpdateSettingsInput,
  ServerGetProviderUsageSnapshotInput,
  ServerProviderStatusesUpdatedPayload,
  ServerSettingsUpdatedPayload,
  ServerVoiceTranscriptionInput,
} from "./server";
import type {
  ProviderListCommandsInput,
  ProviderGetComposerCapabilitiesInput,
  ProviderListPluginsInput,
  ProviderListModelsInput,
  ProviderListAgentsInput,
  ProviderReadPluginInput,
  ProviderListSkillsInput,
  ListLocalUserSkillsInput,
} from "./providerDiscovery";
import type { ProviderCompactThreadInput } from "./provider";

// ── WebSocket RPC 方法名常量 ─────────────────────────────────────────

/** 所有 WebSocket RPC 方法名映射，键为逻辑名，值为协议方法标识 */
export const WS_METHODS = {
  // 项目注册相关方法
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsListDirectories: "projects.listDirectories",
  projectsSearchEntries: "projects.searchEntries",
  projectsSearchLocalEntries: "projects.searchLocalEntries",
  projectsWriteFile: "projects.writeFile",

  // 文件系统浏览方法
  filesystemBrowse: "filesystem.browse",

  // Shell 相关方法
  shellOpenInEditor: "shell.openInEditor",

  // Git 相关方法
  gitPull: "git.pull",
  gitStatus: "git.status",
  gitReadWorkingTreeDiff: "git.readWorkingTreeDiff",
  gitSummarizeDiff: "git.summarizeDiff",
  gitRunStackedAction: "git.runStackedAction",
  gitListBranches: "git.listBranches",
  gitCreateWorktree: "git.createWorktree",
  gitCreateDetachedWorktree: "git.createDetachedWorktree",
  gitRemoveWorktree: "git.removeWorktree",
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

  // 终端相关方法
  terminalOpen: "terminal.open",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",

  // 服务器管理方法
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

  // 流式订阅方法
  subscribeTerminalEvents: "terminal.subscribeEvents",
  subscribeOrchestrationDomainEvents: "orchestration.subscribeDomainEvents",
  subscribeGitActionProgress: "git.subscribeActionProgress",

  // Provider 发现方法
  providerGetComposerCapabilities: "provider.getComposerCapabilities",
  providerCompactThread: "provider.compactThread",
  providerListCommands: "provider.listCommands",
  providerListSkills: "provider.listSkills",
  providerListPlugins: "provider.listPlugins",
  providerReadPlugin: "provider.readPlugin",
  providerListModels: "provider.listModels",
  providerListAgents: "provider.listAgents",

  // 本地用户技能（基于 home 目录扫描，不依赖 Provider）
  skillsListLocal: "skills.listLocal",
} as const;

// ── 推送事件通道常量 ─────────────────────────────────────────────────

/** 服务端主动推送的事件通道名映射 */
export const WS_CHANNELS = {
  gitActionProgress: "git.actionProgress",
  terminalEvent: "terminal.event",
  serverWelcome: "server.welcome",
  serverMaintenanceUpdated: "server.maintenanceUpdated",
  serverConfigUpdated: "server.configUpdated",
  serverProviderStatusesUpdated: "server.providerStatusesUpdated",
  serverSettingsUpdated: "server.settingsUpdated",
} as const;

// ── 请求体类型 ───────────────────────────────────────────────────────

/** 所有 WebSocket 请求体的联合类型，通过 _tag 字段区分 */
export type WebSocketRequestBody =
  // Orchestration methods
  | { _tag: typeof ORCHESTRATION_WS_METHODS.dispatchCommand; command: ClientOrchestrationCommand }
  | { _tag: typeof ORCHESTRATION_WS_METHODS.importThread } & OrchestrationImportThreadInput
  | { _tag: typeof ORCHESTRATION_WS_METHODS.getSnapshot } & OrchestrationGetSnapshotInput
  | { _tag: typeof ORCHESTRATION_WS_METHODS.getShellSnapshot } & OrchestrationGetShellSnapshotInput
  | { _tag: typeof ORCHESTRATION_WS_METHODS.repairState } & OrchestrationRepairStateInput
  | { _tag: typeof ORCHESTRATION_WS_METHODS.getTurnDiff } & OrchestrationGetTurnDiffInput
  | {
      _tag: typeof ORCHESTRATION_WS_METHODS.getFullThreadDiff;
    } & OrchestrationGetFullThreadDiffInput
  | { _tag: typeof ORCHESTRATION_WS_METHODS.replayEvents } & OrchestrationReplayEventsInput
  | { _tag: typeof ORCHESTRATION_WS_METHODS.subscribeShell } & OrchestrationSubscribeShellInput
  | {
      _tag: typeof ORCHESTRATION_WS_METHODS.unsubscribeShell;
    } & OrchestrationUnsubscribeShellInput
  | { _tag: typeof ORCHESTRATION_WS_METHODS.subscribeThread } & OrchestrationSubscribeThreadInput
  | {
      _tag: typeof ORCHESTRATION_WS_METHODS.unsubscribeThread;
    } & OrchestrationUnsubscribeThreadInput
  // Project Search
  | { _tag: typeof WS_METHODS.projectsListDirectories } & ProjectListDirectoriesInput
  | { _tag: typeof WS_METHODS.projectsSearchEntries } & ProjectSearchEntriesInput
  | { _tag: typeof WS_METHODS.projectsSearchLocalEntries } & ProjectSearchLocalEntriesInput
  | { _tag: typeof WS_METHODS.projectsWriteFile } & ProjectWriteFileInput
  // Filesystem browse
  | { _tag: typeof WS_METHODS.filesystemBrowse } & FilesystemBrowseInput
  // Shell methods
  | { _tag: typeof WS_METHODS.shellOpenInEditor } & OpenInEditorInput
  // Git methods
  | { _tag: typeof WS_METHODS.gitPull } & GitPullInput
  | { _tag: typeof WS_METHODS.gitStatus } & GitStatusInput
  | { _tag: typeof WS_METHODS.gitReadWorkingTreeDiff } & GitReadWorkingTreeDiffInput
  | { _tag: typeof WS_METHODS.gitSummarizeDiff } & GitSummarizeDiffInput
  | { _tag: typeof WS_METHODS.gitRunStackedAction } & GitRunStackedActionInput
  | { _tag: typeof WS_METHODS.gitListBranches } & GitListBranchesInput
  | { _tag: typeof WS_METHODS.gitCreateWorktree } & GitCreateWorktreeInput
  | { _tag: typeof WS_METHODS.gitCreateDetachedWorktree } & GitCreateDetachedWorktreeInput
  | { _tag: typeof WS_METHODS.gitRemoveWorktree } & GitRemoveWorktreeInput
  | { _tag: typeof WS_METHODS.gitCreateBranch } & GitCreateBranchInput
  | { _tag: typeof WS_METHODS.gitCheckout } & GitCheckoutInput
  | { _tag: typeof WS_METHODS.gitStashAndCheckout } & GitStashAndCheckoutInput
  | { _tag: typeof WS_METHODS.gitStashDrop } & GitStashDropInput
  | { _tag: typeof WS_METHODS.gitStashInfo } & GitStashInfoInput
  | { _tag: typeof WS_METHODS.gitRemoveIndexLock } & GitRemoveIndexLockInput
  | { _tag: typeof WS_METHODS.gitInit } & GitInitInput
  | { _tag: typeof WS_METHODS.gitHandoffThread } & GitHandoffThreadInput
  | { _tag: typeof WS_METHODS.gitResolvePullRequest } & GitPullRequestRefInput
  | { _tag: typeof WS_METHODS.gitPreparePullRequestThread } & GitPreparePullRequestThreadInput
  // Terminal methods
  | { _tag: typeof WS_METHODS.terminalOpen } & TerminalOpenInput
  | { _tag: typeof WS_METHODS.terminalWrite } & TerminalWriteInput
  | { _tag: typeof WS_METHODS.terminalResize } & TerminalResizeInput
  | { _tag: typeof WS_METHODS.terminalClear } & TerminalClearInput
  | { _tag: typeof WS_METHODS.terminalRestart } & TerminalRestartInput
  | { _tag: typeof WS_METHODS.terminalClose } & TerminalCloseInput
  // Server meta
  | { _tag: typeof WS_METHODS.serverGetConfig }
  | { _tag: typeof WS_METHODS.serverGetEnvironment }
  | { _tag: typeof WS_METHODS.serverGetSettings }
  | { _tag: typeof WS_METHODS.serverUpdateSettings } & ServerUpdateSettingsInput
  | { _tag: typeof WS_METHODS.serverRefreshProviders }
  | { _tag: typeof WS_METHODS.serverUpdateProvider } & ServerProviderUpdateInput
  | { _tag: typeof WS_METHODS.serverListWorktrees }
  | {
      _tag: typeof WS_METHODS.serverGetProviderUsageSnapshot;
    } & ServerGetProviderUsageSnapshotInput
  | { _tag: typeof WS_METHODS.serverGetDiagnostics }
  | { _tag: typeof WS_METHODS.serverTranscribeVoice } & ServerVoiceTranscriptionInput
  | { _tag: typeof WS_METHODS.serverUpsertKeybinding } & KeybindingRule
  // Provider discovery
  | {
      _tag: typeof WS_METHODS.providerGetComposerCapabilities;
    } & ProviderGetComposerCapabilitiesInput
  | { _tag: typeof WS_METHODS.providerCompactThread } & ProviderCompactThreadInput
  | { _tag: typeof WS_METHODS.providerListCommands } & ProviderListCommandsInput
  | { _tag: typeof WS_METHODS.providerListSkills } & ProviderListSkillsInput
  | { _tag: typeof WS_METHODS.providerListPlugins } & ProviderListPluginsInput
  | { _tag: typeof WS_METHODS.providerReadPlugin } & ProviderReadPluginInput
  | { _tag: typeof WS_METHODS.providerListModels } & ProviderListModelsInput
  | { _tag: typeof WS_METHODS.providerListAgents } & ProviderListAgentsInput
  | { _tag: typeof WS_METHODS.skillsListLocal } & ListLocalUserSkillsInput;

/** WebSocket 请求格式，包含请求 ID 和请求体 */
export interface WebSocketRequest {
  id: TrimmedNonEmptyString;
  body: WebSocketRequestBody;
}

export interface WebSocketResponse {
  id: TrimmedNonEmptyString;
  result?: unknown;
  error?: {
    message: string;
  };
}

export type WsPushSequence = NonNegativeInt;

export interface WsWelcomePayload {
  cwd: TrimmedNonEmptyString;
  homeDir?: TrimmedNonEmptyString;
  projectName: TrimmedNonEmptyString;
  bootstrapProjectId?: ProjectId;
  bootstrapThreadId?: ThreadId;
}

export interface WsPushPayloadByChannel {
  readonly [WS_CHANNELS.serverWelcome]: WsWelcomePayload;
  readonly [WS_CHANNELS.serverMaintenanceUpdated]: ServerLifecycleStreamEvent;
  readonly [WS_CHANNELS.serverConfigUpdated]: ServerConfigUpdatedPayload;
  readonly [WS_CHANNELS.serverProviderStatusesUpdated]: ServerProviderStatusesUpdatedPayload;
  readonly [WS_CHANNELS.serverSettingsUpdated]: ServerSettingsUpdatedPayload;
  readonly [WS_CHANNELS.gitActionProgress]: GitActionProgressEvent;
  readonly [WS_CHANNELS.terminalEvent]: TerminalEvent;
  readonly [ORCHESTRATION_WS_CHANNELS.domainEvent]: OrchestrationEvent;
  readonly [ORCHESTRATION_WS_CHANNELS.shellEvent]: OrchestrationShellStreamItem;
  readonly [ORCHESTRATION_WS_CHANNELS.threadEvent]: OrchestrationThreadStreamItem;
}

export type WsPushChannel = keyof WsPushPayloadByChannel;
export type WsPushData<C extends WsPushChannel> = WsPushPayloadByChannel[C];

export interface WsPushServerWelcome {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof WS_CHANNELS.serverWelcome;
  data: WsWelcomePayload;
}

export interface WsPushServerMaintenanceUpdated {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof WS_CHANNELS.serverMaintenanceUpdated;
  data: ServerLifecycleStreamEvent;
}

export interface WsPushServerConfigUpdated {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof WS_CHANNELS.serverConfigUpdated;
  data: ServerConfigUpdatedPayload;
}

export interface WsPushServerProviderStatusesUpdated {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof WS_CHANNELS.serverProviderStatusesUpdated;
  data: ServerProviderStatusesUpdatedPayload;
}

export interface WsPushServerSettingsUpdated {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof WS_CHANNELS.serverSettingsUpdated;
  data: ServerSettingsUpdatedPayload;
}

export interface WsPushGitActionProgress {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof WS_CHANNELS.gitActionProgress;
  data: GitActionProgressEvent;
}

export interface WsPushTerminalEvent {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof WS_CHANNELS.terminalEvent;
  data: TerminalEvent;
}

export interface WsPushOrchestrationDomainEvent {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof ORCHESTRATION_WS_CHANNELS.domainEvent;
  data: OrchestrationEvent;
}

export interface WsPushOrchestrationShellEvent {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof ORCHESTRATION_WS_CHANNELS.shellEvent;
  data: OrchestrationShellStreamItem;
}

export interface WsPushOrchestrationThreadEvent {
  type: "push";
  sequence: WsPushSequence;
  channel: typeof ORCHESTRATION_WS_CHANNELS.threadEvent;
  data: OrchestrationThreadStreamItem;
}

export type WsPushChannelSchema =
  | typeof WS_CHANNELS.gitActionProgress
  | typeof WS_CHANNELS.serverWelcome
  | typeof WS_CHANNELS.serverMaintenanceUpdated
  | typeof WS_CHANNELS.serverConfigUpdated
  | typeof WS_CHANNELS.serverProviderStatusesUpdated
  | typeof WS_CHANNELS.serverSettingsUpdated
  | typeof WS_CHANNELS.terminalEvent
  | typeof ORCHESTRATION_WS_CHANNELS.domainEvent
  | typeof ORCHESTRATION_WS_CHANNELS.shellEvent
  | typeof ORCHESTRATION_WS_CHANNELS.threadEvent;

export type WsPush =
  | WsPushServerWelcome
  | WsPushServerMaintenanceUpdated
  | WsPushServerConfigUpdated
  | WsPushServerProviderStatusesUpdated
  | WsPushServerSettingsUpdated
  | WsPushGitActionProgress
  | WsPushTerminalEvent
  | WsPushOrchestrationDomainEvent
  | WsPushOrchestrationShellEvent
  | WsPushOrchestrationThreadEvent;

export type WsPushMessage<C extends WsPushChannel> = Extract<WsPush, { channel: C }>;

export interface WsPushEnvelopeBase {
  type: "push";
  sequence: WsPushSequence;
  channel: WsPushChannelSchema;
  data: unknown;
}

// ── Union of all server → client messages ─────────────────────────────

export type WsResponse = WebSocketResponse | WsPush;
