/**
 * @file 网络状态 Hook
 *
 * 本 Hook 监听浏览器/系统网络状态变化，提供在线/离线状态感知。
 *
 * ## 核心功能
 *
 * - **实时监听**：监听 online/offline 事件
 * - **初始状态**：启动时读取 navigator.onLine
 * - **状态回调**：状态变化时触发 `onStatusChange`
 * - **可手动覆盖**：通过 `markOnline` / `markOffline` / `markDegraded` 修正状态
 *
 * ## 使用场景
 *
 * - 全局网络状态指示器
 * - Provider 降级模式触发
 * - 发送消息前的网络检查
 * - 离线 Drafts 模式：检测到离线时暂存消息，恢复后自动补发
 *
 * ## 注意事项
 *
 * - Tauri 桌面端 navigator.onLine 始终为 true，需结合心跳检测
 * - 降级模式不阻断本地功能（文件浏览、历史记录查看等）
 * - 手动覆盖的状态比 navigator.onLine 优先级更高，可由 Provider 心跳修正
 */

import { useEffect, useSyncExternalStore, useCallback, useRef } from "react";
import { create, type StoreApi } from "zustand";

/** 网络状态 */
export type NetworkStatus = "online" | "offline" | "degraded";

export interface NetworkState {
  status: NetworkStatus;
  lastChangeAt: number | null;
}

interface NetworkStore extends NetworkState {
  setStatus: (next: NetworkStatus | ((prev: NetworkStatus) => NetworkStatus)) => void;
}

function readNavigatorStatus(): NetworkStatus {
  if (typeof navigator === "undefined") return "online";
  return navigator.onLine ? "online" : "offline";
}

// 缓存 NetworkState 引用:zustand 状态未变时,getSnapshot 必须返回完全相同的对象
// 否则 useSyncExternalStore 会判定 snapshot 变化,触发无限循环。
let cachedSnapshot: NetworkState = {
  status: readNavigatorStatus(),
  lastChangeAt: null,
};

const networkStore: StoreApi<NetworkStore> = create<NetworkStore>((set) => ({
  status: readNavigatorStatus(),
  lastChangeAt: null,
  setStatus: (next) => {
    set((state) => {
      const resolvedStatus =
        typeof next === "function"
          ? (next as (prev: NetworkStatus) => NetworkStatus)(state.status)
          : next;
      if (resolvedStatus === state.status) return state;
      return { status: resolvedStatus, lastChangeAt: Date.now() };
    });
  },
}));

// 自定义 subscribe:仅在 status 变化时通知 listener
function subscribeStatus(listener: () => void): () => void {
  let previousStatus = networkStore.getState().status;
  return networkStore.subscribe((state: NetworkState) => {
    if (state.status !== previousStatus) {
      previousStatus = state.status;
      listener();
    }
  });
}

// 自定义 getSnapshot:仅暴露 NetworkState 字段,保持引用稳定
function getSnapshot(): NetworkState {
  const state = networkStore.getState();
  if (
    cachedSnapshot.status !== state.status ||
    cachedSnapshot.lastChangeAt !== state.lastChangeAt
  ) {
    cachedSnapshot = { status: state.status, lastChangeAt: state.lastChangeAt };
  }
  return cachedSnapshot;
}

// 浏览器/系统网络事件监听（只挂载一次）
let windowListenerInstalled = false;
function installWindowListener() {
  if (typeof window === "undefined" || windowListenerInstalled) return;
  windowListenerInstalled = true;
  const handleOnline = () => {
    networkStore.getState().setStatus("online");
  };
  const handleOffline = () => {
    networkStore.getState().setStatus("offline");
  };
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
}

/** Hook 选项 */
export interface UseNetworkStatusOptions {
  /** 状态变化时回调（去重后触发） */
  onStatusChange?: (status: NetworkStatus, previous: NetworkStatus) => void;
}

/** Hook 返回值 */
export interface UseNetworkStatusResult {
  /** 当前网络状态 */
  status: NetworkStatus;
  /** 是否离线 */
  isOffline: boolean;
  /** 是否降级（网络可用但 Provider 不可达） */
  isDegraded: boolean;
  /** 是否在线 */
  isOnline: boolean;
  /** 上次状态变化时间 */
  lastChangeAt: number | null;
  /** 手动标记为离线（Provider 心跳失败或网络断开时调用） */
  markOffline: () => void;
  /** 手动标记为降级（Provider 心跳失败时调用） */
  markDegraded: () => void;
  /** 恢复为在线 */
  markOnline: () => void;
}

export function useNetworkStatus(options: UseNetworkStatusOptions = {}): UseNetworkStatusResult {
  const { onStatusChange } = options;

  // 仅在客户端挂载时安装 window listener
  useEffect(() => {
    installWindowListener();
  }, []);

  // 使用 useSyncExternalStore 订阅网络状态
  const snapshot: NetworkState = useSyncExternalStore(
    subscribeStatus,
    getSnapshot,
    getSnapshot,
  );

  // 状态变化时调用 onStatusChange，用 ref 持有上一次状态
  const previousStatusRef = useRef<NetworkStatus>(snapshot.status);
  useEffect(() => {
    const previous = previousStatusRef.current;
    if (previous === snapshot.status) return;
    previousStatusRef.current = snapshot.status;
    onStatusChange?.(snapshot.status, previous);
  }, [onStatusChange, snapshot.status]);

  // 用 ref 模式提供稳定引用
  const markOnline = useCallback(() => {
    networkStore.getState().setStatus("online");
  }, []);
  const markOffline = useCallback(() => {
    networkStore.getState().setStatus("offline");
  }, []);
  const markDegraded = useCallback(() => {
    networkStore.getState().setStatus((prev: NetworkStatus) =>
      prev === "offline" ? prev : "degraded",
    );
  }, []);

  return {
    status: snapshot.status,
    isOffline: snapshot.status === "offline",
    isDegraded: snapshot.status === "degraded",
    isOnline: snapshot.status === "online",
    lastChangeAt: snapshot.lastChangeAt,
    markDegraded,
    markOffline,
    markOnline,
  };
}

// 暴露 store 供测试和高级场景使用
export const __testing = {
  reset: () => {
    const target = readNavigatorStatus();
    networkStore.setState({ status: target, lastChangeAt: null });
  },
  getStatus: () => networkStore.getState().status,
};
