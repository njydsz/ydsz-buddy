/**
 * @file WebSocket 协议辅助类型与方法常量
 * @description 定义 Web 端与 ydsz-server 通信所需的 RPC 方法名、推送通道和
 *              编排层命令构造辅助函数。与 ydzs-desktop/src/contracts/ws.ts 保持一致。
 */

// ── RPC 方法名称 ──────────────────────────────────────────────────────

/** WebSocket RPC 方法名称（与 ydzs-desktop 共享） */
export const WS_METHODS = {
  // Orchestration
  orchestrationDispatchCommand: "orchestration.dispatchCommand",
  orchestrationGetSnapshot: "orchestration.getSnapshot",
  orchestrationSubscribeThread: "orchestration.subscribeThread",
  orchestrationUnsubscribeThread: "orchestration.unsubscribeThread",

  // Server meta
  serverGetConfig: "server.getConfig",
  serverGetEnvironment: "server.getEnvironment",
  serverGetSettings: "server.getSettings",
  serverUpdateSettings: "server.updateSettings",
} as const;

/** WebSocket RPC 方法名称类型 */
export type WsMethod = (typeof WS_METHODS)[keyof typeof WS_METHODS];

// ── 推送通道名称 ────────────────────────────────────────────────────────

/** WebSocket 推送通道名称 */
export const WS_CHANNELS = {
  serverWelcome: "server.welcome",
  serverConfigUpdated: "server.configUpdated",
  serverSettingsUpdated: "server.settingsUpdated",
  serverProviderStatusesUpdated: "server.providerStatusesUpdated",
  orchestrationThreadEvent: "orchestration.threadEvent",
  orchestrationDomainEvent: "orchestration.domainEvent",
  orchestrationShellEvent: "orchestration.shellEvent",
  gitActionProgress: "git.actionProgress",
  terminalEvent: "terminal.event",
} as const;

/** 推送通道名称类型 */
export type WsPushChannel = (typeof WS_CHANNELS)[keyof typeof WS_CHANNELS];

// ── 编排层命令构造辅助 ─────────────────────────────────────────────────

/** 生成唯一 ID */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** ISO 8601 时间戳 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 构造 thread.turn.start 命令（用户发送消息）
 * 对应后端 ClientThreadTurnStartCommand schema
 */
export function buildThreadTurnStartCommand(params: {
  threadId: string;
  text: string;
  /** 模型选择，不传则使用后端默认值 */
  modelSelection?: { provider: string; model: string };
}): Record<string, unknown> {
  const { threadId, text, modelSelection } = params;
  return {
    type: "thread.turn.start",
    commandId: generateId("cmd"),
    threadId,
    message: {
      messageId: generateId("msg"),
      role: "user",
      text,
      attachments: [],
    },
    ...(modelSelection ? { modelSelection } : {}),
    runtimeMode: "queue",
    interactionMode: "standard",
    createdAt: nowIso(),
  };
}

/**
 * 构造 thread.create 命令
 */
export function buildThreadCreateCommand(params: {
  projectId: string;
  title: string;
  modelSelection?: { provider: string; model: string };
}): Record<string, unknown> {
  const { projectId, title, modelSelection } = params;
  return {
    type: "thread.create",
    commandId: generateId("cmd"),
    threadId: generateId("thread"),
    projectId,
    title,
    ...(modelSelection ? { modelSelection } : {}),
    runtimeMode: "queue",
    interactionMode: "standard",
    createdAt: nowIso(),
  };
}

// ── 编排事件解析辅助 ───────────────────────────────────────────────────

/** 线程消息发送事件（从 domain event 中提取） */
export interface ThreadMessageSentPayload {
  threadId: string;
  messageId: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming: boolean;
  turnId?: string | null;
}

/**
 * 从域事件 payload 中解析 thread-sent 消息
 */
export function parseMessageSentEvent(event: {
  type?: string;
  payload?: Record<string, unknown>;
}): ThreadMessageSentPayload | null {
  if (event.type !== "thread.message-sent") return null;
  const p = event.payload ?? {};
  return {
    threadId: String(p.threadId ?? ""),
    messageId: String(p.messageId ?? ""),
    role: (p.role as "user" | "assistant" | "system") ?? "assistant",
    text: String(p.text ?? ""),
    streaming: Boolean(p.streaming),
    turnId: (p.turnId as string | null | undefined) ?? null,
  };
}

/**
 * 从编排层 threadEvent 推送数据中提取事件体
 * 推送数据结构: { kind: "event", event: { type, threadId, payload, ... } }
 * 或 { kind: "snapshot", snapshot: {...} }
 */
export function extractThreadEvent(
  data: unknown,
): { type: string; threadId: string; payload: Record<string, unknown> } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  // 如果是 stream item 包装，提取内部 event
  if (d.kind === "event" && d.event && typeof d.event === "object") {
    const ev = d.event as Record<string, unknown>;
    return {
      type: String(ev.type ?? ""),
      threadId: String(ev.threadId ?? ""),
      payload: (ev.payload as Record<string, unknown>) ?? {},
    };
  }

  // 直传格式
  if (d.type && typeof d.type === "string") {
    return {
      type: String(d.type ?? ""),
      threadId: String(d.threadId ?? ""),
      payload: (d.payload as Record<string, unknown>) ?? d,
    };
  }

  return null;
}
