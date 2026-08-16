/**
 * @file useComposerWikiSearch Hook 测试
 *
 * 覆盖以下场景:
 *
 * 1. 非 mention 触发器 → items 为空数组
 * 2. mention 触发器但非 @wiki → items 为空数组
 * 3. mention 触发器 = @wiki 但无 workspaceRoot → 返回 hint:no-root
 * 4. mention 触发器 = @wiki 且有 root,但 query 为空 → 返回 hint:empty-query
 * 5. mention 触发器 = @wiki<query> → 触发 invoke,结果映射为 wiki-result
 * 6. 后端调用失败 → 返回 empty:error
 * 7. 防抖:cancel 后不调用
 *
 * 注:使用 `vi.useFakeTimers` + `vi.runAllTimersAsync` 配合
 *     `await flushPromises()` 处理 setTimeout 内的 microtask 链。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ComposerTrigger } from "../composer-logic";

// mock @tauri-apps/api/core,以便测试环境不依赖真实 Tauri runtime
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useComposerWikiSearch } from "./useComposerWikiSearch";

const SAMPLE_ENTRIES = [
  {
    module: "auth/login",
    title: "Auth Login",
    content: "# Auth Login\n- POST /api/auth/login",
    symbols: ["login", "verifyPassword"],
    updated_at: "2026-06-24T00:00:00Z",
  },
  {
    module: "auth/refresh",
    title: "Auth Refresh",
    content: "# Auth Refresh\n- POST /api/auth/refresh",
    symbols: ["refresh"],
    updated_at: "2026-06-24T00:00:00Z",
  },
];

function makeTrigger(query: string): ComposerTrigger {
  return {
    kind: "mention",
    query,
    rangeStart: 0,
    rangeEnd: query.length + 1,
  };
}

/**
 * 等待所有 pending microtask 完成(包括 setTimeout 内 promise.then 链)。
 */
async function flushPromises() {
  // 多次 await Promise.resolve() 以彻底 flush microtask 队列
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("useComposerWikiSearch", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty items when trigger is null", () => {
    const { result } = renderHook(() =>
      useComposerWikiSearch(null, "/workspace"),
    );
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("returns empty items when trigger is not a mention", () => {
    const trigger: ComposerTrigger = {
      kind: "skill",
      query: "auth",
      rangeStart: 0,
      rangeEnd: 5,
    };
    const { result } = renderHook(() =>
      useComposerWikiSearch(trigger, "/workspace"),
    );
    expect(result.current.items).toEqual([]);
  });

  it("returns no-root hint when mention is @wiki but root is empty", () => {
    const trigger = makeTrigger("wiki");
    const { result } = renderHook(() =>
      useComposerWikiSearch(trigger, null),
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("wiki-hint");
    expect(result.current.items[0]?.id).toBe("wiki-hint:no-root");
  });

  it("returns empty-query hint when @wiki is typed but no query follows", () => {
    const trigger = makeTrigger("wiki");
    const { result } = renderHook(() =>
      useComposerWikiSearch(trigger, "/workspace"),
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("wiki-hint");
    expect(result.current.items[0]?.id).toBe("wiki-hint:empty-query");
  });

  it("does not treat @wikipedia as a wiki mention", () => {
    const trigger = makeTrigger("wikipedia");
    const { result } = renderHook(() =>
      useComposerWikiSearch(trigger, "/workspace"),
    );
    // `wikipedia` 不以 `wiki ` 开头,故不匹配 @wiki
    expect(result.current.items).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("invokes repo_wiki_search after debounce when @wiki<query> is typed", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue({ count: 2, entries: SAMPLE_ENTRIES });
    const trigger = makeTrigger("wiki auth");

    const { result } = renderHook(() =>
      useComposerWikiSearch(trigger, "/workspace"),
    );

    // 等待防抖结束 + mock promise resolve + setState 落地
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(0);
      await flushPromises();
    });

    expect(invokeMock).toHaveBeenCalledWith("repo_wiki_search", {
      params: { root: "/workspace", query: "auth" },
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0]?.type).toBe("wiki-result");
    expect(result.current.items[0]?.module).toBe("auth/login");
    expect(result.current.items[1]?.symbols).toEqual(["refresh"]);
  });

  it("returns error empty item when backend throws", async () => {
    vi.useFakeTimers();
    invokeMock.mockRejectedValue(new Error("network down"));
    const trigger = makeTrigger("wiki auth");

    const { result } = renderHook(() =>
      useComposerWikiSearch(trigger, "/workspace"),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(0);
      await flushPromises();
    });

    expect(result.current.hasError).toBe(true);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("wiki-empty");
    expect(result.current.items[0]?.id).toBe("wiki-empty:error");
  });

  it("returns no-results empty item when backend returns empty list", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue({ count: 0, entries: [] });
    const trigger = makeTrigger("wiki missing");

    const { result } = renderHook(() =>
      useComposerWikiSearch(trigger, "/workspace"),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(0);
      await flushPromises();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("wiki-empty");
    expect(result.current.items[0]?.id).toBe("wiki-empty:no-results");
  });

  it("cancels in-flight search when query changes", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue({ count: 1, entries: SAMPLE_ENTRIES });
    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: ComposerTrigger }) =>
        useComposerWikiSearch(trigger, "/workspace"),
      { initialProps: { trigger: makeTrigger("wiki auth") } },
    );

    // 推进时间未到 debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(invokeMock).not.toHaveBeenCalled();

    // 重新渲染时切换 query,应取消之前的计时器
    rerender({ trigger: makeTrigger("wiki refresh") });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(0);
      await flushPromises();
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("repo_wiki_search", {
      params: { root: "/workspace", query: "refresh" },
    });

    // 最终结果应该是 refresh 搜索的结果
    expect(result.current.items[0]?.module).toBe("auth/login");
  });
});
