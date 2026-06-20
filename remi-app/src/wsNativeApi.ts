/**
 * @file 鍩轰簬 WebSocket 鐨?NativeApi 瀹炵幇
 * @description 閫氳繃 WsTransport 瀹炵幇 NativeApi 鎺ュ彛锛屽皢鎵€鏈夊師鐢熻兘鍔涜皟鐢? *              杞崲涓?WebSocket RPC 璇锋眰銆傚悓鏃舵彁渚涙湇鍔″櫒鎺ㄩ€佷簨浠剁殑璁㈤槄鏈哄埗锛? *              浠ュ強娴忚鍣ㄧ姸鎬佺殑鍚庡锛坒allback锛夌鐞嗐€? *              褰?Tauri 鍘熺敓妗ユ帴涓嶅彲鐢ㄦ椂锛屼綔涓?Web 绔殑榛樿瀹炵幇銆? */

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
  type ThreadId,
  type ThreadBrowserState,
  type GitActionProgressEvent,
  type OrchestrationEvent,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
  type ServerProviderStatusesUpdatedPayload,
  type ServerLifecycleStreamEvent,
  type ServerSettingsUpdatedPayload,
  type TerminalEvent,
  ORCHESTRATION_WS_CHANNELS,
  ORCHESTRATION_WS_METHODS,
  type ClientOrchestrationCommand,
  type ContextMenuItem,
  type NativeApi,
  ServerConfigUpdatedPayload,
  WS_CHANNELS,
  WS_METHODS,
  type WsWelcomePayload,
} from "~/contracts";

import { showConfirmDialogFallback } from "./confirmDialogFallback";
import { showContextMenuFallback } from "./contextMenuFallback";
import { WsTransport } from "./wsTransport";
import { tauriBridge } from "./lib/tauri-bridge";

/** 鍗曚緥瀹炰緥锛岀紦瀛樺凡鍒涘缓鐨?NativeApi 鍜?WsTransport */
let instance: { api: NativeApi; transport: WsTransport } | null = null;
/** 鏈嶅姟鍣ㄦ杩庢秷鎭洃鍚櫒闆嗗悎 */
const welcomeListeners = new Set<(payload: WsWelcomePayload) => void>();
/** 鏈嶅姟鍣ㄩ厤缃洿鏂扮洃鍚櫒闆嗗悎 */
const serverConfigUpdatedListeners = new Set<(payload: ServerConfigUpdatedPayload) => void>();
/** 鏈嶅姟鍣?Provider 鐘舵€佹洿鏂扮洃鍚櫒闆嗗悎 */
const serverProviderStatusesUpdatedListeners = new Set<
  (payload: ServerProviderStatusesUpdatedPayload) => void
>();
/** 鏈嶅姟鍣ㄧ淮鎶ょ姸鎬佹洿鏂扮洃鍚櫒闆嗗悎 */
const serverMaintenanceUpdatedListeners = new Set<(payload: ServerLifecycleStreamEvent) => void>();
/** 鏈嶅姟鍣ㄨ缃洿鏂扮洃鍚櫒闆嗗悎 */
const serverSettingsUpdatedListeners = new Set<(payload: ServerSettingsUpdatedPayload) => void>();
/** Git 鎿嶄綔杩涘害鐩戝惉鍣ㄩ泦鍚?*/
const gitActionProgressListeners = new Set<(payload: GitActionProgressEvent) => void>();

/**
 * 杩囨护鐢ㄦ埛杈撳叆搴旂瓟涓殑 null/undefined 鍊? * 浠呭 thread.user-input.respond 绫诲瀷鐨勫懡浠ょ敓鏁堬紝绉婚櫎 answers 涓棤鏁堢殑绌哄€兼潯鐩? * @param command - 缂栨帓璋冨害鍛戒护
 * @returns 杩囨护鍚庣殑鍛戒护
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
/** 缁堢浜嬩欢鐩戝惉鍣ㄩ泦鍚?*/
const terminalEventListeners = new Set<(payload: TerminalEvent) => void>();
/** 缂栨帓棰嗗煙浜嬩欢鐩戝惉鍣ㄩ泦鍚?*/
const orchestrationDomainEventListeners = new Set<(payload: OrchestrationEvent) => void>();
/** 缂栨帓 Shell 浜嬩欢鐩戝惉鍣ㄩ泦鍚?*/
const orchestrationShellEventListeners = new Set<(payload: OrchestrationShellStreamItem) => void>();
/** 缂栨帓绾跨▼浜嬩欢鐩戝惉鍣ㄩ泦鍚?*/
const orchestrationThreadEventListeners = new Set<
  (payload: OrchestrationThreadStreamItem) => void
>();
/** 鍚庡娴忚鍣ㄧ姸鎬佺洃鍚櫒闆嗗悎 */
const fallbackBrowserStateListeners = new Set<(state: ThreadBrowserState) => void>();
/** 鍚庡娴忚鍣ㄧ姸鎬佺紦瀛橈紝key 涓?threadId */
const fallbackBrowserStates = new Map<ThreadId, ThreadBrowserState>();

/**
 * 鍒涘缓榛樿鐨勬祻瑙堝櫒鐘舵€? * @param threadId - 绾跨▼ ID
 * @returns 鍒濆娴忚鍣ㄧ姸鎬侊紝鐗堟湰涓?0锛屾湭鎵撳紑锛屾棤鏍囩椤? */
function defaultBrowserState(threadId: ThreadId): ThreadBrowserState {
  return {
    threadId,
    version: 0,
    open: false,
    activeTabId: null,
    tabs: [],
    lastError: null,
  };
}

/**
 * 鏍规嵁 URL 鐢熸垚榛樿鐨勬祻瑙堝櫒鏍囩椤垫爣棰? * @param url - 鏍囩椤?URL
 * @returns 鏍囩椤垫爣棰橈紝绌虹櫧椤佃繑鍥?"New tab"锛屽惁鍒欒繑鍥炲煙鍚嶆垨鍘熷 URL
 */
function defaultBrowserTitle(url: string): string {
  if (url === "about:blank") {
    return "New tab";
  }
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

/**
 * 鍙戦€佸甫璁よ瘉鐨?HTTP JSON 璇锋眰
 * @param path - 璇锋眰璺緞
 * @param options - 璇锋眰閫夐」锛屽寘鎷柟娉曞拰璇锋眰浣? * @returns 瑙ｆ瀽鍚庣殑 JSON 鍝嶅簲
 * @throws 褰撳搷搴旂姸鎬佺爜闈?2xx 鏃舵姏鍑洪敊璇? */
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
 * 鍒涘缓鍚庡娴忚鍣ㄦ爣绛鹃〉
 * @param url - 鍒濆 URL锛岄粯璁や负 about:blank
 * @returns 鏂板缓鐨勬爣绛鹃〉瀵硅薄
 */
function createFallbackTab(url = "about:blank") {
  return {
    id: crypto.randomUUID(),
    url,
    title: defaultBrowserTitle(url),
    status: "live" as const,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    faviconUrl: null,
    lastCommittedUrl: url,
    lastError: null,
  };
}

/**
 * 娣辨嫹璐濇祻瑙堝櫒鐘舵€侊紙鍖呮嫭鏍囩椤靛垪琛級
 * @param state - 鍘熷娴忚鍣ㄧ姸鎬? * @returns 娣辨嫹璐濆悗鐨勬祻瑙堝櫒鐘舵€? */
function cloneBrowserState(state: ThreadBrowserState): ThreadBrowserState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => ({ ...tab })),
  };
}

/**
 * 鑾峰彇鎸囧畾绾跨▼鐨勫悗澶囨祻瑙堝櫒鐘舵€侊紝涓嶅瓨鍦ㄥ垯鍒涘缓榛樿鐘舵€? * @param threadId - 绾跨▼ ID
 * @returns 娴忚鍣ㄧ姸鎬? */
function getFallbackBrowserState(threadId: ThreadId): ThreadBrowserState {
  const existing = fallbackBrowserStates.get(threadId);
  if (existing) {
    return existing;
  }
  const initial = defaultBrowserState(threadId);
  fallbackBrowserStates.set(threadId, initial);
  return initial;
}

/**
 * 閫氱煡鎵€鏈夊悗澶囨祻瑙堝櫒鐘舵€佺洃鍚櫒鐘舵€佸凡鏇存柊
 * @param threadId - 绾跨▼ ID
 * @returns 鏇存柊鍚庣殑娴忚鍣ㄧ姸鎬佸壇鏈? */
function emitFallbackBrowserState(threadId: ThreadId): ThreadBrowserState {
  const state = cloneBrowserState(getFallbackBrowserState(threadId));
  for (const listener of fallbackBrowserStateListeners) {
    listener(state);
  }
  return state;
}

/** 鏍囪鍚庡娴忚鍣ㄧ姸鎬佸凡鍙樻洿锛岄€掑鐗堟湰鍙?*/
function markFallbackBrowserStateChanged(state: ThreadBrowserState): void {
  state.version += 1;
}

/**
 * 纭繚鎸囧畾绾跨▼鐨勫悗澶囨祻瑙堝櫒宸ヤ綔鍖哄凡鍒濆鍖? * 濡傛灉娌℃湁鏍囩椤靛垯鍒涘缓涓€涓粯璁ゆ爣绛鹃〉锛屽苟鏍囪涓哄凡鎵撳紑
 * @param threadId - 绾跨▼ ID
 * @returns 鍒濆鍖栧悗鐨勬祻瑙堝櫒鐘舵€? */
function ensureFallbackBrowserWorkspace(threadId: ThreadId): ThreadBrowserState {
  const state = getFallbackBrowserState(threadId);
  if (state.tabs.length === 0) {
    const tab = createFallbackTab();
    state.tabs = [tab];
    state.activeTabId = tab.id;
  }
  state.open = true;
  return state;
}

/**
 * 瑙ｆ瀽鍚庡娴忚鍣ㄤ腑鐨勭洰鏍囨爣绛鹃〉
 * 浼樺厛鍖归厤鎸囧畾 tabId锛屽叾娆″尮閰嶅綋鍓嶆椿璺冩爣绛鹃〉锛屾渶鍚庝娇鐢ㄧ涓€涓爣绛鹃〉
 * 鑻ュ潎涓嶅瓨鍦ㄥ垯鍒涘缓鏂版爣绛鹃〉
 * @param state - 娴忚鍣ㄧ姸鎬? * @param tabId - 鍙€夌殑鐩爣鏍囩椤?ID
 * @returns 鍖归厤鍒扮殑鏍囩椤? */
function resolveFallbackBrowserTab(state: ThreadBrowserState, tabId?: string) {
  const existing =
    (tabId ? state.tabs.find((tab) => tab.id === tabId) : undefined) ??
    (state.activeTabId ? state.tabs.find((tab) => tab.id === state.activeTabId) : undefined) ??
    state.tabs[0];
  if (existing) {
    return existing;
  }
  const tab = createFallbackTab();
  state.tabs = [tab];
  state.activeTabId = tab.id;
  state.open = true;
  return tab;
}

/**
 * 璁㈤槄鏈嶅姟鍣ㄦ杩庢秷鎭? * 濡傛灉鍦ㄨ皟鐢ㄤ箣鍓嶅凡鏀跺埌娆㈣繋娑堟伅锛岀洃鍚櫒浼氬悓姝ヨЕ鍙戝苟浼犲叆缂撳瓨鐨勬秷鎭紝
 * 閬垮厤 WebSocket 杩炴帴涓?React effect 娉ㄥ唽涔嬮棿鐨勭珵鎬佹潯浠? * @param listener - 娆㈣繋娑堟伅鍥炶皟鍑芥暟
 * @returns 鍙栨秷璁㈤槄鐨勫嚱鏁? */
export function onServerWelcome(listener: (payload: WsWelcomePayload) => void): () => void {
  welcomeListeners.add(listener);

  const latestWelcome = instance?.transport.getLatestPush(WS_CHANNELS.serverWelcome)?.data ?? null;
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
 * 璁㈤槄鏈嶅姟鍣ㄩ厤缃洿鏂颁簨浠? * 瀵硅繜娉ㄥ唽鐨勮闃呰€呭洖鏀炬渶鏂扮殑鏇存柊锛岄伩鍏嶉敊杩囬厤缃牎楠屽弽棣? * @param listener - 閰嶇疆鏇存柊鍥炶皟鍑芥暟
 * @returns 鍙栨秷璁㈤槄鐨勫嚱鏁? */
export function onServerConfigUpdated(
  listener: (payload: ServerConfigUpdatedPayload) => void,
): () => void {
  serverConfigUpdatedListeners.add(listener);

  const latestConfig =
    instance?.transport.getLatestPush(WS_CHANNELS.serverConfigUpdated)?.data ?? null;
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
 * 璁㈤槄 Provider 鐘舵€佹洿鏂颁簨浠讹紝鏃犻渶寮哄埗瀹屾暣閰嶇疆閲嶈浇
 * @param listener - Provider 鐘舵€佹洿鏂板洖璋冨嚱鏁? * @returns 鍙栨秷璁㈤槄鐨勫嚱鏁? */
export function onServerProviderStatusesUpdated(
  listener: (payload: ServerProviderStatusesUpdatedPayload) => void,
): () => void {
  serverProviderStatusesUpdatedListeners.add(listener);

  const latestProviderStatuses =
    instance?.transport.getLatestPush(WS_CHANNELS.serverProviderStatusesUpdated)?.data ?? null;
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
 * 璁㈤槄鏈嶅姟鍣ㄧ淮鎶ょ姸鎬佹洿鏂颁簨浠? * @param listener - 缁存姢鐘舵€佹洿鏂板洖璋冨嚱鏁? * @returns 鍙栨秷璁㈤槄鐨勫嚱鏁? */
export function onServerMaintenanceUpdated(
  listener: (payload: ServerLifecycleStreamEvent) => void,
): () => void {
  serverMaintenanceUpdatedListeners.add(listener);

  const latestMaintenance =
    instance?.transport.getLatestPush(WS_CHANNELS.serverMaintenanceUpdated)?.data ?? null;
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
 * 璁㈤槄鏈嶅姟鍣ㄨ缃洿鏂颁簨浠? * @param listener - 璁剧疆鏇存柊鍥炶皟鍑芥暟
 * @returns 鍙栨秷璁㈤槄鐨勫嚱鏁? */
export function onServerSettingsUpdated(
  listener: (payload: ServerSettingsUpdatedPayload) => void,
): () => void {
  serverSettingsUpdatedListeners.add(listener);

  const latestSettings =
    instance?.transport.getLatestPush(WS_CHANNELS.serverSettingsUpdated)?.data ?? null;
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
 * 鍒涘缓鍩轰簬 WebSocket 鐨?NativeApi 瀹炰緥锛堝崟渚嬫ā寮忥級
 * 濡傛灉宸叉湁鏈攢姣佺殑瀹炰緥鍒欑洿鎺ヨ繑鍥烇紝鍚﹀垯鍒涘缓鏂扮殑 WsTransport 骞舵敞鍐屾墍鏈夋帹閫侀閬撶洃鍚櫒
 * @returns NativeApi 瀹炰緥
 */
export function createWsNativeApi(): NativeApi {
  if (instance) {
    if (instance.transport.getState() !== "disposed") {
      return instance.api;
    }
    instance = null;
  }

  const transport = new WsTransport();

  transport.subscribe(WS_CHANNELS.serverWelcome, (message) => {
    const payload = message.data;
    for (const listener of welcomeListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  transport.subscribe(WS_CHANNELS.serverConfigUpdated, (message) => {
    const payload = message.data;
    for (const listener of serverConfigUpdatedListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  transport.subscribe(WS_CHANNELS.serverProviderStatusesUpdated, (message) => {
    const payload = message.data;
    for (const listener of serverProviderStatusesUpdatedListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  transport.subscribe(WS_CHANNELS.serverMaintenanceUpdated, (message) => {
    const payload = message.data;
    for (const listener of serverMaintenanceUpdatedListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  transport.subscribe(WS_CHANNELS.serverSettingsUpdated, (message) => {
    const payload = message.data;
    for (const listener of serverSettingsUpdatedListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  transport.subscribe(WS_CHANNELS.gitActionProgress, (message) => {
    const payload = message.data;
    for (const listener of gitActionProgressListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  transport.subscribe(WS_CHANNELS.terminalEvent, (message) => {
    const payload = message.data;
    for (const listener of terminalEventListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  transport.subscribe(ORCHESTRATION_WS_CHANNELS.domainEvent, (message) => {
    const payload = message.data;
    for (const listener of orchestrationDomainEventListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  transport.subscribe(ORCHESTRATION_WS_CHANNELS.shellEvent, (message) => {
    const payload = message.data;
    for (const listener of orchestrationShellEventListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  transport.subscribe(ORCHESTRATION_WS_CHANNELS.threadEvent, (message) => {
    const payload = message.data;
    for (const listener of orchestrationThreadEventListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
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
      listBranches: (input) => transport.request(WS_METHODS.gitListBranches, input),
      createWorktree: (input) => transport.request(WS_METHODS.gitCreateWorktree, input),
      createDetachedWorktree: (input) =>
        transport.request(WS_METHODS.gitCreateDetachedWorktree, input),
      removeWorktree: (input) => transport.request(WS_METHODS.gitRemoveWorktree, input),
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
      getConfig: () => transport.request(WS_METHODS.serverGetConfig),
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
      onState: (callback) => {
        return tauriBridge.browser.onState(callback);
      },
    },
  };

  instance = { api, transport };
  return api;
}

/** Vite HMR 鐑洿鏂版椂娓呯悊鎵€鏈夎祫婧?*/
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    instance?.transport.dispose();
    instance = null;
    welcomeListeners.clear();
    serverConfigUpdatedListeners.clear();
    serverProviderStatusesUpdatedListeners.clear();
    serverSettingsUpdatedListeners.clear();
    gitActionProgressListeners.clear();
    terminalEventListeners.clear();
    orchestrationDomainEventListeners.clear();
    orchestrationShellEventListeners.clear();
    orchestrationThreadEventListeners.clear();
    fallbackBrowserStateListeners.clear();
  });
}
