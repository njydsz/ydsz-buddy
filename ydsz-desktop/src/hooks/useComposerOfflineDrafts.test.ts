/**
 * @file useComposerOfflineDrafts 单元测试
 *
 * 覆盖关键场景：
 * - 5 秒防抖写入
 * - localStorage 容量边界
 * - 跨线程隔离
 * - 草稿恢复
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ThreadId } from "~/contracts";
import { useComposerOfflineDrafts, type UseComposerOfflineDraftsResult } from "./useComposerOfflineDrafts";

// 让 happy-dom 下 React 18 的 act() 正常工作
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE_KEY = "ydsz-buddy.composer.offline-drafts.v1";

function clearStorage() {
  window.localStorage.clear();
}

function setStorage(drafts: unknown[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

function getStorage(): unknown[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as unknown[]) : [];
}

interface HookHandle {
  result: UseComposerOfflineDraftsResult;
  unmount: () => void;
}

/**
 * 挂载 hook 并暴露一个 handle。
 *
 * 关键：`result` 是 getter，不能在 setup 时解构出来——解构会拿到当时的 `captured` 快照，
 * 而 React 每次 re-render 都会返回新的 hook result 对象。必须通过 `handle.result` 实时访问。
 */
function setupHook(threadId: ThreadId | null): HookHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let captured: UseComposerOfflineDraftsResult | null = null;
  const handle: HookHandle = {
    get result() {
      if (!captured) throw new Error("hook not yet rendered");
      return captured;
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
  function Probe() {
    captured = useComposerOfflineDrafts(threadId);
    return null;
  }
  act(() => {
    root.render(createElement(Probe));
  });
  return handle;
}

describe("useComposerOfflineDrafts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearStorage();
  });

  it("should debounce 5 seconds before persisting to localStorage", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => handle.result.saveDraft("hello"));
    expect(getStorage()).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(getStorage()).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getStorage()).toHaveLength(1);
    expect((getStorage()[0] as { content: string }).content).toBe("hello");
    handle.unmount();
  });

  it("should overwrite previous draft in same thread", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => handle.result.saveDraft("first"));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    act(() => handle.result.saveDraft("second"));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    const all = getStorage();
    expect(all).toHaveLength(1);
    expect((all[0] as { content: string }).content).toBe("second");
    handle.unmount();
  });

  it("should isolate drafts per thread", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const captured: Record<string, UseComposerOfflineDraftsResult> = {};
    function Probe({ tid }: { tid: ThreadId }) {
      captured[tid] = useComposerOfflineDrafts(tid);
      return null;
    }

    act(() => {
      root.render(createElement(Probe, { tid: "thread-1" as ThreadId }));
    });
    act(() => captured["thread-1"]!.saveDraft("content of thread 1"));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    act(() => {
      root.render(createElement(Probe, { tid: "thread-2" as ThreadId }));
    });
    act(() => captured["thread-2"]!.saveDraft("content of thread 2"));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    const all = getStorage() as Array<{ threadId: string; content: string }>;
    expect(all).toHaveLength(2);
    expect(all.find((d) => d.threadId === "thread-1")?.content).toBe("content of thread 1");
    expect(all.find((d) => d.threadId === "thread-2")?.content).toBe("content of thread 2");

    act(() => root.unmount());
    container.remove();
  });

  it("should truncate content exceeding 16KB", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);
    const huge = "x".repeat(20_000);

    act(() => handle.result.saveDraft(huge));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    const all = getStorage() as Array<{ content: string }>;
    expect(all).toHaveLength(1);
    expect(all[0]!.content.length).toBe(16 * 1024);
    handle.unmount();
  });

  it("should remove draft on demand", () => {
    const threadId = "thread-1" as ThreadId;
    setStorage([
      { id: "a", threadId, content: "alpha", createdAt: 1, updatedAt: 1 },
      { id: "b", threadId, content: "beta", createdAt: 2, updatedAt: 2 },
    ]);
    const handle = setupHook(threadId);
    expect(handle.result.drafts).toHaveLength(2);

    act(() => handle.result.removeDraft("a"));
    expect(handle.result.drafts).toHaveLength(1);
    expect(handle.result.drafts[0]?.id).toBe("b");
    handle.unmount();
  });

  it("should flush immediately when flushDraft is called", () => {
    const threadId = "thread-1" as ThreadId;
    const handle = setupHook(threadId);

    act(() => handle.result.saveDraft("debounced"));
    act(() => handle.result.flushDraft("flushed"));
    expect(getStorage()).toHaveLength(1);
    expect((getStorage()[0] as { content: string }).content).toBe("flushed");
    handle.unmount();
  });

  it("should report totalCount for cross-thread draft badge", () => {
    setStorage([
      { id: "a", threadId: "thread-1" as ThreadId, content: "a", createdAt: 1, updatedAt: 1 },
      { id: "b", threadId: "thread-2" as ThreadId, content: "b", createdAt: 1, updatedAt: 1 },
      { id: "c", threadId: "thread-3" as ThreadId, content: "c", createdAt: 1, updatedAt: 1 },
    ]);
    const handle = setupHook("thread-1" as ThreadId);
    expect(handle.result.totalCount).toBe(3);
    expect(handle.result.drafts).toHaveLength(1);
    expect(handle.result.hasDrafts).toBe(true);
    handle.unmount();
  });

  // ─── 页面隐藏 / 关闭场景 ────────────────────────────────────────────────────
  describe("page hide / unload flush", () => {
    it("flushes pending draft on pagehide before debounce window", () => {
      const threadId = "thread-1" as ThreadId;
      const handle = setupHook(threadId);
      act(() => handle.result.saveDraft("fresh input"));

      // 此时仍在 5s 防抖窗口内，不应写入
      expect(getStorage()).toHaveLength(0);

      // 触发 pagehide，立即落盘
      act(() => {
        window.dispatchEvent(new Event("pagehide"));
      });
      const all = getStorage() as Array<{ content: string; threadId: string }>;
      expect(all).toHaveLength(1);
      expect(all[0]!.content).toBe("fresh input");
      expect(all[0]!.threadId).toBe(threadId);
      handle.unmount();
    });

    it("flushes pending draft on beforeunload", () => {
      const threadId = "thread-1" as ThreadId;
      const handle = setupHook(threadId);
      act(() => handle.result.saveDraft("typed fast"));

      expect(getStorage()).toHaveLength(0);
      act(() => {
        window.dispatchEvent(new Event("beforeunload"));
      });
      const all = getStorage() as Array<{ content: string }>;
      expect(all[0]!.content).toBe("typed fast");
      handle.unmount();
    });

    it("flushes pending draft on visibilitychange to hidden", () => {
      const threadId = "thread-1" as ThreadId;
      const handle = setupHook(threadId);
      act(() => handle.result.saveDraft("before switch tab"));

      expect(getStorage()).toHaveLength(0);
      act(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const all = getStorage() as Array<{ content: string }>;
      expect(all[0]!.content).toBe("before switch tab");
      handle.unmount();
    });

    it("does not throw when there is no pending content", () => {
      const handle = setupHook("thread-1" as ThreadId);
      expect(() => {
        act(() => {
          window.dispatchEvent(new Event("pagehide"));
        });
      }).not.toThrow();
      handle.unmount();
    });

    it("removes pagehide listener on unmount", () => {
      const threadId = "thread-1" as ThreadId;
      const handle = setupHook(threadId);
      act(() => handle.result.saveDraft("before unmount"));
      handle.unmount();

      // 重新挂载，验证不重复触发：pagehide 不应再写入
      clearStorage();
      window.dispatchEvent(new Event("pagehide"));
      expect(getStorage()).toHaveLength(0);
    });
  });
});
