/**
 * @file WorkspaceAiSharePanel 单元测试
 * @description 验证 panel / compact 两种 variant 在 loading / error / empty / data 四态下行为正确
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { WorkspaceAiSharePanel } from "./WorkspaceAiSharePanel";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return QueryClientProvider({ children, client });
  } as never;
}

const FAKE_SNAPSHOT = {
  windows: [
    {
      window: "24h",
      aiLines: 100,
      humanLines: 20,
      mixedLines: 10,
      totalLines: 130,
      aiShare: 100 / 130,
      turnCount: 5,
      fileCount: 8,
      hasData: true,
    },
    {
      window: "7d",
      aiLines: 500,
      humanLines: 100,
      mixedLines: 50,
      totalLines: 650,
      aiShare: 500 / 650,
      turnCount: 15,
      fileCount: 30,
      hasData: true,
    },
    {
      window: "30d",
      aiLines: 5000,
      humanLines: 1000,
      mixedLines: 500,
      totalLines: 6500,
      aiShare: 5000 / 6500,
      turnCount: 60,
      fileCount: 200,
      hasData: true,
    },
  ],
  generatedAtMs: 1_700_000_000_000,
  isEmpty: false,
};

const EMPTY_SNAPSHOT = {
  windows: [],
  generatedAtMs: 1,
  isEmpty: true,
};

describe("WorkspaceAiSharePanel - panel variant", () => {
  beforeEach(() => {
    readNativeApiMock.mockReset();
    monitorMock.captureMetric.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loading 时显示骨架", async () => {
    readNativeApiMock.mockReturnValue({
      orchestration: { getTurnAiShareSnapshot: () => new Promise(() => {}) },
    });
    render(<WorkspaceAiSharePanel variant="panel" />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("workspace-ai-share-panel")).toBeTruthy();
    expect(screen.getByTestId("workspace-ai-share-loading")).toBeTruthy();
  });

  it("api 不可用:query.isError 渲染错误区", async () => {
    readNativeApiMock.mockReturnValue(undefined);
    render(<WorkspaceAiSharePanel variant="panel" />, { wrapper: makeWrapper() });
    await waitFor(
      () => expect(screen.getByTestId("workspace-ai-share-error")).toBeTruthy(),
      { timeout: 3000 },
    );
  });

  it("空快照:显示 empty 文案", async () => {
    readNativeApiMock.mockReturnValue({
      orchestration: {
        getTurnAiShareSnapshot: vi.fn().mockResolvedValue(EMPTY_SNAPSHOT),
      },
    });
    render(<WorkspaceAiSharePanel variant="panel" />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-ai-share-empty")).toBeTruthy(),
    );
  });

  it("有数据:渲染三窗口进度条 + data-testid + data-share", async () => {
    readNativeApiMock.mockReturnValue({
      orchestration: {
        getTurnAiShareSnapshot: vi.fn().mockResolvedValue(FAKE_SNAPSHOT),
      },
    });
    render(<WorkspaceAiSharePanel variant="panel" />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-ai-share-windows")).toBeTruthy(),
    );
    for (const w of FAKE_SNAPSHOT.windows) {
      const row = screen.getByTestId(`workspace-ai-share-window-${w.window}`);
      expect(row.getAttribute("data-window")).toBe(w.window);
      expect(row.getAttribute("data-share")).toBe(String(w.aiShare));
      expect(screen.getByTestId(`workspace-ai-share-window-${w.window}-bar`)).toBeTruthy();
    }
  });
});

describe("WorkspaceAiSharePanel - compact variant", () => {
  beforeEach(() => {
    readNativeApiMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("有数据:显示 30d 摘要 + data-empty=false", async () => {
    readNativeApiMock.mockReturnValue({
      orchestration: {
        getTurnAiShareSnapshot: vi.fn().mockResolvedValue(FAKE_SNAPSHOT),
      },
    });
    render(<WorkspaceAiSharePanel variant="compact" />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-ai-share-compact")).toBeTruthy(),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("workspace-ai-share-compact").getAttribute("data-empty"),
      ).toBe("false"),
    );
    const node = screen.getByTestId("workspace-ai-share-compact");
    expect(node.textContent ?? "").toMatch(/AI/);
  });

  it("空快照:data-empty=true", async () => {
    readNativeApiMock.mockReturnValue({
      orchestration: {
        getTurnAiShareSnapshot: vi.fn().mockResolvedValue(EMPTY_SNAPSHOT),
      },
    });
    render(<WorkspaceAiSharePanel variant="compact" />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() =>
      expect(screen.getByTestId("workspace-ai-share-compact")).toBeTruthy(),
    );
    expect(
      screen.getByTestId("workspace-ai-share-compact").getAttribute("data-empty"),
    ).toBe("true");
  });
});
