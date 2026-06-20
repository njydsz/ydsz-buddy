/**
 * @file WebSocket 浼犺緭灞傚疄鐜? * @description 鍩轰簬 Effect RPC 鍜?WebSocket 鍗忚鐨勫弻鍚戦€氫俊浼犺緭灞傘€? *              灏佽浜?RPC 瀹㈡埛绔殑鍒涘缓銆佽繛鎺ョ鐞嗐€佽嚜鍔ㄩ噸杩炪€佹祦寮忚闃呯瓑鍔熻兘锛? *              涓轰笂灞傛彁渚涚粺涓€鐨?request/subscribe 鎺ュ彛锛屽睆钄藉簳灞?WebSocket 閫氫俊缁嗚妭銆? *              Tauri 杩佺Щ鏈熼棿涓存椂璺宠繃绫诲瀷妫€鏌ワ紝鍚庣画闇€鏇挎崲涓?Tauri event/invoke 瀹炵幇銆? */
// @ts-nocheck
// TODO: Tauri 杩佺Щ鏈熼棿涓存椂璺宠繃绫诲瀷妫€鏌ャ€傚師鏂囦欢鍩轰簬 Effect RPC/WebSocket锛?// 闇€鏇挎崲涓?Tauri event/invoke 瀹炵幇銆?
import {
  ORCHESTRATION_WS_CHANNELS,
  ORCHESTRATION_WS_METHODS,
  WS_CHANNELS,
  WS_METHODS,
  WsRpcGroup,
  type GitActionProgressEvent,
  type GitRunStackedActionResult,
  type OrchestrationEvent,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
  type ServerConfigStreamEvent,
  type ServerLifecycleStreamEvent,
  type ServerProviderStatusesUpdatedPayload,
  type ServerSettingsUpdatedPayload,
  type TerminalEvent,
  type WsPush,
  type WsPushChannel,
  type WsPushMessage,
} from "~/contracts";
import { Cause, Data, Effect, Exit, Layer, ManagedRuntime, Scope, Stream } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

/** 鎺ㄩ€佹秷鎭洃鍚櫒绫诲瀷锛岀敤浜庤闃呮寚瀹氶閬撶殑鎺ㄩ€佹秷鎭?*/
type PushListener<C extends WsPushChannel> = (message: WsPushMessage<C>) => void;

/** RPC 瀹㈡埛绔伐鍘?Effect 绫诲瀷 */
type RpcClientEffect = typeof makeRpcClient;
/** RPC 瀹㈡埛绔疄渚嬬被鍨嬶紝浠庡伐鍘?Effect 涓帹鏂?*/
type RpcClientInstance =
  RpcClientEffect extends Effect.Effect<infer Client, any, any> ? Client : never;

/** 浼犺緭灞傝繛鎺ョ姸鎬?*/
type TransportState = "connecting" | "open" | "closed" | "disposed";

/** WebSocket RPC 閫氫俊閿欒 */
class WsTransportRpcError extends Data.TaggedError("WsTransportRpcError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** 鍒涘缓 RPC 瀹㈡埛绔疄渚嬬殑 Effect锛屽熀浜?WsRpcGroup 瀹氫箟鐨勬柟娉曢泦 */
const makeRpcClient = RpcClient.make(WsRpcGroup);

/**
 * 灏嗗師濮?URL 瑙ｆ瀽涓?RPC 绔偣鍦板潃
 * @param rawUrl - 鍘熷 WebSocket 杩炴帴鍦板潃
 * @returns 杩藉姞浜?`/ws` 璺緞鐨勫畬鏁?URL
 */
function resolveRpcUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.pathname = "/ws";
  return url.toString();
}

/**
 * 鏋勫缓 WebSocket 杩炴帴鍦板潃
 * 浼樺厛绾э細鏄惧紡 URL > Tauri Bridge URL > 鐜鍙橀噺 VITE_WS_URL > 褰撳墠椤甸潰鍗忚鑷姩鎺ㄥ
 * @param explicitUrl - 鏄惧紡鎸囧畾鐨?WebSocket URL锛屼负 null 鏃惰嚜鍔ㄦ帹瀵? * @returns 鍙敤浜庡缓绔?WebSocket 杩炴帴鐨勫畬鏁?URL
 */
function makeSocketUrl(explicitUrl: string | null): string {
  if (explicitUrl) return resolveRpcUrl(explicitUrl);
  const bridgeUrl = tauriBridge.getWsUrl();
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  const rawUrl =
    bridgeUrl && bridgeUrl.length > 0
      ? bridgeUrl
      : envUrl && envUrl.length > 0
        ? envUrl
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}`;
  return resolveRpcUrl(rawUrl);
}

/**
 * 鏋勫缓 RPC 鍗忚灞傦紝鍖呭惈 WebSocket 浼犺緭灞傚拰 JSON 搴忓垪鍖栧眰
 * @param url - WebSocket 杩炴帴鍦板潃
 * @returns Effect Layer锛屾彁渚?RPC 鍗忚鏀寔
 */
function makeProtocolLayer(url: string) {
  const socketLayer = Socket.layerWebSocket(url).pipe(
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
  );
  return RpcClient.layerProtocolSocket().pipe(
    Layer.provide(Layer.mergeAll(socketLayer, RpcSerialization.layerJson)),
  );
}

/**
 * 灏?Effect Cause 杞崲涓烘爣鍑?Error 瀵硅薄
 * @param cause - Effect 妗嗘灦鐨勯敊璇?Cause
 * @returns 鏍囧噯 Error 瀹炰緥
 */
function causeToError(cause: Cause.Cause<unknown>): Error {
  const error = Cause.squash(cause);
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * 杩囨护鐢ㄦ埛杈撳叆搴旂瓟涓殑 null/undefined 鍊? * 褰撳懡浠ょ被鍨嬩负 thread.user-input.respond 鏃讹紝绉婚櫎 answers 涓€间负 null 鎴?undefined 鐨勬潯鐩紝
 * 閬垮厤鍚庣鎺ユ敹鍒版棤鏁堢殑绌哄€煎簲绛? * @param input - 鍘熷 RPC 璇锋眰鍙傛暟
 * @returns 杩囨护鍚庣殑璇锋眰鍙傛暟
 */
function omitNullUserInputAnswers(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }
  const command = input as { type?: unknown; answers?: unknown };
  if (command.type !== "thread.user-input.respond" || !command.answers) {
    return input;
  }
  if (typeof command.answers !== "object") {
    return input;
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

/**
 * 鍒ゆ柇缁欏畾棰戦亾鏄惁涓烘湇鍔″櫒鐢熷懡鍛ㄦ湡鐩稿叧棰戦亾
 * @param channel - 棰戦亾鏍囪瘑
 * @returns 鏄惁涓烘湇鍔″櫒鐢熷懡鍛ㄦ湡棰戦亾锛坰erverWelcome 鎴?serverMaintenanceUpdated锛? */
export function isServerLifecyclePushChannel(channel: string): boolean {
  return channel === WS_CHANNELS.serverWelcome || channel === WS_CHANNELS.serverMaintenanceUpdated;
}

/**
 * 鍒ゆ柇鏄惁闇€瑕佷繚鎸佹湇鍔″櫒鐢熷懡鍛ㄦ湡娴佸浜庢椿璺冪姸鎬? * 褰撲换涓€鐢熷懡鍛ㄦ湡棰戦亾浠嶆湁璁㈤槄鑰呮椂锛屾祦涓嶅簲琚叧闂? * @param activeChannels - 褰撳墠娲昏穬鐨勯閬撻泦鍚? * @returns 鏄惁闇€瑕佷繚鎸佺敓鍛藉懆鏈熸祦
 */
export function shouldKeepServerLifecycleStream(activeChannels: ReadonlySet<string>): boolean {
  return (
    activeChannels.has(WS_CHANNELS.serverWelcome) ||
    activeChannels.has(WS_CHANNELS.serverMaintenanceUpdated)
  );
}

/**
 * WebSocket 浼犺緭灞傛牳蹇冪被
 * 璐熻矗绠＄悊 WebSocket 杩炴帴鐨勭敓鍛藉懆鏈燂紝鍖呮嫭锛? * - RPC 璇锋眰鐨勫彂閫佷笌鍝嶅簲鎺ユ敹
 * - 鎺ㄩ€侀閬撶殑璁㈤槄涓庡彇娑? * - 杩炴帴鏂紑鍚庣殑鑷姩閲嶈繛锛堟寚鏁伴€€閬匡級
 * - 娴佸紡鏁版嵁鐨勮闃呯鐞? *
 * @example
 * ```typescript
 * const transport = new WsTransport("ws://localhost:8080");
 * const unsubscribe = transport.subscribe(WS_CHANNELS.serverWelcome, (msg) => {
 *   console.log("Welcome:", msg.data);
 * });
 * // 鍙栨秷璁㈤槄
 * unsubscribe();
 * transport.dispose();
 * ```
 */
export class WsTransport {
  /** 鏄惧紡鎸囧畾鐨?WebSocket URL锛屼紭鍏堢骇鏈€楂?*/
  private readonly explicitUrl: string | null;
  /** 鍚勯閬撶殑鐩戝惉鍣ㄩ泦鍚堬紝key 涓洪閬撳悕 */
  private readonly listeners = new Map<string, Set<(message: WsPush) => void>>();
  /** 鍚勯閬撴渶杩戜竴娆℃帹閫佹秷鎭紦瀛橈紝鐢ㄤ簬鏂拌闃呰€呯殑鍥炴斁 */
  private readonly latestPushByChannel = new Map<string, WsPush>();
  /** 娑堟伅搴忓垪鍙凤紝鐢ㄤ簬鎺ㄩ€佹秷鎭帓搴?*/
  private sequence = 0;
  /** 褰撳墠浼犺緭灞傜姸鎬?*/
  private state: TransportState = "connecting";
  /** 鏄惁宸查攢姣?*/
  private disposed = false;
  /** Effect ManagedRuntime锛岀鐞?RPC 瀹㈡埛绔殑鐢熷懡鍛ㄦ湡 */
  private runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
  /** RPC 瀹㈡埛绔殑浣滅敤鍩燂紝鐢ㄤ簬璧勬簮娓呯悊 */
  private clientScope: Scope.Closeable;
  /** RPC 瀹㈡埛绔疄渚嬬殑 Promise锛屾敮鎸佸紓姝ュ垵濮嬪寲 */
  private clientPromise: Promise<RpcClientInstance>;
  /** 姝ｅ湪杩涜鐨勯噸杩?Promise锛岄槻姝㈠苟鍙戦噸杩?*/
  private reconnectPromise: Promise<RpcClientInstance> | null = null;
  /** 杩炵画閲嶈繛澶辫触娆℃暟锛岀敤浜庤绠楅€€閬垮欢杩?*/
  private reconnectFailures = 0;
  /** 娲昏穬娴佺殑娓呯悊鍑芥暟鏄犲皠锛宬ey 涓烘祦鏍囪瘑 */
  private readonly streamCleanups = new Map<string, () => void>();
  /** 姝ｅ湪涓诲姩鍋滄鐨勬祦鏍囪瘑闆嗗悎锛岀敤浜庡尯鍒嗕富鍔ㄥ仠姝㈠拰寮傚父鏂紑 */
  private readonly stoppingStreams = new Set<string>();
  /** 鏄惁宸茶闃?Shell 浜嬩欢娴?*/
  private shellSubscribed = false;
  /** 绾跨▼璁㈤槄鍙傛暟鏄犲皠锛宬ey 涓?threadId锛岄噸杩炴椂鐢ㄤ簬鎭㈠璁㈤槄 */
  private readonly threadSubscriptions = new Map<string, unknown>();

  /**
   * 鍒涘缓 WsTransport 瀹炰緥
   * @param url - 鍙€夌殑 WebSocket 杩炴帴鍦板潃锛屼笉浼犲垯鑷姩鎺ㄥ
   */
  constructor(url?: string) {
    this.explicitUrl = url ?? null;
    const session = this.createSession();
    this.runtime = session.runtime;
    this.clientScope = session.clientScope;
    this.clientPromise = session.clientPromise;
  }

  /**
   * 鍙戦€?RPC 璇锋眰骞惰繑鍥炲搷搴?   * 瀵逛簬娴佸紡鏂规硶锛堝 git 鎿嶄綔銆丼hell/Thread 璁㈤槄锛夛紝浼氬惎鍔ㄥ搴旂殑娴佸鐞?   * @param method - RPC 鏂规硶鍚?   * @param params - 璇锋眰鍙傛暟
   * @param _options - 鍙€夐厤缃紙濡傝秴鏃舵椂闂达級锛屽綋鍓嶆湭浣跨敤
   * @returns RPC 鍝嶅簲缁撴灉
   * @throws 褰撲紶杈撳眰宸查攢姣佹垨鏂规硶涓嶅瓨鍦ㄦ椂鎶涘嚭閿欒
   */
  async request<T = unknown>(
    method: string,
    params?: unknown,
    _options?: { readonly timeoutMs?: number | null },
  ): Promise<T> {
    if (this.disposed) throw new Error("Transport disposed");
    const client = await this.getClient();

    if (method === WS_METHODS.gitRunStackedAction) {
      return (await this.runGitActionStream(client, params)) as T;
    }

    if (method === ORCHESTRATION_WS_METHODS.subscribeShell) {
      this.shellSubscribed = true;
      this.startShellStream(client);
      return undefined as T;
    }
    if (method === ORCHESTRATION_WS_METHODS.unsubscribeShell) {
      this.shellSubscribed = false;
      this.stopStream("orchestration.shell");
      return undefined as T;
    }
    if (method === ORCHESTRATION_WS_METHODS.subscribeThread) {
      const threadId = (params as { threadId: string }).threadId;
      this.threadSubscriptions.set(threadId, params);
      this.startThreadStream(client, threadId, params as never);
      return undefined as T;
    }
    if (method === ORCHESTRATION_WS_METHODS.unsubscribeThread) {
      const threadId = (params as { threadId: string }).threadId;
      this.threadSubscriptions.delete(threadId);
      this.stopStream(`orchestration.thread:${threadId}`);
      return undefined as T;
    }

    const rpcInput =
      method === ORCHESTRATION_WS_METHODS.dispatchCommand
        ? (params as { command: unknown }).command
        : (params ?? {});
    const normalizedRpcInput = omitNullUserInputAnswers(rpcInput);
    const call = (
      client as unknown as Record<
        string,
        (input: unknown) => Effect.Effect<unknown, WsTransportRpcError, never>
      >
    )[method];
    if (!call) throw new WsTransportRpcError({ message: `Unknown RPC method: ${method}` });
    return (await this.runtime.runPromise(call(normalizedRpcInput))) as T;
  }

  /**
   * 璁㈤槄鎸囧畾棰戦亾鐨勬帹閫佹秷鎭?   * 褰撻涓洃鍚櫒娉ㄥ唽鏃惰嚜鍔ㄥ惎鍔ㄥ搴旂殑娴侊紝褰撴渶鍚庝竴涓洃鍚櫒绉婚櫎鏃惰嚜鍔ㄥ仠姝㈡祦
   * @param channel - 瑕佽闃呯殑鎺ㄩ€侀閬?   * @param listener - 娑堟伅鍥炶皟鍑芥暟
   * @param options - 璁㈤槄閫夐」锛宺eplayLatest 涓?true 鏃朵細绔嬪嵆鍥炴斁鏈€杩戜竴鏉℃秷鎭?   * @returns 鍙栨秷璁㈤槄鐨勫嚱鏁?   * @example
   * ```typescript
   * const unsub = transport.subscribe(WS_CHANNELS.serverConfigUpdated, (msg) => {
   *   console.log(msg.data);
   * }, { replayLatest: true });
   * ```
   */
  subscribe<C extends WsPushChannel>(
    channel: C,
    listener: PushListener<C>,
    options?: { readonly replayLatest?: boolean },
  ): () => void {
    let channelListeners = this.listeners.get(channel);
    if (!channelListeners) {
      channelListeners = new Set<(message: WsPush) => void>();
      this.listeners.set(channel, channelListeners);
      this.startChannelStream(channel);
    }

    const wrappedListener = (message: WsPush) => listener(message as WsPushMessage<C>);
    channelListeners.add(wrappedListener);

    if (options?.replayLatest) {
      const latest = this.latestPushByChannel.get(channel);
      if (latest) wrappedListener(latest);
    }

    return () => {
      channelListeners?.delete(wrappedListener);
      if (channelListeners?.size === 0) {
        this.listeners.delete(channel);
        this.stopChannelStream(channel);
      }
    };
  }

  /**
   * 鑾峰彇鎸囧畾棰戦亾鏈€杩戜竴娆℃帹閫佹秷鎭?   * @param channel - 棰戦亾鏍囪瘑
   * @returns 鏈€杩戜竴娆℃帹閫佹秷鎭紝鑻ユ棤缂撳瓨鍒欒繑鍥?null
   */
  getLatestPush<C extends WsPushChannel>(channel: C): WsPushMessage<C> | null {
    const latest = this.latestPushByChannel.get(channel);
    return latest ? (latest as WsPushMessage<C>) : null;
  }

  /**
   * 鑾峰彇褰撳墠浼犺緭灞傜姸鎬?   * @returns 浼犺緭灞傝繛鎺ョ姸鎬?   */
  getState(): TransportState {
    return this.state;
  }

  /**
   * 閿€姣佷紶杈撳眰锛岄噴鏀炬墍鏈夎祫婧?   * 鍋滄鎵€鏈夋椿璺冩祦銆佸叧闂?RPC 瀹㈡埛绔繛鎺ャ€侀攢姣佽繍琛屾椂
   */
  dispose() {
    this.disposed = true;
    this.state = "disposed";
    for (const cleanup of this.streamCleanups.values()) cleanup();
    this.streamCleanups.clear();
    void this.runtime.runPromise(Scope.close(this.clientScope, Exit.void)).finally(() => {
      this.runtime.dispose();
    });
  }

  /** 鍒涘缓鏂扮殑 RPC 浼氳瘽锛堣繍琛屾椂 + 瀹㈡埛绔綔鐢ㄥ煙 + 瀹㈡埛绔?Promise锛?*/
  private createSession() {
    const runtime = ManagedRuntime.make(makeProtocolLayer(makeSocketUrl(this.explicitUrl)));
    const clientScope = runtime.runSync(Scope.make());
    const clientPromise = runtime
      .runPromise(Scope.provide(clientScope)(makeRpcClient))
      .then((client) => {
        this.state = "open";
        return client;
      })
      .catch((error) => {
        this.state = "closed";
        throw error;
      });
    return { runtime, clientScope, clientPromise };
  }

  /**
   * 鑾峰彇 RPC 瀹㈡埛绔疄渚嬶紝杩炴帴澶辫触鏃惰嚜鍔ㄨЕ鍙戦噸杩?   * @returns RPC 瀹㈡埛绔疄渚?   */
  private async getClient(): Promise<RpcClientInstance> {
    try {
      return await this.clientPromise;
    } catch {
      if (this.disposed) throw new Error("Transport disposed");
      return this.reconnect();
    }
  }

  /**
   * 鎵ц閲嶈繛鎿嶄綔锛屾竻鐞嗘棫浼氳瘽骞跺垱寤烘柊浼氳瘽
   * 浣跨敤浜掓枼閿侊紙reconnectPromise锛夐槻姝㈠苟鍙戦噸杩?   * @returns 鏂扮殑 RPC 瀹㈡埛绔疄渚?   */
  private reconnect(): Promise<RpcClientInstance> {
    if (this.reconnectPromise) return this.reconnectPromise;

    const oldRuntime = this.runtime;
    const oldClientScope = this.clientScope;
    for (const cleanup of this.streamCleanups.values()) cleanup();
    this.streamCleanups.clear();
    this.stoppingStreams.clear();

    this.state = "connecting";

    void oldRuntime.runPromise(Scope.close(oldClientScope, Exit.void)).finally(() => {
      oldRuntime.dispose();
    });

    this.reconnectPromise = this.openReconnectSession().finally(() => {
      this.reconnectPromise = null;
    });
    return this.reconnectPromise;
  }

  /**
   * 鎵撳紑鏂扮殑閲嶈繛浼氳瘽锛屼娇鐢ㄦ寚鏁伴€€閬跨瓥鐣ュ欢杩熼噸璇?   * 閲嶈繛鎴愬姛鍚庢仮澶嶆墍鏈夐閬撹闃呫€丼hell 璁㈤槄鍜岀嚎绋嬭闃?   * @returns 鏂扮殑 RPC 瀹㈡埛绔疄渚?   */
  private async openReconnectSession(): Promise<RpcClientInstance> {
    // 鎸囨暟閫€閬匡細500ms * 2^failures锛屾渶澶?5000ms
    const delayMs = Math.min(500 * 2 ** this.reconnectFailures, 5_000);
    this.reconnectFailures += 1;
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));

    const session = this.createSession();
    this.runtime = session.runtime;
    this.clientScope = session.clientScope;
    this.clientPromise = session.clientPromise;

    const client = await session.clientPromise;
    this.reconnectFailures = 0;
    for (const channel of this.listeners.keys()) {
      this.startChannelStream(channel as WsPushChannel);
    }
    if (this.shellSubscribed) {
      this.startShellStream(client);
    }
    for (const [threadId, input] of this.threadSubscriptions) {
      this.startThreadStream(client, threadId, input);
    }
    return client;
  }

  /**
   * 鍚戞寚瀹氶閬撳彂閫佹帹閫佹秷鎭紝閫氱煡鎵€鏈夌洃鍚櫒
   * @param channel - 鐩爣棰戦亾
   * @param data - 鎺ㄩ€佹暟鎹?   */
  private emit<C extends WsPushChannel>(channel: C, data: WsPushMessage<C>["data"]): void {
    const message = {
      type: "push" as const,
      sequence: ++this.sequence,
      channel,
      data,
    } as WsPush;
    this.latestPushByChannel.set(channel, message);
    const listeners = this.listeners.get(channel);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(message);
      } catch {
        // Listener errors must not break transport streams.
      }
    }
  }

  /**
   * 鍚姩鎸囧畾棰戦亾鐨勬祦寮忚闃?   * 鏍规嵁棰戦亾绫诲瀷璺敱鍒板搴旂殑娴佸鐞嗛€昏緫
   * @param channel - 瑕佽闃呯殑棰戦亾
   */
  private startChannelStream(channel: WsPushChannel): void {
    void this.getClient()
      .then((client) => {
        const restartChannel = () => {
          if (this.listeners.has(channel)) {
            this.startChannelStream(channel);
          }
        };

        if (isServerLifecyclePushChannel(channel)) {
          this.startLifecycleStream(client);
        } else if (channel === WS_CHANNELS.serverConfigUpdated) {
          this.startStream(
            "server.config",
            client[WS_METHODS.subscribeServerConfig]({}),
            (event: ServerConfigStreamEvent) => {
              if (event.type === "snapshot") {
                this.emit(WS_CHANNELS.serverConfigUpdated, {
                  issues: event.config.issues,
                  providers: event.config.providers,
                });
              } else if (event.type === "configUpdated") {
                this.emit(WS_CHANNELS.serverConfigUpdated, event.payload);
              }
            },
            restartChannel,
          );
        } else if (channel === WS_CHANNELS.serverProviderStatusesUpdated) {
          this.startStream(
            "server.providers",
            client[WS_METHODS.subscribeServerProviderStatuses]({}),
            (payload: ServerProviderStatusesUpdatedPayload) =>
              this.emit(WS_CHANNELS.serverProviderStatusesUpdated, payload),
            restartChannel,
          );
        } else if (channel === WS_CHANNELS.serverSettingsUpdated) {
          this.startStream(
            "server.settings",
            client[WS_METHODS.subscribeServerSettings]({}),
            (payload: ServerSettingsUpdatedPayload) =>
              this.emit(WS_CHANNELS.serverSettingsUpdated, payload),
            restartChannel,
          );
        } else if (channel === WS_CHANNELS.terminalEvent) {
          this.startStream(
            "terminal.events",
            client[WS_METHODS.subscribeTerminalEvents]({}),
            (event: TerminalEvent) => this.emit(WS_CHANNELS.terminalEvent, event),
            restartChannel,
          );
        } else if (channel === ORCHESTRATION_WS_CHANNELS.domainEvent) {
          this.startStream(
            "orchestration.domain",
            client[WS_METHODS.subscribeOrchestrationDomainEvents]({}),
            (event: OrchestrationEvent) => this.emit(ORCHESTRATION_WS_CHANNELS.domainEvent, event),
            restartChannel,
          );
        }
      })
      .catch((error) => {
        if (!this.disposed && this.listeners.has(channel)) {
          console.warn("WebSocket RPC channel failed to start", error);
          window.setTimeout(() => this.startChannelStream(channel), 500);
        }
      });
  }

  /**
   * 鍋滄鎸囧畾棰戦亾鐨勬祦寮忚闃?   * @param channel - 瑕佸仠姝㈢殑棰戦亾
   */
  private stopChannelStream(channel: WsPushChannel): void {
    if (isServerLifecyclePushChannel(channel)) {
      if (!this.shouldKeepLifecycleStream()) this.stopStream("server.lifecycle");
    } else if (channel === WS_CHANNELS.serverConfigUpdated) this.stopStream("server.config");
    else if (channel === WS_CHANNELS.serverProviderStatusesUpdated)
      this.stopStream("server.providers");
    else if (channel === WS_CHANNELS.serverSettingsUpdated) this.stopStream("server.settings");
    else if (channel === WS_CHANNELS.terminalEvent) this.stopStream("terminal.events");
    else if (channel === ORCHESTRATION_WS_CHANNELS.domainEvent)
      this.stopStream("orchestration.domain");
  }

  /** 鍒ゆ柇鏄惁浠嶉渶淇濇寔鐢熷懡鍛ㄦ湡娴佹椿璺?*/
  private shouldKeepLifecycleStream(): boolean {
    return shouldKeepServerLifecycleStream(new Set(this.listeners.keys()));
  }

  /**
   * 鍚姩鏈嶅姟鍣ㄧ敓鍛藉懆鏈熶簨浠舵祦锛坵elcome + maintenance锛?   * @param client - RPC 瀹㈡埛绔疄渚?   */
  private startLifecycleStream(client: RpcClientInstance): void {
    const restartLifecycle = () => {
      if (!this.shouldKeepLifecycleStream()) return;
      void this.getClient()
        .then((nextClient) => this.startLifecycleStream(nextClient))
        .catch((error) => console.warn("WebSocket RPC lifecycle stream failed to restart", error));
    };
    this.startStream(
      "server.lifecycle",
      client[WS_METHODS.subscribeServerLifecycle]({}),
      (event: ServerLifecycleStreamEvent) => {
        if (event.type === "welcome") {
          this.emit(WS_CHANNELS.serverWelcome, event.payload);
        } else if (event.type === "maintenance") {
          this.emit(WS_CHANNELS.serverMaintenanceUpdated, event);
        }
      },
      restartLifecycle,
    );
  }

  /**
   * 鍚姩 Shell 浜嬩欢娴?   * @param client - RPC 瀹㈡埛绔疄渚?   */
  private startShellStream(client: RpcClientInstance): void {
    const restartShell = () => {
      void this.getClient()
        .then((nextClient) => this.startShellStream(nextClient))
        .catch((error) => console.warn("WebSocket RPC shell stream failed to restart", error));
    };
    this.startStream(
      "orchestration.shell",
      client[ORCHESTRATION_WS_METHODS.subscribeShell]({}),
      (event: OrchestrationShellStreamItem) =>
        this.emit(ORCHESTRATION_WS_CHANNELS.shellEvent, event),
      restartShell,
    );
  }

  /**
   * 鍚姩鎸囧畾绾跨▼鐨勪簨浠舵祦
   * @param client - RPC 瀹㈡埛绔疄渚?   * @param threadId - 绾跨▼ ID
   * @param input - 璁㈤槄鍙傛暟
   */
  private startThreadStream(client: RpcClientInstance, threadId: string, input: unknown): void {
    const key = `orchestration.thread:${threadId}`;
    this.stopStream(key);
    this.stoppingStreams.delete(key);
    const restartThread = () => {
      void this.getClient()
        .then((nextClient) => this.startThreadStream(nextClient, threadId, input))
        .catch((error) => console.warn("WebSocket RPC thread stream failed to restart", error));
    };
    this.startStream(
      key,
      client[ORCHESTRATION_WS_METHODS.subscribeThread](input as never),
      (event: OrchestrationThreadStreamItem) =>
        this.emit(ORCHESTRATION_WS_CHANNELS.threadEvent, event),
      restartThread,
    );
  }

  /**
   * 閫氱敤鐨勬祦鍚姩鏂规硶锛岃闃?Effect Stream 骞跺湪娴佺粨鏉熸椂鑷姩澶勭悊閲嶈繛鎴栭敊璇?   * @param key - 娴佺殑鍞竴鏍囪瘑锛岀敤浜庣鐞嗙敓鍛藉懆鏈?   * @param stream - Effect Stream 瀹炰緥
   * @param listener - 浜嬩欢鍥炶皟
   * @param restart - 娴佸紓甯镐腑鏂悗鐨勯噸鍚洖璋?   */
  private startStream<T>(
    key: string,
    stream: unknown,
    listener: (event: T) => void,
    restart?: (() => void) | undefined,
  ): void {
    if (this.streamCleanups.has(key)) return;
    const runnableStream = stream as Stream.Stream<T, WsTransportRpcError, never>;
    const cancel = this.runtime.runCallback(
      Stream.runForEach(runnableStream, (event) => Effect.sync(() => listener(event))),
      {
        onExit: (exit) => {
          if (this.streamCleanups.get(key) === cancel) {
            this.streamCleanups.delete(key);
          }
          const wasStoppedIntentionally = this.stoppingStreams.delete(key);
          if (wasStoppedIntentionally || this.disposed) {
            return;
          }
          if (restart && Exit.isFailure(exit)) {
            window.setTimeout(
              () => {
                if (!this.disposed && !this.streamCleanups.has(key)) {
                  void this.reconnect()
                    .then(() => restart())
                    .catch((error) => console.warn("WebSocket RPC stream reconnect failed", error));
                }
              },
              Cause.hasInterruptsOnly(exit.cause) ? 0 : 500,
            );
            return;
          }
          if (Exit.isFailure(exit) && !this.disposed && !Cause.hasInterruptsOnly(exit.cause)) {
            console.warn("WebSocket RPC stream failed", causeToError(exit.cause));
          }
        },
      },
    );
    this.streamCleanups.set(key, cancel);
  }

  /**
   * 鍋滄鎸囧畾鏍囪瘑鐨勬祦
   * @param key - 娴佺殑鍞竴鏍囪瘑
   */
  private stopStream(key: string): void {
    const cleanup = this.streamCleanups.get(key);
    if (!cleanup) return;
    this.stoppingStreams.add(key);
    this.streamCleanups.delete(key);
    cleanup();
  }

  /**
   * 鎵ц Git 鍫嗗彔鎿嶄綔娴侊紝灏嗚繘搴︿簨浠舵帹閫佸埌 gitActionProgress 棰戦亾
   * @param client - RPC 瀹㈡埛绔疄渚?   * @param params - Git 鎿嶄綔鍙傛暟
   * @returns Git 鎿嶄綔鐨勬渶缁堢粨鏋?   * @throws 褰撴祦瀹屾垚浣嗘湭杩斿洖鏈€缁堢粨鏋滄椂鎶涘嚭閿欒
   */
  private async runGitActionStream(
    client: RpcClientInstance,
    params: unknown,
  ): Promise<GitRunStackedActionResult> {
    let result: GitRunStackedActionResult | null = null;
    await this.runtime.runPromise(
      Stream.runForEach(client[WS_METHODS.gitRunStackedAction](params as never), (event) =>
        Effect.sync(() => {
          this.emit(WS_CHANNELS.gitActionProgress, event as GitActionProgressEvent);
          if ((event as GitActionProgressEvent).kind === "action_finished") {
            result = (event as Extract<GitActionProgressEvent, { kind: "action_finished" }>).result;
          }
        }),
      ),
    );
    if (!result) throw new Error("Git action stream completed without a final result.");
    return result;
  }
}
