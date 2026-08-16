/**
 * @file useOfflineDraftAutoFlush.ts
 * @description 监听网络/Provider 状态变化，在恢复可用时按时间顺序自动补发离线草稿。
 *
 * ## 行为
 *
 * - **网络恢复时**：按 `createdAt` 升序逐条重发，每条之间留出 200ms 缓冲以避免突发流量
 * - **Provider 恢复时**：同样的顺序补发
 * - **重发失败时**：保留草稿在队列里，等待下一次状态变化再次尝试
 * - **重发中**：状态变为"补发中"避免重复触发；不阻塞后续草稿
 *
 * ## 配合
 *
 * 配合 `useNetworkStatus` 和 Provider 心跳一起使用。
 * 通常由 ChatView 顶层调用，传入当前活动线程与 `onSend` 回调。
 */

import { useCallback, useEffect, useRef } from "react";
import { useOfflineDraftStore, type OfflineDraftEntry } from "../offlineDraftStore";
import type { NetworkStatus } from "./useNetworkStatus";
import type { ServerProviderStatus } from "~/contracts";
import { isProviderUsable } from "../lib/providerAvailability";

/** 补发回调签名：补发一条草稿，返回是否成功 */
export type FlushOfflineDraftHandler = (entry: OfflineDraftEntry) => Promise<boolean>;

/** Hook 选项 */
export interface UseOfflineDraftAutoFlushOptions {
  /** 当前活动线程 ID（没有时不补发） */
  activeThreadId: string | null | undefined;
  /** 当前网络状态 */
  networkStatus: NetworkStatus;
  /** 当前 Provider 状态 */
  activeProviderStatus: ServerProviderStatus | null | undefined;
  /** 补发单条草稿的回调 */
  onFlush: FlushOfflineDraftHandler;
  /** 是否启用自动补发（默认 true） */
  enabled?: boolean;
}

const FLUSH_INTERVAL_MS = 200;
const FLUSH_RETRY_COOLDOWN_MS = 1500;

/**
 * 离线草稿自动补发 hook。
 *
 * @param options - hook 配置选项
 */
export function useOfflineDraftAutoFlush(options: UseOfflineDraftAutoFlushOptions): void {
  const {
    activeThreadId,
    networkStatus,
    activeProviderStatus,
    onFlush,
    enabled = true,
  } = options;

  const flushingRef = useRef<boolean>(false);
  const lastFlushAttemptAtRef = useRef<number>(0);
  // 使用 ref 持有最新的 onFlush 回调，避免回调引用变化导致 effect 重复触发
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const tryFlush = useCallback(async () => {
    if (!enabled || !activeThreadId) return;
    if (flushingRef.current) return;
    if (networkStatus === "offline") return;
    // Provider 不可用（authStatus=unauthenticated 或 available=false）时不补发
    if (activeProviderStatus && !isProviderUsable(activeProviderStatus)) return;

    const drafts = useOfflineDraftStore.getState().listForThread(activeThreadId);
    if (drafts.length === 0) return;

    // 限流：避免在快速恢复时短时间内多次触发
    const now = Date.now();
    if (now - lastFlushAttemptAtRef.current < FLUSH_RETRY_COOLDOWN_MS) {
      return;
    }
    lastFlushAttemptAtRef.current = now;

    flushingRef.current = true;
    try {
      // 按顺序逐条重发，失败则停止，等待下次状态变化
      for (const entry of drafts) {
        const success = await onFlushRef.current(entry);
        if (!success) {
          break;
        }
        // 补发成功则从队列移除
        useOfflineDraftStore.getState().remove(activeThreadId, entry.id);
        // 缓冲，避免突发流量
        await new Promise((resolve) => setTimeout(resolve, FLUSH_INTERVAL_MS));
      }
    } finally {
      flushingRef.current = false;
    }
  }, [activeThreadId, activeProviderStatus, enabled, networkStatus]);

  // 监听网络/Provider 状态变化
  useEffect(() => {
    // 离线时不补发
    if (networkStatus === "offline") return;
    if (activeProviderStatus && !isProviderUsable(activeProviderStatus)) return;
    if (!activeThreadId) return;
    void tryFlush();
  }, [activeProviderStatus, activeThreadId, networkStatus, tryFlush]);

  // 组件挂载时尝试补发一次（处理页面加载时已存在草稿的情况）
  useEffect(() => {
    void tryFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
