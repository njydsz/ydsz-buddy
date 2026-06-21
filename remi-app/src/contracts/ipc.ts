/**
 * @file IPC 契约聚合模块
 *
 * 本模块是所有 IPC（进程间通信）调用的契约聚合入口，**不定义新的 Schema**，
 * 仅重新导出其他子模块中的输入/输出类型，并按业务领域聚合为命名空间。
 *
 * ## 核心职责
 *
 * 1. **按业务领域聚合**：将各业务模块的契约聚合到统一命名空间下
 *    - `AuthIpc`：认证相关调用
 *    - `GitIpc`：Git 操作调用
 *    - `ProjectIpc`：项目管理调用
 *    - `ProviderIpc`：Provider 配置调用
 *    - `ProviderRuntimeIpc`：Provider 运行时会话调用
 *    - `EnvironmentIpc`：环境管理调用
 *    - `SettingsIpc`：设置管理调用
 *    - `KeybindingsIpc`：快捷键调用
 *    - `TerminalIpc`：终端调用
 *    - `EditorIpc`：编辑器调用
 *    - `FilesystemIpc`：文件系统调用
 *    - `WorkspaceIpc`：工作区调用
 * 2. **提供统一调用点**：业务代码可通过 `Ipc.<domain>` 访问所有 IPC 契约
 *
 * ## 调用方向
 *
 * 客户端（Web）→ WebSocket/HTTP → 服务端（Tauri 后端）→ 业务逻辑
 *
 * ## 错误处理
 *
 * 所有 IPC 调用失败时会抛出 `IpcError`（来自 `@/lib/tauri-bridge`），
 * 错误信息包含方法名、错误码和人类可读消息。
 */

import type {
  AuthBearerBootstrapResult,
  AuthBootstrapInput,
  AuthBootstrapResult,
  AuthClientSession,
  AuthCreatePairingCredentialInput,
  AuthPairingCredentialResult,
  AuthPairingLink,
  AuthRevokeClientSessionInput,
  AuthRevokePairingLinkInput,
  AuthSessionState,
  AuthWebSocketTokenResult,
} from "./auth";
import type {
  GitCheckoutInput,
  GitActionProgressEvent,
  GitCreateBranchInput,
  GitCreateDetachedWorktreeInput,
  GitCreateDetachedWorktreeResult,
  GitHandoffThreadInput,
  GitHandoffThreadResult,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullRequestRefInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPullInput,
  GitPullResult,
  GitReadWorkingTreeDiffInput,
  GitReadWorkingTreeDiffResult,
  GitRemoveIndexLockInput,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  GitStashAndCheckoutInput,
  GitStashDropInput,
  GitStashInfoInput,
  GitStashInfoResult,
  GitStatusInput,
  GitStatusResult,
  GitSummarizeDiffInput,
  GitSummarizeDiffResult,
} from "./git";
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
import type { FilesystemBrowseInput, FilesystemBrowseResult } from "./filesystem";
import type {
  ServerConfig,
  ServerDiagnosticsResult,
  ServerGetEnvironmentResult,
  ServerGetProviderUsageSnapshotInput,
  ServerGetProviderUsageSnapshotResult,
  ServerGetSettingsResult,
  ServerListWorktreesResult,
  ServerProviderUpdateInput,
  ServerProviderUpdateResult,
  ServerRefreshProvidersResult,
  ServerUpdateSettingsInput,
  ServerUpdateSettingsResult,
  ServerUpsertKeybindingInput,
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
import type {
  ClientOrchestrationCommand,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetFullThreadDiffResult,
  OrchestrationImportThreadInput,
  OrchestrationImportThreadResult,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  OrchestrationEvent,
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamItem,
  OrchestrationSubscribeThreadInput,
  OrchestrationThreadStreamItem,
} from "./orchestration";
import { EditorId } from "./editor";
import type { ThreadId } from "./baseSchemas";
import type {
  ProviderComposerCapabilities,
  ProviderGetComposerCapabilitiesInput,
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
  ProviderReadPluginInput,
  ProviderReadPluginResult,
  ListLocalUserSkillsResult,
} from "./providerDiscovery";
import type { ProviderCompactThreadInput } from "./provider";

export interface ContextMenuItem<T extends string = string> {
  id: T;
  label: string;
  /** Starts a new visual group before this actionable row. */
  separatorBefore?: boolean;
  destructive?: boolean;
}

export type DesktopUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type DesktopRuntimeArch = "arm64" | "x64" | "other";
export type DesktopTheme = "light" | "dark" | "system";

export interface DesktopRuntimeInfo {
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
}

export interface DesktopUpdateState {
  enabled: boolean;
  status: DesktopUpdateStatus;
  currentVersion: string;
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  errorContext: "check" | "download" | "install" | null;
  canRetry: boolean;
}

export interface DesktopUpdateActionResult {
  accepted: boolean;
  completed: boolean;
  state: DesktopUpdateState;
}

export interface BrowserTabState {
  id: string;
  url: string;
  title: string;
  status: "live" | "suspended";
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  faviconUrl: string | null;
  lastCommittedUrl: string | null;
  lastError: string | null;
}

export interface ThreadBrowserState {
  threadId: ThreadId;
  version: number;
  open: boolean;
  activeTabId: string | null;
  tabs: BrowserTabState[];
  lastError: string | null;
}

export interface BrowserOpenInput {
  threadId: ThreadId;
  initialUrl?: string;
}

export interface BrowserThreadInput {
  threadId: ThreadId;
}

export interface BrowserTabInput {
  threadId: ThreadId;
  tabId: string;
}

export interface BrowserNavigateInput {
  threadId: ThreadId;
  tabId?: string;
  url: string;
}

export interface BrowserNewTabInput {
  threadId: ThreadId;
  url?: string;
  activate?: boolean;
}

export interface BrowserPanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserSetPanelBoundsInput {
  threadId: ThreadId;
  bounds: BrowserPanelBounds | null;
  surface?: "native" | "renderer";
}

export interface BrowserAttachWebviewInput extends BrowserTabInput {
  webContentsId: number;
}

export interface BrowserCaptureScreenshotResult {
  name: string;
  mimeType: "image/png";
  sizeBytes: number;
  bytes: Uint8Array;
}

export interface BrowserExecuteCdpInput extends BrowserTabInput {
  method: string;
  params?: Record<string, unknown>;
}

export interface DesktopNotificationInput {
  title: string;
  body?: string;
  silent?: boolean;
  threadId?: ThreadId;
}

export interface DesktopBridge {
  getWsUrl: () => string | null;
  pickFolder: () => Promise<string | null>;
  saveFile?: (input: {
    defaultFilename: string;
    contents: string;
    filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
  }) => Promise<string | null>;
  confirm: (message: string) => Promise<boolean>;
  setTheme: (theme: DesktopTheme) => Promise<void>;
  showContextMenu: <T extends string>(
    items: readonly ContextMenuItem<T>[],
    position?: { x: number; y: number },
  ) => Promise<T | null>;
  openExternal: (url: string) => Promise<boolean>;
  showInFolder: (path: string) => Promise<void>;
  shell?: {
    showInFolder: (path: string) => Promise<void>;
  };
  onMenuAction: (listener: (action: string) => void) => () => void;
  getUpdateState: () => Promise<DesktopUpdateState>;
  checkForUpdates: () => Promise<DesktopUpdateState>;
  downloadUpdate: () => Promise<DesktopUpdateActionResult>;
  installUpdate: () => Promise<DesktopUpdateActionResult>;
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
  notifications: {
    isSupported: () => Promise<boolean>;
    show: (input: DesktopNotificationInput) => Promise<boolean>;
  };
  server?: {
    transcribeVoice: (
      input: ServerVoiceTranscriptionInput,
    ) => Promise<ServerVoiceTranscriptionResult>;
  };
  browser: {
    open: (input: BrowserOpenInput) => Promise<ThreadBrowserState>;
    close: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    hide: (input: BrowserThreadInput) => Promise<void>;
    getState: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    setPanelBounds: (input: BrowserSetPanelBoundsInput) => Promise<void>;
    attachWebview: (input: BrowserAttachWebviewInput) => Promise<ThreadBrowserState>;
    copyScreenshotToClipboard: (input: BrowserTabInput) => Promise<void>;
    captureScreenshot: (input: BrowserTabInput) => Promise<BrowserCaptureScreenshotResult>;
    executeCdp: (input: BrowserExecuteCdpInput) => Promise<unknown>;
    navigate: (input: BrowserNavigateInput) => Promise<ThreadBrowserState>;
    reload: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    goBack: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    goForward: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    newTab: (input: BrowserNewTabInput) => Promise<ThreadBrowserState>;
    closeTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    selectTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    openDevTools: (input: BrowserTabInput) => Promise<void>;
    onState: (listener: (state: ThreadBrowserState) => void) => () => void;
    onBrowserUseOpenPanelRequest: (listener: () => void) => () => void;
  };
}

export interface NativeApi {
  dialogs: {
    pickFolder: () => Promise<string | null>;
    saveFile?: (input: {
      defaultFilename: string;
      contents: string;
      filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
    }) => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
  };
  terminal: {
    open: (input: TerminalOpenInput) => Promise<TerminalSessionSnapshot>;
    write: (input: TerminalWriteInput) => Promise<void>;
    resize: (input: TerminalResizeInput) => Promise<void>;
    clear: (input: TerminalClearInput) => Promise<void>;
    restart: (input: TerminalRestartInput) => Promise<TerminalSessionSnapshot>;
    close: (input: TerminalCloseInput) => Promise<void>;
    onEvent: (callback: (event: TerminalEvent) => void) => () => void;
  };
  projects: {
    listDirectories: (input: ProjectListDirectoriesInput) => Promise<ProjectListDirectoriesResult>;
    searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
    searchLocalEntries: (
      input: ProjectSearchLocalEntriesInput,
    ) => Promise<ProjectSearchLocalEntriesResult>;
    writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
  };
  filesystem: {
    browse: (input: FilesystemBrowseInput) => Promise<FilesystemBrowseResult>;
  };
  shell: {
    openInEditor: (cwd: string, editor: EditorId) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    showInFolder: (path: string) => Promise<void>;
  };
  git: {
    // Existing branch/worktree API
    listBranches: (input: GitListBranchesInput) => Promise<GitListBranchesResult>;
    createWorktree: (input: GitCreateWorktreeInput) => Promise<GitCreateWorktreeResult>;
    createDetachedWorktree: (
      input: GitCreateDetachedWorktreeInput,
    ) => Promise<GitCreateDetachedWorktreeResult>;
    removeWorktree: (input: GitRemoveWorktreeInput) => Promise<void>;
    createBranch: (input: GitCreateBranchInput) => Promise<void>;
    checkout: (input: GitCheckoutInput) => Promise<void>;
    stashAndCheckout: (input: GitStashAndCheckoutInput) => Promise<void>;
    stashDrop: (input: GitStashDropInput) => Promise<void>;
    stashInfo: (input: GitStashInfoInput) => Promise<GitStashInfoResult>;
    removeIndexLock: (input: GitRemoveIndexLockInput) => Promise<void>;
    init: (input: GitInitInput) => Promise<void>;
    handoffThread: (input: GitHandoffThreadInput) => Promise<GitHandoffThreadResult>;
    resolvePullRequest: (input: GitPullRequestRefInput) => Promise<GitResolvePullRequestResult>;
    preparePullRequestThread: (
      input: GitPreparePullRequestThreadInput,
    ) => Promise<GitPreparePullRequestThreadResult>;
    // Stacked action API
    pull: (input: GitPullInput) => Promise<GitPullResult>;
    status: (input: GitStatusInput) => Promise<GitStatusResult>;
    readWorkingTreeDiff: (
      input: GitReadWorkingTreeDiffInput,
    ) => Promise<GitReadWorkingTreeDiffResult>;
    summarizeDiff: (input: GitSummarizeDiffInput) => Promise<GitSummarizeDiffResult>;
    runStackedAction: (input: GitRunStackedActionInput) => Promise<GitRunStackedActionResult>;
    onActionProgress: (callback: (event: GitActionProgressEvent) => void) => () => void;
  };
  contextMenu: {
    show: <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>;
  };
  server: {
    getConfig: () => Promise<ServerConfig>;
    getEnvironment: () => Promise<ServerGetEnvironmentResult>;
    getSettings: () => Promise<ServerGetSettingsResult>;
    updateSettings: (input: ServerUpdateSettingsInput) => Promise<ServerUpdateSettingsResult>;
    getAuthSession: () => Promise<AuthSessionState>;
    bootstrapAuth: (input: AuthBootstrapInput) => Promise<AuthBootstrapResult>;
    bootstrapBearerAuth: (input: AuthBootstrapInput) => Promise<AuthBearerBootstrapResult>;
    issueAuthWebSocketToken: () => Promise<AuthWebSocketTokenResult>;
    createAuthPairingToken: (
      input?: AuthCreatePairingCredentialInput,
    ) => Promise<AuthPairingCredentialResult>;
    listAuthPairingLinks: () => Promise<ReadonlyArray<AuthPairingLink>>;
    revokeAuthPairingLink: (input: AuthRevokePairingLinkInput) => Promise<{ revoked: boolean }>;
    listAuthClients: () => Promise<ReadonlyArray<AuthClientSession>>;
    revokeAuthClient: (input: AuthRevokeClientSessionInput) => Promise<{ revoked: boolean }>;
    revokeOtherAuthClients: () => Promise<{ revokedCount: number }>;
    refreshProviders: () => Promise<ServerRefreshProvidersResult>;
    updateProvider: (input: ServerProviderUpdateInput) => Promise<ServerProviderUpdateResult>;
    listWorktrees: () => Promise<ServerListWorktreesResult>;
    getProviderUsageSnapshot: (
      input: ServerGetProviderUsageSnapshotInput,
    ) => Promise<ServerGetProviderUsageSnapshotResult>;
    getDiagnostics: () => Promise<ServerDiagnosticsResult>;
    transcribeVoice: (
      input: ServerVoiceTranscriptionInput,
    ) => Promise<ServerVoiceTranscriptionResult>;
    upsertKeybinding: (input: ServerUpsertKeybindingInput) => Promise<ServerUpsertKeybindingResult>;
  };
  provider: {
    getComposerCapabilities: (
      input: ProviderGetComposerCapabilitiesInput,
    ) => Promise<ProviderComposerCapabilities>;
    compactThread: (input: ProviderCompactThreadInput) => Promise<void>;
    listCommands: (input: ProviderListCommandsInput) => Promise<ProviderListCommandsResult>;
    listSkills: (input: ProviderListSkillsInput) => Promise<ProviderListSkillsResult>;
    listPlugins: (input: ProviderListPluginsInput) => Promise<ProviderListPluginsResult>;
    readPlugin: (input: ProviderReadPluginInput) => Promise<ProviderReadPluginResult>;
    listModels: (input: ProviderListModelsInput) => Promise<ProviderListModelsResult>;
    listAgents: (input: ProviderListAgentsInput) => Promise<ProviderListAgentsResult>;
  };
  skills: {
    listLocal: () => Promise<ListLocalUserSkillsResult>;
  };
  orchestration: {
    getSnapshot: () => Promise<OrchestrationReadModel>;
    getShellSnapshot: () => Promise<OrchestrationShellSnapshot>;
    dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{ sequence: number }>;
    importThread: (
      input: OrchestrationImportThreadInput,
    ) => Promise<OrchestrationImportThreadResult>;
    repairState: () => Promise<OrchestrationReadModel>;
    getTurnDiff: (input: OrchestrationGetTurnDiffInput) => Promise<OrchestrationGetTurnDiffResult>;
    getFullThreadDiff: (
      input: OrchestrationGetFullThreadDiffInput,
    ) => Promise<OrchestrationGetFullThreadDiffResult>;
    replayEvents: (fromSequenceExclusive: number) => Promise<OrchestrationEvent[]>;
    subscribeShell: () => Promise<void>;
    unsubscribeShell: () => Promise<void>;
    subscribeThread: (input: OrchestrationSubscribeThreadInput) => Promise<void>;
    unsubscribeThread: (input: OrchestrationSubscribeThreadInput) => Promise<void>;
    onDomainEvent: (callback: (event: OrchestrationEvent) => void) => () => void;
    onShellEvent: (callback: (event: OrchestrationShellStreamItem) => void) => () => void;
    onThreadEvent: (callback: (event: OrchestrationThreadStreamItem) => void) => () => void;
  };
  browser: {
    open: (input: BrowserOpenInput) => Promise<ThreadBrowserState>;
    close: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    hide: (input: BrowserThreadInput) => Promise<void>;
    getState: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    setPanelBounds: (input: BrowserSetPanelBoundsInput) => Promise<void>;
    attachWebview: (input: BrowserAttachWebviewInput) => Promise<ThreadBrowserState>;
    copyScreenshotToClipboard: (input: BrowserTabInput) => Promise<void>;
    captureScreenshot: (input: BrowserTabInput) => Promise<BrowserCaptureScreenshotResult>;
    executeCdp: (input: BrowserExecuteCdpInput) => Promise<unknown>;
    navigate: (input: BrowserNavigateInput) => Promise<ThreadBrowserState>;
    reload: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    goBack: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    goForward: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    newTab: (input: BrowserNewTabInput) => Promise<ThreadBrowserState>;
    closeTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    selectTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    openDevTools: (input: BrowserTabInput) => Promise<void>;
    onState: (callback: (state: ThreadBrowserState) => void) => () => void;
  };
}
