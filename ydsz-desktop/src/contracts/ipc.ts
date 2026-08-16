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
  GitAuthStatusInput,
  GitAuthStatusResult,
  GitClosePullRequestInput,
  GitCommentPullRequestInput,
  GitCreateBranchInput,
  GitCreateDetachedWorktreeInput,
  GitCreateDetachedWorktreeResult,
  GitCreatePullRequestInput,
  GitCreatePullRequestResult,
  GitDiffPullRequestInput,
  GitDiffPullRequestResult,
  GitHandoffThreadInput,
  GitHandoffThreadResult,
  GitListPullRequestsInput,
  GitListPullRequestsResult,
  GitMergePullRequestInput,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullRequestRefInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitInitInput,
  GitApplyPatchInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPullInput,
  GitPullResult,
  GitReadWorkingTreeDiffInput,
  GitReadWorkingTreeDiffResult,
  GitReconcileWorktreesInput,
  GitReconcileWorktreesResult,
  GitRemoveWorktreeInput,
  GitRemoveIndexLockInput,
  GitReopenPullRequestInput,
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
  GitViewPullRequestInput,
  GitViewPullRequestResult,
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
  ServerVoicePolishInput,
  ServerVoicePolishResult,
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
  OrchestrationGetTurnAiShareSnapshotResult,
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
import type { ThreadId, TurnId } from "./baseSchemas";
import type {
  InstalledSkill,
  MarketplaceCategory,
  MarketplaceEntry,
  SkillBody,
  SkillInstallInput,
  SkillMarketplaceSearchInput,
  SkillMarketplaceSetUrlInput,
  SkillMarketplaceStatus,
  SkillMarketplaceTrendingInput,
} from "./skillMarketplace";
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
import type {
  AstGrepCompilePatternInput,
  AstGrepCompiledPattern,
  AstGrepFindByNameInput,
  AstGrepFindByNodeKindInput,
  AstGrepFindByQueryInput,
  AstGrepListPresetsInput,
  AstGrepMatch,
  AstGrepPresetInfo,
  AstGrepRewriteInput,
  AstGrepRewriteResult,
} from "./astGrep";
import type { UrlMetadata, UrlPreviewFetchMetadataInput } from "./urlPreview";
import type {
  LinearAuthStatus,
  LinearCreateThreadFromTaskInput,
  LinearCreateThreadResult,
  LinearGetTaskInput,
  LinearListTasksInput,
  LinearSearchTasksInput,
  LinearSetApiKeyInput,
  LinearSetApiKeyResult,
  LinearTaskDetail,
  LinearTaskSummary,
  LinearUpdateTaskStatusInput,
  LinearUpdateTaskStatusResult,
} from "./linear";

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

export interface BrowserDesignModeToggleInput {
  threadId: ThreadId;
  tabId: string;
  enabled: boolean;
}

export interface BrowserDesignModeElement {
  tagName: string;
  elementId: string;
  classList: string[];
  outerHtml: string;
  computedStyles: string;
  rectX: number;
  rectY: number;
  rectWidth: number;
  rectHeight: number;
  textContent: string;
  url: string;
  pageTitle: string;
}

export interface BrowserDesignModeSelection {
  threadId: ThreadId;
  tabId: string;
  element: BrowserDesignModeElement;
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
    voicePolishText: (
      input: ServerVoicePolishInput,
    ) => Promise<ServerVoicePolishResult>;
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
    designModeToggle: (input: BrowserDesignModeToggleInput) => Promise<boolean>;
    onState: (listener: (state: ThreadBrowserState) => void) => () => void;
    onBrowserUseOpenPanelRequest: (listener: () => void) => () => void;
    onDesignModeElementSelected: (
      listener: (selection: BrowserDesignModeSelection) => void,
    ) => () => void;
    onDesignModeCancelled: (listener: () => void) => () => void;
  };
}

/**
 * 目标模式上下文视图（前端序列化形态）
 *
 * 与后端 `GoalContextView` 保持一致；后端 status 默认序列化为 PascalCase
 * ("Running"/"Achieved"/"Aborted")，前端展示层负责映射为小写。
 */
export interface GoalContextView {
  goal_id: string;
  thread_id: string;
  description: string;
  status: "Running" | "Achieved" | "Aborted" | string;
  progress_percent: number;
  current_task: string | null;
  completed_tasks: ReadonlyArray<string>;
  started_at: string;
  updated_at: string;
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
    reconcileWorktrees: (
      input: GitReconcileWorktreesInput,
    ) => Promise<GitReconcileWorktreesResult>;
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
    // GitHub PR 管理 RPC（对应后端 GitHubCli 方法）
    listPullRequests: (input: GitListPullRequestsInput) => Promise<GitListPullRequestsResult>;
    viewPullRequest: (input: GitViewPullRequestInput) => Promise<GitViewPullRequestResult>;
    mergePullRequest: (input: GitMergePullRequestInput) => Promise<void>;
    commentPullRequest: (input: GitCommentPullRequestInput) => Promise<void>;
    diffPullRequest: (input: GitDiffPullRequestInput) => Promise<GitDiffPullRequestResult>;
    closePullRequest: (input: GitClosePullRequestInput) => Promise<void>;
    reopenPullRequest: (input: GitReopenPullRequestInput) => Promise<void>;
    authStatus: (input: GitAuthStatusInput) => Promise<GitAuthStatusResult>;
    createPullRequest: (
      input: GitCreatePullRequestInput,
    ) => Promise<GitCreatePullRequestResult>;
    // Stacked action API
    pull: (input: GitPullInput) => Promise<GitPullResult>;
    status: (input: GitStatusInput) => Promise<GitStatusResult>;
    readWorkingTreeDiff: (
      input: GitReadWorkingTreeDiffInput,
    ) => Promise<GitReadWorkingTreeDiffResult>;
    summarizeDiff: (input: GitSummarizeDiffInput) => Promise<GitSummarizeDiffResult>;
    runStackedAction: (input: GitRunStackedActionInput) => Promise<GitRunStackedActionResult>;
    applyPatch: (input: GitApplyPatchInput) => Promise<void>;
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
    voicePolishText: (
      input: ServerVoicePolishInput,
    ) => Promise<ServerVoicePolishResult>;
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
    /**
     * Skill 市场（云顶数字 Skill Marketplace）真后端 RPC
     *
     * 数据流：
     * 1. 启动时自动从 `~/.ydsz/marketplace-cache.json` 或内置索引加载
     * 2. 5 分钟 TTL 过期后由后端后台静默拉取远端 `https://marketplace.njydsz.com/index.json`
     * 3. 用户可通过 `setUrl` 切换为自托管 URL
     */
    marketplace: {
      /** 列出所有 skills（可按 tag / runtime 过滤） */
      list: (input?: { tag?: string | null; runtime?: string | null }) => Promise<ReadonlyArray<MarketplaceEntry>>;
      /** 热门 skills（按 verified 优先 + 字典序，取 limit 条） */
      trending: (input?: SkillMarketplaceTrendingInput) => Promise<ReadonlyArray<MarketplaceEntry>>;
      /** 关键字搜索 */
      search: (input: SkillMarketplaceSearchInput) => Promise<ReadonlyArray<MarketplaceEntry>>;
      /** 按 slug 查单条 */
      lookup: (input: { slug: string }) => Promise<MarketplaceEntry | null>;
      /** 列出所有分类（含 count） */
      categories: () => Promise<ReadonlyArray<MarketplaceCategory>>;
      /** 安装（marketplace:slug / github:owner/repo@ref / local:path） */
      install: (input: SkillInstallInput) => Promise<InstalledSkill>;
      /** 卸载 */
      uninstall: (input: { name: string }) => Promise<{ success: boolean }>;
      /** 列出已安装 skills */
      listInstalled: () => Promise<ReadonlyArray<InstalledSkill>>;
      /** 加载已安装 skill 的 prompt body */
      loadBody: (input: { name: string }) => Promise<SkillBody | null>;
      /** 强制刷新（远端 → 磁盘缓存 → 内置三级回退） */
      refresh: () => Promise<SkillMarketplaceStatus>;
      /** 查询当前 marketplace 状态 */
      status: () => Promise<SkillMarketplaceStatus>;
      /**
       * 运行时切换 marketplace URL
       *
       * - `url` 为 `string`：覆盖默认 URL（必须以 http(s):// 开头）
       * - `url` 为 `null` / 缺省：清空，恢复使用环境变量 / 默认 URL
       * - `refresh: true`：设置后立即触发一次 refresh（默认 false）
       */
      setUrl: (input: SkillMarketplaceSetUrlInput) => Promise<SkillMarketplaceStatus>;
    };
  };
  /**
   * AST-Grep 结构搜索（与 @ast-grep 提及配套使用）。
   *
   * - 浏览器模式：走 WebSocket `indexer.astGrep*` RPC
   * - Tauri 模式：走 `indexer_ast_grep_*` 命令（由 `tauri-bridge` 转发）
   *
   * 推荐使用 `astGrepClient`（`src/lib/astGrepClient.ts`），
   * 它会按运行环境自动选择 Tauri 或 WS 路径。
   */
  indexer: {
    /** 按节点类型搜索（`call_expression` / `try_statement` 等） */
    astGrepFindByNodeKind: (
      input: AstGrepFindByNodeKindInput,
    ) => Promise<ReadonlyArray<AstGrepMatch>>;
    /** 按 S-expression 查询搜索 */
    astGrepFindByQuery: (
      input: AstGrepFindByQueryInput,
    ) => Promise<ReadonlyArray<AstGrepMatch>>;
    /** 按名称找引用或调用（`name` / `obj.name`） */
    astGrepFindByName: (
      input: AstGrepFindByNameInput,
    ) => Promise<ReadonlyArray<AstGrepMatch>>;
    /** 列出 AST-Grep 预设模式 */
    astGrepListPresets: (
      input?: AstGrepListPresetsInput,
    ) => Promise<ReadonlyArray<AstGrepPresetInfo>>;
    /** 把用户友好模式编译为 tree-sitter S-expression */
    astGrepCompilePattern: (
      input: AstGrepCompilePatternInput,
    ) => Promise<AstGrepCompiledPattern>;
    /** 在指定文件中按模式做结构性替换 */
    astGrepRewrite: (input: AstGrepRewriteInput) => Promise<AstGrepRewriteResult>;
  };
  /**
   * URL 预览（P0-3：后端抓取 OG meta + 30 分钟缓存）。
   *
   * 数据流：
   * 1. 前端 `UrlPreviewCard` 收到 URL（拖拽/粘贴）
   * 2. 调用 `nativeApi.urlPreview.fetchMetadata({ url })`
   * 3. WebSocket RPC 到后端 `url_preview.fetch_metadata`
   * 4. 后端 reqwest 抓取 HTML + scraper 解析 OG meta
   * 5. 返回 `UrlMetadata`，前端渲染卡片
   */
  urlPreview: {
    /** 抓取 URL 元数据（OG meta / title / favicon / thumbnail） */
    fetchMetadata: (input: UrlPreviewFetchMetadataInput) => Promise<UrlMetadata>;
  };
  /**
   * Linear 集成（P3-1：Linear API 对接 + 从 task 创建 worktree 线程）
   *
   * 数据流：
   * 1. 用户通过 `setApiKey` 设置 Linear API Key
   * 2. `listTasks` / `searchTasks` 获取 Linear 任务列表
   * 3. `createThreadFromTask` 从任务创建 worktree 线程
   * 4. `updateTaskStatus` 在工作完成后更新任务状态
   */
  linear: {
    setApiKey: (input: LinearSetApiKeyInput) => Promise<LinearSetApiKeyResult>;
    getAuthStatus: () => Promise<LinearAuthStatus>;
    clearApiKey: () => Promise<void>;
    listTasks: (input: LinearListTasksInput) => Promise<LinearTaskSummary[]>;
    searchTasks: (input: LinearSearchTasksInput) => Promise<LinearTaskSummary[]>;
    getTask: (input: LinearGetTaskInput) => Promise<LinearTaskDetail>;
    createThreadFromTask: (
      input: LinearCreateThreadFromTaskInput,
    ) => Promise<LinearCreateThreadResult>;
    updateTaskStatus: (
      input: LinearUpdateTaskStatusInput,
    ) => Promise<LinearUpdateTaskStatusResult>;
  };
  goal: {
    start: (input: { threadId: string; description: string }) => Promise<string>;
    abort: (input: { goalId: string; reason?: string }) => Promise<{ success: boolean }>;
    listActive: () => Promise<ReadonlyArray<GoalContextView>>;
    get: (input: { goalId: string }) => Promise<GoalContextView | null>;
    cleanup: () => Promise<{ success: boolean }>;
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
    getTurnAiShareSnapshot: () => Promise<OrchestrationGetTurnAiShareSnapshotResult>;
    replayEvents: (fromSequenceExclusive: number) => Promise<OrchestrationEvent[]>;
    subscribeShell: () => Promise<void>;
    unsubscribeShell: () => Promise<void>;
    subscribeThread: (input: OrchestrationSubscribeThreadInput) => Promise<void>;
    unsubscribeThread: (input: OrchestrationSubscribeThreadInput) => Promise<void>;
    onDomainEvent: (callback: (event: OrchestrationEvent) => void) => () => void;
    onShellEvent: (callback: (event: OrchestrationShellStreamItem) => void) => () => void;
    onThreadEvent: (callback: (event: OrchestrationThreadStreamItem) => void) => () => void;
  };
  threads: {
    deleteMessage: (threadId: ThreadId, turnId: TurnId) => Promise<void>;
    sendTurn: (input: {
      threadId: ThreadId;
      content: string;
      model?: string;
      provider?: string;
    }) => Promise<{ turnId: TurnId }>;
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
    designModeToggle: (input: BrowserDesignModeToggleInput) => Promise<boolean>;
    onState: (callback: (state: ThreadBrowserState) => void) => () => void;
    onDesignModeElementSelected: (
      callback: (selection: BrowserDesignModeSelection) => void,
    ) => () => void;
    onDesignModeCancelled: (callback: () => void) => () => void;
  };
  /**
   * Quest 引擎（多步骤自主执行任务）
   *
   * 数据流：
   * 1. 用户通过 `create` 创建 Quest（指定 threadId + title + steps）
   * 2. `start` 启动自动执行，`pause`/`resume` 控制 lifecycle
   * 3. `skipStep`/`retryStep` 控制单步行为
   * 4. `listActive` 轮询活跃 Quest 列表
   * 5. `abort` 中止 Quest，`cleanup` 清理已完成 Quest
   */
  quest: {
    create: (input: {
      threadId: string;
      title: string;
      description?: string;
      steps?: ReadonlyArray<{ title: string; description?: string }>;
    }) => Promise<{ questId: string }>;
    start: (input: { questId: string }) => Promise<{ success: boolean }>;
    pause: (input: { questId: string }) => Promise<{ success: boolean }>;
    resume: (input: { questId: string }) => Promise<{ success: boolean }>;
    abort: (input: { questId: string; reason?: string }) => Promise<{ success: boolean }>;
    get: (input: { questId: string }) => Promise<unknown>;
    listActive: () => Promise<ReadonlyArray<unknown>>;
    skipStep: (input: { questId: string }) => Promise<{ success: boolean }>;
    retryStep: (input: { questId: string }) => Promise<{ success: boolean }>;
    cleanup: () => Promise<{ removed: number }>;
  };
}
