/**
 * @file WebSocket 传输层模块
 * @description 实现基于 Effect/RPC 的 WebSocket 传输层，处理 RPC 方法调用和服务器事件订阅。
 *              支持自动重连、事件流管理和订阅保持机制。
 */

import {
  ORCHESTRATION_WS_CHANNELS,
  ORCHESTRATION_WS_METHODS,
  WS_CHANNELS,
  WS_METHODS,
  WsRpcGroup,
  type GitActionProgressEvent,
  type GitRunStackedActionResult,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadStreamItem,
  type ServerLifecycleStreamEvent,
  type WsPush,
  type WsPushChannel,
  type WsPushMessage,
  type WsWelcomePayload,
} from "@ydsz-buddy/contracts";
import { Cause, Data, Effect, Exit, Layer, ManagedRuntime, Schedule, Scope, Stream } from "effect";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import * as Socket from "@effect/platform/Socket";
import { tauriBridge } from "./lib/tauri-bridge";
import { isTauri } from "./env";
import { toastManager } from "./components/ui/toast";
import { MESSAGES } from "./i18n/messages";
import { DEFAULT_LANGUAGE } from "./i18n/language";

// #region debug-point wsTransport-instrumentation
//
// 调试开关:默认关闭。仅当 URL 携带 `?__ydszDbg=1` 时启用真实 fetch 上报。
//
// 历史背景:此前 _wdbg 默认启用,在 makeSocketUrl / WsTransport 构造 /
// getSharedWsTransport 等关键路径每次都触发 fetch("http://127.0.0.1:7777/event")。
// 当 debug server (端口 7777) 未启动时,fetch 虽快速失败但仍占用主线程调度,
// 与 getClient 重试 / startChannelStream 重连链路叠加,放大启动期间的主线程压力。
const _debugUrl = "http://127.0.0.1:7777/event";
const _wDebugEnabled =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("__ydszDbg") === "1";
function _wdbg(msg: string, data?: Record<string, unknown>, hypothesisId?: string) {
  if (!_wDebugEnabled) return;
  try {
    void fetch(_debugUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        sessionId: "desktop-freeze-v3",
        runId: "post-singleton-fix",
        hypothesisId: hypothesisId ?? "H1-H5",
        location: "wsTransport.ts",
        msg: `[DEBUG] ${msg}`,
        data: data ?? {},
        ts: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}
// #endregion

type PushListener<C extends WsPushChannel> = (message: WsPushMessage<C>) => void;

type RpcClientEffect = typeof makeRpcClient;
type RpcClientInstance =
  RpcClientEffect extends Effect.Effect<infer Client, any, any> ? Client : never;

type TransportState = "connecting" | "open" | "closed" | "disposed";

class WsTransportRpcError extends Data.TaggedError("WsTransportRpcError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const makeRpcClient = RpcClient.make(WsRpcGroup);

function resolveRpcUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.pathname = "/ws";
  return url.toString();
}

function makeSocketUrl(explicitUrl: string | null): string {
  if (explicitUrl) {
    const resolved = resolveRpcUrl(explicitUrl);
    _wdbg("makeSocketUrl: using explicitUrl", { explicitUrl, resolved }, "H5");
    return resolved;
  }
  const bridgeUrl = window.desktopBridge?.getWsUrl() ?? tauriBridge.getCachedWsUrl?.();
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;

  _wdbg("makeSocketUrl: URL resolution", {
    hasDesktopBridge: !!window.desktopBridge,
    desktopBridgeUrl: window.desktopBridge?.getWsUrl() ?? null,
    cachedWsUrl: tauriBridge.getCachedWsUrl?.() ?? null,
    envUrl: envUrl ?? null,
    isTauri,
    windowLocation: `${window.location.protocol}//${window.location.hostname}:${window.location.port}`,
  }, "H5");

  // Tauri 桌面端：禁止回退到 window.location（Vite dev 的 localhost:1420）。
  // 该地址连接 ydsz-server，WsTransport 连接失败后会进入高频重连循环，
  // 触发渲染风暴并最终导致主窗口"未响应"。
  // 到达这里说明 readNativeApi() 的 guard 失效，直接抛错阻止创建错误连接。
  if (isTauri && !bridgeUrl && !envUrl) {
    _wdbg("makeSocketUrl: THROWING - no valid URL for Tauri desktop", {}, "H5");
    throw new Error(
      "[WsTransport] Tauri desktop requires a valid embedded server WS URL; refusing to fallback to window.location"
    );
  }

  const rawUrl =
    bridgeUrl && bridgeUrl.length > 0
      ? bridgeUrl
      : envUrl && envUrl.length > 0
        ? envUrl
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}`;
  const resolved = resolveRpcUrl(rawUrl);
  _wdbg("makeSocketUrl: resolved URL", { rawUrl, resolved, source: bridgeUrl ? "bridge" : envUrl ? "env" : "window" }, "H5");
  return resolved;
}

function makeProtocolLayer(url: string) {
  const socketLayer = Socket.layerWebSocket(url).pipe(
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
  );
  const transientRetrySchedule = Schedule.exponential(500, 1.5).pipe(
    Schedule.compose(Schedule.recurs(2)),
  );
  return RpcClient.layerProtocolSocket({
    retryTransientErrors: true,
    retrySchedule: transientRetrySchedule,
  }).pipe(
    Layer.provide(Layer.mergeAll(socketLayer, RpcSerialization.layerJsonRpc())),
  );
}

function causeToError(cause: Cause.Cause<unknown>): Error {
  const error = Cause.squash(cause);
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * 从 RpcClient.make 创建的嵌套客户端对象中解析方法。
 *
 * RpcClient.make 会把带点号的 tag（如 "server.getConfig"）拆分为嵌套对象:
 *   client = { server: { getConfig: fn, ... }, orchestration: { ... }, ... }
 *
 * 本函数按第一个点号拆分: prefix="server", tag="getConfig" → client.server.getConfig
 * 对于不带点号的 tag,直接返回 client[tag]。
 */
type RpcMethod = (input: unknown) => Effect.Effect<unknown, WsTransportRpcError, never>;

function resolveRpcClientMethod(
  client: RpcClientInstance,
  method: string,
): RpcMethod | undefined {
  const dotIndex = method.indexOf(".");
  const c = client as unknown as Record<
    string,
    Record<string, ((input: unknown) => unknown) | undefined> | undefined
  >;
  if (dotIndex === -1) {
    const fn = c[method];
    return typeof fn === "function" ? (fn as RpcMethod) : undefined;
  }
  const prefix = method.slice(0, dotIndex);
  const tag = method.slice(dotIndex + 1);
  const ns = c[prefix];
  return ns && typeof ns[tag] === "function" ? (ns[tag] as RpcMethod) : undefined;
}

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

export function isServerLifecyclePushChannel(channel: string): boolean {
  return channel === WS_CHANNELS.serverWelcome || channel === WS_CHANNELS.serverMaintenanceUpdated;
}

export function shouldKeepServerLifecycleStream(activeChannels: ReadonlySet<string>): boolean {
  return (
    activeChannels.has(WS_CHANNELS.serverWelcome) ||
    activeChannels.has(WS_CHANNELS.serverMaintenanceUpdated)
  );
}

let sharedTransport: WsTransport | null = null;
let wsTransportInstanceCount = 0;

export function getSharedWsTransport(): WsTransport {
  if (!sharedTransport || sharedTransport.getState() === "disposed") {
    wsTransportInstanceCount++;
    _wdbg("getSharedWsTransport: creating new WsTransport instance", {
      instanceCount: wsTransportInstanceCount,
      hadExisting: !!sharedTransport,
      existingState: sharedTransport?.getState() ?? null,
    }, "H1");
    sharedTransport = new WsTransport();
  }
  return sharedTransport;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    sharedTransport?.dispose();
    sharedTransport = null;
  });
}

export class WsTransport {
  private readonly explicitUrl: string | null;
  private readonly listeners = new Map<string, Set<(message: WsPush) => void>>();
  private readonly latestPushByChannel = new Map<string, WsPush>();
  private sequence = 0;
  private state: TransportState = "connecting";
  private disposed = false;
  private runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
  private clientScope: Scope.CloseableScope;
  private clientPromise: Promise<RpcClientInstance>;
  private reconnectPromise: Promise<RpcClientInstance> | null = null;
  private reconnectFailures = 0;
  private readonly streamCleanups = new Map<string, () => void>();
  private readonly stoppingStreams = new Set<string>();
  /**
   * stream 失败后 onExit 重启的尝试次数,超过 `MAX_STREAM_RESTART_RETRIES`
   * 静默放弃,防止服务端占位 alias 反复触发 500ms 重启循环把主线程拖死。
   */
  private readonly streamRestartRetries = new Map<string, number>();
  private static readonly MAX_STREAM_RESTART_RETRIES = 3;
  private readonly threadSubscriptions = new Map<string, unknown>();
  /** 每个 channel 的 startChannelStream 重试计数，防止无限重试风暴 */
  private readonly channelStreamRetries = new Map<string, number>();
  /** startChannelStream 最大重试次数。从 5 降到 2，减少启动失败时后台任务堆积。 */
  private static readonly MAX_CHANNEL_STREAM_RETRIES = 2;
  /** getClient 最大重试次数，防止无限重连风暴。
   *  从 1 提升到 2，给 dev 模式下一次额外重试机会。*/
  private static readonly MAX_CLIENT_RETRIES = 2;
  /** getClient 当前重试计数 */
  private getClientRetries = 0;
  /**
   * 服务端 lifecycle 通道( `server.welcome` / `server.maintenanceUpdated` )的
   * 一次性 welcome 抓取是否已发起,避免 `startChannelStream` 对
   * `serverWelcome` / `serverMaintenanceUpdated` 两个通道都触发一次导致的重复
   * 抓取和重复 emit。
   *
   * 之所以不走 `server.subscribeLifecycle` 流:
   *  - 当前后端 `ydsz-server/src/rpc_methods/handlers/subscription.rs` 的
   *    `server.subscribeLifecycle` 是 `register_subscription_alias` 的占位实现,
   *    只返回 `Ok({status:"active"})` 并不下发流事件;
   *  - 客户端按 stream 解码会立即失败,触发 `onExit` 失败分支里的
   *    `setTimeout(restart, 500)` 重启循环,主线程被频繁占据导致窗口未响应;
   *  - 实际 welcome 是后端在 `handle_socket` 里通过 `connection.send_notification`
   *    以 JSON-RPC notification 形式下发的,Effect/RPC 的 socket 层不会把它
   *    当作 push 派发,所以前端目前根本拿不到 welcome。
   *
   * 临时修复:绕开坏掉的 stream,改用 `server.getConfig` + `server.getEnvironment`
   * 两个一次性 RPC 拼出 `WsWelcomePayload` 直接 emit 到 `server.welcome` 通道。
   * `serverMaintenanceUpdated` 通道的 maintenance 事件流属于"非启动关键路径",
   * 在服务端真正落地 lifecycle stream 之前先静默丢弃,不影响主流程。
   */
  private lifecycleWelcomeFetched = false;
  private serverConfigFetched = false;
  private serverSettingsFetched = false;

  constructor(url?: string) {
    this.explicitUrl = url ?? null;
    _wdbg("WsTransport constructor called", { explicitUrl: this.explicitUrl, instanceCount: wsTransportInstanceCount }, "H1");
    const session = this.createSession();
    this.runtime = session.runtime;
    this.clientScope = session.clientScope;
    this.clientPromise = session.clientPromise;
    _wdbg("WsTransport constructor completed, session created", {}, "H1");
  }

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
      // 服务端 orchestration.subscribeShell 是占位 alias,启动 stream 会立即失败
      // 触发 reconnect() 死循环。EventRouter 有 getShellSnapshot + replayEvents fallback,
      // 不依赖实时 stream 也能完成启动流程,所以这里不启动 stream。
      return undefined as T;
    }
    if (method === ORCHESTRATION_WS_METHODS.unsubscribeShell) {
      this.stopStream("orchestration.shell");
      return undefined as T;
    }
    if (method === ORCHESTRATION_WS_METHODS.subscribeThread) {
      // 服务端 orchestration.subscribeThread 是占位 alias,启动 stream 会立即失败
      // 触发 reconnect() 死循环。EventRouter 有 requestThreadSnapshot + replayEvents fallback,
      // 不依赖实时 stream 也能加载线程数据。
      return undefined as T;
    }
    if (method === ORCHESTRATION_WS_METHODS.unsubscribeThread) {
      const threadId = (params as { threadId: string }).threadId;
      this.threadSubscriptions.delete(threadId);
      this.stopStream(`orchestration.thread:${threadId}`);
      return undefined as T;
    }

    // orchestration.dispatchCommand 的 params 是 { command: ClientOrchestrationCommand }
    // 包装(由 wsNativeApi.ts 提供),需要在调用 RPC 之前解包,Effect Schema Union
    // 才能按 _tag/type 区分 variant;Rust 端 register("orchestration.dispatchCommand")
    // 也是直接把 params 整体反序列化为 OrchestrationCommand。
    const rpcInput =
      method === ORCHESTRATION_WS_METHODS.dispatchCommand
        ? (params as { command: unknown } | null | undefined)?.command ?? {}
        : (params ?? {});
    const normalizedRpcInput = omitNullUserInputAnswers(rpcInput);
    // RpcClient.make 创建嵌套对象结构: "server.getConfig" → client.server.getConfig
    // 不能用 client["server.getConfig"]（带点单键）访问,会返回 undefined。
    const call = resolveRpcClientMethod(client, method);
    if (!call) throw new WsTransportRpcError({ message: `Unknown RPC method: ${method}` });
    return (await this.runtime.runPromise(call(normalizedRpcInput))) as T;
  }

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

  getLatestPush<C extends WsPushChannel>(channel: C): WsPushMessage<C> | null {
    const latest = this.latestPushByChannel.get(channel);
    return latest ? (latest as WsPushMessage<C>) : null;
  }

  getState(): TransportState {
    return this.state;
  }

  dispose() {
    this.disposed = true;
    this.state = "disposed";
    this.resolvedClient = null;
    for (const cleanup of this.streamCleanups.values()) cleanup();
    this.streamCleanups.clear();
    this.streamRestartRetries.clear();
    this.stoppingStreams.clear();
    void this.runtime.runPromise(Scope.close(this.clientScope, Exit.void)).finally(() => {
      this.runtime.dispose();
    });
  }

  /**
   * 已解析的 RPC 客户端缓存。
   *
   * 当 `clientPromise` 在 `getClient()` 超时后最终 resolve 时，缓存结果，
   * 后续 `getClient()` 调用可直接返回，不再等待或触发重连。
   * 这解决了 dev 模式下 Effect RPC 握手较慢（~10s）但 getClient 超时较短（5s）
   * 导致连接被丢弃、前端永久卡死的问题。
   */
  private resolvedClient: RpcClientInstance | null = null;

  private createSession() {
    const wsUrl = makeSocketUrl(this.explicitUrl);

    const runtime = ManagedRuntime.make(makeProtocolLayer(wsUrl));
    const clientScope = runtime.runSync(Scope.make());

    const rpcClientPromise = runtime
      .runPromise(Scope.extend(clientScope)(makeRpcClient))
      .then((client) => {
        this.state = "open";
        // 缓存已解析的客户端，后续 getClient() 可直接返回
        this.resolvedClient = client;
        return client;
      })
      .catch((error) => {
        this.state = "closed";
        throw error;
      });

    // 不再使用 connectionTimeoutPromise 与 rpcClientPromise 竞争。
    const clientPromise = rpcClientPromise;

    return { runtime, clientScope, clientPromise };
  }

  private async getClient(): Promise<RpcClientInstance> {
    if (this.disposed) throw new Error("Transport disposed");

    // 快速路径：如果客户端已解析（连接已建立），直接返回
    if (this.resolvedClient) {
      return this.resolvedClient;
    }

    // 整体超时保护：防止 getClient() 无限 pending。
    // 超时只影响当前调用方，不会杀掉底层 WebSocket 连接。
    // clientPromise 在后台继续运行，一旦 resolve 后续调用可通过 resolvedClient 快速返回。
    //
    // dev 模式下 Effect RPC 握手可能需要 10-15s（Vite 按需编译 + RPC 初始化），
    // 因此超时设为 15s。prod 模式下通常 <1s。
    const GET_CLIENT_TIMEOUT_MS = 15_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      window.setTimeout(
        () => reject(new Error(`getClient: timed out after ${GET_CLIENT_TIMEOUT_MS}ms`)),
        GET_CLIENT_TIMEOUT_MS,
      ),
    );

    const doGetClient = async (): Promise<RpcClientInstance> => {
      try {
        const client = await this.clientPromise;
        // 连接成功 → 重置重试计数器，允许后续断线后重新计数
        this.getClientRetries = 0;
        return client;
      } catch (error) {
        if (this.disposed) throw new Error("Transport disposed");
        if (this.getClientRetries >= WsTransport.MAX_CLIENT_RETRIES) {
          if (import.meta.env?.DEV) {
            // eslint-disable-next-line no-console
            console.warn(
              `[wsTransport] getClient: connection failed after ${this.getClientRetries} retries, giving up`,
              error,
            );
          }
          throw new Error(
            `Failed to connect after ${WsTransport.MAX_CLIENT_RETRIES} retries. Please ensure ydsz-server is running.`,
          );
        }
        this.getClientRetries += 1;
        if (import.meta.env?.DEV) {
          // eslint-disable-next-line no-console
          console.warn(
            `[wsTransport] getClient: initial connection failed (${this.getClientRetries}/${WsTransport.MAX_CLIENT_RETRIES}), retrying...`,
            error,
          );
        }
        return this.reconnect();
      }
    };

    return Promise.race([doGetClient(), timeoutPromise]);
  }

  private reconnect(): Promise<RpcClientInstance> {
    if (this.reconnectPromise) return this.reconnectPromise;
    // disposed 后不再发起重连,避免组件卸载后仍在后台调度 setTimeout/Effect
    // 占用主线程(曾导致窗口关闭后主线程仍被重试链路占据的现象)。
    if (this.disposed) {
      return Promise.reject(new Error("Transport disposed"));
    }

    // 显示重连中 Toast (仅首次重连时显示,避免连续重连刷屏)
    if (this.reconnectFailures === 0) {
      const t = MESSAGES[DEFAULT_LANGUAGE].networkStatus;
      toastManager.add({
        type: "info",
        title: t.wsReconnectingMessage,
        timeout: 10_000,
      });
    }

    const oldRuntime = this.runtime;
    const oldClientScope = this.clientScope;
    for (const cleanup of this.streamCleanups.values()) cleanup();
    this.streamCleanups.clear();
    this.stoppingStreams.clear();
    // 重置所有 channel 的重试计数，允许重连后重新计数
    this.channelStreamRetries.clear();
    // 重置 stream onExit 重启计数,允许重连后重新计数
    this.streamRestartRetries.clear();

    // 重置 lifecycle welcome 抓取标记,允许重连后重新 emit。
    // `openReconnectSession` 会迭代 listeners 重新调用 `startChannelStream`,
    // 如果不重置,重连后 `__root.tsx` 的 onServerWelcome 永远不会被再次触发,
    // boot 进度会卡在 server-welcome 阶段。
    this.lifecycleWelcomeFetched = false;
    this.serverConfigFetched = false;
    this.serverSettingsFetched = false;

    this.state = "connecting";
    // 重置已解析客户端缓存
    this.resolvedClient = null;

    void oldRuntime.runPromise(Scope.close(oldClientScope, Exit.void)).finally(() => {
      oldRuntime.dispose();
    });

    this.reconnectPromise = this.openReconnectSession()
      .catch((error) => {
        // 重连失败,显示失败 Toast (仅在连续失败 3 次后显示,避免短暂网络波动刷屏)
        if (this.reconnectFailures >= 3) {
          const t = MESSAGES[DEFAULT_LANGUAGE].networkStatus;
          toastManager.add({
            type: "error",
            title: t.wsReconnectFailedMessage,
            timeout: 8000,
          });
        }
        throw error;
      })
      .finally(() => {
        this.reconnectPromise = null;
      });
    return this.reconnectPromise;
  }

  private async openReconnectSession(): Promise<RpcClientInstance> {
    const delayMs = Math.min(500 * 2 ** this.reconnectFailures, 5_000);
    this.reconnectFailures += 1;
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));

    // 退避期间 transport 可能已被 dispose,提前退出避免创建无意义的 session
    if (this.disposed) {
      throw new Error("Transport disposed during reconnect backoff");
    }

    const session = this.createSession();
    this.runtime = session.runtime;
    this.clientScope = session.clientScope;
    this.clientPromise = session.clientPromise;

    const client = await session.clientPromise;
    this.reconnectFailures = 0;

    // 重连成功,显示恢复 Toast
    const t = MESSAGES[DEFAULT_LANGUAGE].networkStatus;
    toastManager.add({
      type: "success",
      title: t.wsReconnectedMessage,
      timeout: 3000,
    });
    // getClientRetries 只在 getClient() 连接成功时重置(见 getClient() 中
    // `this.getClientRetries = 0`),防止 openReconnectSession 重置导致
    // getClient() 的 MAX_CLIENT_RETRIES 限制被绕过、形成无限重试循环。
    for (const channel of this.listeners.keys()) {
      this.startChannelStream(channel as WsPushChannel);
    }
    // shell/thread streams 不再启动(服务端是占位 alias,会触发无限重启),
    // 不需要在重连后重启它们。
    return client;
  }

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

  private startChannelStream(channel: WsPushChannel): void {
    // 对于 lifecycle / config / settings 通道，无论 getClient() 成功与否，
    // 都在首次尝试时触发快照抓取。这些方法内部有 8s 超时 + 默认值 fallback，
    // 确保即使服务端不可达，UI 也能收到 welcome / config / settings 事件，
    // 不会永久卡在启动屏。
    const triggerSnapshot = () => {
      if (isServerLifecyclePushChannel(channel)) {
        void this.startLifecycleWelcome();
      } else if (channel === WS_CHANNELS.serverConfigUpdated) {
        void this.startServerConfigSnapshot();
      } else if (channel === WS_CHANNELS.serverSettingsUpdated) {
        void this.startServerSettingsSnapshot();
      }
    };

    void this.getClient()
      .then(() => {
        // 成功获取 client 后重置该 channel 的重试计数
        this.channelStreamRetries.delete(channel);

        // 关键修复:若之前因 getClient() 失败导致 snapshot 方法以默认值发射
        // (如 startLifecycleWelcome 发射了 cwd="." 的默认 welcome),
        // 则 fetched 标志已被设为 true。现在连接成功,重置标志让 snapshot
        // 方法能重新拉取真实数据(正确 cwd / homeDir / config / settings)。
        if (isServerLifecyclePushChannel(channel)) {
          this.lifecycleWelcomeFetched = false;
        } else if (channel === WS_CHANNELS.serverConfigUpdated) {
          this.serverConfigFetched = false;
        } else if (channel === WS_CHANNELS.serverSettingsUpdated) {
          this.serverSettingsFetched = false;
        }

        triggerSnapshot();

        if (channel === WS_CHANNELS.serverProviderStatusesUpdated) {
          // Provider statuses 随 server.getConfig 一起下发,由 startServerConfigSnapshot 统一处理。
          return;
        } else if (channel === WS_CHANNELS.terminalEvent) {
          // 服务端 subscribeTerminalEvents 是占位 alias,暂不启动 stream。
          return;
        } else if (channel === ORCHESTRATION_WS_CHANNELS.domainEvent) {
          // 服务端 subscribeOrchestrationDomainEvents 是占位 alias,暂不启动 stream。
          return;
        }
      })
      .catch((error) => {
        // 即使 getClient() 失败，首次尝试时也触发快照抓取。
        // 后续重试不再重复触发（retries > 0），避免重复 emit。
        const retries = this.channelStreamRetries.get(channel) ?? 0;
        if (retries === 0) {
          triggerSnapshot();
        }

        if (!this.disposed && this.listeners.has(channel)) {
          if (retries >= WsTransport.MAX_CHANNEL_STREAM_RETRIES) {
            if (import.meta.env?.DEV) {
              // eslint-disable-next-line no-console
              console.warn(
                `[wsTransport] startChannelStream(${channel}): max retries (${WsTransport.MAX_CHANNEL_STREAM_RETRIES}) reached, giving up`,
                error,
              );
            }
            this.channelStreamRetries.delete(channel);
            return;
          }
          this.channelStreamRetries.set(channel, retries + 1);
          // 指数退避：500ms, 1s, 2s。MAX_CHANNEL_STREAM_RETRIES 已降为 2，
          // 避免启动失败时大量重试任务堆积。
          const delay = Math.min(500 * 2 ** retries, 2_000);
          if (import.meta.env?.DEV) {
            // eslint-disable-next-line no-console
            console.warn(
              `[wsTransport] startChannelStream(${channel}): retry ${retries + 1}/${WsTransport.MAX_CHANNEL_STREAM_RETRIES} in ${delay}ms`,
              error,
            );
          }
          // setTimeout 回调里再次检查 disposed,避免退避期间 transport 被
          // dispose 后仍触发无意义的 startChannelStream(会立即抛错并占用
          // 主线程调度)。
          window.setTimeout(() => {
            if (this.disposed) {
              this.channelStreamRetries.delete(channel);
              return;
            }
            this.startChannelStream(channel);
          }, delay);
        }
      });
  }

  private stopChannelStream(channel: WsPushChannel): void {
    // 重置该 channel 的重试计数，允许下次订阅重新开始计数
    this.channelStreamRetries.delete(channel);

    if (isServerLifecyclePushChannel(channel)) {
      // 新逻辑下 lifecycle 通道不再持有后台 stream,只需在最后一个监听器
      // 退订时允许下次订阅重新拉取 welcome。
      this.stopStream("server.lifecycle");
      this.lifecycleWelcomeFetched = false;
    } else if (channel === WS_CHANNELS.serverConfigUpdated) {
      this.stopStream("server.config");
      this.serverConfigFetched = false;
    } else if (channel === WS_CHANNELS.serverProviderStatusesUpdated) {
      this.stopStream("server.providers");
    } else if (channel === WS_CHANNELS.serverSettingsUpdated) {
      this.stopStream("server.settings");
      this.serverSettingsFetched = false;
    } else if (channel === WS_CHANNELS.terminalEvent) this.stopStream("terminal.events");
    else if (channel === ORCHESTRATION_WS_CHANNELS.domainEvent)
      this.stopStream("orchestration.domain");
  }

  /**
   * 通过一次性 RPC 抓取服务端 lifecycle welcome 信息,并以 push 形式
   * emit 到 `server.welcome` 通道,确保 `__root.tsx` 的 `onServerWelcome`
   * 监听器能继续推进 server-welcome → shell-snapshot → 启动完成 链路。
   *
   * 触发条件:`startChannelStream` 中对 lifecycle 通道的请求被路由到这里。
   * 仅执行一次(per transport 生命周期),重连时通过 `lifecycleWelcomeFetched`
   * 在 stopChannelStream 中重置后允许重新拉取。
   *
   * 关键修复:不再通过 `this.request()` 间接调用 `this.getClient()`。
   * 当 `startChannelStream` 已在重试 `getClient()` 时,嵌套调用会:
   * 1. 并发递增 getClientRetries,导致 MAX_CLIENT_RETRIES 被提前耗尽
   * 2. 在 15s 超时先于重试耗尽时,触发新一轮重试链
   * 改为直接使用 `this.clientPromise`,若连接已就绪则拉取真实数据,
   * 否则立即发射默认 welcome 事件,让 UI 推进启动流程。
   */
  private async startLifecycleWelcome(): Promise<void> {
    if (this.lifecycleWelcomeFetched) return;
    this.lifecycleWelcomeFetched = true;

    // 服务端 schema 与 client 期望的 `ServerConfig` 并不完全一致(后端是
    // 简化版 json!),这里用宽松类型拿到我们关心的字段即可。
    type LooseConfig = {
      homeDir?: string | null;
      baseDir?: string | null;
      cwd?: string | null;
    };
    type LooseEnv = {
      cwd?: string | null;
    };

    // 快速路径:如果 clientPromise 尚未 resolve(连接未就绪或已失败),
    // 不调用 this.request()(其内部会再次调用 this.getClient() 触发嵌套重试),
    // 直接发射默认 welcome 事件推进启动流程。
    const REQUEST_TIMEOUT_MS = 8_000;

    // 检查 clientPromise 当前状态:若已 resolved 则直接使用已连接的 client
    // 进行 RPC 调用;否则立即 fallback 到默认值。
    let client: RpcClientInstance | null = null;
    try {
      // dev 模式下 Effect RPC 握手可能需要 10-15s,用 500ms 会永远走 fallback。
      // 改为等待完整连接（getClient 已有 15s 超时保护）。
      client = await this.getClient();
    } catch {
      // clientPromise rejected → 连接不可用,走默认值
    }

    if (client === null || this.disposed) {
      // 连接未就绪或已断开 → 发射默认 welcome 事件,不阻塞启动流程
      if (!this.disposed) {
        this.emit(WS_CHANNELS.serverWelcome, {
          cwd: ".",
          projectName: "云顶数字 Buddy",
        });
      }
      return;
    }

    // 连接已就绪 → 并行拉取 config 和 environment,减少等待时间
    let config: LooseConfig | null = null;
    let env: LooseEnv | null = null;

    const fetchConfig = Promise.race([
      this.request<LooseConfig>(WS_METHODS.serverGetConfig),
      new Promise<LooseConfig>((_, reject) =>
        window.setTimeout(() => reject(new Error("request timeout")), REQUEST_TIMEOUT_MS),
      ),
    ]);
    const fetchEnv = Promise.race([
      this.request<LooseEnv>(WS_METHODS.serverGetEnvironment),
      new Promise<LooseEnv>((_, reject) =>
        window.setTimeout(() => reject(new Error("request timeout")), REQUEST_TIMEOUT_MS),
      ),
    ]);

    const [configResult, envResult] = await Promise.allSettled([fetchConfig, fetchEnv]);

    if (configResult.status === "fulfilled") {
      config = configResult.value;
    } else if (typeof console !== "undefined" && import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[wsTransport] startLifecycleWelcome: server.getConfig failed", configResult.reason);
    }
    if (envResult.status === "fulfilled") {
      env = envResult.value;
    } else if (typeof console !== "undefined" && import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[wsTransport] startLifecycleWelcome: server.getEnvironment failed", envResult.reason);
    }

    if (this.disposed) {
      return;
    }

    const homeDir = config?.homeDir ?? config?.baseDir ?? undefined;
    const cwd = config?.cwd ?? env?.cwd ?? "";
    const projectName = cwd
      ? cwd.split(/[\\/]/).filter(Boolean).pop() || "云顶数字 Buddy"
      : "云顶数字 Buddy";

    const payload: WsWelcomePayload = {
      cwd: cwd || ".",
      projectName,
      ...(homeDir ? { homeDir } : {}),
    };

    this.emit(WS_CHANNELS.serverWelcome, payload);
  }

  /**
   * 通过一次性 RPC 抓取服务端初始 config(provider 状态 + 问题列表),
   * 并以 push 形式 emit 到 `server.configUpdated` 和
   * `server.providerStatusesUpdated` 通道。
   *
   * 与 lifecycle welcome 同理:服务端 subscribeServerConfig /
   * subscribeServerProviderStatuses 是占位 alias,启动 stream 会立即
   * 失败触发 reconnect() 死循环拖死主线程。改用一次性 RPC 拉取快照,
   * 确保 React Query 的 config query 和 Provider 状态初始化能拿到数据。
   * 实时更新在服务端真正落地 stream 之前暂不可用。
   */
  private async startServerConfigSnapshot(): Promise<void> {
    if (this.serverConfigFetched) return;
    this.serverConfigFetched = true;

    // 等待连接就绪（getClient 已有 15s 超时保护）。
    // config 数据会通过 React Query 的 serverConfigQueryOptions 独立加载。
    let client: RpcClientInstance | null = null;
    try {
      client = await this.getClient();
    } catch {
      // clientPromise rejected → 跳过
    }
    if (client === null || this.disposed) return;

    type LooseConfig = {
      issues?: unknown;
      providers?: unknown;
    };

    const REQUEST_TIMEOUT_MS = 8_000;

    let config: LooseConfig | null = null;
    try {
      config = await Promise.race([
        this.request<LooseConfig>(WS_METHODS.serverGetConfig),
        new Promise<LooseConfig>((_, reject) =>
          window.setTimeout(() => reject(new Error("request timeout")), REQUEST_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      if (typeof console !== "undefined" && import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[wsTransport] startServerConfigSnapshot: server.getConfig failed", error);
      }
    }

    if (this.disposed) return;

    const issues = (config?.issues ?? []) as never;
    const providers = (config?.providers ?? []) as never;

    this.emit(WS_CHANNELS.serverConfigUpdated, { issues, providers });
    this.emit(WS_CHANNELS.serverProviderStatusesUpdated, { providers });
  }

  /**
   * 通过一次性 RPC 抓取服务端初始 settings,并以 push 形式 emit 到
   * `server.settingsUpdated` 通道。
   *
   * 同理:服务端 subscribeServerSettings 是占位 alias,启动 stream 会
   * 立即失败触发 reconnect() 死循环。
   */
  private async startServerSettingsSnapshot(): Promise<void> {
    if (this.serverSettingsFetched) return;
    this.serverSettingsFetched = true;

    // 等待连接就绪（getClient 已有 15s 超时保护）。
    // settings 数据会通过 React Query 的 serverSettingsQueryOptions 独立加载。
    let client: RpcClientInstance | null = null;
    try {
      client = await this.getClient();
    } catch {
      // clientPromise rejected → 跳过
    }
    if (client === null || this.disposed) return;

    type LooseSettings = {
      settings?: unknown;
    };

    const REQUEST_TIMEOUT_MS = 8_000;

    let result: LooseSettings | null = null;
    try {
      result = await Promise.race([
        this.request<LooseSettings>(WS_METHODS.serverGetSettings),
        new Promise<LooseSettings>((_, reject) =>
          window.setTimeout(() => reject(new Error("request timeout")), REQUEST_TIMEOUT_MS),
        ),
      ]);
    } catch (error) {
      if (typeof console !== "undefined" && import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[wsTransport] startServerSettingsSnapshot: server.getSettings failed", error);
      }
    }

    if (this.disposed) return;

    const settings = (result?.settings ?? {}) as never;
    this.emit(WS_CHANNELS.serverSettingsUpdated, { settings });
  }

  private shouldKeepLifecycleStream(): boolean {
    return shouldKeepServerLifecycleStream(new Set(this.listeners.keys()));
  }

  private startLifecycleStream(client: RpcClientInstance): void {
    const restartLifecycle = () => {
      if (!this.shouldKeepLifecycleStream()) return;
      void this.getClient()
        .then((nextClient) => this.startLifecycleStream(nextClient))
        .catch((error) => console.warn("WebSocket RPC lifecycle stream failed to restart", error));
    };
    this.startStream(
      "server.lifecycle",
      resolveRpcClientMethod(client, WS_METHODS.subscribeServerLifecycle)!({} as never),
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

  private startShellStream(client: RpcClientInstance): void {
    const restartShell = () => {
      void this.getClient()
        .then((nextClient) => this.startShellStream(nextClient))
        .catch((error) => console.warn("WebSocket RPC shell stream failed to restart", error));
    };
    this.startStream(
      "orchestration.shell",
      resolveRpcClientMethod(client, ORCHESTRATION_WS_METHODS.subscribeShell)!({} as never),
      (event: OrchestrationShellStreamItem) =>
        this.emit(ORCHESTRATION_WS_CHANNELS.shellEvent, event),
      restartShell,
    );
  }

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
      resolveRpcClientMethod(client, ORCHESTRATION_WS_METHODS.subscribeThread)!(input as never),
      (event: OrchestrationThreadStreamItem) =>
        this.emit(ORCHESTRATION_WS_CHANNELS.threadEvent, event),
      restartThread,
    );
  }

  private startStream<T>(
    key: string,
    stream: unknown,
    listener: (event: T) => void,
    restart?: (() => void) | undefined,
  ): void {
    if (this.streamCleanups.has(key)) return;
    // 新的 stream 启动 → 重置 onExit 重启计数,允许后续失败重新计数
    this.streamRestartRetries.delete(key);
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
            // 严格限制 stream 失败后的 onExit 重启次数,避免服务端把
            // subscription 走占位 alias(只回 `{status:"active"}` 立即
            // 收尾)时,客户端每 500ms 重启一次形成的死循环把主线程拖死。
            // 这里给每个 stream key 3 次硬上限,失败 3 次后直接停摆,
            // 把"非关键路径"通道(serverConfigUpdated / serverSettingsUpdated
            // 等)静默让出,主线程立即恢复响应。
            const retryCount = this.streamRestartRetries.get(key) ?? 0;
            if (retryCount >= WsTransport.MAX_STREAM_RESTART_RETRIES) {
              this.streamRestartRetries.delete(key);
              console.warn(
                "[wsTransport] stream restart retries exhausted, giving up:",
                key,
              );
              return;
            }
            this.streamRestartRetries.set(key, retryCount + 1);
            window.setTimeout(
              () => {
                if (!this.disposed && !this.streamCleanups.has(key)) {
                  void this.reconnect()
                    .then(() => restart())
                    .catch((error) =>
                      console.warn("WebSocket RPC stream reconnect failed", error),
                    );
                }
              },
              Cause.isInterruptedOnly(exit.cause) ? 0 : 500,
            );
            return;
          }
          if (Exit.isFailure(exit) && !this.disposed && !Cause.isInterruptedOnly(exit.cause)) {
            console.warn("WebSocket RPC stream failed", causeToError(exit.cause));
          }
        },
      },
    );
    this.streamCleanups.set(key, cancel);
  }

  private stopStream(key: string): void {
    const cleanup = this.streamCleanups.get(key);
    if (!cleanup) return;
    this.stoppingStreams.add(key);
    this.streamCleanups.delete(key);
    cleanup();
  }

  private async runGitActionStream(
    client: RpcClientInstance,
    params: unknown,
  ): Promise<GitRunStackedActionResult> {
    let result: GitRunStackedActionResult | null = null;
    await this.runtime.runPromise(
      Stream.runForEach(resolveRpcClientMethod(client, WS_METHODS.gitRunStackedAction)!(params as never), (event) =>
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
