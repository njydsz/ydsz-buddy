/**
 * @file offlineDraftStore.ts
 * @description 离线 Drafts 模式的状态管理。
 *
 * 当网络断开或 Provider 不可达时，用户发送的消息会被暂存到「离线草稿」队列。
 * 网络恢复后，按 `createdAt` 时间顺序自动重发。
 *
 * ## 设计要点
 *
 * - **非持久化**：草稿不写入 localStorage，刷新页面后失效（与 session 绑定）
 * - **不阻塞本地操作**：暂存草稿只影响"发送"动作，编辑 Composer 不受影响
 * - **不与 queuedTurns 冲突**：queuedTurns 是"会话中活跃 Turn 的排队"，
 *   offlineDrafts 是"网络异常时本会话所有待补发的草稿"，两者生命周期不同
 * - **按线程分组**：每个 ThreadId 独立维护自己的离线草稿队列
 */

import { create } from "zustand";
import type { QueuedComposerChatTurn } from "./composerDraftStore";

/** 离线草稿条目（带客户端元数据） */
export interface OfflineDraftEntry extends QueuedComposerChatTurn {
  /** 入队时间戳（毫秒），用于联网后按时间顺序补发 */
  readonly enqueuedAt: number;
  /** 暂存原因（"offline" / "provider-unavailable"） */
  readonly reason: "offline" | "provider-unavailable";
}

export type OfflineDraftReason = OfflineDraftEntry["reason"];

/** 离线草稿 store 状态 */
export interface OfflineDraftStoreState {
  /** 按 ThreadId 分组的离线草稿 */
  draftsByThreadId: Record<string, OfflineDraftEntry[]>;
  /** 入队草稿（线程不存在时自动创建） */
  enqueue: (threadId: string, entry: OfflineDraftEntry) => void;
  /** 移除指定草稿（按 entry.id） */
  remove: (threadId: string, entryId: string) => void;
  /** 弹出最早的一条草稿（FIFO 顺序） */
  pop: (threadId: string) => OfflineDraftEntry | null;
  /** 查看最早的一条草稿，不移除 */
  peek: (threadId: string) => OfflineDraftEntry | null;
  /** 清空某个线程的所有草稿 */
  clearForThread: (threadId: string) => void;
  /** 统计某个线程的草稿数量 */
  countForThread: (threadId: string) => number;
  /** 列出某个线程的全部草稿(按 createdAt 升序) */
  listForThread: (threadId: string) => readonly OfflineDraftEntry[];
}

const EMPTY_LIST: readonly OfflineDraftEntry[] = Object.freeze([]) as readonly OfflineDraftEntry[];

function sortByCreatedAt(entries: OfflineDraftEntry[]): OfflineDraftEntry[] {
  return [...entries].sort((a, b) => {
    if (a.enqueuedAt === b.enqueuedAt) {
      return a.id.localeCompare(b.id);
    }
    return a.enqueuedAt - b.enqueuedAt;
  });
}

export const useOfflineDraftStore = create<OfflineDraftStoreState>((set, get) => ({
  draftsByThreadId: {},
  enqueue: (threadId, entry) => {
    if (!threadId) return;
    set((state) => {
      const existing = state.draftsByThreadId[threadId] ?? [];
      return {
        draftsByThreadId: {
          ...state.draftsByThreadId,
          [threadId]: [...existing, entry],
        },
      };
    });
  },
  remove: (threadId, entryId) => {
    if (!threadId || !entryId) return;
    set((state) => {
      const existing = state.draftsByThreadId[threadId];
      if (!existing) return state;
      const next = existing.filter((entry) => entry.id !== entryId);
      if (next.length === existing.length) return state;
      const nextDraftsByThreadId = { ...state.draftsByThreadId };
      if (next.length === 0) {
        delete nextDraftsByThreadId[threadId];
      } else {
        nextDraftsByThreadId[threadId] = next;
      }
      return { draftsByThreadId: nextDraftsByThreadId };
    });
  },
  pop: (threadId) => {
    const list = get().draftsByThreadId[threadId];
    if (!list || list.length === 0) return null;
    const [earliest, ...rest] = sortByCreatedAt(list);
    if (!earliest) return null;
    set((state) => {
      const nextDraftsByThreadId = { ...state.draftsByThreadId };
      if (rest.length === 0) {
        delete nextDraftsByThreadId[threadId];
      } else {
        nextDraftsByThreadId[threadId] = rest;
      }
      return { draftsByThreadId: nextDraftsByThreadId };
    });
    return earliest;
  },
  peek: (threadId) => {
    const list = get().draftsByThreadId[threadId];
    if (!list || list.length === 0) return null;
    const sorted = sortByCreatedAt(list);
    return sorted[0] ?? null;
  },
  clearForThread: (threadId) => {
    if (!threadId) return;
    set((state) => {
      if (!state.draftsByThreadId[threadId]) return state;
      const nextDraftsByThreadId = { ...state.draftsByThreadId };
      delete nextDraftsByThreadId[threadId];
      return { draftsByThreadId: nextDraftsByThreadId };
    });
  },
  countForThread: (threadId) => {
    return get().draftsByThreadId[threadId]?.length ?? 0;
  },
  listForThread: (threadId) => {
    const list = get().draftsByThreadId[threadId];
    if (!list || list.length === 0) return EMPTY_LIST;
    return sortByCreatedAt(list);
  },
}));

/** 选择器：获取某个线程的离线草稿数量 */
export function selectOfflineDraftCountForThread(
  state: OfflineDraftStoreState,
  threadId: string,
): number {
  return state.draftsByThreadId[threadId]?.length ?? 0;
}

/** 选择器：获取某个线程的全部离线草稿（按 createdAt 升序） */
export function selectOfflineDraftsForThread(
  state: OfflineDraftStoreState,
  threadId: string,
): readonly OfflineDraftEntry[] {
  const list = state.draftsByThreadId[threadId];
  if (!list || list.length === 0) return EMPTY_LIST;
  return sortByCreatedAt(list);
}
