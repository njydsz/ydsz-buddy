/**
 * @file threadDetailSubscriptionRetention.ts
 * @description 在路�?侧边栏切换期间保持最近使用的线程详情订阅处于活跃状态�? * 通过引用计数和延迟淘汰机制，避免频繁切换视图时反复建�?断开订阅�? * 从而减少网络开销和加载延迟�? *
 * 核心机制�? * - retain/release：引用计数管理，支持多个消费者同时持有同一订阅
 * - 延迟淘汰：引用计数归零后不立即释放，而是等待 15 分钟超时后再淘汰
 * - 容量限制：最多缓�?32 个订阅，超出时按最近访问时间淘汰空闲条�? * - 活跃保护：正在运行中的线程（�?idle/stopped 状态）不会被淘�? */

import type { ThreadId } from "~/contracts";
import { useSyncExternalStore } from "react";
import { useStore } from "./store";

/** 空闲订阅的淘汰延迟时间（15 分钟），引用计数归零后等待此时间再淘�?*/
const THREAD_DETAIL_RETENTION_EVICTION_MS = 15 * 60 * 1000;
/** 最大缓存的线程详情订阅数量，超出时�?LRU 策略淘汰空闲条目 */
const MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS = 32;

/**
 * 被保留的线程订阅条目，包含引用计数和淘汰调度信息�? */
type RetainedThreadEntry = {
  /** 当前持有该订阅的消费者数量，归零后进入淘汰倒计�?*/
  refCount: number;
  /** 最后一次被访问的时间戳（毫秒），用�?LRU 排序 */
  lastAccessedAt: number;
  /** 淘汰定时器，引用计数归零后设置的延迟淘汰计时�?*/
  evictionTimeout: ReturnType<typeof setTimeout> | null;
};

/** 线程 ID 到其保留条目的映射表 */
const retainedThreadEntries = new Map<ThreadId, RetainedThreadEntry>();
/** useSyncExternalStore 的订阅监听器集合 */
const listeners = new Set<() => void>();
/** 保留线程 ID 变更的监听器集合，接收最新的线程 ID 列表 */
const retainedThreadIdChangeListeners = new Set<(threadIds: readonly ThreadId[]) => void>();
/** 缓存的保留线�?ID 快照，避免每次调�?getSnapshot 时重新计�?*/
let cachedSnapshot: readonly ThreadId[] = [];

/** 通知所有监听器保留的线�?ID 列表已发生变�?*/
function emitChange(): void {
  cachedSnapshot = [...retainedThreadEntries.keys()];
  for (const listener of listeners) {
    listener();
  }
  for (const listener of retainedThreadIdChangeListeners) {
    listener(cachedSnapshot);
  }
}

/**
 * 判断指定线程是否处于非空闲状态（正在运行或有待处理事项）�? * 非空闲线程不应被淘汰，以保证用户可见的活跃状态不被意外中断�? *
 * @param threadId - 待检查的线程 ID
 * @returns 若线程处于非空闲状态则返回 true
 */
function isNonIdleThread(threadId: ThreadId): boolean {
  const state = useStore.getState();
  const sidebarThread = state.sidebarThreadSummaryById[threadId];

  if (sidebarThread) {
    if (
      sidebarThread.hasPendingApprovals ||
      sidebarThread.hasPendingUserInput ||
      sidebarThread.hasActionableProposedPlan ||
      sidebarThread.hasLiveTailWork
    ) {
      return true;
    }

    const orchestrationStatus = sidebarThread.session?.orchestrationStatus;
    if (
      orchestrationStatus &&
      orchestrationStatus !== "idle" &&
      orchestrationStatus !== "stopped"
    ) {
      return true;
    }

    if (sidebarThread.latestTurn?.state === "running") {
      return true;
    }
  }

  const thread = state.threads.find((candidate) => candidate.id === threadId);
  if (!thread) {
    return false;
  }

  const orchestrationStatus = thread.session?.orchestrationStatus;
  return (
    Boolean(
      orchestrationStatus && orchestrationStatus !== "idle" && orchestrationStatus !== "stopped",
    ) ||
    thread.latestTurn?.state === "running" ||
    thread.pendingSourceProposedPlan !== undefined
  );
}

/**
 * 判断指定条目是否应被淘汰�? * 仅当引用计数�?0 且线程处于空闲状态时才可淘汰�? *
 * @param threadId - 线程 ID
 * @param entry - 保留条目
 * @returns 若应被淘汰则返回 true
 */
function shouldEvictEntry(threadId: ThreadId, entry: RetainedThreadEntry): boolean {
  return entry.refCount === 0 && !isNonIdleThread(threadId);
}

/** 清除条目上的淘汰定时�?*/
function clearEvictionTimeout(entry: RetainedThreadEntry): void {
  if (entry.evictionTimeout === null) {
    return;
  }
  clearTimeout(entry.evictionTimeout);
  entry.evictionTimeout = null;
}

/**
 * 为指定条目安排延迟淘汰。先清除已有定时器，再设置新的延迟淘汰计时�? * 若条目不应被淘汰（引用计�?> 0 或线程活跃），则不设置定时器�? *
 * @param threadId - 线程 ID
 * @param entry - 保留条目
 */
function scheduleEviction(threadId: ThreadId, entry: RetainedThreadEntry): void {
  clearEvictionTimeout(entry);
  if (!shouldEvictEntry(threadId, entry)) {
    return;
  }
  entry.evictionTimeout = setTimeout(() => {
    const currentEntry = retainedThreadEntries.get(threadId);
    if (!currentEntry || !shouldEvictEntry(threadId, currentEntry)) {
      return;
    }
    retainedThreadEntries.delete(threadId);
    emitChange();
  }, THREAD_DETAIL_RETENTION_EVICTION_MS);
}

/**
 * 当缓存数量超过最大限制时，按最近访问时间从早到晚淘汰空闲条目，
 * 直到缓存数量降至最大限制以内�? */
function evictIdleEntriesToCapacity(): void {
  if (retainedThreadEntries.size <= MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS) {
    return;
  }

  const idleEntries = [...retainedThreadEntries.entries()]
    .filter((entry): entry is [ThreadId, RetainedThreadEntry] =>
      shouldEvictEntry(entry[0], entry[1]),
    )
    .toSorted((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt);

  for (const [threadId] of idleEntries) {
    if (retainedThreadEntries.size <= MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS) {
      return;
    }
    const entry = retainedThreadEntries.get(threadId);
    if (!entry || !shouldEvictEntry(threadId, entry)) {
      continue;
    }
    clearEvictionTimeout(entry);
    retainedThreadEntries.delete(threadId);
    emitChange();
  }
}

/**
 * 重新审视所有保留条目的淘汰状态�? * �?Store 状态变化时调用，确保之前因活跃而无法淘汰的条目
 * 在变为空闲后能正确进入淘汰倒计时�? */
function reconcileRetentionEntries(): void {
  for (const [threadId, entry] of retainedThreadEntries) {
    clearEvictionTimeout(entry);
    if (shouldEvictEntry(threadId, entry)) {
      scheduleEviction(threadId, entry);
    }
  }
  evictIdleEntriesToCapacity();
}

/** 监听 Store 变化，在线程状态改变时重新审视淘汰策略 */
useStore.subscribe(() => {
  reconcileRetentionEntries();
});

/**
 * 保留指定线程的详情订阅（引用计数 +1）�? * 若该线程尚未被保留，则创建新的保留条目；若已存在，则增加引用计数并清除淘汰定时器�? *
 * @param threadId - 需要保留订阅的线程 ID
 * @returns 释放函数，调用时将引用计�?-1（releaseThreadDetailSubscription 的快捷方式）
 *
 * @example
 * ```ts
 * const release = retainThreadDetailSubscription("thread-123");
 * // ... 使用线程详情数据
 * release(); // 不再需要时释放
 * ```
 */
export function retainThreadDetailSubscription(threadId: ThreadId): () => void {
  const existing = retainedThreadEntries.get(threadId);
  if (existing) {
    clearEvictionTimeout(existing);
    existing.refCount += 1;
    existing.lastAccessedAt = Date.now();
    return () => releaseThreadDetailSubscription(threadId);
  }

  retainedThreadEntries.set(threadId, {
    refCount: 1,
    lastAccessedAt: Date.now(),
    evictionTimeout: null,
  });
  emitChange();
  evictIdleEntriesToCapacity();

  return () => releaseThreadDetailSubscription(threadId);
}

/**
 * 释放指定线程的详情订阅（引用计数 -1）�? * 引用计数归零后进入延迟淘汰倒计时，不会立即移除�? *
 * @param threadId - 需要释放订阅的线程 ID
 */
export function releaseThreadDetailSubscription(threadId: ThreadId): void {
  const entry = retainedThreadEntries.get(threadId);
  if (!entry) {
    return;
  }

  entry.refCount = Math.max(0, entry.refCount - 1);
  entry.lastAccessedAt = Date.now();
  if (entry.refCount > 0) {
    return;
  }

  scheduleEviction(threadId, entry);
  evictIdleEntriesToCapacity();
}

/**
 * 订阅保留线程 ID 列表变化的监听器（用�?useSyncExternalStore）�? *
 * @param listener - 当保留列表变化时调用的回调函�? * @returns 取消订阅的函�? */
export function subscribeRetainedThreadDetailIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 订阅保留线程 ID 列表变化的监听器（带参数版本）�? * 回调函数接收最新的保留线程 ID 列表作为参数�? *
 * @param listener - 当保留列表变化时调用的回调函数，参数为最新的线程 ID 列表
 * @returns 取消订阅的函�? */
export function subscribeRetainedThreadDetailIdChanges(
  listener: (threadIds: readonly ThreadId[]) => void,
): () => void {
  retainedThreadIdChangeListeners.add(listener);
  return () => {
    retainedThreadIdChangeListeners.delete(listener);
  };
}

/**
 * 获取当前保留的线�?ID 列表快照（用�?useSyncExternalStore �?getSnapshot）�? *
 * @returns 当前保留的线�?ID 只读数组
 */
export function getRetainedThreadDetailIdsSnapshot(): readonly ThreadId[] {
  return cachedSnapshot;
}

/**
 * React Hook：获取当前保留的线程详情订阅 ID 列表�? * 基于 useSyncExternalStore 实现，当保留列表变化时自动触发重渲染�? *
 * @returns 当前保留的线�?ID 只读数组
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const retainedIds = useRetainedThreadDetailIds();
 *   return <div>保留的线程数: {retainedIds.length}</div>;
 * }
 * ```
 */
export function useRetainedThreadDetailIds(): readonly ThreadId[] {
  return useSyncExternalStore(
    subscribeRetainedThreadDetailIds,
    getRetainedThreadDetailIdsSnapshot,
    getRetainedThreadDetailIdsSnapshot,
  );
}

/**
 * 重置所有保留的线程详情订阅（仅用于测试）�? * 清除所有淘汰定时器并清空保留条目，触发变更通知�? */
export function resetRetainedThreadDetailSubscriptionsForTests(): void {
  for (const entry of retainedThreadEntries.values()) {
    clearEvictionTimeout(entry);
  }
  retainedThreadEntries.clear();
  emitChange();
}
