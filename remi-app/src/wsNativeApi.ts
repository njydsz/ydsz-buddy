/**
 * @file 閸╄桨绨?WebSocket 閻?NativeApi 鐎圭偟骞? * @description 闁俺绻?WsTransport 鐎圭偟骞?NativeApi 閹恒儱褰涢敍灞界殺閹碘偓閺堝甯悽鐔诲厴閸旀稖鐨熼悽? *              鏉烆剚宕叉稉?WebSocket RPC 鐠囬攱鐪伴妴鍌氭倱閺冭埖褰佹笟娑欐箛閸斺€虫珤閹恒劑鈧椒绨ㄦ禒鍓佹畱鐠併垽妲勯張鍝勫煑閿? *              娴犮儱寮峰ù蹇氼潔閸ｃ劎濮搁幀浣烘畱閸氬骸顦敍鍧抋llback閿涘顓搁悶鍡愨偓? *              瑜?Tauri 閸樼喓鏁撳銉﹀复娑撳秴褰查悽銊︽閿涘奔缍旀稉?Web 缁旑垳娈戞妯款吇鐎圭偟骞囬妴? */

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

/** 閸楁洑绶ョ€圭偘绶ラ敍宀€绱︾€涙ê鍑￠崚娑樼紦閻?NativeApi 閸?WsTransport */
let instance: { api: NativeApi; transport: WsTransport } | null = null;
/** 閺堝秴濮熼崳銊︻偨鏉╁孩绉烽幁顖滄磧閸氼剙娅掗梿鍡楁値 */
const welcomeListeners = new Set<(payload: WsWelcomePayload) => void>();
/** 閺堝秴濮熼崳銊╁帳缂冾喗娲块弬鎵磧閸氼剙娅掗梿鍡楁値 */
const serverConfigUpdatedListeners = new Set<(payload: ServerConfigUpdatedPayload) => void>();
/** 閺堝秴濮熼崳?Provider 閻樿埖鈧焦娲块弬鎵磧閸氼剙娅掗梿鍡楁値 */
const serverProviderStatusesUpdatedListeners = new Set<
  (payload: ServerProviderStatusesUpdatedPayload) => void
>();
/** 閺堝秴濮熼崳銊ф樊閹躲倗濮搁幀浣规纯閺傛壆娲冮崥顒€娅掗梿鍡楁値 */
const serverMaintenanceUpdatedListeners = new Set<(payload: ServerLifecycleStreamEvent) => void>();
/** 閺堝秴濮熼崳銊啎缂冾喗娲块弬鎵磧閸氼剙娅掗梿鍡楁値 */
const serverSettingsUpdatedListeners = new Set<(payload: ServerSettingsUpdatedPayload) => void>();
/** Git 閹垮秳缍旀潻娑樺閻╂垵鎯夐崳銊╂肠閸?*/
const gitActionProgressListeners = new Set<(payload: GitActionProgressEvent) => void>();

/**
 * 鏉╁洦鎶ら悽銊﹀煕鏉堟挸鍙嗘惔鏃傜摕娑擃厾娈?null/undefined 閸? * 娴犲懎顕?thread.user-input.respond 缁鐎烽惃鍕嚒娴犮倗鏁撻弫鍫礉缁夊娅?answers 娑擃厽妫ら弫鍫㈡畱缁屽搫鈧吋娼惄? * @param command - 缂傛牗甯撶拫鍐ㄥ閸涙垝鎶? * @returns 鏉╁洦鎶ら崥搴ｆ畱閸涙垝鎶? */
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
/** 缂佸牏顏禍瀣╂閻╂垵鎯夐崳銊╂肠閸?*/
const terminalEventListeners = new Set<(payload: TerminalEvent) => void>();
/** 缂傛牗甯撴０鍡楃厵娴滃娆㈤惄鎴濇儔閸ｃ劑娉﹂崥?*/
const orchestrationDomainEventListeners = new Set<(payload: OrchestrationEvent) => void>();
/** 缂傛牗甯?Shell 娴滃娆㈤惄鎴濇儔閸ｃ劑娉﹂崥?*/
const orchestrationShellEventListeners = new Set<(payload: OrchestrationShellStreamItem) => void>();
/** 缂傛牗甯撶痪璺ㄢ柤娴滃娆㈤惄鎴濇儔閸ｃ劑娉﹂崥?*/
const orchestrationThreadEventListeners = new Set<
  (payload: OrchestrationThreadStreamItem) => void
>();
/** 閸氬骸顦ù蹇氼潔閸ｃ劎濮搁幀浣烘磧閸氼剙娅掗梿鍡楁値 */
const fallbackBrowserStateListeners = new Set<(state: ThreadBrowserState) => void>();
/** 閸氬骸顦ù蹇氼潔閸ｃ劎濮搁幀浣虹处鐎涙﹫绱漦ey 娑?threadId */
const fallbackBrowserStates = new Map<ThreadId, ThreadBrowserState>();

/**
 * 閸掓稑缂撴妯款吇閻ㄥ嫭绁荤憴鍫濇珤閻樿埖鈧? * @param threadId - 缁捐法鈻?ID
 * @returns 閸掓繂顫愬ù蹇氼潔閸ｃ劎濮搁幀渚婄礉閻楀牊婀版稉?0閿涘本婀幍鎾崇磻閿涘本妫ら弽鍥╊劮妞? */
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
 * 閺嶈宓?URL 閻㈢喐鍨氭妯款吇閻ㄥ嫭绁荤憴鍫濇珤閺嶅洨顒锋い鍨垼妫? * @param url - 閺嶅洨顒锋い?URL
 * @returns 閺嶅洨顒锋い鍨垼妫版﹫绱濈粚铏规妞や絻绻戦崶?"New tab"閿涘苯鎯侀崚娆掔箲閸ョ偛鐓欓崥宥嗗灗閸樼喎顫?URL
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
 * 閸欐垿鈧礁鐢拋銈堢槈閻?HTTP JSON 鐠囬攱鐪? * @param path - 鐠囬攱鐪扮捄顖氱窞
 * @param options - 鐠囬攱鐪伴柅澶愩€嶉敍灞藉瘶閹奉剚鏌熷▔鏇炴嫲鐠囬攱鐪版担? * @returns 鐟欙絾鐎介崥搴ｆ畱 JSON 閸濆秴绨? * @throws 瑜版挸鎼锋惔鏃傚Ц閹胶鐖滈棃?2xx 閺冭埖濮忛崙娲晩鐠? */
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
 * 閸掓稑缂撻崥搴☆槵濞村繗顫嶉崳銊︾垼缁涢箖銆? * @param url - 閸掓繂顫?URL閿涘矂绮拋銈勮礋 about:blank
 * @returns 閺傛澘缂撻惃鍕垼缁涢箖銆夌€电钖? */
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
 * 濞ｈ鲸瀚圭拹婵囩セ鐟欏牆娅掗悩鑸碘偓渚婄礄閸栧懏瀚弽鍥╊劮妞ら潧鍨悰顭掔礆
 * @param state - 閸樼喎顫愬ù蹇氼潔閸ｃ劎濮搁幀? * @returns 濞ｈ鲸瀚圭拹婵嗘倵閻ㄥ嫭绁荤憴鍫濇珤閻樿埖鈧? */
function cloneBrowserState(state: ThreadBrowserState): ThreadBrowserState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => ({ ...tab })),
  };
}

/**
 * 閼惧嘲褰囬幐鍥х暰缁捐法鈻奸惃鍕倵婢跺洦绁荤憴鍫濇珤閻樿埖鈧緤绱濇稉宥呯摠閸︺劌鍨崚娑樼紦姒涙顓婚悩鑸碘偓? * @param threadId - 缁捐法鈻?ID
 * @returns 濞村繗顫嶉崳銊уЦ閹? */
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
 * 闁氨鐓￠幍鈧張澶婃倵婢跺洦绁荤憴鍫濇珤閻樿埖鈧胶娲冮崥顒€娅掗悩鑸碘偓浣稿嚒閺囧瓨鏌? * @param threadId - 缁捐法鈻?ID
 * @returns 閺囧瓨鏌婇崥搴ｆ畱濞村繗顫嶉崳銊уЦ閹礁澹囬張? */
function emitFallbackBrowserState(threadId: ThreadId): ThreadBrowserState {
  const state = cloneBrowserState(getFallbackBrowserState(threadId));
  for (const listener of fallbackBrowserStateListeners) {
    listener(state);
  }
  return state;
}

/** 閺嶅洩顔囬崥搴☆槵濞村繗顫嶉崳銊уЦ閹礁鍑￠崣妯绘纯閿涘矂鈧帒顤冮悧鍫熸拱閸?*/
function markFallbackBrowserStateChanged(state: ThreadBrowserState): void {
  state.version += 1;
}

/**
 * 绾喕绻氶幐鍥х暰缁捐法鈻奸惃鍕倵婢跺洦绁荤憴鍫濇珤瀹搞儰缍旈崠鍝勫嚒閸掓繂顫愰崠? * 婵″倹鐏夊▽鈩冩箒閺嶅洨顒锋い闈涘灟閸掓稑缂撴稉鈧稉顏堢帛鐠併倖鐖ｇ粵楣冦€夐敍灞借嫙閺嶅洩顔囨稉鍝勫嚒閹垫挸绱? * @param threadId - 缁捐法鈻?ID
 * @returns 閸掓繂顫愰崠鏍ф倵閻ㄥ嫭绁荤憴鍫濇珤閻樿埖鈧? */
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
 * 鐟欙絾鐎介崥搴☆槵濞村繗顫嶉崳銊よ厬閻ㄥ嫮娲伴弽鍥ㄧ垼缁涢箖銆? * 娴兼ê鍘涢崠褰掑帳閹稿洤鐣?tabId閿涘苯鍙惧▎鈥冲爱闁板秴缍嬮崜宥嗘た鐠哄啯鐖ｇ粵楣冦€夐敍灞炬付閸氬簼濞囬悽銊ь儑娑撯偓娑擃亝鐖ｇ粵楣冦€? * 閼汇儱娼庢稉宥呯摠閸︺劌鍨崚娑樼紦閺傜増鐖ｇ粵楣冦€? * @param state - 濞村繗顫嶉崳銊уЦ閹? * @param tabId - 閸欘垶鈧娈戦惄顔界垼閺嶅洨顒锋い?ID
 * @returns 閸栧綊鍘ら崚鎵畱閺嶅洨顒锋い? */
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
 * 鐠併垽妲勯張宥呭閸ｃ劍顐芥潻搴㈢Х閹? * 婵″倹鐏夐崷銊ㄧ殶閻劋绠ｉ崜宥呭嚒閺€璺哄煂濞嗐垼绻嬪☉鍫熶紖閿涘瞼娲冮崥顒€娅掓导姘倱濮濄儴袝閸欐垵鑻熸导鐘插弳缂傛挸鐡ㄩ惃鍕Х閹垽绱? * 闁灝鍘?WebSocket 鏉╃偞甯存稉?React effect 濞夈劌鍞芥稊瀣？閻ㄥ嫮鐝甸幀浣规蒋娴? * @param listener - 濞嗐垼绻嬪☉鍫熶紖閸ョ偠鐨熼崙鑺ユ殶
 * @returns 閸欐牗绉风拋銏ゆ閻ㄥ嫬鍤遍弫? */
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
 * 鐠併垽妲勯張宥呭閸ｃ劑鍘ょ純顔芥纯閺傞绨ㄦ禒? * 鐎电绻滃▔銊ュ斀閻ㄥ嫯顓归梼鍛扳偓鍛礀閺€鐐付閺傛壆娈戦弴瀛樻煀閿涘矂浼╅崗宥夋晩鏉╁洭鍘ょ純顔界墡妤犲苯寮芥＃? * @param listener - 闁板秶鐤嗛弴瀛樻煀閸ョ偠鐨熼崙鑺ユ殶
 * @returns 閸欐牗绉风拋銏ゆ閻ㄥ嫬鍤遍弫? */
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
 * 鐠併垽妲?Provider 閻樿埖鈧焦娲块弬棰佺皑娴犺绱濋弮鐘绘付瀵搫鍩楃€瑰本鏆ｉ柊宥囩枂闁插秷娴? * @param listener - Provider 閻樿埖鈧焦娲块弬鏉挎礀鐠嬪啫鍤遍弫? * @returns 閸欐牗绉风拋銏ゆ閻ㄥ嫬鍤遍弫? */
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
 * 鐠併垽妲勯張宥呭閸ｃ劎娣幎銈囧Ц閹焦娲块弬棰佺皑娴? * @param listener - 缂佸瓨濮㈤悩鑸碘偓浣规纯閺傛澘娲栫拫鍐ㄥ毐閺? * @returns 閸欐牗绉风拋銏ゆ閻ㄥ嫬鍤遍弫? */
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
 * 鐠併垽妲勯張宥呭閸ｃ劏顔曠純顔芥纯閺傞绨ㄦ禒? * @param listener - 鐠佸墽鐤嗛弴瀛樻煀閸ョ偠鐨熼崙鑺ユ殶
 * @returns 閸欐牗绉风拋銏ゆ閻ㄥ嫬鍤遍弫? */
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
 * 閸掓稑缂撻崺杞扮艾 WebSocket 閻?NativeApi 鐎圭偘绶ラ敍鍫濆礋娓氬膩瀵骏绱? * 婵″倹鐏夊鍙夋箒閺堫亪鏀㈠В浣烘畱鐎圭偘绶ラ崚娆戞纯閹恒儴绻戦崶鐑囩礉閸氾箑鍨崚娑樼紦閺傛壆娈?WsTransport 楠炶埖鏁為崘灞惧閺堝甯归柅渚€顣堕柆鎾舵磧閸氼剙娅? * @returns NativeApi 鐎圭偘绶? */
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

/** Vite HMR 閻戭厽娲块弬鐗堟濞撳懐鎮婇幍鈧張澶庣カ濠?*/
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
