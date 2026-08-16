/**
 * @file GoalModePerformancePanel 单元测试
 * @description P2-6 24h 长跑准备 - 验证性能面板正确显示 Goal Mode session 指标
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { GoalModePerformancePanel } from "./GoalModePerformancePanel";
import { goalModeTelemetry } from "../lib/goalModeTelemetry";

interface MountedHandle {
  container: HTMLDivElement;
  root: Root;
}

function mountPanel(): MountedHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(GoalModePerformancePanel));
  });
  return { container, root };
}

function unmount(handle: MountedHandle): void {
  act(() => {
    handle.root.unmount();
  });
  handle.container.remove();
}

/**
 * 推进 2s 周期 + 让 React 渲染
 */
async function flushRefreshCycle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2100);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  goalModeTelemetry.resetSession();
});

afterEach(() => {
  vi.useRealTimers();
  goalModeTelemetry.resetSession();
});

describe("GoalModePerformancePanel - 渲染", () => {
  it("渲染 panel 容器", () => {
    const handle = mountPanel();
    expect(
      handle.container.querySelector(
        '[data-testid="goal-mode-performance-panel"]',
      ),
    ).toBeTruthy();
    unmount(handle);
  });

  it("初始 session 全 0 时显示", () => {
    const handle = mountPanel();
    // listActive 调用次数为 0
    expect(
      handle.container
        .querySelector('[data-testid="goal-list-count"]')
        ?.textContent,
    ).toMatch(/0 \(失败 0\)/);
    // 连续失败 0
    expect(
      handle.container
        .querySelector('[data-testid="goal-consecutive-failures"]')
        ?.textContent,
    ).toBe("0");
    unmount(handle);
  });

  it("启动成功率为 100% (无失败时)", () => {
    const handle = mountPanel();
    const startRate = handle.container.querySelector(
      '[data-testid="goal-start-rate"]',
    );
    expect(startRate?.textContent).toMatch(/100\.0%/);
    unmount(handle);
  });
});

describe("GoalModePerformancePanel - 数据反映", () => {
  it("更新 active counts 后,UI 立即反映", async () => {
    const handle = mountPanel();
    await act(async () => {
      goalModeTelemetry.updateActiveCounts({
        running: 2,
        achieved: 1,
        aborted: 0,
      });
    });
    // 推进 2s 周期触发 setInterval 刷新
    await flushRefreshCycle();

    expect(
      handle.container.querySelector('[data-testid="goal-active-running"]')
        ?.textContent,
    ).toBe("2");
    expect(
      handle.container.querySelector('[data-testid="goal-active-achieved"]')
        ?.textContent,
    ).toBe("1");
    expect(
      handle.container.querySelector('[data-testid="goal-active-aborted"]')
        ?.textContent,
    ).toBe("0");
    expect(
      handle.container.querySelector('[data-testid="goal-active-total"]')
        ?.textContent,
    ).toBe("3");
    unmount(handle);
  });

  it("连续失败达到阈值时显示降级 badge", async () => {
    const handle = mountPanel();
    for (let i = 0; i < 5; i++) {
      act(() => {
        goalModeTelemetry.recordListFailure("net fail");
      });
    }
    await flushRefreshCycle();
    expect(
      handle.container.querySelector(
        '[data-testid="goal-mode-degraded-badge"]',
      ),
    ).toBeTruthy();
    unmount(handle);
  });

  it("listActive 失败率反映真实数据", async () => {
    const t = goalModeTelemetry;
    // 3 次成功 + 1 次失败
    for (let i = 0; i < 3; i++) {
      await t.measure("listActive", async () => []);
    }
    await expect(
      t.measure("listActive", async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow();

    const handle = mountPanel();
    await flushRefreshCycle();
    expect(
      handle.container.querySelector('[data-testid="goal-list-count"]')
        ?.textContent,
    ).toMatch(/4 \(失败 1\)/);
    // 失败率 25%
    expect(
      handle.container.querySelector('[data-testid="goal-list-failure-rate"]')
        ?.textContent,
    ).toMatch(/25\.0%/);
    unmount(handle);
  });
});

describe("GoalModePerformancePanel - 报告导出事件", () => {
  it("window 自定义事件 'goal_mode:session_report' 可被订阅", async () => {
    const handle = mountPanel();
    const received: string[] = [];
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") received.push(detail);
    };
    window.addEventListener("goal_mode:session_report", handler);
    // 触发一次事件
    window.dispatchEvent(
      new CustomEvent("goal_mode:session_report", {
        detail: '{"test":true}',
      }),
    );
    expect(received.length).toBe(1);
    window.removeEventListener("goal_mode:session_report", handler);
    unmount(handle);
  });
});
