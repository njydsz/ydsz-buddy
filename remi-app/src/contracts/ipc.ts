/**
 * @file ipc.ts
 * @description IPC（进程间通信）桥接层定义。定义了桌面应用（Electron/Tauri）与前端之间的
 * 原生 API 接口，包括文件系统操作、终端管理、Git 操作、服务器配置、Provider 管理、
 * 编排系统、浏览器面板等功能的桥接方法。
 *
 * 核心职责：
 * - 提供统一的 NativeApi 接口，屏蔽底层桌面运行时差异
 * - 定义桌面运行时信息、更新状态、浏览器面板状态等数据结构
 * - 封装右键菜单、通知、对话框等原生 UI 交互
 * - 提供 WebSocket 连接、语音转写、快捷键等高级功能
 *
 * 使用场景：
 * - 前端通过 DesktopBridge 或 NativeApi 调用原生能力
 * - 桌面端实现这些接口以提供原生功能
 * - 跨平台适配时通过统一接口屏蔽差异
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

/**
 * 右键上下文菜单项定义
 * @template T - 菜单项 ID 的字符串字面量类型
 */
export interface ContextMenuItem<T extends string = string> {
  /** 菜单项唯一标识 */
  id: T;
  /** 菜单项显示文本 */
  label: string;
  /** 是否在该菜单项前显示分隔线（用于视觉分组） */
  separatorBefore?: boolean;
  /** 是否为破坏性操作（通常以红色高亮显示） */
  destructive?: boolean;
}

/** 桌面应用更新状态枚举 */
export type DesktopUpdateStatus =
  | "disabled"      // 更新功能已禁用
  | "idle"          // 空闲状态
  | "checking"      // 正在检查更新
  | "up-to-date"    // 已是最新版本
  | "available"     // 有新版本可用
  | "downloading"   // 正在下载更新
  | "downloaded"    // 下载完成
  | "error";        // 更新出错

/** 桌面运行时 CPU 架构 */
export type DesktopRuntimeArch = "arm64" | "x64" | "other";

/** 桌面主题模式 */
export type DesktopTheme = "light" | "dark" | "system";

/** 桌面运行时信息，包含主机和应用架构信息 */
export interface DesktopRuntimeInfo {
  /** 主机 CPU 架构 */
  hostArch: DesktopRuntimeArch;
  /** 应用程序 CPU 架构 */
  appArch: DesktopRuntimeArch;
  /** 是否在 ARM64 翻译层下运行（如 Apple Silicon 上的 Rosetta） */
  runningUnderArm64Translation: boolean;
}

/** 桌面应用更新状态详情 */
export interface DesktopUpdateState {
  /** 自动更新是否启用 */
  enabled: boolean;
  /** 当前更新状态 */
  status: DesktopUpdateStatus;
  /** 当前应用版本号 */
  currentVersion: string;
  /** 主机 CPU 架构 */
  hostArch: DesktopRuntimeArch;
  /** 应用 CPU 架构 */
  appArch: DesktopRuntimeArch;
  /** 是否在 ARM64 翻译层下运行 */
  runningUnderArm64Translation: boolean;
  /** 可用更新版本号（无更新时为 null） */
  availableVersion: string | null;
  /** 已下载版本号（未下载时为 null） */
  downloadedVersion: string | null;
  /** 下载进度百分比（0-100，未下载时为 null） */
  downloadPercent: number | null;
  /** 上次检查更新时间（ISO 格式） */
  checkedAt: string | null;
  /** 状态消息（如错误信息或更新提示） */
  message: string | null;
  /** 错误发生的阶段：check（检查）、download（下载）、install（安装） */
  errorContext: "check" | "download" | "install" | null;
  /** 是否可以重试（用于错误恢复） */
  canRetry: boolean;
}

/** 桌面更新操作结果 */
export interface DesktopUpdateActionResult {
  /** 操作是否被接受 */
  accepted: boolean;
  /** 操作是否已完成 */
  completed: boolean;
  /** 操作后的更新状态 */
  state: DesktopUpdateState;
}

/** 浏览器标签页状态 */
export interface BrowserTabState {
  /** 标签页唯一标识 */
  id: string;
  /** 当前 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 标签页状态：live（活跃）| suspended（挂起） */
  status: "live" | "suspended";
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否可以后退 */
  canGoBack: boolean;
  /** 是否可以前进 */
  canGoForward: boolean;
  /** 网站图标 URL */
  faviconUrl: string | null;
  /** 最后提交的 URL（用于错误恢复） */
  lastCommittedUrl: string | null;
  /** 最后错误信息 */
  lastError: string | null;
}

/** 线程关联的浏览器面板状态 */
export interface ThreadBrowserState {
  /** 关联的线程 ID */
  threadId: ThreadId;
  /** 状态版本号（用于增量更新） */
  version: number;
  /** 浏览器面板是否打开 */
  open: boolean;
  /** 当前激活的标签页 ID */
  activeTabId: string | null;
  /** 所有标签页列表 */
  tabs: BrowserTabState[];
  /** 最后错误信息 */
  lastError: string | null;
}

/** 打开浏览器面板的输入参数 */
export interface BrowserOpenInput {
  /** 要关联的线程 ID */
  threadId: ThreadId;
  /** 初始加载的 URL（可选） */
  initialUrl?: string;
}

/** 线程级浏览器操作输入参数 */
export interface BrowserThreadInput {
  /** 目标线程 ID */
  threadId: ThreadId;
}

/** 标签页级浏览器操作输入参数 */
export interface BrowserTabInput {
  /** 目标线程 ID */
  threadId: ThreadId;
  /** 目标标签页 ID */
  tabId: string;
}

/** 浏览器导航输入参数 */
export interface BrowserNavigateInput {
  /** 目标线程 ID */
  threadId: ThreadId;
  /** 目标标签页 ID（不指定则使用当前激活标签页） */
  tabId?: string;
  /** 要导航到的 URL */
  url: string;
}

/** 新建浏览器标签页输入参数 */
export interface BrowserNewTabInput {
  /** 目标线程 ID */
  threadId: ThreadId;
  /** 初始 URL（可选） */
  url?: string;
  /** 是否立即激活新标签页 */
  activate?: boolean;
}

/** 浏览器面板边界矩形 */
export interface BrowserPanelBounds {
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
  /** 面板宽度 */
  width: number;
  /** 面板高度 */
  height: number;
}

/** 设置浏览器面板边界输入参数 */
export interface BrowserSetPanelBoundsInput {
  /** 目标线程 ID */
  threadId: ThreadId;
  /** 面板边界（null 表示恢复默认） */
  bounds: BrowserPanelBounds | null;
  /** 渲染表面类型：native（原生）| renderer（渲染器） */
  surface?: "native" | "renderer";
}

/** 附加 WebView 输入参数 */
export interface BrowserAttachWebviewInput extends BrowserTabInput {
  /** WebView 内容 ID */
  webContentsId: number;
}

/** 截图捕获结果 */
export interface BrowserCaptureScreenshotResult {
  /** 截图文件名 */
  name: string;
  /** 图片 MIME 类型 */
  mimeType: "image/png";
  /** 图片字节大小 */
  sizeBytes: number;
  /** 图片二进制数据 */
  bytes: Uint8Array;
}

/** 执行 Chrome DevTools Protocol 命令输入参数 */
export interface BrowserExecuteCdpInput extends BrowserTabInput {
  /** CDP 方法名 */
  method: string;
  /** CDP 方法参数 */
  params?: Record<string, unknown>;
}

/** 桌面通知输入参数 */
export interface DesktopNotificationInput {
  /** 通知标题 */
  title: string;
  /** 通知正文 */
  body?: string;
  /** 是否静音（不播放提示音） */
  silent?: boolean;
  /** 关联线程 ID（点击通知时跳转） */
  threadId?: ThreadId;
}

/**
 * 桌面桥接接口 - 提供桌面应用原生能力的统一访问入口。
 * 包含对话框、主题、右键菜单、外部链接、更新管理、通知、浏览器面板等功能。
 * 前端通过此接口与桌面运行时交互，屏蔽底层 Electron/Tauri 差异。
 */
export interface DesktopBridge {
  /** 获取 WebSocket 服务器地址 */
  getWsUrl: () => string | null;
  /** 弹出文件夹选择对话框，返回选中路径或 null */
  pickFolder: () => Promise<string | null>;
  /** 弹出文件保存对话框（可选功能） */
  saveFile?: (input: {
    /** 默认文件名 */
    defaultFilename: string;
    /** 文件内容 */
    contents: string;
    /** 文件类型过滤器 */
    filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
  }) => Promise<string | null>;
  /** 弹出确认对话框 */
  confirm: (message: string) => Promise<boolean>;
  /** 设置应用主题 */
  setTheme: (theme: DesktopTheme) => Promise<void>;
  /** 显示右键上下文菜单，返回用户选择的菜单项 ID */
  showContextMenu: <T extends string>(
    items: readonly ContextMenuItem<T>[],
    position?: { x: number; y: number },
  ) => Promise<T | null>;
  /** 在外部浏览器中打开 URL */
  openExternal: (url: string) => Promise<boolean>;
  /** 在文件管理器中显示文件 */
  showInFolder: (path: string) => Promise<void>;
  /** Shell 操作（可选） */
  shell?: {
    showInFolder: (path: string) => Promise<void>;
  };
  /** 监听菜单动作事件，返回取消订阅函数 */
  onMenuAction: (listener: (action: string) => void) => () => void;
  /** 获取当前更新状态 */
  getUpdateState: () => Promise<DesktopUpdateState>;
  /** 检查更新 */
  checkForUpdates: () => Promise<DesktopUpdateState>;
  /** 下载更新 */
  downloadUpdate: () => Promise<DesktopUpdateActionResult>;
  /** 安装更新 */
  installUpdate: () => Promise<DesktopUpdateActionResult>;
  /** 监听更新状态变化，返回取消订阅函数 */
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
  /** 系统通知功能 */
  notifications: {
    /** 检查是否支持系统通知 */
    isSupported: () => Promise<boolean>;
    /** 显示系统通知 */
    show: (input: DesktopNotificationInput) => Promise<boolean>;
  };
  /** 服务器相关功能（可选） */
  server?: {
    /** 语音转文字 */
    transcribeVoice: (
      input: ServerVoiceTranscriptionInput,
    ) => Promise<ServerVoiceTranscriptionResult>;
  };
  /** 内嵌浏览器面板管理 */
  browser: {
    /** 打开线程关联的浏览器面板 */
    open: (input: BrowserOpenInput) => Promise<ThreadBrowserState>;
    /** 关闭线程关联的浏览器面板 */
    close: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    /** 隐藏浏览器面板 */
    hide: (input: BrowserThreadInput) => Promise<void>;
    /** 获取浏览器面板当前状态 */
    getState: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    /** 设置浏览器面板边界 */
    setPanelBounds: (input: BrowserSetPanelBoundsInput) => Promise<void>;
    /** 附加 WebView 到浏览器面板 */
    attachWebview: (input: BrowserAttachWebviewInput) => Promise<ThreadBrowserState>;
    /** 将截图复制到剪贴板 */
    copyScreenshotToClipboard: (input: BrowserTabInput) => Promise<void>;
    /** 捕获当前页面截图 */
    captureScreenshot: (input: BrowserTabInput) => Promise<BrowserCaptureScreenshotResult>;
    /** 执行 Chrome DevTools Protocol 命令 */
    executeCdp: (input: BrowserExecuteCdpInput) => Promise<unknown>;
    /** 导航到指定 URL */
    navigate: (input: BrowserNavigateInput) => Promise<ThreadBrowserState>;
    /** 重新加载当前页面 */
    reload: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 后退到上一页 */
    goBack: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 前进到下一页 */
    goForward: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 新建标签页 */
    newTab: (input: BrowserNewTabInput) => Promise<ThreadBrowserState>;
    /** 关闭标签页 */
    closeTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 切换到指定标签页 */
    selectTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 打开开发者工具 */
    openDevTools: (input: BrowserTabInput) => Promise<void>;
    /** 监听浏览器面板状态变化 */
    onState: (listener: (state: ThreadBrowserState) => void) => () => void;
    /** 监听浏览器面板打开请求事件 */
    onBrowserUseOpenPanelRequest: (listener: () => void) => () => void;
  };
}

/**
 * 原生 API 接口 - 提供完整的原生能力访问接口。
 * 包含对话框、终端、项目、文件系统、Shell、Git、右键菜单、服务器、Provider、
 * 技能、编排系统、浏览器面板等功能模块。
 * 这是 DesktopBridge 的扩展版本，包含更多后端功能接口。
 */
export interface NativeApi {
  /** 对话框功能 */
  dialogs: {
    /** 弹出文件夹选择对话框 */
    pickFolder: () => Promise<string | null>;
    /** 弹出文件保存对话框（可选） */
    saveFile?: (input: {
      /** 默认文件名 */
      defaultFilename: string;
      /** 文件内容 */
      contents: string;
      /** 文件类型过滤器 */
      filters?: ReadonlyArray<{ name: string; extensions: ReadonlyArray<string> }>;
    }) => Promise<string | null>;
    /** 弹出确认对话框 */
    confirm: (message: string) => Promise<boolean>;
  };
  /** 终端管理功能 */
  terminal: {
    /** 打开新终端会话 */
    open: (input: TerminalOpenInput) => Promise<TerminalSessionSnapshot>;
    /** 向终端写入数据 */
    write: (input: TerminalWriteInput) => Promise<void>;
    /** 调整终端尺寸 */
    resize: (input: TerminalResizeInput) => Promise<void>;
    /** 清屏 */
    clear: (input: TerminalClearInput) => Promise<void>;
    /** 重启终端会话 */
    restart: (input: TerminalRestartInput) => Promise<TerminalSessionSnapshot>;
    /** 关闭终端会话 */
    close: (input: TerminalCloseInput) => Promise<void>;
    /** 监听终端事件，返回取消订阅函数 */
    onEvent: (callback: (event: TerminalEvent) => void) => () => void;
  };
  /** 项目管理功能 */
  projects: {
    /** 列出项目目录 */
    listDirectories: (input: ProjectListDirectoriesInput) => Promise<ProjectListDirectoriesResult>;
    /** 搜索项目条目 */
    searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
    /** 搜索本地项目条目 */
    searchLocalEntries: (
      input: ProjectSearchLocalEntriesInput,
    ) => Promise<ProjectSearchLocalEntriesResult>;
    /** 写入项目文件 */
    writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
  };
  /** 文件系统浏览功能 */
  filesystem: {
    /** 浏览文件系统 */
    browse: (input: FilesystemBrowseInput) => Promise<FilesystemBrowseResult>;
  };
  /** Shell 操作功能 */
  shell: {
    /** 在指定编辑器中打开目录 */
    openInEditor: (cwd: string, editor: EditorId) => Promise<void>;
    /** 在外部浏览器中打开 URL */
    openExternal: (url: string) => Promise<void>;
    /** 在文件管理器中显示文件 */
    showInFolder: (path: string) => Promise<void>;
  };
  /** Git 操作功能 */
  git: {
    /** 列出分支 */
    listBranches: (input: GitListBranchesInput) => Promise<GitListBranchesResult>;
    /** 创建工作树 */
    createWorktree: (input: GitCreateWorktreeInput) => Promise<GitCreateWorktreeResult>;
    /** 创建独立工作树 */
    createDetachedWorktree: (
      input: GitCreateDetachedWorktreeInput,
    ) => Promise<GitCreateDetachedWorktreeResult>;
    /** 删除工作树 */
    removeWorktree: (input: GitRemoveWorktreeInput) => Promise<void>;
    /** 创建分支 */
    createBranch: (input: GitCreateBranchInput) => Promise<void>;
    /** 切换分支 */
    checkout: (input: GitCheckoutInput) => Promise<void>;
    /** 暂存并切换分支 */
    stashAndCheckout: (input: GitStashAndCheckoutInput) => Promise<void>;
    /** 删除暂存 */
    stashDrop: (input: GitStashDropInput) => Promise<void>;
    /** 获取暂存信息 */
    stashInfo: (input: GitStashInfoInput) => Promise<GitStashInfoResult>;
    /** 删除索引锁 */
    removeIndexLock: (input: GitRemoveIndexLockInput) => Promise<void>;
    /** 初始化 Git 仓库 */
    init: (input: GitInitInput) => Promise<void>;
    /** 将线程移交给 Git 分支 */
    handoffThread: (input: GitHandoffThreadInput) => Promise<GitHandoffThreadResult>;
    /** 解析 Pull Request */
    resolvePullRequest: (input: GitPullRequestRefInput) => Promise<GitResolvePullRequestResult>;
    /** 准备 Pull Request 线程 */
    preparePullRequestThread: (
      input: GitPreparePullRequestThreadInput,
    ) => Promise<GitPreparePullRequestThreadResult>;
    /** 拉取远程更新 */
    pull: (input: GitPullInput) => Promise<GitPullResult>;
    /** 获取仓库状态 */
    status: (input: GitStatusInput) => Promise<GitStatusResult>;
    /** 读取工作树差异 */
    readWorkingTreeDiff: (
      input: GitReadWorkingTreeDiffInput,
    ) => Promise<GitReadWorkingTreeDiffResult>;
    /** 总结差异内容 */
    summarizeDiff: (input: GitSummarizeDiffInput) => Promise<GitSummarizeDiffResult>;
    /** 执行堆叠操作 */
    runStackedAction: (input: GitRunStackedActionInput) => Promise<GitRunStackedActionResult>;
    /** 监听操作进度事件，返回取消订阅函数 */
    onActionProgress: (callback: (event: GitActionProgressEvent) => void) => () => void;
  };
  /** 右键菜单功能 */
  contextMenu: {
    /** 显示右键菜单 */
    show: <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>;
  };
  /** 服务器管理功能 */
  server: {
    /** 获取服务器配置 */
    getConfig: () => Promise<ServerConfig>;
    /** 获取执行环境信息 */
    getEnvironment: () => Promise<ServerGetEnvironmentResult>;
    /** 获取服务器设置 */
    getSettings: () => Promise<ServerGetSettingsResult>;
    /** 更新服务器设置 */
    updateSettings: (input: ServerUpdateSettingsInput) => Promise<ServerUpdateSettingsResult>;
    /** 获取认证会话状态 */
    getAuthSession: () => Promise<AuthSessionState>;
    /** 引导认证流程 */
    bootstrapAuth: (input: AuthBootstrapInput) => Promise<AuthBootstrapResult>;
    /** 引导 Bearer Token 认证流程 */
    bootstrapBearerAuth: (input: AuthBootstrapInput) => Promise<AuthBearerBootstrapResult>;
    /** 颁发 WebSocket Token */
    issueAuthWebSocketToken: () => Promise<AuthWebSocketTokenResult>;
    /** 创建配对凭证 */
    createAuthPairingToken: (
      input?: AuthCreatePairingCredentialInput,
    ) => Promise<AuthPairingCredentialResult>;
    /** 列出所有配对链接 */
    listAuthPairingLinks: () => Promise<ReadonlyArray<AuthPairingLink>>;
    /** 撤销配对链接 */
    revokeAuthPairingLink: (input: AuthRevokePairingLinkInput) => Promise<{ revoked: boolean }>;
    /** 列出所有客户端会话 */
    listAuthClients: () => Promise<ReadonlyArray<AuthClientSession>>;
    /** 撤销客户端会话 */
    revokeAuthClient: (input: AuthRevokeClientSessionInput) => Promise<{ revoked: boolean }>;
    /** 撤销其他所有客户端会话 */
    revokeOtherAuthClients: () => Promise<{ revokedCount: number }>;
    /** 刷新 Provider 列表 */
    refreshProviders: () => Promise<ServerRefreshProvidersResult>;
    /** 更新 Provider 配置 */
    updateProvider: (input: ServerProviderUpdateInput) => Promise<ServerProviderUpdateResult>;
    /** 列出所有工作树 */
    listWorktrees: () => Promise<ServerListWorktreesResult>;
    /** 获取 Provider 使用快照 */
    getProviderUsageSnapshot: (
      input: ServerGetProviderUsageSnapshotInput,
    ) => Promise<ServerGetProviderUsageSnapshotResult>;
    /** 获取诊断信息 */
    getDiagnostics: () => Promise<ServerDiagnosticsResult>;
    /** 语音转文字 */
    transcribeVoice: (
      input: ServerVoiceTranscriptionInput,
    ) => Promise<ServerVoiceTranscriptionResult>;
    /** 新增或更新快捷键绑定 */
    upsertKeybinding: (input: ServerUpsertKeybindingInput) => Promise<ServerUpsertKeybindingResult>;
  };
  /** Provider 管理功能 */
  provider: {
    /** 获取 Composer 能力 */
    getComposerCapabilities: (
      input: ProviderGetComposerCapabilitiesInput,
    ) => Promise<ProviderComposerCapabilities>;
    /** 压缩线程历史 */
    compactThread: (input: ProviderCompactThreadInput) => Promise<void>;
    /** 列出可用命令 */
    listCommands: (input: ProviderListCommandsInput) => Promise<ProviderListCommandsResult>;
    /** 列出可用技能 */
    listSkills: (input: ProviderListSkillsInput) => Promise<ProviderListSkillsResult>;
    /** 列出可用插件 */
    listPlugins: (input: ProviderListPluginsInput) => Promise<ProviderListPluginsResult>;
    /** 读取插件详情 */
    readPlugin: (input: ProviderReadPluginInput) => Promise<ProviderReadPluginResult>;
    /** 列出可用模型 */
    listModels: (input: ProviderListModelsInput) => Promise<ProviderListModelsResult>;
    /** 列出可用代理 */
    listAgents: (input: ProviderListAgentsInput) => Promise<ProviderListAgentsResult>;
  };
  /** 技能管理功能 */
  skills: {
    /** 列出本地用户技能 */
    listLocal: () => Promise<ListLocalUserSkillsResult>;
  };
  /** 编排系统功能 */
  orchestration: {
    /** 获取编排状态快照 */
    getSnapshot: () => Promise<OrchestrationReadModel>;
    /** 获取 Shell 快照 */
    getShellSnapshot: () => Promise<OrchestrationShellSnapshot>;
    /** 分发命令到编排系统 */
    dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{ sequence: number }>;
    /** 导入外部线程 */
    importThread: (
      input: OrchestrationImportThreadInput,
    ) => Promise<OrchestrationImportThreadResult>;
    /** 修复状态 */
    repairState: () => Promise<OrchestrationReadModel>;
    /** 获取轮次差异 */
    getTurnDiff: (input: OrchestrationGetTurnDiffInput) => Promise<OrchestrationGetTurnDiffResult>;
    /** 获取完整线程差异 */
    getFullThreadDiff: (
      input: OrchestrationGetFullThreadDiffInput,
    ) => Promise<OrchestrationGetFullThreadDiffResult>;
    /** 重放事件 */
    replayEvents: (fromSequenceExclusive: number) => Promise<OrchestrationEvent[]>;
    /** 订阅 Shell 事件 */
    subscribeShell: () => Promise<void>;
    /** 取消订阅 Shell 事件 */
    unsubscribeShell: () => Promise<void>;
    /** 订阅线程事件 */
    subscribeThread: (input: OrchestrationSubscribeThreadInput) => Promise<void>;
    /** 取消订阅线程事件 */
    unsubscribeThread: (input: OrchestrationSubscribeThreadInput) => Promise<void>;
    /** 监听领域事件，返回取消订阅函数 */
    onDomainEvent: (callback: (event: OrchestrationEvent) => void) => () => void;
    /** 监听 Shell 事件，返回取消订阅函数 */
    onShellEvent: (callback: (event: OrchestrationShellStreamItem) => void) => () => void;
    /** 监听线程事件，返回取消订阅函数 */
    onThreadEvent: (callback: (event: OrchestrationThreadStreamItem) => void) => () => void;
  };
  /** 浏览器面板功能 */
  browser: {
    /** 打开线程关联的浏览器面板 */
    open: (input: BrowserOpenInput) => Promise<ThreadBrowserState>;
    /** 关闭线程关联的浏览器面板 */
    close: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    /** 隐藏浏览器面板 */
    hide: (input: BrowserThreadInput) => Promise<void>;
    /** 获取浏览器面板当前状态 */
    getState: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    /** 设置浏览器面板边界 */
    setPanelBounds: (input: BrowserSetPanelBoundsInput) => Promise<void>;
    /** 附加 WebView 到浏览器面板 */
    attachWebview: (input: BrowserAttachWebviewInput) => Promise<ThreadBrowserState>;
    /** 将截图复制到剪贴板 */
    copyScreenshotToClipboard: (input: BrowserTabInput) => Promise<void>;
    /** 捕获当前页面截图 */
    captureScreenshot: (input: BrowserTabInput) => Promise<BrowserCaptureScreenshotResult>;
    /** 执行 Chrome DevTools Protocol 命令 */
    executeCdp: (input: BrowserExecuteCdpInput) => Promise<unknown>;
    /** 导航到指定 URL */
    navigate: (input: BrowserNavigateInput) => Promise<ThreadBrowserState>;
    /** 重新加载当前页面 */
    reload: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 后退到上一页 */
    goBack: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 前进到下一页 */
    goForward: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 新建标签页 */
    newTab: (input: BrowserNewTabInput) => Promise<ThreadBrowserState>;
    /** 关闭标签页 */
    closeTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 切换到指定标签页 */
    selectTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    /** 打开开发者工具 */
    openDevTools: (input: BrowserTabInput) => Promise<void>;
    /** 监听浏览器面板状态变化，返回取消订阅函数 */
    onState: (callback: (state: ThreadBrowserState) => void) => () => void;
  };
}
