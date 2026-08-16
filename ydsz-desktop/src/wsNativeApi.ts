/**
 * @file 基于 WebSocket 的 NativeApi 实现
 * @description 通过 WsTransport 实现 NativeApi 接口，将所有原生能力调用转换为 WebSocket RPC 请求。
 *              同时提供服务器推送事件的订阅机制以及浏览器状态的后备（fallback）管理。
 *              当 Tauri 原生桥接不可用时，作为 Web 端的默认实现。
 */

import {
  type AuthBootstrapInput,
  type AuthBootstrapResult,
  type AuthBearerBootstrapResult,
  type AuthClientSession,
  type AuthCreatePairingCredentialInput,
  type AuthPairingCredentialResult,
  type AuthPairingLink,
  type AuthRevokeClientSessionInput,
  type AuthRevokePairingLinkInput,
  type AuthSessionState,
  type AuthWebSocketTokenResult,
  type AstGrepCompiledPattern,
  type AstGrepMatch,
  type AstGrepPresetInfo,
  type AstGrepRewriteResult,
  type ThreadBrowserState,
  type GitActionProgressEvent,
  type InstalledSkill,
  type MarketplaceCategory,
  type MarketplaceEntry,
  type OrchestrationEvent,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
  type ServerProviderStatusesUpdatedPayload,
  type ServerLifecycleStreamEvent,
  type ServerSettingsUpdatedPayload,
  type SkillBody,
  type SkillMarketplaceStatus,
  type TerminalEvent,
  type UrlMetadata,
  type LinearAuthStatus,
  type LinearCreateThreadFromTaskInput,
  type LinearCreateThreadResult,
  type LinearGetTaskInput,
  type LinearListTasksInput,
  type LinearSearchTasksInput,
  type LinearSetApiKeyInput,
  type LinearSetApiKeyResult,
  type LinearTaskDetail,
  type LinearTaskSummary,
  type LinearUpdateTaskStatusInput,
  type LinearUpdateTaskStatusResult,
  ORCHESTRATION_WS_CHANNELS,
  ORCHESTRATION_WS_METHODS,
  type ClientOrchestrationCommand,
  type ContextMenuItem,
  type NativeApi,
  type ServerConfig,
  ServerConfigUpdatedPayload,
  WS_CHANNELS,
  WS_METHODS,
  type WsPushChannel,
  type WsWelcomePayload,
} from "@ydsz-buddy/contracts";

import { showConfirmDialogFallback } from "./confirmDialogFallback";
import { getSharedWsTransport } from "./wsTransport";
import { tauriBridge } from "./lib/tauri-bridge";
import type { TurnId } from "./contracts/baseSchemas";

/** Quest 步骤状态 */
export type QuestStepStatus = "pending" | "running" | "completed" | "skipped" | "failed";

/** Quest 整体状态 */
export type QuestStatus = "created" | "planning" | "running" | "paused" | "completed" | "aborted" | "failed";

/** Quest 步骤 DTO（与后端 QuestStep 对齐） */
export interface QuestStepDto {
  id: string;
  index: number;
  title: string;
  description?: string;
  status: QuestStepStatus;
  turnId?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  artifacts: string[];
}

/** Quest DTO（与后端 Quest 对齐） */
export interface QuestDto {
  id: string;
  threadId: string;
  title: string;
  description: string;
  status: QuestStatus;
  steps: QuestStepDto[];
  currentStepIndex: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  abortReason?: string;
}

/** 单例实例，缓存已创建的 NativeApi */
let instance: NativeApi | null = null;
/** 标记共享 transport 的监听器是否已注册 */
let transportListenersRegistered = false;
/** 服务器欢迎消息监听器集合 */
const welcomeListeners = new Set<(payload: WsWelcomePayload) => void>();
/** 服务器配置更新监听器集合 */
const serverConfigUpdatedListeners = new Set<(payload: ServerConfigUpdatedPayload) => void>();
/** 服务???Provider 状态更新监听器集合 */
const serverProviderStatusesUpdatedListeners = new Set<
  (payload: ServerProviderStatusesUpdatedPayload) => void
>();
/** 服务器维护状态更新监听器集合 */
const serverMaintenanceUpdatedListeners = new Set<(payload: ServerLifecycleStreamEvent) => void>();
/** 服务器设置更新监听器集合 */
const serverSettingsUpdatedListeners = new Set<(payload: ServerSettingsUpdatedPayload) => void>();
/** Git 操作进度监听器集合 */
const gitActionProgressListeners = new Set<(payload: GitActionProgressEvent) => void>();

/**
 * 过滤用户输入应答中的 null/undefined ??? * 仅对 thread.user-input.respond 类型的命令生效，移除 answers 中无效的空值条??? * @param command - 编排调度命令
 * @returns 过滤后的命令
 */
function omitNullUserInputAnswers(
  command: ClientOrchestrationCommand,
): ClientOrchestrationCommand {
  if (command.type !== "thread.user-input.respond") {
    return command;
  }

  return {
    ...command,
    answers: Object.fromEntries(
      Object.entries(command.answers).filter(
        ([, answer]) => answer !== null && answer !== undefined,
      ),
    ),
  };
}
/** 终端事件监听器集合 */
const terminalEventListeners = new Set<(payload: TerminalEvent) => void>();
/** 编排领域事件监听器集合 */
const orchestrationDomainEventListeners = new Set<(payload: OrchestrationEvent) => void>();
/** 编排 Shell 事件监听器集合 */
const orchestrationShellEventListeners = new Set<(payload: OrchestrationShellStreamItem) => void>();
/** 编排线程事件监听器集合 */
const orchestrationThreadEventListeners = new Set<
  (payload: OrchestrationThreadStreamItem) => void
>();
/** 后备浏览器状态监听器集合 */
const fallbackBrowserStateListeners = new Set<(state: ThreadBrowserState) => void>();

/**
 * 发送带认证的 HTTP JSON 请求
 * @param path - 请求路径
 * @param options - 请求选项，包括方法和请求体
 * @returns 解析后的 JSON 响应
 * @throws 当响应状态码非 2xx 时抛出错误
 */
async function requestAuthJson<T>(
  path: string,
  options: {
    readonly method?: "GET" | "POST";
    readonly body?: unknown;
  } = {},
): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(path, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    ...(hasBody
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Auth request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

/**
 * 订阅服务器欢迎消??? * 如果在调用之前已收到欢迎消息，监听器会同步触发并传入缓存的消息，
 * 避免 WebSocket 连接???React effect 注册之间的竞态条??? * @param listener - 欢迎消息回调函数
 * @returns 取消订阅的函??? */
function tryGetLatestPush<T>(channel: WsPushChannel): T | null {
  try {
    return (getSharedWsTransport().getLatestPush(channel)?.data ?? null) as T | null;
  } catch {
    return null;
  }
}

export function onServerWelcome(listener: (payload: WsWelcomePayload) => void): () => void {
  welcomeListeners.add(listener);

  const latestWelcome = tryGetLatestPush<WsWelcomePayload>(WS_CHANNELS.serverWelcome);
  if (latestWelcome) {
    try {
      listener(latestWelcome);
    } catch {
      // Swallow listener errors
    }
  }

  return () => {
    welcomeListeners.delete(listener);
  };
}

/**
 * 订阅服务器配置更新事??? * 对迟注册的订阅者回放最新的更新，避免错过配置校验反??? * @param listener - 配置更新回调函数
 * @returns 取消订阅的函??? */
export function onServerConfigUpdated(
  listener: (payload: ServerConfigUpdatedPayload) => void,
): () => void {
  serverConfigUpdatedListeners.add(listener);

  const latestConfig = tryGetLatestPush<ServerConfigUpdatedPayload>(WS_CHANNELS.serverConfigUpdated);
  if (latestConfig) {
    try {
      listener(latestConfig);
    } catch {
      // Swallow listener errors
    }
  }

  return () => {
    serverConfigUpdatedListeners.delete(listener);
  };
}

/**
 * 订阅 Provider 状态更新事件，无需强制完整配置重载
 * @param listener - Provider 状态更新回调函??? * @returns 取消订阅的函??? */
export function onServerProviderStatusesUpdated(
  listener: (payload: ServerProviderStatusesUpdatedPayload) => void,
): () => void {
  serverProviderStatusesUpdatedListeners.add(listener);

  const latestProviderStatuses = tryGetLatestPush<ServerProviderStatusesUpdatedPayload>(WS_CHANNELS.serverProviderStatusesUpdated);
  if (latestProviderStatuses) {
    try {
      listener(latestProviderStatuses);
    } catch {
      // Swallow listener errors
    }
  }

  return () => {
    serverProviderStatusesUpdatedListeners.delete(listener);
  };
}

/**
 * 订阅服务器维护状态更新事??? * @param listener - 维护状态更新回调函??? * @returns 取消订阅的函??? */
export function onServerMaintenanceUpdated(
  listener: (payload: ServerLifecycleStreamEvent) => void,
): () => void {
  serverMaintenanceUpdatedListeners.add(listener);

  const latestMaintenance = tryGetLatestPush<ServerLifecycleStreamEvent>(WS_CHANNELS.serverMaintenanceUpdated);
  if (latestMaintenance) {
    try {
      listener(latestMaintenance);
    } catch {
      // Swallow listener errors
    }
  }

  return () => {
    serverMaintenanceUpdatedListeners.delete(listener);
  };
}

/**
 * 订阅服务器设置更新事??? * @param listener - 设置更新回调函数
 * @returns 取消订阅的函??? */
export function onServerSettingsUpdated(
  listener: (payload: ServerSettingsUpdatedPayload) => void,
): () => void {
  serverSettingsUpdatedListeners.add(listener);

  const latestSettings = tryGetLatestPush<ServerSettingsUpdatedPayload>(WS_CHANNELS.serverSettingsUpdated);
  if (latestSettings) {
    try {
      listener(latestSettings);
    } catch {
      // Swallow listener errors
    }
  }

  return () => {
    serverSettingsUpdatedListeners.delete(listener);
  };
}

/**
 * 创建基于 WebSocket ???NativeApi 实例（单例模式）
 * 如果已有未销毁的实例则直接返回，否则创建新的 WsTransport 并注册所有推送频道监听器
 * @returns NativeApi 实例
 */
export function createWsNativeApi(): NativeApi {
  if (instance) {
    return instance;
  }

  const transport = getSharedWsTransport();

  if (!transportListenersRegistered) {
    transportListenersRegistered = true;

    transport.subscribe(WS_CHANNELS.serverWelcome, (message) => {
      const payload = message.data as WsWelcomePayload;
      for (const listener of welcomeListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
    transport.subscribe(WS_CHANNELS.serverConfigUpdated, (message) => {
      const payload = message.data as ServerConfigUpdatedPayload;
      for (const listener of serverConfigUpdatedListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
    transport.subscribe(WS_CHANNELS.serverProviderStatusesUpdated, (message) => {
      const payload = message.data as ServerProviderStatusesUpdatedPayload;
      for (const listener of serverProviderStatusesUpdatedListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
    transport.subscribe(WS_CHANNELS.serverMaintenanceUpdated, (message) => {
      const payload = message.data as ServerLifecycleStreamEvent;
      for (const listener of serverMaintenanceUpdatedListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
    transport.subscribe(WS_CHANNELS.serverSettingsUpdated, (message) => {
      const payload = message.data as ServerSettingsUpdatedPayload;
      for (const listener of serverSettingsUpdatedListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
    transport.subscribe(WS_CHANNELS.gitActionProgress, (message) => {
      const payload = message.data as GitActionProgressEvent;
      for (const listener of gitActionProgressListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
    transport.subscribe(WS_CHANNELS.terminalEvent, (message) => {
      const payload = message.data as TerminalEvent;
      for (const listener of terminalEventListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
    transport.subscribe(ORCHESTRATION_WS_CHANNELS.domainEvent, (message) => {
      const payload = message.data as OrchestrationEvent;
      for (const listener of orchestrationDomainEventListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
    transport.subscribe(ORCHESTRATION_WS_CHANNELS.shellEvent, (message) => {
      const payload = message.data as OrchestrationShellStreamItem;
      for (const listener of orchestrationShellEventListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
    transport.subscribe(ORCHESTRATION_WS_CHANNELS.threadEvent, (message) => {
      const payload = message.data as OrchestrationThreadStreamItem;
      for (const listener of orchestrationThreadEventListeners) {
        try {
          listener(payload);
        } catch {
          // Swallow listener errors
        }
      }
    });
  }

  const api: NativeApi = {
    dialogs: {
      pickFolder: async () => {
        return tauriBridge.pickFolder();
      },
      saveFile: async (input) => {
        if (tauriBridge.saveFile) {
          return tauriBridge.saveFile(input);
        }
        const blob = new Blob([input.contents], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        try {
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = input.defaultFilename;
          anchor.click();
        } finally {
          URL.revokeObjectURL(url);
        }
        return null;
      },
      confirm: async (message) => {
        return showConfirmDialogFallback(message);
      },
    },
    terminal: {
      open: (input) => transport.request(WS_METHODS.terminalOpen, input),
      write: (input) => transport.request(WS_METHODS.terminalWrite, input),
      resize: (input) => transport.request(WS_METHODS.terminalResize, input),
      clear: (input) => transport.request(WS_METHODS.terminalClear, input),
      restart: (input) => transport.request(WS_METHODS.terminalRestart, input),
      close: (input) => transport.request(WS_METHODS.terminalClose, input),
      onEvent: (callback) => {
        terminalEventListeners.add(callback);
        return () => {
          terminalEventListeners.delete(callback);
        };
      },
    },
    projects: {
      listDirectories: (input) => transport.request(WS_METHODS.projectsListDirectories, input),
      searchEntries: (input) => transport.request(WS_METHODS.projectsSearchEntries, input),
      searchLocalEntries: (input) =>
        transport.request(WS_METHODS.projectsSearchLocalEntries, input),
      writeFile: (input) => transport.request(WS_METHODS.projectsWriteFile, input),
    },
    filesystem: {
      browse: (input) => transport.request(WS_METHODS.filesystemBrowse, input),
    },
    shell: {
      openInEditor: (cwd, editor) =>
        transport.request(WS_METHODS.shellOpenInEditor, { cwd, editor }),
      openExternal: async (url) => {
        const opened = await tauriBridge.openExternal(url);
        if (!opened) {
          throw new Error("Unable to open link.");
        }
      },
      showInFolder: async (path) => {
        await tauriBridge.showInFolder(path);
      },
    },
    git: {
      pull: (input) => transport.request(WS_METHODS.gitPull, input),
      status: (input) => transport.request(WS_METHODS.gitStatus, input),
      readWorkingTreeDiff: (input) => transport.request(WS_METHODS.gitReadWorkingTreeDiff, input),
      summarizeDiff: (input) =>
        transport.request(WS_METHODS.gitSummarizeDiff, input, {
          timeoutMs: null,
        }),
      runStackedAction: (input) =>
        transport.request(WS_METHODS.gitRunStackedAction, input, {
          timeoutMs: null,
        }),
      applyPatch: (input) => transport.request(WS_METHODS.gitApply, input),
      listBranches: (input) => transport.request(WS_METHODS.gitListBranches, input),
      createWorktree: (input) => transport.request(WS_METHODS.gitCreateWorktree, input),
      createDetachedWorktree: (input) =>
        transport.request(WS_METHODS.gitCreateDetachedWorktree, input),
      removeWorktree: (input) => transport.request(WS_METHODS.gitRemoveWorktree, input),
      reconcileWorktrees: (input) =>
        transport.request(WS_METHODS.gitReconcileWorktrees, input),
      createBranch: (input) => transport.request(WS_METHODS.gitCreateBranch, input),
      checkout: (input) => transport.request(WS_METHODS.gitCheckout, input),
      stashAndCheckout: (input) => transport.request(WS_METHODS.gitStashAndCheckout, input),
      stashDrop: (input) => transport.request(WS_METHODS.gitStashDrop, input),
      stashInfo: (input) => transport.request(WS_METHODS.gitStashInfo, input),
      removeIndexLock: (input) => transport.request(WS_METHODS.gitRemoveIndexLock, input),
      init: (input) => transport.request(WS_METHODS.gitInit, input),
      handoffThread: (input) => transport.request(WS_METHODS.gitHandoffThread, input),
      resolvePullRequest: (input) => transport.request(WS_METHODS.gitResolvePullRequest, input),
      preparePullRequestThread: (input) =>
        transport.request(WS_METHODS.gitPreparePullRequestThread, input),
      // GitHub PR 管理 RPC（透传至后端 GitHubCli 方法）
      listPullRequests: (input) => transport.request(WS_METHODS.gitListPullRequests, input),
      viewPullRequest: (input) => transport.request(WS_METHODS.gitViewPullRequest, input),
      mergePullRequest: (input) => transport.request(WS_METHODS.gitMergePullRequest, input),
      commentPullRequest: (input) => transport.request(WS_METHODS.gitCommentPullRequest, input),
      diffPullRequest: (input) => transport.request(WS_METHODS.gitDiffPullRequest, input),
      closePullRequest: (input) => transport.request(WS_METHODS.gitClosePullRequest, input),
      reopenPullRequest: (input) => transport.request(WS_METHODS.gitReopenPullRequest, input),
      authStatus: (input) => transport.request(WS_METHODS.gitAuthStatus, input),
      createPullRequest: (input) => transport.request(WS_METHODS.gitCreatePullRequest, input),
      onActionProgress: (callback) => {
        gitActionProgressListeners.add(callback);
        return () => {
          gitActionProgressListeners.delete(callback);
        };
      },
    },
    contextMenu: {
      show: async <T extends string>(
        items: readonly ContextMenuItem<T>[],
        position?: { x: number; y: number },
      ): Promise<T | null> => {
        return tauriBridge.showContextMenu(items, position);
      },
    },
    server: {
      getConfig: () => transport.request<ServerConfig>(WS_METHODS.serverGetConfig),
      getEnvironment: () => transport.request(WS_METHODS.serverGetEnvironment),
      getSettings: () => transport.request(WS_METHODS.serverGetSettings),
      updateSettings: (input) => transport.request(WS_METHODS.serverUpdateSettings, input),
      getAuthSession: () => requestAuthJson<AuthSessionState>("/api/auth/session"),
      bootstrapAuth: (input: AuthBootstrapInput) =>
        requestAuthJson<AuthBootstrapResult>("/api/auth/bootstrap", {
          method: "POST",
          body: input,
        }),
      bootstrapBearerAuth: (input: AuthBootstrapInput) =>
        requestAuthJson<AuthBearerBootstrapResult>("/api/auth/bootstrap/bearer", {
          method: "POST",
          body: input,
        }),
      issueAuthWebSocketToken: () =>
        requestAuthJson<AuthWebSocketTokenResult>("/api/auth/ws-token", { method: "POST" }),
      createAuthPairingToken: (input?: AuthCreatePairingCredentialInput) =>
        requestAuthJson<AuthPairingCredentialResult>("/api/auth/pairing-token", {
          method: "POST",
          ...(input ? { body: input } : {}),
        }),
      listAuthPairingLinks: () =>
        requestAuthJson<ReadonlyArray<AuthPairingLink>>("/api/auth/pairing-links"),
      revokeAuthPairingLink: (input: AuthRevokePairingLinkInput) =>
        requestAuthJson<{ revoked: boolean }>("/api/auth/pairing-links/revoke", {
          method: "POST",
          body: input,
        }),
      listAuthClients: () => requestAuthJson<ReadonlyArray<AuthClientSession>>("/api/auth/clients"),
      revokeAuthClient: (input: AuthRevokeClientSessionInput) =>
        requestAuthJson<{ revoked: boolean }>("/api/auth/clients/revoke", {
          method: "POST",
          body: input,
        }),
      revokeOtherAuthClients: () =>
        requestAuthJson<{ revokedCount: number }>("/api/auth/clients/revoke-others", {
          method: "POST",
        }),
      refreshProviders: () => transport.request(WS_METHODS.serverRefreshProviders),
      updateProvider: (input) => transport.request(WS_METHODS.serverUpdateProvider, input),
      listWorktrees: () => transport.request(WS_METHODS.serverListWorktrees),
      getProviderUsageSnapshot: (input) =>
        transport.request(WS_METHODS.serverGetProviderUsageSnapshot, input),
      getDiagnostics: () => transport.request(WS_METHODS.serverGetDiagnostics),
      transcribeVoice: (input) => {
        return tauriBridge.server?.transcribeVoice(input) ?? Promise.reject(new Error("Not available"));
      },
      voicePolishText: (input) => {
        return tauriBridge.server?.voicePolishText(input) ?? Promise.reject(new Error("Not available"));
      },
      upsertKeybinding: (input) => transport.request(WS_METHODS.serverUpsertKeybinding, input),
    },
    provider: {
      getComposerCapabilities: (input) =>
        transport.request(WS_METHODS.providerGetComposerCapabilities, input),
      compactThread: (input) => transport.request(WS_METHODS.providerCompactThread, input),
      listCommands: (input) => transport.request(WS_METHODS.providerListCommands, input),
      listSkills: (input) => transport.request(WS_METHODS.providerListSkills, input),
      listPlugins: (input) => transport.request(WS_METHODS.providerListPlugins, input),
      readPlugin: (input) => transport.request(WS_METHODS.providerReadPlugin, input),
      listModels: (input) => transport.request(WS_METHODS.providerListModels, input),
      listAgents: (input) => transport.request(WS_METHODS.providerListAgents, input),
    },
    skills: {
      listLocal: () => transport.request(WS_METHODS.skillsListLocal, null),
      marketplace: {
        list: (input) =>
          transport.request<ReadonlyArray<MarketplaceEntry>>(
            WS_METHODS.skillMarketplaceList,
            input ?? null,
          ),
        trending: (input) =>
          transport.request<ReadonlyArray<MarketplaceEntry>>(
            WS_METHODS.skillMarketplaceTrending,
            input ?? null,
          ),
        search: (input) =>
          transport.request<ReadonlyArray<MarketplaceEntry>>(
            WS_METHODS.skillMarketplaceSearch,
            input,
          ),
        lookup: (input) =>
          transport.request<MarketplaceEntry | null>(WS_METHODS.skillMarketplaceLookup, input),
        categories: () =>
          transport.request<ReadonlyArray<MarketplaceCategory>>(
            WS_METHODS.skillMarketplaceCategories,
            null,
          ),
        install: (input) =>
          transport.request<InstalledSkill>(WS_METHODS.skillMarketplaceInstall, input),
        uninstall: (input) =>
          transport.request<{ success: boolean }>(WS_METHODS.skillMarketplaceUninstall, input),
        listInstalled: () =>
          transport.request<ReadonlyArray<InstalledSkill>>(
            WS_METHODS.skillMarketplaceListInstalled,
            null,
          ),
        loadBody: (input) =>
          transport.request<SkillBody | null>(WS_METHODS.skillMarketplaceLoadBody, input),
        refresh: () =>
          transport.request<SkillMarketplaceStatus>(WS_METHODS.skillMarketplaceRefresh, null),
        status: () =>
          transport.request<SkillMarketplaceStatus>(WS_METHODS.skillMarketplaceStatus, null),
        setUrl: (input) =>
          transport.request<SkillMarketplaceStatus>(WS_METHODS.skillMarketplaceSetUrl, input),
      },
    },
    indexer: {
      astGrepFindByNodeKind: (input) =>
        transport.request<ReadonlyArray<AstGrepMatch>>(
          WS_METHODS.indexerAstGrepFindByNodeKind,
          input,
        ),
      astGrepFindByQuery: (input) =>
        transport.request<ReadonlyArray<AstGrepMatch>>(
          WS_METHODS.indexerAstGrepFindByQuery,
          input,
        ),
      astGrepFindByName: (input) =>
        transport.request<ReadonlyArray<AstGrepMatch>>(
          WS_METHODS.indexerAstGrepFindByName,
          input,
        ),
      astGrepListPresets: (input) =>
        transport.request<ReadonlyArray<AstGrepPresetInfo>>(
          WS_METHODS.indexerAstGrepListPresets,
          input ?? {},
        ),
      astGrepCompilePattern: (input) =>
        transport.request<AstGrepCompiledPattern>(
          WS_METHODS.indexerAstGrepCompilePattern,
          input,
        ),
      astGrepRewrite: (input) =>
        transport.request<AstGrepRewriteResult>(WS_METHODS.indexerAstGrepRewrite, input),
    },
    urlPreview: {
      fetchMetadata: (input) =>
        transport.request<UrlMetadata>(WS_METHODS.urlPreviewFetchMetadata, input),
    },
    linear: {
      setApiKey: (input: LinearSetApiKeyInput) =>
        transport.request<LinearSetApiKeyResult>(WS_METHODS.linearSetApiKey, input),
      getAuthStatus: () =>
        transport.request<LinearAuthStatus>(WS_METHODS.linearGetAuthStatus, null),
      clearApiKey: () =>
        transport.request<void>(WS_METHODS.linearClearApiKey, null),
      listTasks: (input: LinearListTasksInput) =>
        transport.request<LinearTaskSummary[]>(WS_METHODS.linearListTasks, input),
      searchTasks: (input: LinearSearchTasksInput) =>
        transport.request<LinearTaskSummary[]>(WS_METHODS.linearSearchTasks, input),
      getTask: (input: LinearGetTaskInput) =>
        transport.request<LinearTaskDetail>(WS_METHODS.linearGetTask, input),
      createThreadFromTask: (input: LinearCreateThreadFromTaskInput) =>
        transport.request<LinearCreateThreadResult>(
          WS_METHODS.linearCreateThreadFromTask,
          input,
        ),
      updateTaskStatus: (input: LinearUpdateTaskStatusInput) =>
        transport.request<LinearUpdateTaskStatusResult>(
          WS_METHODS.linearUpdateTaskStatus,
          input,
        ),
    },
    goal: {
      start: (input) => transport.request(WS_METHODS.goalStart, input),
      abort: (input) => transport.request(WS_METHODS.goalAbort, input),
      listActive: () => transport.request(WS_METHODS.goalListActive, null),
      get: (input) => transport.request(WS_METHODS.goalGet, input),
      cleanup: () => transport.request(WS_METHODS.goalCleanup, null),
    },
    quest: {
      create: (input: { threadId: string; title: string; description?: string; steps?: ReadonlyArray<{ title: string; description?: string }> }) =>
        transport.request<{ questId: string }>(WS_METHODS.questCreate, input),
      start: (input: { questId: string }) =>
        transport.request<{ success: boolean }>(WS_METHODS.questStart, input),
      pause: (input: { questId: string }) =>
        transport.request<{ success: boolean }>(WS_METHODS.questPause, input),
      resume: (input: { questId: string }) =>
        transport.request<{ success: boolean }>(WS_METHODS.questResume, input),
      abort: (input: { questId: string; reason?: string }) =>
        transport.request<{ success: boolean }>(WS_METHODS.questAbort, input),
      get: (input: { questId: string }) =>
        transport.request<QuestDto | null>(WS_METHODS.questGet, input),
      listActive: () =>
        transport.request<ReadonlyArray<QuestDto>>(WS_METHODS.questListActive, null),
      skipStep: (input: { questId: string }) =>
        transport.request<{ success: boolean }>(WS_METHODS.questSkipStep, input),
      retryStep: (input: { questId: string }) =>
        transport.request<{ success: boolean }>(WS_METHODS.questRetryStep, input),
      cleanup: () =>
        transport.request<{ removed: number }>(WS_METHODS.questCleanup, null),
    },
    orchestration: {
      getSnapshot: () => transport.request(ORCHESTRATION_WS_METHODS.getSnapshot),
      getShellSnapshot: () => transport.request(ORCHESTRATION_WS_METHODS.getShellSnapshot),
      dispatchCommand: (command) => {
        return transport.request(ORCHESTRATION_WS_METHODS.dispatchCommand, {
          command: omitNullUserInputAnswers(command),
        });
      },
      importThread: (input) => transport.request(ORCHESTRATION_WS_METHODS.importThread, input),
      repairState: () => transport.request(ORCHESTRATION_WS_METHODS.repairState),
      getTurnDiff: (input) => transport.request(ORCHESTRATION_WS_METHODS.getTurnDiff, input),
      getFullThreadDiff: (input) =>
        transport.request(ORCHESTRATION_WS_METHODS.getFullThreadDiff, input),
      getTurnAiShareSnapshot: () =>
        transport.request(ORCHESTRATION_WS_METHODS.getTurnAiShareSnapshot, undefined),
      replayEvents: (fromSequenceExclusive) =>
        transport.request(ORCHESTRATION_WS_METHODS.replayEvents, {
          fromSequenceExclusive,
        }),
      subscribeShell: () => transport.request<void>(ORCHESTRATION_WS_METHODS.subscribeShell, {}),
      unsubscribeShell: () =>
        transport.request<void>(ORCHESTRATION_WS_METHODS.unsubscribeShell, {}),
      subscribeThread: (input) =>
        transport.request<void>(ORCHESTRATION_WS_METHODS.subscribeThread, input),
      unsubscribeThread: (input) =>
        transport.request<void>(ORCHESTRATION_WS_METHODS.unsubscribeThread, input),
      onDomainEvent: (callback) => {
        orchestrationDomainEventListeners.add(callback);
        return () => {
          orchestrationDomainEventListeners.delete(callback);
        };
      },
      onShellEvent: (callback) => {
        orchestrationShellEventListeners.add(callback);
        return () => {
          orchestrationShellEventListeners.delete(callback);
        };
      },
      onThreadEvent: (callback) => {
        orchestrationThreadEventListeners.add(callback);
        return () => {
          orchestrationThreadEventListeners.delete(callback);
        };
      },
    },
    threads: {
      deleteMessage: (threadId, turnId) =>
        transport.request<void>("threads.deleteMessage", { threadId, turnId }),
      sendTurn: (input) =>
        transport.request<{ turnId: string }>("threads.sendTurn", input).then((res) => ({
          turnId: res.turnId as TurnId,
        })),
    },
    browser: {
      open: async (input) => {
        return tauriBridge.browser.open(input);
      },
      close: async (input) => {
        return tauriBridge.browser.close(input);
      },
      hide: async (input) => {
        await tauriBridge.browser.hide(input);
      },
      getState: async (input) => {
        return tauriBridge.browser.getState(input);
      },
      setPanelBounds: async (input) => {
        await tauriBridge.browser.setPanelBounds(input);
      },
      attachWebview: async (input) => {
        return tauriBridge.browser.attachWebview(input);
      },
      copyScreenshotToClipboard: async (input) => {
        await tauriBridge.browser.copyScreenshotToClipboard(input);
      },
      captureScreenshot: async (input) => {
        return tauriBridge.browser.captureScreenshot(input);
      },
      executeCdp: async (input) => {
        return tauriBridge.browser.executeCdp(input);
      },
      navigate: async (input) => {
        return tauriBridge.browser.navigate(input);
      },
      reload: async (input) => {
        return tauriBridge.browser.reload(input);
      },
      goBack: async (input) => {
        return tauriBridge.browser.goBack(input);
      },
      goForward: async (input) => {
        return tauriBridge.browser.goForward(input);
      },
      newTab: async (input) => {
        return tauriBridge.browser.newTab(input);
      },
      closeTab: async (input) => {
        return tauriBridge.browser.closeTab(input);
      },
      selectTab: async (input) => {
        return tauriBridge.browser.selectTab(input);
      },
      openDevTools: async (input) => {
        await tauriBridge.browser.openDevTools(input);
      },
      designModeToggle: async (input) => {
        return tauriBridge.browser.designModeToggle(input);
      },
      onDesignModeElementSelected: (callback) => {
        return tauriBridge.browser.onDesignModeElementSelected(callback);
      },
      onDesignModeCancelled: (callback) => {
        return tauriBridge.browser.onDesignModeCancelled(callback);
      },
      onState: (callback) => {
        return tauriBridge.browser.onState(callback);
      },
    },
  };

  instance = api;
  return api;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    instance = null;
    transportListenersRegistered = false;
    welcomeListeners.clear();
    serverConfigUpdatedListeners.clear();
    serverProviderStatusesUpdatedListeners.clear();
    serverSettingsUpdatedListeners.clear();
    serverMaintenanceUpdatedListeners.clear();
    gitActionProgressListeners.clear();
    terminalEventListeners.clear();
    orchestrationDomainEventListeners.clear();
    orchestrationShellEventListeners.clear();
    orchestrationThreadEventListeners.clear();
    fallbackBrowserStateListeners.clear();
  });
}
