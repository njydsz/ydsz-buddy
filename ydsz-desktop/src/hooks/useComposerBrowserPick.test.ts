/**
 * @file useComposerBrowserPick 单元测试
 *
 * 覆盖：
 * 1. trigger 为 null → items 为空
 * 2. mention 触发器但非 @browser → items 为空
 * 3. @browser 触发器 + 无 threadId → 返回 hint:no-thread
 * 4. @browser 触发器 + 有 threadId → 触发 browser_get_state,返回 result
 * 5. @browser 触发器 + query 关键词 → 按 title/url 过滤
 * 6. 后端 invoke 抛错 → 返回 empty:error
 * 7. 防抖:cancel 后不调用
 * 8. 空 tabs 列表 → 返回 empty:no-tabs
 * 9. 带 query 但无匹配 → 返回 empty:no-match
 * 10. active tab 排在最前
 * 11. @browser-foo 长前缀不会误匹配
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ComposerTrigger } from "../composer-logic";
import type { ThreadBrowserState } from "~/contracts";

// Mock @tauri-apps/api/core 的 invoke
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { useComposerBrowserPick } = await import("./useComposerBrowserPick");

function makeTrigger(query: string): ComposerTrigger {
  return { kind: "mention", query };
}

const SAMPLE_TABS: ThreadBrowserState["tabs"] = [
  { id: "tab-1", url: "https://example.com/dashboard", title: "Dashboard", status: "live", isLoading: false, canGoBack: false, canGoForward: false, faviconUrl: null, lastCommittedUrl: null, lastError: null },
  { id: "tab-2", url: "https://github.com/foo/bar", title: "GitHub - foo/bar", status: "live", isLoading: false, canGoBack: true, canGoForward: false, faviconUrl: null, lastCommittedUrl: null, lastError: null },
  { id: "tab-3", url: "https://example.com/settings", title: "Settings", status: "suspended", isLoading: false, canGoBack: true, canGoForward: false, faviconUrl: null, lastCommittedUrl: null, lastError: null },
];

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useComposerBrowserPick / trigger matching", () => {
  it("trigger 为 null 时 items 为空", () => {
    const { result } = renderHook(() =>
      useComposerBrowserPick(null, "thread-1"),
    );
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("mention 触发器但非 @browser → items 为空", () => {
    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("wiki"), "thread-1"),
    );
    expect(result.current.items).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("@browser-foo 长前缀不会误匹配", () => {
    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser-foo"), "thread-1"),
    );
    expect(result.current.items).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("@browser 触发器 + 无 threadId → 返回 hint:no-thread", () => {
    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser"), null),
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("browser-hint");
    expect(result.current.items[0]?.id).toBe("browser-hint:no-thread");
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("useComposerBrowserPick / fetch flow", () => {
  it("@browser 触发器 + 有 threadId → 触发 browser_get_state 并返回 result", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      threadId: "thread-1",
      version: 1,
      open: true,
      activeTabId: "tab-1",
      tabs: SAMPLE_TABS,
      lastError: null,
    } satisfies ThreadBrowserState);

    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser"), "thread-1"),
    );

    // 防抖期间 → loading hint
    expect(result.current.items[0]?.type).toBe("browser-hint");
    expect(result.current.items[0]?.id).toBe("browser-hint:loading");
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("browser_get_state", {
      input: { threadId: "thread-1" },
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toHaveLength(3);
    expect(result.current.items[0]?.type).toBe("browser-result");
    expect(result.current.items[0]?.active).toBe(true);
  });

  it("invoke 抛错 → 返回 empty:error", async () => {
    vi.useFakeTimers();
    invokeMock.mockRejectedValueOnce(new Error("backend not ready"));

    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser"), "thread-1"),
    );

    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(true);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("browser-empty");
    expect(result.current.items[0]?.id).toBe("browser-empty:error");
  });

  it("空 tabs 列表 → 返回 empty:no-tabs", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      threadId: "thread-1",
      version: 1,
      open: false,
      activeTabId: null,
      tabs: [],
      lastError: null,
    } satisfies ThreadBrowserState);

    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser"), "thread-1"),
    );

    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    expect(result.current.items[0]?.type).toBe("browser-empty");
    expect(result.current.items[0]?.id).toBe("browser-empty:no-tabs");
  });

  it("防抖:cancel 后不调用", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue({ tabs: [] });

    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: ComposerTrigger | null }) =>
        useComposerBrowserPick(trigger, "thread-1"),
      { initialProps: { trigger: makeTrigger("browser") as ComposerTrigger | null } },
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(invokeMock).not.toHaveBeenCalled();

    // 切到 null,清理 effect
    rerender({ trigger: null });
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });
});

describe("useComposerBrowserPick / filter & sort", () => {
  it("@browser <query> 关键词过滤(命中 title)", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      threadId: "thread-1",
      version: 1,
      open: true,
      activeTabId: null,
      tabs: SAMPLE_TABS,
      lastError: null,
    } satisfies ThreadBrowserState);

    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser settings"), "thread-1"),
    );

    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.title).toBe("Settings");
  });

  it("@browser <query> 关键词过滤(命中 url)", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      threadId: "thread-1",
      version: 1,
      open: true,
      activeTabId: null,
      tabs: SAMPLE_TABS,
      lastError: null,
    } satisfies ThreadBrowserState);

    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser github"), "thread-1"),
    );

    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.url).toContain("github");
  });

  it("带 query 但无匹配 → 返回 empty:no-match", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      threadId: "thread-1",
      version: 1,
      open: true,
      activeTabId: null,
      tabs: SAMPLE_TABS,
      lastError: null,
    } satisfies ThreadBrowserState);

    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser nonexistent-zzz"), "thread-1"),
    );

    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("browser-empty");
    expect(result.current.items[0]?.id).toBe("browser-empty:no-match:nonexistent-zzz");
  });

  it("active tab 排在最前", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      threadId: "thread-1",
      version: 1,
      open: true,
      activeTabId: "tab-2",
      tabs: SAMPLE_TABS,
      lastError: null,
    } satisfies ThreadBrowserState);

    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser"), "thread-1"),
    );

    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    expect(result.current.items[0]?.tabId).toBe("tab-2");
    expect(result.current.items[0]?.active).toBe(true);
    expect(result.current.items[0]?.description).toContain("活动");
  });

  it("active tab 描述带「活动」前缀,其他 tab 描述只显示 url", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce({
      threadId: "thread-1",
      version: 1,
      open: true,
      activeTabId: "tab-1",
      tabs: SAMPLE_TABS,
      lastError: null,
    } satisfies ThreadBrowserState);

    const { result } = renderHook(() =>
      useComposerBrowserPick(makeTrigger("browser"), "thread-1"),
    );

    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    const active = result.current.items.find((it) => it.active);
    const others = result.current.items.filter((it) => !it.active);
    expect(active?.description.startsWith("活动 · ")).toBe(true);
    expect(others[0]?.description).not.toContain("活动");
  });
});
