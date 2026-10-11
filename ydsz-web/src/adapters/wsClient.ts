/**
 * @file WebSocket JSON-RPC 客户端
 * @description 轻量级 WebSocket JSON-RPC 2.0 客户端，与 ydzs-desktop 协议格式兼容。
 *              支持：请求-响应匹配、Pending Map、心跳 ping/pong、指数退避重连（最多10次）、
 *              服务端推送事件分发。
 *
 * ## 协议格式
 *
 * 请求:  { jsonrpc: "2.0", id: string, method: string, params?: unknown }
 * 响应:  { jsonrpc: "2.0", id: string, result?: unknown, error?: { message, code? } }
 * 通知:  { jsonrpc: "2.0", method: string, params?: unknown }
 * 推送:  { type: "push", sequence: number, channel: string, data?: unknown }
 */

// ── 类型定义 ──────────────────────────────────────────────────────────

/** 推送监听器 */
export type PushListener = (data: unknown) => void;

/** 推送通道名称 */
export type WsPushChannel =
  | "server.welcome"
  | "server.configUpdated"
  | "server.settingsUpdated"
  | "server.providerStatusesUpdated"
  | "orchestration.threadEvent"
  | "orchestration.domainEvent"
  | "orchestration.shellEvent"
  | "git.actionProgress"
  | "terminal.event";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

type TransportState = "connecting" | "open" | "closed" | "disposed";

// ── JSON-RPC 消息格式 ────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { message: string; code?: number };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

/** 服务端推送消息 */
interface JsonRpcPush {
  type: "push";
  sequence: number;
  channel: string;
  data?: unknown;
}

type JsonRpcInbound = JsonRpcResponse | JsonRpcNotification | JsonRpcPush;

// ── 配置选项 ──────────────────────────────────────────────────────────

export interface WsClientConfig {
  /** WebSocket URL，不传则自动推导 */
  url?: string;
  /** 请求超时时间（毫秒），默认 30000 */
  requestTimeoutMs?: number;
  /** 是否启用自动重连，默认 true */
  autoReconnect?: boolean;
  /** 重连最大尝试次数，默认 10 */
  maxReconnectAttempts?: number;
  /** 初始退避延迟（毫秒），默认 1000 */
  baseDelayMs?: number;
  /** 最大退避延迟（毫秒），默认 30000 */
  maxDelayMs?: number;
  /** 心跳间隔（毫秒），默认 30000 */
  heartbeatIntervalMs?: number;
  /** 心跳超时（毫秒），默认 10000 */
  heartbeatTimeoutMs?: number;
  /** 连接成功回调 */
  onConnected?: () => void;
  /** 连接断开回调 */
  onDisconnected?: (event: CloseEvent) => void;
  /** 错误回调 */
  onError?: (error: Event) => void;
}

// ── 默认配置 ──────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<Omit<WsClientConfig, "url" | "onConnected" | "onDisconnected" | "onError">> = {
  requestTimeoutMs: 30_000,
  autoReconnect: true,
  maxReconnectAttempts: 10,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  heartbeatIntervalMs: 30_000,
  heartbeatTimeoutMs: 10_000,
};

// ── WebSocket JSON-RPC 客户端 ─────────────────────────────────────────

export class WsJsonRpcClient {
  private ws: WebSocket | null = null;
  private readonly config: WsClientConfig;
  private readonly mergedConfig: typeof DEFAULT_CONFIG;
  private state: TransportState = "connecting";
  private readonly pendingRequests = new Map<string, PendingRequest>();
  /** 推送通道监听器映射：channel -> Set<listener> */
  private readonly listeners = new Map<string, Set<PushListener>>();
  /** 最新推送缓存：channel -> push data */
  private readonly latestPush = new Map<string, unknown>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private reqIdCounter = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WsClientConfig = {}) {
    this.config = config;
    this.mergedConfig = { ...DEFAULT_CONFIG };
    if (config.requestTimeoutMs !== undefined) this.mergedConfig.requestTimeoutMs = config.requestTimeoutMs;
    if (config.autoReconnect !== undefined) this.mergedConfig.autoReconnect = config.autoReconnect;
    if (config.maxReconnectAttempts !== undefined) this.mergedConfig.maxReconnectAttempts = config.maxReconnectAttempts;
    if (config.baseDelayMs !== undefined) this.mergedConfig.baseDelayMs = config.baseDelayMs;
    if (config.maxDelayMs !== undefined) this.mergedConfig.maxDelayMs = config.maxDelayMs;
    if (config.heartbeatIntervalMs !== undefined) this.mergedConfig.heartbeatIntervalMs = config.heartbeatIntervalMs;
    if (config.heartbeatTimeoutMs !== undefined) this.mergedConfig.heartbeatTimeoutMs = config.heartbeatTimeoutMs;
  }

  // ── 公共 API ────────────────────────────────────────────────────

  /**
   * 建立 WebSocket 连接
   */
  connect(): void {
    if (this.disposed) return;
    const url = this.config.url ?? this.deriveUrl();
    this.state = "connecting";

    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      console.warn("[WsClient] WebSocket creation failed", error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.state = "open";
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.config.onConnected?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.state = "closed";
      this.stopHeartbeat();
      this.config.onDisconnected?.(event);
      if (this.mergedConfig.autoReconnect && !this.disposed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event: Event) => {
      this.config.onError?.(event);
    };
  }

  /**
   * 发送 JSON-RPC 请求并等待响应
   * @param method 方法名（如 "orchestration.dispatchCommand"）
   * @param params 参数对象
   * @returns 服务端返回的 result
   * @throws 连接失败、超时或服务端返回 error 时抛出 Error
   */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.disposed) throw new Error("Client disposed");
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    const id = String(++this.reqIdCounter);
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout (${this.mergedConfig.requestTimeoutMs}ms): ${method}`));
      }, this.mergedConfig.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        method,
      });

      try {
        this.ws!.send(JSON.stringify(message));
      } catch (sendError) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(sendError instanceof Error ? sendError : new Error(String(sendError)));
      }
    });
  }

  /**
   * 发送通知（不等待响应）
   */
  notify(method: string, params?: unknown): void {
    if (this.disposed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const message: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * 订阅推送通道
   * @param channel 通道名称
   * @param listener 监听器
   * @param options.replayLatest 是否重播最新推送
   * @returns 取消订阅函数
   */
  subscribe(
    channel: WsPushChannel,
    listener: PushListener,
    options?: { replayLatest?: boolean },
  ): () => void {
    let channelListeners = this.listeners.get(channel);
    if (!channelListeners) {
      channelListeners = new Set();
      this.listeners.set(channel, channelListeners);
    }

    channelListeners.add(listener);

    // 重播最新推送
    if (options?.replayLatest) {
      const latest = this.latestPush.get(channel);
      if (latest !== undefined) {
        try {
          listener(latest);
        } catch {
          // Listener 错误不影响其他监听器
        }
      }
    }

    // 返回取消订阅函数
    return () => {
      channelListeners?.delete(listener);
      if (channelListeners?.size === 0) {
        this.listeners.delete(channel);
      }
    };
  }

  /**
   * 获取当前连接状态
   */
  getState(): TransportState {
    return this.state;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.state === "open" && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 获取当前重连次数
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * 断开连接并清理资源
   */
  dispose(): void {
    this.disposed = true;
    this.state = "disposed";

    // 清理重连计时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 停止心跳
    this.stopHeartbeat();

    // 拒绝所有待处理请求
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Client disposed"));
    }
    this.pendingRequests.clear();

    // 关闭 WebSocket
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    // 清理监听器
    this.listeners.clear();
    this.latestPush.clear();
  }

  // ── 内部方法 ────────────────────────────────────────────────────

  /**
   * 推导 WebSocket URL
   * 优先使用 Vite 代理的 /ws 路径（开发模式）
   */
  private deriveUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws`;
  }

  /**
   * 处理收到的 WebSocket 消息
   */
  private handleMessage(raw: string | ArrayBuffer): void {
    let message: JsonRpcInbound;
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      message = JSON.parse(text) as JsonRpcInbound;
    } catch {
      // 忽略无法解析的消息
      return;
    }

    // 推送消息（type: "push"）
    if ("type" in message && message.type === "push") {
      const push = message as JsonRpcPush;
      this.dispatchPush(push.channel as WsPushChannel, push.data);
      return;
    }

    // 响应消息（有 id 字段且不是 push 类型）
    if ("id" in message) {
      const response = message as JsonRpcResponse;
      const pending = this.pendingRequests.get(response.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pendingRequests.delete(response.id);

      if (response.error) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response.result);
      }
      return;
    }

    // 通知消息（jsonrpc + method，无 id）
    const notification = message as JsonRpcNotification;
    this.dispatchPush(notification.method as WsPushChannel, notification.params);
  }

  /**
   * 分发推送到对应通道的监听器
   */
  private dispatchPush(channel: WsPushChannel, data: unknown): void {
    // 缓存最新推送
    this.latestPush.set(channel, data);

    const channelListeners = this.listeners.get(channel);
    if (!channelListeners) return;

    for (const listener of channelListeners) {
      try {
        listener(data);
      } catch {
        // Listener 错误不应破坏其他监听器
      }
    }
  }

  /**
   * 调度重连（指数退避）
   */
  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.mergedConfig.maxReconnectAttempts) {
      return;
    }

    const delay = Math.min(
      this.mergedConfig.baseDelayMs * 2 ** this.reconnectAttempts,
      this.mergedConfig.maxDelayMs,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) {
        this.connect();
      }
    }, delay);
  }

  // ── 心跳 ──────────────────────────────────────────────────────

  /**
   * 启动心跳
   * 定期发送 server.getConfig 作为心跳检测
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.mergedConfig.heartbeatIntervalMs;

    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected()) return;

      // 设置心跳超时
      this.heartbeatTimeoutTimer = setTimeout(() => {
        // 心跳超时，主动断开触发重连
        console.warn("[WsClient] Heartbeat timeout, disconnecting...");
        this.ws?.close();
      }, this.mergedConfig.heartbeatTimeoutMs);

      // 发送心跳（轻量级 RPC）
      this.request("server.getConfig")
        .then(() => {
          if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
          }
        })
        .catch(() => {
          // 心跳失败会在 onclose 中触发重连
          if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
          }
        });
    }, interval);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
}

// ── 单例管理 ──────────────────────────────────────────────────────────

let sharedClient: WsJsonRpcClient | null = null;

/**
 * 获取共享的 WebSocket 客户端单例
 */
export function getSharedWsClient(config?: WsClientConfig): WsJsonRpcClient {
  if (!sharedClient || sharedClient.getState() === "disposed") {
    sharedClient = new WsJsonRpcClient(config);
  }
  return sharedClient;
}

/**
 * 销毁共享客户端
 */
export function disposeSharedWsClient(): void {
  if (sharedClient) {
    sharedClient.dispose();
    sharedClient = null;
  }
}

// ── 便捷 RPC 方法封装 ──────────────────────────────────────────────────

/**
 * 发送编排层命令（orchestration.dispatchCommand）
 * @param command 命令体，如 { type: "thread.turn.start", ... }
 */
export async function dispatchOrchestrationCommand(
  command: Record<string, unknown>,
): Promise<unknown> {
  const client = getSharedWsClient();
  return client.request("orchestration.dispatchCommand", { command });
}

/**
 * 订阅编排层 Thread 事件
 * @param listener 事件监听器（接收 threadEvent 数据）
 * @returns 取消订阅函数
 */
export function subscribeThreadEvents(listener: PushListener): () => void {
  const client = getSharedWsClient();
  return client.subscribe("orchestration.threadEvent", listener, { replayLatest: true });
}

/**
 * 获取共享客户端实例（用于高级操作）
 */
export function getRawClient(): WsJsonRpcClient {
  return getSharedWsClient();
}
