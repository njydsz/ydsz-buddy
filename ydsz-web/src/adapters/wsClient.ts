/**
 * @file WebSocket JSON-RPC 客户端
 * @description 轻量级 WebSocket JSON-RPC 客户端，从 ydzs-desktop 的 wsTransport 提取核心协议逻辑。
 *              支持自动重连（指数退避）、订阅模式（服务端 push）、请求-响应匹配。
 */

// ── 协议常量（与 ydzs-desktop/src/contracts/ws.ts 保持一致）────────────────

/** WebSocket RPC 方法名称 */
export const WS_METHODS = {
  serverGetConfig: "server.getConfig",
  serverGetEnvironment: "server.getEnvironment",
  serverGetSettings: "server.getSettings",
  serverUpdateSettings: "server.updateSettings",
  subscribeServerLifecycle: "server.subscribeLifecycle",
  subscribeServerConfig: "server.subscribeConfig",
  subscribeServerSettings: "server.subscribeSettings",
} as const;

/** WebSocket 推送通道名称 */
export const WS_CHANNELS = {
  serverWelcome: "server.welcome",
  serverMaintenanceUpdated: "server.maintenanceUpdated",
  serverConfigUpdated: "server.configUpdated",
  serverProviderStatusesUpdated: "server.providerStatusesUpdated",
  serverSettingsUpdated: "server.settingsUpdated",
  gitActionProgress: "git.actionProgress",
  terminalEvent: "terminal.event",
} as const;

// ── 类型定义 ──────────────────────────────────────────────────────────

/** 推送通道值类型 */
export type WsPushChannel = (typeof WS_CHANNELS)[keyof typeof WS_CHANNELS];

/** 推送监听器 */
export type PushListener = (data: unknown) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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

type JsonRpcMessage = JsonRpcResponse | JsonRpcNotification;

// ── 配置选项 ──────────────────────────────────────────────────────────

export interface WsClientConfig {
  /** WebSocket URL，不传则自动推导 */
  url?: string;
  /** 请求超时时间（毫秒），默认 15000 */
  requestTimeoutMs?: number;
  /** 是否启用自动重连，默认 true */
  autoReconnect?: boolean;
  /** 重连最大尝试次数，默认 5 */
  maxReconnectAttempts?: number;
  /** 初始退避延迟（毫秒），默认 500 */
  baseDelayMs?: number;
  /** 最大退避延迟（毫秒），默认 5000 */
  maxDelayMs?: number;
  /** 连接成功回调 */
  onConnected?: () => void;
  /** 连接断开回调 */
  onDisconnected?: (event: CloseEvent) => void;
  /** 错误回调 */
  onError?: (error: Event) => void;
}

// ── 默认配置 ──────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<Omit<WsClientConfig, "url" | "onConnected" | "onDisconnected" | "onError">> = {
  requestTimeoutMs: 15_000,
  autoReconnect: true,
  maxReconnectAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
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

  constructor(config: WsClientConfig = {}) {
    this.config = config;
    this.mergedConfig = { ...DEFAULT_CONFIG };
    if (config.requestTimeoutMs !== undefined) this.mergedConfig.requestTimeoutMs = config.requestTimeoutMs;
    if (config.autoReconnect !== undefined) this.mergedConfig.autoReconnect = config.autoReconnect;
    if (config.maxReconnectAttempts !== undefined) this.mergedConfig.maxReconnectAttempts = config.maxReconnectAttempts;
    if (config.baseDelayMs !== undefined) this.mergedConfig.baseDelayMs = config.baseDelayMs;
    if (config.maxDelayMs !== undefined) this.mergedConfig.maxDelayMs = config.maxDelayMs;
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
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.state = "open";
      this.reconnectAttempts = 0;
      this.config.onConnected?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.state = "closed";
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
        reject(new Error(`Request timeout: ${method}`));
      }, this.mergedConfig.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.ws!.send(JSON.stringify(message));
    });
  }

  /**
   * 订阅推送通道
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
        listener(latest);
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
   * 获取连接状态
   */
  getState(): TransportState {
    return this.state;
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

  /** 请求 ID 计数器 */
  private reqIdCounter = 0;

  /**
   * 推导 WebSocket URL
   */
  private deriveUrl(): string {
    // 优先使用 Vite 代理的 /ws 路径（开发模式）
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws`;
  }

  /**
   * 处理收到的 WebSocket 消息
   */
  private handleMessage(raw: string | ArrayBuffer): void {
    let message: JsonRpcMessage;
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      message = JSON.parse(text) as JsonRpcMessage;
    } catch {
      return;
    }

    // 通知（无 id）：可能是推送或 Server -> Client 通知
    if (!("id" in message)) {
      const notification = message as JsonRpcNotification;
      // 按 method 字段匹配推送通道（运行时检查）
      this.dispatchPush(notification.method as WsPushChannel, notification.params);
      return;
    }

    // 响应（有 id）：匹配到待处理请求
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
