/**
 * @file useFailoverDraftGuard Hook 单元测试
 *
 * 覆盖目标：
 * - 监听 FailoverEvent 触发草稿保存
 * - 初始化时不触发（避免误保存空内容）
 * - 多次切换 Provider 时多次保存
 * - threadId 为 null 时不生效
 * - enabled=false 时不生效
 * - 空 prompt 不触发草稿保存
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { ThreadId } from "@ydsz-buddy/contracts";

const THREAD_ID = ThreadId.makeUnsafe("thread-1");

// Mock useComposerOfflineDrafts
const mockFlushDraft = vi.fn();
const mockDrafts: Array<{ id: string; content: string; threadId: string }> = [];
vi.mock("./useComposerOfflineDrafts", () => ({
  useComposerOfflineDrafts: () => ({
    drafts: mockDrafts,
    hasDrafts: mockDrafts.length > 0,
    saveDraft: vi.fn(),
    flushDraft: mockFlushDraft,
    removeDraft: vi.fn(),
    clearDrafts: vi.fn(),
    totalCount: mockDrafts.length,
  }),
}));

// Mock useNetworkStatus
const mockMarkDegraded = vi.fn();
let mockIsOffline = false;
vi.mock("./useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isOffline: mockIsOffline,
    isOnline: !mockIsOffline,
    markOnline: vi.fn(),
    markDegraded: mockMarkDegraded,
    markOffline: vi.fn(),
  }),
}));

// Mock useAutoProviderFailover context provider
let mockHistory: Array<{ from: string; to: string; reason: string; at: number }> = [];
const mockRecordFailure = vi.fn();
const mockRecordSuccess = vi.fn();
const mockSwitchTo = vi.fn();
const mockSetMonitoring = vi.fn();
const mockReset = vi.fn();
let mockActiveProvider = "codex";
let mockIsMonitoring = true;

vi.mock("./useAutoProviderFailover", () => ({
  useAutoProviderFailover: () => ({
    activeProvider: mockActiveProvider,
    failureCounts: { codex: 0 },
    history: mockHistory,
    isMonitoring: mockIsMonitoring,
    recordFailure: mockRecordFailure,
    recordSuccess: mockRecordSuccess,
    switchTo: mockSwitchTo,
    setMonitoring: mockSetMonitoring,
    reset: mockReset,
  }),
}));

import { useFailoverDraftGuard } from "./useFailoverDraftGuard";

beforeEach(() => {
  mockHistory = [];
  mockDrafts.length = 0;
  mockIsOffline = false;
  mockActiveProvider = "codex";
  mockIsMonitoring = true;
  mockFlushDraft.mockReset();
  mockMarkDegraded.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useFailoverDraftGuard", () => {
  it("初始 history 为空时不触发草稿保存", () => {
    const getCurrentPrompt = vi.fn(() => "hello world");
    const { result } = renderHook(
      () => useFailoverDraftGuard({ threadId: THREAD_ID, getCurrentPrompt }),
      { wrapper: ({ children }: { children: ReactNode }) => <>{children}</> },
    );
    expect(mockFlushDraft).not.toHaveBeenCalled();
    expect(result.current.draftCount).toBe(0);
  });

  it("新增 FailoverEvent 时调用 flushDraft 保存当前 prompt", () => {
    const getCurrentPrompt = vi.fn(() => "需要保存的内容");
    const { rerender } = renderHook(
      ({ getCurrentPrompt: g }) =>
        useFailoverDraftGuard({ threadId: THREAD_ID, getCurrentPrompt: g }),
      {
        wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
        initialProps: { getCurrentPrompt },
      },
    );
    // 模拟 Provider 切换
    act(() => {
      mockHistory = [
        { from: "codex", to: "claudeAgent", reason: "连续 3 次失败", at: Date.now() },
      ];
    });
    rerender({ getCurrentPrompt });
    expect(mockFlushDraft).toHaveBeenCalledWith("需要保存的内容");
  });

  it("多次切换 Provider 时多次保存", () => {
    const getCurrentPrompt = vi.fn(() => "current content");
    const { rerender } = renderHook(
      ({ getCurrentPrompt: g }) =>
        useFailoverDraftGuard({ threadId: THREAD_ID, getCurrentPrompt: g }),
      {
        wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
        initialProps: { getCurrentPrompt },
      },
    );
    act(() => {
      mockHistory = [
        { from: "codex", to: "claudeAgent", reason: "失败 1", at: 1 },
      ];
    });
    rerender({ getCurrentPrompt });
    act(() => {
      mockHistory = [
        ...mockHistory,
        { from: "claudeAgent", to: "cursor", reason: "失败 2", at: 2 },
      ];
    });
    rerender({ getCurrentPrompt });
    expect(mockFlushDraft).toHaveBeenCalledTimes(2);
  });

  it("threadId 为 null 时不生效", () => {
    const getCurrentPrompt = vi.fn(() => "content");
    const { rerender } = renderHook(
      ({ getCurrentPrompt: g }) =>
        useFailoverDraftGuard({ threadId: null, getCurrentPrompt: g }),
      {
        wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
        initialProps: { getCurrentPrompt },
      },
    );
    act(() => {
      mockHistory = [{ from: "codex", to: "claudeAgent", reason: "x", at: 1 }];
    });
    rerender({ getCurrentPrompt });
    expect(mockFlushDraft).not.toHaveBeenCalled();
  });

  it("enabled=false 时不生效", () => {
    const getCurrentPrompt = vi.fn(() => "content");
    const { rerender } = renderHook(
      ({ getCurrentPrompt: g }) =>
        useFailoverDraftGuard({
          threadId: THREAD_ID,
          getCurrentPrompt: g,
          enabled: false,
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
        initialProps: { getCurrentPrompt },
      },
    );
    act(() => {
      mockHistory = [{ from: "codex", to: "claudeAgent", reason: "x", at: 1 }];
    });
    rerender({ getCurrentPrompt });
    expect(mockFlushDraft).not.toHaveBeenCalled();
  });

  it("空 prompt 不触发草稿保存", () => {
    const getCurrentPrompt = vi.fn(() => "");
    const { rerender } = renderHook(
      ({ getCurrentPrompt: g }) =>
        useFailoverDraftGuard({ threadId: THREAD_ID, getCurrentPrompt: g }),
      {
        wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
        initialProps: { getCurrentPrompt },
      },
    );
    act(() => {
      mockHistory = [{ from: "codex", to: "claudeAgent", reason: "x", at: 1 }];
    });
    rerender({ getCurrentPrompt });
    expect(mockFlushDraft).not.toHaveBeenCalled();
  });

  it("纯空白 prompt 不触发草稿保存", () => {
    const getCurrentPrompt = vi.fn(() => "   \n  \t  ");
    const { rerender } = renderHook(
      ({ getCurrentPrompt: g }) =>
        useFailoverDraftGuard({ threadId: THREAD_ID, getCurrentPrompt: g }),
      {
        wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
        initialProps: { getCurrentPrompt },
      },
    );
    act(() => {
      mockHistory = [{ from: "codex", to: "claudeAgent", reason: "x", at: 1 }];
    });
    rerender({ getCurrentPrompt });
    expect(mockFlushDraft).not.toHaveBeenCalled();
  });

  it("非离线状态下切换 Provider 时会标记降级", () => {
    mockIsOffline = false;
    const getCurrentPrompt = vi.fn(() => "content");
    const { rerender } = renderHook(
      ({ getCurrentPrompt: g }) =>
        useFailoverDraftGuard({ threadId: THREAD_ID, getCurrentPrompt: g }),
      {
        wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
        initialProps: { getCurrentPrompt },
      },
    );
    act(() => {
      mockHistory = [{ from: "codex", to: "claudeAgent", reason: "x", at: 1 }];
    });
    rerender({ getCurrentPrompt });
    expect(mockMarkDegraded).toHaveBeenCalled();
  });

  it("已经离线时不重复标记降级", () => {
    mockIsOffline = true;
    const getCurrentPrompt = vi.fn(() => "content");
    const { rerender } = renderHook(
      ({ getCurrentPrompt: g }) =>
        useFailoverDraftGuard({ threadId: THREAD_ID, getCurrentPrompt: g }),
      {
        wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
        initialProps: { getCurrentPrompt },
      },
    );
    act(() => {
      mockHistory = [{ from: "codex", to: "claudeAgent", reason: "x", at: 1 }];
    });
    rerender({ getCurrentPrompt });
    expect(mockMarkDegraded).not.toHaveBeenCalled();
  });
});
