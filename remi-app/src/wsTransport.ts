/**
 * @file WebSocket 传输层实�? * @description 基于 Effect RPC �?WebSocket 协议的双向通信传输层�? *              封装�?RPC 客户端的创建、连接管理、自动重连、流式订阅等功能�? *              为上层提供统一�?request/subscribe 接口，屏蔽底�?WebSocket 通信细节�? *              Tauri 迁移期间临时跳过类型检查，后续需替换�?Tauri event/invoke 实现�? */
// @ts-nocheck
// TODO: Tauri 迁移期间临时跳过类型检查。原文件基于 Effect RPC/WebSocket�?// 需替换�?Tauri event/invoke 实现�?
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

/** 推送消息监听器类型，用于订阅指定频道的推送消�?*/
type PushListener<C extends WsPushChannel> = (message: WsPushMessage<C>) => void;

/** RPC 客户端工�?Effect 类型 */
type RpcClientEffect = typeof makeRpcClient;
/** RPC 客户端实例类型，从工�?Effect 中推�?*/
type RpcClientInstance =
  RpcClientEffect extends Effect.Effect<infer Client, any, any> ? Client : never;

/** 传输层连接状�?*/
type TransportState = "connecting" | "open" | "closed" | "disposed";

/** WebSocket RPC 通信错误 */
class WsTransportRpcError extends Data.TaggedError("WsTransportRpcError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** 创建 RPC 客户端实例的 Effect，基�?WsRpcGroup 定义的方法集 */
const makeRpcClient = RpcClient.make(WsRpcGroup);

/**
 * 将原�?URL 解析�?RPC 端点地址
 * @param rawUrl - 原始 WebSocket 连接地址
 * @returns 追加�?`/ws` 路径的完�?URL
 */
function resolveRpcUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.pathname = "/ws";
  return url.toString();
}

/**
 * 构建 WebSocket 连接地址
 * 优先级：显式 URL > Tauri Bridge URL > 环境变量 VITE_WS_URL > 当前页面协议自动推导
 * @param explicitUrl - 显式指定�?WebSocket URL，为 null 时自动推�? * @returns 可用于建�?WebSocket 连接的完�?URL
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
 * 构建 RPC 协议层，包含 WebSocket 传输层和 JSON 序列化层
 * @param url - WebSocket 连接地址
 * @returns Effect Layer，提�?RPC 协议支持
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
 * �?Effect Cause 转换为标�?Error 对象
 * @param cause - Effect 框架的错�?Cause
 * @returns 标准 Error 实例
 */
function causeToError(cause: Cause.Cause<unknown>): Error {
  const error = Cause.squash(cause);
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * 过滤用户输入应答中的 null/undefined �? * 当命令类型为 thread.user-input.respond 时，移除 answers 中值为 null �?undefined 的条目，
 * 避免后端接收到无效的空值应�? * @param input - 原始 RPC 请求参数
 * @returns 过滤后的请求参数
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
 * 判断给定频道是否为服务器生命周期相关频道
 * @param channel - 频道标识
 * @returns 是否为服务器生命周期频道（serverWelcome �?serverMaintenanceUpdated�? */
export function isServerLifecyclePushChannel(channel: string): boolean {
  return channel === WS_CHANNELS.serverWelcome || channel === WS_CHANNELS.serverMaintenanceUpdated;
}

/**
 * 判断是否需要保持服务器生命周期流处于活跃状�? * 当任一生命周期频道仍有订阅者时，流不应被关�? * @param activeChannels - 当前活跃的频道集�? * @returns 是否需要保持生命周期流
 */
export function shouldKeepServerLifecycleStream(activeChannels: ReadonlySet<string>): boolean {
  return (
    activeChannels.has(WS_CHANNELS.serverWelcome) ||
    activeChannels.has(WS_CHANNELS.serverMaintenanceUpdated)
  );
}

/**
 * WebSocket 传输层核心类
 * 负责管理 WebSocket 连接的生命周期，包括�? * - RPC 请求的发送与响应接收
 * - 推送频道的订阅与取�? * - 连接断开后的自动重连（指数退避）
 * - 流式数据的订阅管�? *
 * @example
 * ```typescript
 * const transport = new WsTransport("ws://localhost:8080");
 * const unsubscribe = transport.subscribe(WS_CHANNELS.serverWelcome, (msg) => {
 *   console.log("Welcome:", msg.data);
 * });
 * // 取消订阅
 * unsubscribe();
 * transport.dispose();
 * ```
 */
export class WsTransport {
  /** 显式指定�?WebSocket URL，优先级最�?*/
  private readonly explicitUrl: string | null;
  /** 各频道的监听器集合，key 为频道名 */
  private readonly listeners = new Map<string, Set<(message: WsPush) => void>>();
  /** 各频道最近一次推送消息缓存，用于新订阅者的回放 */
  private readonly latestPushByChannel = new Map<string, WsPush>();
  /** 消息序列号，用于推送消息排�?*/
  private sequence = 0;
  /** 当前传输层状�?*/
  private state: TransportState = "connecting";
  /** 是否已销�?*/
  private disposed = false;
  /** Effect ManagedRuntime，管�?RPC 客户端的生命周期 */
  private runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
  /** RPC 客户端的作用域，用于资源清理 */
  private clientScope: Scope.Closeable;
  /** RPC 客户端实例的 Promise，支持异步初始化 */
  private clientPromise: Promise<RpcClientInstance>;
  /** 正在进行的重�?Promise，防止并发重�?*/
  private reconnectPromise: Promise<RpcClientInstance> | null = null;
  /** 连续重连失败次数，用于计算退避延�?*/
  private reconnectFailures = 0;
  /** 活跃流的清理函数映射，key 为流标识 */
  private readonly streamCleanups = new Map<string, () => void>();
  /** 正在主动停止的流标识集合，用于区分主动停止和异常断开 */
  private readonly stoppingStreams = new Set<string>();
  /** 是否已订�?Shell 事件�?*/
  private shellSubscribed = false;
  /** 线程订阅参数映射，key �?threadId，重连时用于恢复订阅 */
  private readonly threadSubscriptions = new Map<string, unknown>();

  /**
   * 创建 WsTransport 实例
   * @param url - 可选的 WebSocket 连接地址，不传则自动推导
   */
  constructor(url?: string) {
    this.explicitUrl = url ?? null;
    const session = this.createSession();
    this.runtime = session.runtime;
    this.clientScope = session.clientScope;
    this.clientPromise = session.clientPromise;
  }

  /**
   * 发�?RPC 请求并返回响�?   * 对于流式方法（如 git 操作、Shell/Thread 订阅），会启动对应的流处�?   * @param method - RPC 方法�?   * @param params - 请求参数
   * @param _options - 可选配置（如超时时间），当前未使用
   * @returns RPC 响应结果
   * @throws 当传输层已销毁或方法不存在时抛出错误
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
   * 订阅指定频道的推送消�?   * 当首个监听器注册时自动启动对应的流，当最后一个监听器移除时自动停止流
   * @param channel - 要订阅的推送频�?   * @param listener - 消息回调函数
   * @param options - 订阅选项，replayLatest �?true 时会立即回放最近一条消�?   * @returns 取消订阅的函�?   * @example
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
   * 获取指定频道最近一次推送消�?   * @param channel - 频道标识
   * @returns 最近一次推送消息，若无缓存则返�?null
   */
  getLatestPush<C extends WsPushChannel>(channel: C): WsPushMessage<C> | null {
    const latest = this.latestPushByChannel.get(channel);
    return latest ? (latest as WsPushMessage<C>) : null;
  }

  /**
   * 获取当前传输层状�?   * @returns 传输层连接状�?   */
  getState(): TransportState {
    return this.state;
  }

  /**
   * 销毁传输层，释放所有资�?   * 停止所有活跃流、关�?RPC 客户端连接、销毁运行时
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

  /** 创建新的 RPC 会话（运行时 + 客户端作用域 + 客户�?Promise�?*/
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
   * 获取 RPC 客户端实例，连接失败时自动触发重�?   * @returns RPC 客户端实�?   */
  private async getClient(): Promise<RpcClientInstance> {
    try {
      return await this.clientPromise;
    } catch {
      if (this.disposed) throw new Error("Transport disposed");
      return this.reconnect();
    }
  }

  /**
   * 执行重连操作，清理旧会话并创建新会话
   * 使用互斥锁（reconnectPromise）防止并发重�?   * @returns 新的 RPC 客户端实�?   */
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
   * 打开新的重连会话，使用指数退避策略延迟重�?   * 重连成功后恢复所有频道订阅、Shell 订阅和线程订�?   * @returns 新的 RPC 客户端实�?   */
  private async openReconnectSession(): Promise<RpcClientInstance> {
    // 指数退避：500ms * 2^failures，最�?5000ms
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
   * 向指定频道发送推送消息，通知所有监听器
   * @param channel - 目标频道
   * @param data - 推送数�?   */
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
   * 启动指定频道的流式订�?   * 根据频道类型路由到对应的流处理逻辑
   * @param channel - 要订阅的频道
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
   * 停止指定频道的流式订�?   * @param channel - 要停止的频道
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

  /** 判断是否仍需保持生命周期流活�?*/
  private shouldKeepLifecycleStream(): boolean {
    return shouldKeepServerLifecycleStream(new Set(this.listeners.keys()));
  }

  /**
   * 启动服务器生命周期事件流（welcome + maintenance�?   * @param client - RPC 客户端实�?   */
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
   * 启动 Shell 事件�?   * @param client - RPC 客户端实�?   */
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
   * 启动指定线程的事件流
   * @param client - RPC 客户端实�?   * @param threadId - 线程 ID
   * @param input - 订阅参数
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
   * 通用的流启动方法，订�?Effect Stream 并在流结束时自动处理重连或错�?   * @param key - 流的唯一标识，用于管理生命周�?   * @param stream - Effect Stream 实例
   * @param listener - 事件回调
   * @param restart - 流异常中断后的重启回�?   */
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
   * 停止指定标识的流
   * @param key - 流的唯一标识
   */
  private stopStream(key: string): void {
    const cleanup = this.streamCleanups.get(key);
    if (!cleanup) return;
    this.stoppingStreams.add(key);
    this.streamCleanups.delete(key);
    cleanup();
  }

  /**
   * 执行 Git 堆叠操作流，将进度事件推送到 gitActionProgress 频道
   * @param client - RPC 客户端实�?   * @param params - Git 操作参数
   * @returns Git 操作的最终结�?   * @throws 当流完成但未返回最终结果时抛出错误
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
