/**
 * 移动端遥控器 — 桌面端 WebSocket 桥接
 *
 * 移动端 (ydsz-mobile) 通过 WebSocket 连接桌面端嵌入服务器，
 * 实现跨设备会话查看、审批响应、定时任务触发等"遥控器"功能。
 *
 * 对标 Octop 移动端方案 (Octop App) — 但更轻量化，定位为
 * 桌面端（主战场）的辅助控制面板。
 */

/** WebSocket 连接配置 */
interface BridgeConfig {
  serverUrl: string;   // 桌面端 ws://host:port
  authToken?: string;  // 未来 JWT 鉴权
  reconnectInterval: number;  // 重连间隔 ms
}

/** 桥接事件类型 */
export type BridgeEventType =
  | 'session.created'
  | 'session.updated'
  | 'approval.requested'
  | 'approval.resolved'
  | 'thread.new_message'
  | 'scheduler.task_fired'
  | 'scheduler.task_finished'
  | 'connection.status_changed';

export interface BridgeEvent {
  type: BridgeEventType;
  payload: unknown;
  timestamp: string;
}

type EventHandler = (event: BridgeEvent) => void;

const DEFAULT_CONFIG: BridgeConfig = {
  serverUrl: 'ws://127.0.0.1:1729',
  reconnectInterval: 5000,
};

/**
 * 初始化桌面端桥接
 *
 * 建立 WebSocket 连接、注册心跳、加载已有会话列表。
 */
export async function initBridge(config: Partial<BridgeConfig> = {}): Promise<void> {
  const merged = { ...DEFAULT_CONFIG, ...config };
  // TODO: 建立 WS 连接
  // TODO: 发送 auth 握手
  // TODO: 订阅事件频道
  console.log('[Bridge] 初始化桥接:', merged.serverUrl);
}

/** 获取桌面端活跃会话列表 */
export async function getSessions(): Promise<unknown[]> {
  // TODO: WS RPC call → ydzs-server thread_list
  console.log('[Bridge] 获取会话列表 (stub)');
  return [];
}

/** 从移动端响应审批请求 */
export async function sendApprovalResponse(
  requestId: string,
  approved: boolean,
): Promise<void> {
  // TODO: WS RPC call → ydzs-server approval_respond
  console.log('[Bridge] 响应审批:', requestId, approved);
}

/** 订阅桌面端事件推送 */
export function subscribeToEvents(_callback: EventHandler): () => void {
  // TODO: 注册事件监听器 + 返回取消订阅函数
  return () => { /* unsubscribe */ };
}

/** 关闭桥接连接 */
export async function disconnectBridge(): Promise<void> {
  // TODO: 关闭 WS 连接
  console.log('[Bridge] 断开连接');
}

/** 打开移动端 Quick Chat */
export async function quickChat(message: string): Promise<string> {
  // TODO: WS RPC call → ydzs-server turn_queue
  console.log('[Bridge] 快捷消息:', message);
  return 'stub-response';
}
