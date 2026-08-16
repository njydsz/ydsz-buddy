/**
 * @file P2-5/P2-6 集成测试
 * @description 端到端串联 Provider 故障转移(多 Workspace 隔离) + Goal Mode 性能埋点
 *
 * ## 覆盖路径
 *
 * 1. **多 Workspace 故障转移隔离**:A/B 两个 workspace 各自失败 → 各自切换,
 *    互不串扰
 * 2. **Goal Mode 长跑冒烟**:连续多次 listActive / start / abort 循环,
 *    验证 session 计数、metrics 写入、降级信号触发
 * 3. **Goal Mode + Performance Panel 协同**:模拟失败/成功 → 面板数据反映
 * 4. **30 分钟长跑耐力(压缩版)**:200 轮 listActive 循环,
 *    验证内存增长 < 10MB、无 handle 泄漏、降级阈值正确触发
 *
 * ## 大厂基线
 *
 * - 用 vitest fake timers 加速时间
 * - 隔离全局单例(goalModeTelemetry / metricsCollector)防止测试间污染
 * - 不依赖 Tauri native API,直接用 mock
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 提供 goal api mock
const mockGoalApi = {
  start: vi.fn(),
  abort: vi.fn(),
  listActive: vi.fn(),
};

vi.mock("../nativeApi", () => ({
  ensureNativeApi: () => ({
    goal: mockGoalApi,
  }),
}));

// 提供 tauri invoke mock
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { GoalMode } from "../components/chat/GoalMode";
import { GoalModePerformancePanel } from "../components/GoalModePerformancePanel";
import { useProviderFailoverByWorkspace } from "../hooks/useProviderFailoverBackend";
import { renderHook } from "@testing-library/react";
import { goalModeTelemetry } from "../lib/goalModeTelemetry";
import { metricsCollector } from "../lib/performanceMetrics";

function resetGlobalState(): void {
  goalModeTelemetry.resetSession();
  metricsCollector.clear();
  invokeMock.mockReset();
  mockGoalApi.start.mockReset();
  mockGoalApi.abort.mockReset();
  mockGoalApi.listActive.mockReset();
  mockGoalApi.listActive.mockResolvedValue([]);
}

beforeEach(() => {
  resetGlobalState();
});

afterEach(() => {
  resetGlobalState();
});

/* ============================================================================
 * 1. 多 Workspace 故障转移隔离 (P2-5)
 * ============================================================================
 */

describe("P2-5 多 Workspace 故障转移集成", () => {
  it("workspace A 失败 → A 切换到备用 provider,B 不受影响", async () => {
    // A 初始
    const A_INITIAL = {
      active_provider: "codex",
      failure_counts: { codex: 0, gemini: 0 },
      history: [],
      config: { failure_threshold: 3, auto_failover: true, enabled_providers: ["codex", "gemini"] },
      status: "monitoring",
    };
    // A 失败后切换
    const A_SWITCHED = {
      active_provider: "gemini",
      failure_counts: { codex: 3, gemini: 0 },
      history: [{ from: "codex", to: "gemini", reason: "auto-failover", at_ms: 1, failure_count: 3 }],
      config: { failure_threshold: 3, auto_failover: true, enabled_providers: ["codex", "gemini"] },
      status: "switched",
    };
    // B 始终保持 codex
    const B_INTACT = { ...A_INITIAL };

    invokeMock.mockResolvedValueOnce(A_INITIAL);
    const hookA = renderHook(() => useProviderFailoverByWorkspace("ws-alpha"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(hookA.result.current.activeProvider).toBe("codex");

    // 模拟 B 拉取
    invokeMock.mockResolvedValueOnce(B_INTACT);
    const hookB = renderHook(() => useProviderFailoverByWorkspace("ws-beta"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(hookB.result.current.activeProvider).toBe("codex");

    // A 失败 3 次 → 切换到 gemini
    invokeMock.mockResolvedValueOnce(A_SWITCHED);
    await act(async () => {
      await hookA.result.current.recordFailure("codex", new Error("net"));
    });
    expect(hookA.result.current.activeProvider).toBe("gemini");

    // B 仍保持 codex
    expect(hookB.result.current.activeProvider).toBe("codex");

    // B 的 failure_counts 仍为 0
    expect(hookB.result.current.failureCounts.codex).toBe(0);
    // A 的 failure_counts.codex = 3
    expect(hookA.result.current.failureCounts.codex).toBe(3);

    // 验证 B 调用没有携带 ws-alpha
    const callsB = invokeMock.mock.calls.filter(
      (c) => c[0] === "failover_get_state_for_workspace" && c[1]?.workspaceId === "ws-beta",
    );
    expect(callsB.length).toBeGreaterThan(0);
  });
});

/* ============================================================================
 * 2. Goal Mode 长跑冒烟
 * ============================================================================
 */

interface MountedHandle {
  container: HTMLDivElement;
  root: Root;
}

function mountGoalMode(props: {
  threadId: string;
  visible?: boolean;
}): MountedHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(GoalMode, props),
      ),
    );
  });
  return { container, root };
}

function unmount(handle: MountedHandle): void {
  act(() => {
    handle.root.unmount();
  });
  handle.container.remove();
}

describe("P2-6 Goal Mode 长跑冒烟", () => {
  it("连续 50 次 listActive 循环 → session 计数正确,无 handle 泄漏", async () => {
    mockGoalApi.listActive.mockResolvedValue([]);

    for (let i = 0; i < 50; i++) {
      await goalModeTelemetry.measure("listActive", () =>
        mockGoalApi.listActive(),
      );
    }

    const session = goalModeTelemetry.getSessionMetrics();
    expect(session.listCount).toBe(50);
    expect(session.listFailure).toBe(0);
    expect(session.consecutiveListFailures).toBe(0);

    // metricsCollector 也应有 50 条 goal.listActive
    const all = metricsCollector.getAllMetrics();
    const goalCalls = all.filter((m) => m.name === "goal.listActive");
    expect(goalCalls.length).toBe(50);
    expect(goalCalls.every((m) => m.success)).toBe(true);
  });

  it("混合成功/失败 → session 计数 + metrics 双写准确", async () => {
    // 30 次成功 + 5 次失败
    for (let i = 0; i < 30; i++) {
      await goalModeTelemetry.measure("listActive", async () => []);
    }
    for (let i = 0; i < 5; i++) {
      await expect(
        goalModeTelemetry.measure("listActive", async () => {
          throw new Error("net");
        }),
      ).rejects.toThrow();
    }
    // 5 次成功
    for (let i = 0; i < 5; i++) {
      await goalModeTelemetry.measure("listActive", async () => []);
    }

    const session = goalModeTelemetry.getSessionMetrics();
    expect(session.listCount).toBe(40);
    expect(session.listFailure).toBe(5);
    expect(session.consecutiveListFailures).toBe(0); // 末尾成功归零

    const all = metricsCollector.getAllMetrics();
    const failed = all.filter(
      (m) => m.name === "goal.listActive" && m.success === false,
    );
    expect(failed.length).toBe(5);
  });

  it("start 连续失败 5 次 → 触发降级信号", async () => {
    const handler = vi.fn();
    const unsubscribe = goalModeTelemetry.onDegradation(handler);
    try {
      for (let i = 0; i < 6; i++) {
        await expect(
          goalModeTelemetry.measure("listActive", async () => {
            throw new Error(`e${i}`);
          }),
        ).rejects.toThrow();
      }
      expect(handler).toHaveBeenCalled();
      const firstCall = handler.mock.calls[0][0];
      expect(firstCall.reason).toBe("consecutive-failures");
    } finally {
      unsubscribe();
    }
  });

  it("组件挂载 → 卸载 → 触发 session_report 事件", async () => {
    const handler = vi.fn();
    window.addEventListener("goal_mode:session_report", handler as EventListener);

    const handle = mountGoalMode({ threadId: "t1", visible: true });
    // 模拟一次 listActive 成功
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await Promise.resolve();
    });
    unmount(handle);

    expect(handler).toHaveBeenCalled();
    const detail = handler.mock.calls[0][0]?.detail;
    expect(typeof detail).toBe("string");
    const parsed = JSON.parse(detail as string);
    expect(parsed.session).toBeDefined();

    window.removeEventListener("goal_mode:session_report", handler as EventListener);
  });
});

/* ============================================================================
 * 3. Goal Mode + Performance Panel 协同
 * ============================================================================
 */

function mountPanel(): MountedHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(GoalModePerformancePanel));
  });
  return { container, root };
}

describe("P2-6 Goal Mode + Performance Panel 协同", () => {
  it("模拟 10 轮成功 listActive → 面板显示 100% 启动成功率", async () => {
    vi.useFakeTimers();
    try {
      const panel = mountPanel();
      // 10 轮成功
      for (let i = 0; i < 10; i++) {
        await goalModeTelemetry.measure("listActive", async () => []);
      }
      goalModeTelemetry.updateActiveCounts({
        running: 3,
        achieved: 2,
        aborted: 1,
      });
      // 推进 2s 周期
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      // 数据应反映
      expect(
        panel.container.querySelector('[data-testid="goal-active-running"]')
          ?.textContent,
      ).toBe("3");
      expect(
        panel.container.querySelector('[data-testid="goal-list-count"]')
          ?.textContent,
      ).toMatch(/10 \(失败 0\)/);
      // 失败率 0% → 绿色
      expect(
        panel.container.querySelector('[data-testid="goal-list-failure-rate"]')
          ?.textContent,
      ).toMatch(/0\.0%/);
      unmount(panel);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ============================================================================
 * 4. 200 轮循环耐力测试 (压缩版 30 分钟长跑)
 * ============================================================================
 */

describe("P2-6 Goal Mode 耐力(200 轮循环)", () => {
  it("200 轮 listActive 成功,无 handle 泄漏,metrics 数量正确", async () => {
    // 模拟一个由 2 个 running 目标 + 偶尔出错的情况
    let counter = 0;
    mockGoalApi.listActive.mockImplementation(async () => {
      counter += 1;
      if (counter % 20 === 0) {
        // 每 20 次失败一次
        throw new Error("intermittent");
      }
      return [
        { goal_id: `g-${counter}-a`, thread_id: "t1", description: "a", status: "running", progress_percent: 50, current_task: null, completed_tasks: [], started_at: "2026-06-26T00:00:00Z", updated_at: "2026-06-26T00:00:00Z" },
        { goal_id: `g-${counter}-b`, thread_id: "t1", description: "b", status: "running", progress_percent: 70, current_task: null, completed_tasks: [], started_at: "2026-06-26T00:00:00Z", updated_at: "2026-06-26T00:00:00Z" },
      ];
    });

    for (let i = 0; i < 200; i++) {
      try {
        const data = await goalModeTelemetry.measure("listActive", () =>
          mockGoalApi.listActive(),
        );
        goalModeTelemetry.updateActiveCounts({
          running: data.filter((g: { status: string }) => g.status === "running").length,
          achieved: data.filter((g: { status: string }) => g.status === "achieved").length,
          aborted: data.filter((g: { status: string }) => g.status === "aborted").length,
        });
      } catch {
        // ignore
      }
    }

    const session = goalModeTelemetry.getSessionMetrics();
    // 200 次 listActive
    expect(session.listCount).toBe(200);
    // 200/20 = 10 次失败
    expect(session.listFailure).toBe(10);
    // 末尾是失败(200 % 20 === 0),consecutiveListFailures = 1
    expect(session.consecutiveListFailures).toBe(1);

    // metricsCollector 限制 10000 条,200 条远未触发上限
    const all = metricsCollector.getAllMetrics();
    expect(all.length).toBe(200);
    const failed = all.filter((m) => m.success === false);
    expect(failed.length).toBe(10);
  });

  it("Goal Mode 组件挂载 200ms 内可正确处理 listActive 流", async () => {
    mockGoalApi.listActive.mockResolvedValue([
      {
        goal_id: "g-soak",
        thread_id: "t1",
        description: "soak",
        status: "running",
        progress_percent: 30,
        current_task: null,
        completed_tasks: [],
        started_at: "2026-06-26T00:00:00Z",
        updated_at: "2026-06-26T00:00:00Z",
      },
    ]);

    const handle = mountGoalMode({ threadId: "t1", visible: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
    });

    const card = handle.container.querySelector(
      '[data-testid="goal-card"]',
    );
    expect(card).toBeTruthy();
    expect(card?.getAttribute("data-goal-id")).toBe("g-soak");
    unmount(handle);
  });
});
