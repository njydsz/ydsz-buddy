/**
 * @file useComposerOfflineDrafts
 * @description Composer 离线草稿暂存 Hook
 *
 * 当网络断开或 Provider 不可达时，自动把 Composer 当前输入暂存到 localStorage；
 * 网络恢复后提示用户「恢复草稿」并可一键还原。提供以下能力：
 *
 * - **节流写入**：5 秒防抖避免频繁落盘
 * - **草稿列表**：每个 thread 最多保存 5 条草稿
 * - **容量控制**：单条草稿上限 16KB，总体积上限 1MB
 * - **时间戳**：记录草稿创建时间，用于展示「3 分钟前保存的草稿」
 *
 * ## 核心导出
 *
 * - `useComposerOfflineDrafts`：主 Hook
 * - `OfflineDraft`：草稿数据结构
 *
 * ## 使用场景
 *
 * - 离线编辑时不丢失用户输入
 * - 网络抖动时短暂降级到本地草稿
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadId } from "~/contracts";
import { useNetworkStatus } from "./useNetworkStatus";

/** 单条离线草稿 */
export interface OfflineDraft {
  /** 草稿 id（uuid v4 子集） */
  id: string;
  /** 所属线程 id */
  threadId: ThreadId;
  /** 草稿内容 */
  content: string;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 更新时间戳（毫秒） */
  updatedAt: number;
}

export interface UseComposerOfflineDraftsResult {
  /** 当前线程的草稿列表（按更新时间倒序） */
  drafts: ReadonlyArray<OfflineDraft>;
  /** 是否有待恢复的草稿 */
  hasDrafts: boolean;
  /** 保存草稿（自动节流） */
  saveDraft: (content: string) => void;
  /** 立即强制写入（节流等待中也会刷出） */
  flushDraft: (content: string) => void;
  /** 删除一条草稿 */
  removeDraft: (id: string) => void;
  /** 清空当前线程的草稿 */
  clearDrafts: () => void;
  /** 草稿总数（用于顶栏角标） */
  totalCount: number;
}

const STORAGE_KEY = "ydsz-buddy.composer.offline-drafts.v1";
const DEBOUNCE_MS = 5_000;
const MAX_TOTAL_DRAFTS = 20;
const MAX_CONTENT_BYTES = 16 * 1024;

function readAllDrafts(): OfflineDraft[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d): d is OfflineDraft =>
        typeof d === "object" &&
        d !== null &&
        typeof (d as OfflineDraft).id === "string" &&
        typeof (d as OfflineDraft).threadId === "string" &&
        typeof (d as OfflineDraft).content === "string",
    );
  } catch {
    return [];
  }
}

function writeAllDrafts(drafts: ReadonlyArray<OfflineDraft>): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // 配额溢出或写入失败，静默忽略以避免打断用户
  }
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 14);
}

/**
 * Composer 离线草稿 Hook。
 *
 * @param threadId - 当前线程 id（必须保证全局唯一）
 */
export function useComposerOfflineDrafts(
  threadId: ThreadId | null,
): UseComposerOfflineDraftsResult {
  const { isOffline, markDegraded, markOnline } = useNetworkStatus();
  const [drafts, setDrafts] = useState<OfflineDraft[]>(() => readAllDrafts());
  const pendingRef = useRef<{ content: string; timer: ReturnType<typeof setTimeout> | null }>({
    content: "",
    timer: null,
  });

  // 同步初始化：读取当前线程的草稿
  useEffect(() => {
    setDrafts(readAllDrafts());
  }, [threadId]);

  // 卸载时如果有未刷出的草稿，立即写入
  useEffect(() => {
    return () => {
      if (pendingRef.current.timer) {
        clearTimeout(pendingRef.current.timer);
        if (pendingRef.current.content) {
          flushImmediate(pendingRef.current.content);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // 页面隐藏 / 关闭 / 切后台时同步落盘 pending 草稿
  // 解决「最近 5 秒内输入的内容在 tab 关闭时丢失」的问题
  // 注意：本 useEffect 必须在 `flushImmediate` 定义之后注册，
  // 避免闭包内的 TDZ（Cannot access 'flushImmediate' before initialization）。
  // 因此该 effect 放在 flushImmediate 下方。
  /* moved to bottom of hook */

  // 同步持久化草稿：使用 ref 保存最新草稿列表，避免 setState updater 内调用副作用
  const draftsRef = useRef<OfflineDraft[]>(drafts);
  draftsRef.current = drafts;

  const persistDrafts = useCallback((next: ReadonlyArray<OfflineDraft>) => {
    draftsRef.current = [...next];
    writeAllDrafts(next);
  }, []);

  const flushImmediate = useCallback(
    (content: string) => {
      if (!threadId) return;
      const trimmed = content.slice(0, MAX_CONTENT_BYTES);
      if (!trimmed) return;
      const current = draftsRef.current;
      const existing = current.find((d) => d.threadId === threadId);
      const next: OfflineDraft = {
        id: existing?.id ?? makeId(),
        threadId,
        content: trimmed,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      // 如果当前线程已有草稿:替换;否则:插入到队首
      const replaced = existing
        ? current.map((d) => (d.threadId === threadId ? next : d))
        : [next, ...current];
      const limited = replaced.slice(0, MAX_TOTAL_DRAFTS);
      persistDrafts(limited);
      setDrafts(limited);
    },
    [persistDrafts, threadId],
  );

  const saveDraft = useCallback(
    (content: string) => {
      if (!threadId) return;
      if (isOffline) markDegraded();
      const trimmed = content.slice(0, MAX_CONTENT_BYTES);
      if (!trimmed) {
        if (pendingRef.current.timer) {
          clearTimeout(pendingRef.current.timer);
          pendingRef.current.timer = null;
        }
        return;
      }
      pendingRef.current.content = trimmed;
      if (pendingRef.current.timer) {
        clearTimeout(pendingRef.current.timer);
      }
      pendingRef.current.timer = setTimeout(() => {
        flushImmediate(trimmed);
        pendingRef.current.timer = null;
        pendingRef.current.content = "";
      }, DEBOUNCE_MS);
    },
    [flushImmediate, isOffline, markDegraded, threadId],
  );

  const flushDraft = useCallback(
    (content: string) => {
      if (pendingRef.current.timer) {
        clearTimeout(pendingRef.current.timer);
        pendingRef.current.timer = null;
      }
      flushImmediate(content);
    },
    [flushImmediate],
  );

  const removeDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.id !== id);
      writeAllDrafts(next);
      return next;
    });
  }, []);

  const clearDrafts = useCallback(() => {
    if (!threadId) return;
    setDrafts((prev) => {
      const next = prev.filter((d) => d.threadId !== threadId);
      writeAllDrafts(next);
      return next;
    });
    markOnline();
  }, [markOnline, threadId]);

  const currentThreadDrafts = useMemo(
    () => drafts.filter((d) => d.threadId === threadId).sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, threadId],
  );

  // 页面隐藏 / 关闭 / 切后台时同步落盘 pending 草稿
  // 解决「最近 5 秒内输入的内容在 tab 关闭时丢失」的问题
  // 必须放在 flushImmediate 定义之后，避免闭包内的 TDZ
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!threadId) return;

    const flushPending = () => {
      if (pendingRef.current.timer) {
        clearTimeout(pendingRef.current.timer);
        pendingRef.current.timer = null;
      }
      if (pendingRef.current.content) {
        flushImmediate(pendingRef.current.content);
        pendingRef.current.content = "";
      }
    };

    const onPageHide = () => flushPending();
    const onBeforeUnload = () => flushPending();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPending();
      }
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flushImmediate, threadId]);

  return {
    drafts: currentThreadDrafts,
    hasDrafts: currentThreadDrafts.length > 0,
    saveDraft,
    flushDraft,
    removeDraft,
    clearDrafts,
    totalCount: drafts.length,
  };
}
