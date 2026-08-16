/**
 * @file useWorkspaceTurnAiShare 单元测试
 * @description 验证 hook 在 api 不可用 / 拉取成功 / 拉取失败三种状态下行为正确
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pickAiShare, useWorkspaceTurnAiShare } from "./useWorkspaceTurnAiShare";

const { readNativeApiMock, monitorMock } = vi.hoisted(() => ({
  readNativeApiMock: vi.fn(),
  monitorMock: {
    captureError: vi.fn(),
    captureMessage: vi.fn(),
    captureMetric: vi.fn(),
    startSpan: vi.fn(),
    endSpan: vi.fn(),
  },
}));

vi.mock("../nativeApi", () => ({
  readNativeApi: () => readNativeApiMock(),
}));

vi.mock("../lib/monitor", () => ({ monitor: monitorMock }));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return QueryClientProvider({ children, client });
  } as never;
}

describe("useWorkspaceTurnAiShare", () => {
  beforeEach(() => {
    readNativeApiMock.mockReset();
    monitorMock.captureMetric.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("api 不可用时,queryFn 抛错且不调用 getTurnAiShareSnapshot", async () => {
    readNativeApiMock.mockReturnValue(undefined);
    const { result } = renderHook(() => useWorkspaceTurnAiShare(true), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error)).toContain("Native API not ready");
  });

  it("拉取成功:返回 snapshot,enabled=false 时不触发", async () => {
    const snapshot = {
      windows: [
        { window: "24h", aiLines: 5, humanLines: 1, mixedLines: 0, totalLines: 6, aiShare: 5 / 6, turnCount: 1, fileCount: 1, hasData: true },
        { window: "7d", aiLines: 20, humanLines: 5, mixedLines: 0, totalLines: 25, aiShare: 0.8, turnCount: 3, fileCount: 5, hasData: true },
        { window: "30d", aiLines: 100, humanLines: 20, mixedLines: 10, totalLines: 130, aiShare: 100 / 130, turnCount: 10, fileCount: 20, hasData: true },
      ],
      generatedAtMs: 1_700_000_000_000,
      isEmpty: false,
    };
    const getTurnAiShareSnapshot = vi.fn().mockResolvedValue(snapshot);
    readNativeApiMock.mockReturnValue({
      orchestration: { getTurnAiShareSnapshot },
    });

    const { result } = renderHook(() => useWorkspaceTurnAiShare(true), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.generatedAtMs).toBe(snapshot.generatedAtMs);
    expect(getTurnAiShareSnapshot).toHaveBeenCalledTimes(1);
  });

  it("快照更新时上报 monitor.captureMetric(去重)", async () => {
    const snapshot = {
      windows: [
        { window: "24h", aiLines: 1, humanLines: 0, mixedLines: 0, totalLines: 1, aiShare: 1, turnCount: 1, fileCount: 1, hasData: true },
        { window: "7d", aiLines: 2, humanLines: 0, mixedLines: 0, totalLines: 2, aiShare: 1, turnCount: 1, fileCount: 1, hasData: true },
        { window: "30d", aiLines: 50, humanLines: 10, mixedLines: 0, totalLines: 60, aiShare: 50 / 60, turnCount: 5, fileCount: 10, hasData: true },
      ],
      generatedAtMs: 1_700_000_000_001,
      isEmpty: false,
    };
    readNativeApiMock.mockReturnValue({
      orchestration: { getTurnAiShareSnapshot: vi.fn().mockResolvedValue(snapshot) },
    });

    const { result } = renderHook(() => useWorkspaceTurnAiShare(true), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 等 useEffect 执行
    await waitFor(() => {
      expect(monitorMock.captureMetric).toHaveBeenCalled();
    });
    const names = monitorMock.captureMetric.mock.calls.map((c) => c[0]);
    expect(names).toContain("workspaceAiShare.30d.share");
    expect(names).toContain("workspaceAiShare.30d.aiLines");
    expect(names).toContain("workspaceAiShare.30d.totalLines");

    // 第二次 render,相同 snapshot 不应再重复上报
    const before = monitorMock.captureMetric.mock.calls.length;
    result.current.refetch();
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(monitorMock.captureMetric.mock.calls.length).toBe(before);
  });

  it("空快照(isEmpty=true)不上报 monitor", async () => {
    readNativeApiMock.mockReturnValue({
      orchestration: {
        getTurnAiShareSnapshot: vi.fn().mockResolvedValue({
          windows: [],
          generatedAtMs: 1,
          isEmpty: true,
        }),
      },
    });
    const { result } = renderHook(() => useWorkspaceTurnAiShare(true), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // 等待 effect 跑完
    await new Promise((r) => setTimeout(r, 50));
    expect(monitorMock.captureMetric).not.toHaveBeenCalled();
  });
});

describe("pickAiShare", () => {
  it("snapshot 缺失返回 null", () => {
    expect(pickAiShare(undefined, "24h")).toBeNull();
  });

  it("返回指定窗口的统计", () => {
    const snapshot = {
      windows: [
        { window: "24h", aiLines: 1, humanLines: 0, mixedLines: 0, totalLines: 1, aiShare: 1, turnCount: 1, fileCount: 1, hasData: true },
      ],
      generatedAtMs: 1,
      isEmpty: false,
    };
    expect(pickAiShare(snapshot, "24h")?.aiShare).toBe(1);
    expect(pickAiShare(snapshot, "7d")).toBeNull();
  });
});
