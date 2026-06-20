/**
 * @file WebSocket 娴肩姾绶仦鍌氱杽閻? * @description 閸╄桨绨?Effect RPC 閸?WebSocket 閸楀繗顔呴惃鍕蓟閸氭垿鈧矮淇婃导鐘虹翻鐏炲倶鈧? *              鐏忎浇顥婃禍?RPC 鐎广垺鍩涚粩顖滄畱閸掓稑缂撻妴浣界箾閹恒儳顓搁悶鍡愨偓浣藉殰閸斻劑鍣告潻鐐偓浣圭ウ瀵繗顓归梼鍛搼閸旂喕鍏橀敍? *              娑撹桨绗傜仦鍌涘絹娓氭稓绮烘稉鈧惃?request/subscribe 閹恒儱褰涢敍灞界潌閽勮棄绨崇仦?WebSocket 闁矮淇婄紒鍡氬Ν閵? *              Tauri 鏉╀胶些閺堢喖妫挎稉瀛樻鐠哄疇绻冪猾璇茬€峰Λ鈧弻銉礉閸氬海鐢婚棁鈧弴鎸庡床娑?Tauri event/invoke 鐎圭偟骞囬妴? */
// @ts-nocheck
// TODO: Tauri 鏉╀胶些閺堢喖妫挎稉瀛樻鐠哄疇绻冪猾璇茬€峰Λ鈧弻銉ｂ偓鍌氬斧閺傚洣娆㈤崺杞扮艾 Effect RPC/WebSocket閿?// 闂団偓閺囨寧宕叉稉?Tauri event/invoke 鐎圭偟骞囬妴?
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

/** 閹恒劑鈧焦绉烽幁顖滄磧閸氼剙娅掔猾璇茬€烽敍宀€鏁ゆ禍搴ゎ吂闂冨懏瀵氱€规岸顣堕柆鎾舵畱閹恒劑鈧焦绉烽幁?*/
type PushListener<C extends WsPushChannel> = (message: WsPushMessage<C>) => void;

/** RPC 鐎广垺鍩涚粩顖氫紣閸?Effect 缁鐎?*/
type RpcClientEffect = typeof makeRpcClient;
/** RPC 鐎广垺鍩涚粩顖氱杽娓氬琚崹瀣剁礉娴犲骸浼愰崢?Effect 娑擃厽甯归弬?*/
type RpcClientInstance =
  RpcClientEffect extends Effect.Effect<infer Client, any, any> ? Client : never;

/** 娴肩姾绶仦鍌濈箾閹恒儳濮搁幀?*/
type TransportState = "connecting" | "open" | "closed" | "disposed";

/** WebSocket RPC 闁矮淇婇柨娆掝嚖 */
class WsTransportRpcError extends Data.TaggedError("WsTransportRpcError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** 閸掓稑缂?RPC 鐎广垺鍩涚粩顖氱杽娓氬娈?Effect閿涘苯鐔€娴?WsRpcGroup 鐎规矮绠熼惃鍕煙濞夋洟娉?*/
const makeRpcClient = RpcClient.make(WsRpcGroup);

/**
 * 鐏忓棗甯慨?URL 鐟欙絾鐎芥稉?RPC 缁旑垳鍋ｉ崷鏉挎絻
 * @param rawUrl - 閸樼喎顫?WebSocket 鏉╃偞甯撮崷鏉挎絻
 * @returns 鏉╄棄濮炴禍?`/ws` 鐠侯垰绶為惃鍕暚閺?URL
 */
function resolveRpcUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.pathname = "/ws";
  return url.toString();
}

/**
 * 閺嬪嫬缂?WebSocket 鏉╃偞甯撮崷鏉挎絻
 * 娴兼ê鍘涚痪褝绱伴弰鎯х础 URL > Tauri Bridge URL > 閻滎垰顣ㄩ崣姗€鍣?VITE_WS_URL > 瑜版挸澧犳い鐢告桨閸楀繗顔呴懛顏勫З閹恒劌顕? * @param explicitUrl - 閺勬儳绱￠幐鍥х暰閻?WebSocket URL閿涘奔璐?null 閺冩儼鍤滈崝銊﹀腹鐎? * @returns 閸欘垳鏁ゆ禍搴＄紦缁?WebSocket 鏉╃偞甯撮惃鍕暚閺?URL
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
 * 閺嬪嫬缂?RPC 閸楀繗顔呯仦鍌︾礉閸栧懎鎯?WebSocket 娴肩姾绶仦鍌氭嫲 JSON 鎼村繐鍨崠鏍х湴
 * @param url - WebSocket 鏉╃偞甯撮崷鏉挎絻
 * @returns Effect Layer閿涘本褰佹笟?RPC 閸楀繗顔呴弨顖涘瘮
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
 * 鐏?Effect Cause 鏉烆剚宕叉稉鐑樼垼閸?Error 鐎电钖? * @param cause - Effect 濡楀棙鐏﹂惃鍕晩鐠?Cause
 * @returns 閺嶅洤鍣?Error 鐎圭偘绶? */
function causeToError(cause: Cause.Cause<unknown>): Error {
  const error = Cause.squash(cause);
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * 鏉╁洦鎶ら悽銊﹀煕鏉堟挸鍙嗘惔鏃傜摕娑擃厾娈?null/undefined 閸? * 瑜版挸鎳℃禒銈囪閸ㄥ璐?thread.user-input.respond 閺冭绱濈粔濠氭珟 answers 娑擃厼鈧棿璐?null 閹?undefined 閻ㄥ嫭娼惄顕嗙礉
 * 闁灝鍘ら崥搴ｎ伂閹恒儲鏁归崚鐗堟￥閺佸牏娈戠粚鍝勨偓鐓庣安缁? * @param input - 閸樼喎顫?RPC 鐠囬攱鐪伴崣鍌涙殶
 * @returns 鏉╁洦鎶ら崥搴ｆ畱鐠囬攱鐪伴崣鍌涙殶
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
 * 閸掋倖鏌囩紒娆忕暰妫版垿浜鹃弰顖氭儊娑撶儤婀囬崝鈥虫珤閻㈢喎鎳￠崨銊︽埂閻╃鍙ф０鎴︿壕
 * @param channel - 妫版垿浜鹃弽鍥槕
 * @returns 閺勵垰鎯佹稉鐑樻箛閸斺€虫珤閻㈢喎鎳￠崨銊︽埂妫版垿浜鹃敍鍧癳rverWelcome 閹?serverMaintenanceUpdated閿? */
export function isServerLifecyclePushChannel(channel: string): boolean {
  return channel === WS_CHANNELS.serverWelcome || channel === WS_CHANNELS.serverMaintenanceUpdated;
}

/**
 * 閸掋倖鏌囬弰顖氭儊闂団偓鐟曚椒绻氶幐浣规箛閸斺€虫珤閻㈢喎鎳￠崨銊︽埂濞翠礁顦╂禍搴㈡た鐠哄啰濮搁幀? * 瑜版挷鎹㈡稉鈧悽鐔锋嚒閸涖劍婀℃０鎴︿壕娴犲秵婀佺拋銏ゆ閼板懏妞傞敍灞剧ウ娑撳秴绨茬悮顐㈠彠闂? * @param activeChannels - 瑜版挸澧犲ú鏄忕┈閻ㄥ嫰顣堕柆鎾绘肠閸? * @returns 閺勵垰鎯侀棁鈧憰浣风箽閹镐胶鏁撻崨钘夋噯閺堢喐绁? */
export function shouldKeepServerLifecycleStream(activeChannels: ReadonlySet<string>): boolean {
  return (
    activeChannels.has(WS_CHANNELS.serverWelcome) ||
    activeChannels.has(WS_CHANNELS.serverMaintenanceUpdated)
  );
}

/**
 * WebSocket 娴肩姾绶仦鍌涚壋韫囧啰琚? * 鐠愮喕鐭楃粻锛勬倞 WebSocket 鏉╃偞甯撮惃鍕晸閸涜棄鎳嗛張鐕傜礉閸栧懏瀚敍? * - RPC 鐠囬攱鐪伴惃鍕絺闁椒绗岄崫宥呯安閹恒儲鏁? * - 閹恒劑鈧線顣堕柆鎾舵畱鐠併垽妲勬稉搴″絿濞? * - 鏉╃偞甯撮弬顓炵磻閸氬海娈戦懛顏勫З闁插秷绻涢敍鍫熷瘹閺佷即鈧偓闁尅绱? * - 濞翠礁绱￠弫鐗堝祦閻ㄥ嫯顓归梼鍛吀閻? *
 * @example
 * ```typescript
 * const transport = new WsTransport("ws://localhost:8080");
 * const unsubscribe = transport.subscribe(WS_CHANNELS.serverWelcome, (msg) => {
 *   console.log("Welcome:", msg.data);
 * });
 * // 閸欐牗绉风拋銏ゆ
 * unsubscribe();
 * transport.dispose();
 * ```
 */
export class WsTransport {
  /** 閺勬儳绱￠幐鍥х暰閻?WebSocket URL閿涘奔绱崗鍫㈤獓閺堚偓妤?*/
  private readonly explicitUrl: string | null;
  /** 閸氬嫰顣堕柆鎾舵畱閻╂垵鎯夐崳銊╂肠閸氬牞绱漦ey 娑撴椽顣堕柆鎾虫倳 */
  private readonly listeners = new Map<string, Set<(message: WsPush) => void>>();
  /** 閸氬嫰顣堕柆鎾存付鏉╂垳绔村▎鈩冨腹闁焦绉烽幁顖滅处鐎涙﹫绱濋悽銊ょ艾閺傛媽顓归梼鍛扳偓鍛畱閸ョ偞鏂?*/
  private readonly latestPushByChannel = new Map<string, WsPush>();
  /** 濞戝牊浼呮惔蹇撳灙閸欏嚖绱濋悽銊ょ艾閹恒劑鈧焦绉烽幁顖涘笓鎼?*/
  private sequence = 0;
  /** 瑜版挸澧犳导鐘虹翻鐏炲倻濮搁幀?*/
  private state: TransportState = "connecting";
  /** 閺勵垰鎯佸鏌ユ敘濮?*/
  private disposed = false;
  /** Effect ManagedRuntime閿涘瞼顓搁悶?RPC 鐎广垺鍩涚粩顖滄畱閻㈢喎鎳￠崨銊︽埂 */
  private runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
  /** RPC 鐎广垺鍩涚粩顖滄畱娴ｆ粎鏁ら崺鐕傜礉閻劋绨挧鍕爱濞撳懐鎮?*/
  private clientScope: Scope.Closeable;
  /** RPC 鐎广垺鍩涚粩顖氱杽娓氬娈?Promise閿涘本鏁幐浣哥磽濮濄儱鍨垫慨瀣 */
  private clientPromise: Promise<RpcClientInstance>;
  /** 濮濓絽婀潻娑滎攽閻ㄥ嫰鍣告潻?Promise閿涘矂妲诲銏犺嫙閸欐垿鍣告潻?*/
  private reconnectPromise: Promise<RpcClientInstance> | null = null;
  /** 鏉╃偟鐢婚柌宥堢箾婢惰精瑙﹀▎鈩冩殶閿涘瞼鏁ゆ禍搴ゎ吀缁犳鈧偓闁灝娆㈡潻?*/
  private reconnectFailures = 0;
  /** 濞叉槒绌ù浣烘畱濞撳懐鎮婇崙鑺ユ殶閺勭姴鐨犻敍瀹琫y 娑撶儤绁﹂弽鍥槕 */
  private readonly streamCleanups = new Map<string, () => void>();
  /** 濮濓絽婀稉璇插З閸嬫粍顒涢惃鍕ウ閺嶅洩鐦戦梿鍡楁値閿涘瞼鏁ゆ禍搴″隘閸掑棔瀵岄崝銊ヤ粻濮濄垹鎷板鍌氱埗閺傤厼绱?*/
  private readonly stoppingStreams = new Set<string>();
  /** 閺勵垰鎯佸鑼额吂闂?Shell 娴滃娆㈠ù?*/
  private shellSubscribed = false;
  /** 缁捐法鈻肩拋銏ゆ閸欏倹鏆熼弰鐘茬殸閿涘ey 娑?threadId閿涘矂鍣告潻鐐存閻劋绨幁銏狀槻鐠併垽妲?*/
  private readonly threadSubscriptions = new Map<string, unknown>();

  /**
   * 閸掓稑缂?WsTransport 鐎圭偘绶?   * @param url - 閸欘垶鈧娈?WebSocket 鏉╃偞甯撮崷鏉挎絻閿涘奔绗夋导鐘插灟閼奉亜濮╅幒銊ヮ嚤
   */
  constructor(url?: string) {
    this.explicitUrl = url ?? null;
    const session = this.createSession();
    this.runtime = session.runtime;
    this.clientScope = session.clientScope;
    this.clientPromise = session.clientPromise;
  }

  /**
   * 閸欐垿鈧?RPC 鐠囬攱鐪伴獮鎯扮箲閸ョ偛鎼锋惔?   * 鐎甸€涚艾濞翠礁绱￠弬瑙勭《閿涘牆顩?git 閹垮秳缍旈妴涓糷ell/Thread 鐠併垽妲勯敍澶涚礉娴兼艾鎯庨崝銊ヮ嚠鎼存梻娈戝ù浣割槱閻?   * @param method - RPC 閺傝纭堕崥?   * @param params - 鐠囬攱鐪伴崣鍌涙殶
   * @param _options - 閸欘垶鈧鍘ょ純顕嗙礄婵″倽绉撮弮鑸垫闂傝揪绱氶敍灞界秼閸撳秵婀担璺ㄦ暏
   * @returns RPC 閸濆秴绨茬紒鎾寸亯
   * @throws 瑜版挷绱舵潏鎾崇湴瀹告煡鏀㈠В浣瑰灗閺傝纭舵稉宥呯摠閸︺劍妞傞幎娑樺毉闁挎瑨顕?   */
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
   * 鐠併垽妲勯幐鍥х暰妫版垿浜鹃惃鍕腹闁焦绉烽幁?   * 瑜版捇顩绘稉顏嗘磧閸氼剙娅掑▔銊ュ斀閺冩儼鍤滈崝銊ユ儙閸斻劌顕惔鏃傛畱濞翠緤绱濊ぐ鎾存付閸氬簼绔存稉顏嗘磧閸氼剙娅掔粔濠氭珟閺冩儼鍤滈崝銊ヤ粻濮濄垺绁?   * @param channel - 鐟曚浇顓归梼鍛畱閹恒劑鈧線顣堕柆?   * @param listener - 濞戝牊浼呴崶鐐剁殶閸戣姤鏆?   * @param options - 鐠併垽妲勯柅澶愩€嶉敍瀹篹playLatest 娑?true 閺冩湹绱扮粩瀣祮閸ョ偞鏂侀張鈧潻鎴滅閺夆剝绉烽幁?   * @returns 閸欐牗绉风拋銏ゆ閻ㄥ嫬鍤遍弫?   * @example
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
   * 閼惧嘲褰囬幐鍥х暰妫版垿浜鹃張鈧潻鎴滅濞嗏剝甯归柅浣圭Х閹?   * @param channel - 妫版垿浜鹃弽鍥槕
   * @returns 閺堚偓鏉╂垳绔村▎鈩冨腹闁焦绉烽幁顖ょ礉閼汇儲妫ょ紓鎾崇摠閸掓瑨绻戦崶?null
   */
  getLatestPush<C extends WsPushChannel>(channel: C): WsPushMessage<C> | null {
    const latest = this.latestPushByChannel.get(channel);
    return latest ? (latest as WsPushMessage<C>) : null;
  }

  /**
   * 閼惧嘲褰囪ぐ鎾冲娴肩姾绶仦鍌滃Ц閹?   * @returns 娴肩姾绶仦鍌濈箾閹恒儳濮搁幀?   */
  getState(): TransportState {
    return this.state;
  }

  /**
   * 闁库偓濮ｄ椒绱舵潏鎾崇湴閿涘矂鍣撮弨鐐閺堝绁┃?   * 閸嬫粍顒涢幍鈧張澶嬫た鐠哄啯绁﹂妴浣稿彠闂?RPC 鐎广垺鍩涚粩顖濈箾閹恒儯鈧線鏀㈠В浣界箥鐞涘本妞?   */
  dispose() {
    this.disposed = true;
    this.state = "disposed";
    for (const cleanup of this.streamCleanups.values()) cleanup();
    this.streamCleanups.clear();
    void this.runtime.runPromise(Scope.close(this.clientScope, Exit.void)).finally(() => {
      this.runtime.dispose();
    });
  }

  /** 閸掓稑缂撻弬鎵畱 RPC 娴兼俺鐦介敍鍫ｇ箥鐞涘本妞?+ 鐎广垺鍩涚粩顖欑稊閻劌鐓?+ 鐎广垺鍩涚粩?Promise閿?*/
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
   * 閼惧嘲褰?RPC 鐎广垺鍩涚粩顖氱杽娓氬绱濇潻鐐村复婢惰精瑙﹂弮鎯板殰閸斻劏袝閸欐垿鍣告潻?   * @returns RPC 鐎广垺鍩涚粩顖氱杽娓?   */
  private async getClient(): Promise<RpcClientInstance> {
    try {
      return await this.clientPromise;
    } catch {
      if (this.disposed) throw new Error("Transport disposed");
      return this.reconnect();
    }
  }

  /**
   * 閹笛嗩攽闁插秷绻涢幙宥勭稊閿涘本绔婚悶鍡樻＋娴兼俺鐦介獮璺哄灡瀵ょ儤鏌婃导姘崇樈
   * 娴ｈ法鏁ゆ禍鎺撴灱闁夸緤绱檙econnectPromise閿涘妲诲銏犺嫙閸欐垿鍣告潻?   * @returns 閺傛壆娈?RPC 鐎广垺鍩涚粩顖氱杽娓?   */
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
   * 閹垫挸绱戦弬鎵畱闁插秷绻涙导姘崇樈閿涘奔濞囬悽銊﹀瘹閺佷即鈧偓闁法鐡ラ悾銉ユ鏉╃喖鍣哥拠?   * 闁插秷绻涢幋鎰閸氬孩浠径宥嗗閺堝顣堕柆鎾诡吂闂冨懌鈧讣hell 鐠併垽妲勯崪宀€鍤庣粙瀣吂闂?   * @returns 閺傛壆娈?RPC 鐎广垺鍩涚粩顖氱杽娓?   */
  private async openReconnectSession(): Promise<RpcClientInstance> {
    // 閹稿洦鏆熼柅鈧柆鍖＄窗500ms * 2^failures閿涘本娓舵径?5000ms
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
   * 閸氭垶瀵氱€规岸顣堕柆鎾冲絺闁焦甯归柅浣圭Х閹垽绱濋柅姘辩叀閹碘偓閺堝娲冮崥顒€娅?   * @param channel - 閻╊喗鐖ｆ０鎴︿壕
   * @param data - 閹恒劑鈧焦鏆熼幑?   */
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
   * 閸氼垰濮╅幐鍥х暰妫版垿浜鹃惃鍕ウ瀵繗顓归梼?   * 閺嶈宓佹０鎴︿壕缁鐎风捄顖滄暠閸掓澘顕惔鏃傛畱濞翠礁顦╅悶鍡涒偓鏄忕帆
   * @param channel - 鐟曚浇顓归梼鍛畱妫版垿浜?   */
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
   * 閸嬫粍顒涢幐鍥х暰妫版垿浜鹃惃鍕ウ瀵繗顓归梼?   * @param channel - 鐟曚礁浠犲銏㈡畱妫版垿浜?   */
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

  /** 閸掋倖鏌囬弰顖氭儊娴犲秹娓舵穱婵囧瘮閻㈢喎鎳￠崨銊︽埂濞翠焦妞跨捄?*/
  private shouldKeepLifecycleStream(): boolean {
    return shouldKeepServerLifecycleStream(new Set(this.listeners.keys()));
  }

  /**
   * 閸氼垰濮╅張宥呭閸ｃ劎鏁撻崨钘夋噯閺堢喍绨ㄦ禒鑸电ウ閿涘澋elcome + maintenance閿?   * @param client - RPC 鐎广垺鍩涚粩顖氱杽娓?   */
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
   * 閸氼垰濮?Shell 娴滃娆㈠ù?   * @param client - RPC 鐎广垺鍩涚粩顖氱杽娓?   */
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
   * 閸氼垰濮╅幐鍥х暰缁捐法鈻奸惃鍕皑娴犺埖绁?   * @param client - RPC 鐎广垺鍩涚粩顖氱杽娓?   * @param threadId - 缁捐法鈻?ID
   * @param input - 鐠併垽妲勯崣鍌涙殶
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
   * 闁氨鏁ら惃鍕ウ閸氼垰濮╅弬瑙勭《閿涘矁顓归梼?Effect Stream 楠炶泛婀ù浣虹波閺夌喐妞傞懛顏勫З婢跺嫮鎮婇柌宥堢箾閹存牠鏁婄拠?   * @param key - 濞翠胶娈戦崬顖欑閺嶅洩鐦戦敍宀€鏁ゆ禍搴ｎ吀閻炲棛鏁撻崨钘夋噯閺?   * @param stream - Effect Stream 鐎圭偘绶?   * @param listener - 娴滃娆㈤崶鐐剁殶
   * @param restart - 濞翠礁绱撶敮闀愯厬閺傤厼鎮楅惃鍕櫢閸氼垰娲栫拫?   */
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
   * 閸嬫粍顒涢幐鍥х暰閺嶅洩鐦戦惃鍕ウ
   * @param key - 濞翠胶娈戦崬顖欑閺嶅洩鐦?   */
  private stopStream(key: string): void {
    const cleanup = this.streamCleanups.get(key);
    if (!cleanup) return;
    this.stoppingStreams.add(key);
    this.streamCleanups.delete(key);
    cleanup();
  }

  /**
   * 閹笛嗩攽 Git 閸棗褰旈幙宥勭稊濞翠緤绱濈亸鍡氱箻鎼达缚绨ㄦ禒鑸靛腹闁礁鍩?gitActionProgress 妫版垿浜?   * @param client - RPC 鐎广垺鍩涚粩顖氱杽娓?   * @param params - Git 閹垮秳缍旈崣鍌涙殶
   * @returns Git 閹垮秳缍旈惃鍕付缂佸牏绮ㄩ弸?   * @throws 瑜版挻绁︾€瑰本鍨氭担鍡樻弓鏉╂柨娲栭張鈧紒鍫㈢波閺嬫粍妞傞幎娑樺毉闁挎瑨顕?   */
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
