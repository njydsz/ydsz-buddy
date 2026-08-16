/**
 * @file GoalMode 单元测试
 * @description P2-6 Goal Mode 24h 长跑测试准备:
 *   - 渲染（visible/invisible 切换）
 *   - 输入校验（空 description 不触发 start）
 *   - start goal 流程（成功 + 失败 toast）
 *   - abort goal 流程
 *   - 后端 listActive 错误降级(不阻塞 UI)
 *   - 状态归一化(PascalCase → 小写)
 *   - 运行中数量显示
 *
 * 24h 长跑冒烟路径不在本文件覆盖（需要 e2e harness），这里只保证
 * 单元 / 集成层面对 GoalMode 的核心交互稳定。
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoalMode } from "./GoalMode";

// mock ensureNativeApi -> goal
const mockGoalApi = {
  start: vi.fn(),
  abort: vi.fn(),
  listActive: vi.fn(),
};

vi.mock("../../nativeApi", () => ({
  ensureNativeApi: () => ({
    goal: mockGoalApi,
  }),
}));

interface MountedHandle {
  container: HTMLDivElement;
  root: Root;
}

let queryClient: QueryClient;

function mountGoalMode(props: {
  threadId: string;
  visible?: boolean;
  onClose?: () => void;
}): MountedHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(GoalMode, {
          threadId: props.threadId,
          visible: props.visible ?? true,
          onClose: props.onClose,
        }),
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

function clickByTestId(container: HTMLElement, testId: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`Test ID not found: ${testId}`);
  el.click();
  return el;
}

function setInputValue(testId: string, value: string): void {
  const input = document.querySelector<HTMLTextAreaElement>(
    `[data-testid="${testId}"]`,
  );
  if (!input) throw new Error(`Textarea not found: ${testId}`);
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  mockGoalApi.start.mockReset();
  mockGoalApi.abort.mockReset();
  mockGoalApi.listActive.mockReset();
  // 默认返回空列表
  mockGoalApi.listActive.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("P2-6 GoalMode - 渲染", () => {
  it("visible=false 时不渲染任何内容", () => {
    const handle = mountGoalMode({ threadId: "t1", visible: false });
    expect(
      handle.container.querySelector('[data-testid="goal-mode-panel"]'),
    ).toBeNull();
    unmount(handle);
  });

  it("visible=true 时渲染面板 + 输入区 + 启动按钮", () => {
    const handle = mountGoalMode({ threadId: "t1", visible: true });
    const panel = handle.container.querySelector(
      '[data-testid="goal-mode-panel"]',
    );
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("data-thread-id")).toBe("t1");
    expect(panel?.getAttribute("data-running-count")).toBe("0");
    expect(
      handle.container.querySelector('[data-testid="goal-description-input"]'),
    ).toBeTruthy();
    expect(
      handle.container.querySelector('[data-testid="goal-start-button"]'),
    ).toBeTruthy();
    unmount(handle);
  });
});

describe("P2-6 GoalMode - 启动目标", () => {
  it("空描述时启动按钮 disabled,点击不调后端", () => {
    const handle = mountGoalMode({ threadId: "t1", visible: true });
    const startBtn = handle.container.querySelector<HTMLButtonElement>(
      '[data-testid="goal-start-button"]',
    );
    // 默认 disabled
    expect(startBtn?.disabled).toBe(true);
    clickByTestId(handle.container, "goal-start-button");
    expect(mockGoalApi.start).not.toHaveBeenCalled();
    unmount(handle);
  });

  it("输入描述后点击启动 → 调用 goal.start 并清空输入", async () => {
    mockGoalApi.start.mockResolvedValue("goal-123");
    const handle = mountGoalMode({ threadId: "t1", visible: true });

    act(() => {
      setInputValue("goal-description-input", "重构认证模块");
    });
    // 触发 start
    await act(async () => {
      clickByTestId(handle.container, "goal-start-button");
      // 等 microtask flush
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGoalApi.start).toHaveBeenCalledWith({
      threadId: "t1",
      description: "重构认证模块",
    });
    // 成功后输入框被清空
    const input = handle.container.querySelector<HTMLTextAreaElement>(
      '[data-testid="goal-description-input"]',
    );
    expect(input?.value).toBe("");
    unmount(handle);
  });

  it("启动失败时 mutation 捕获错误,不抛到 React", async () => {
    mockGoalApi.start.mockRejectedValue(new Error("rpc failed"));
    const handle = mountGoalMode({ threadId: "t1", visible: true });

    act(() => {
      setInputValue("goal-description-input", "失败测试");
    });
    // 不应 throw
    await act(async () => {
      clickByTestId(handle.container, "goal-start-button");
      try {
        await Promise.resolve();
        await Promise.resolve();
      } catch {
        // 忽略 mutation 异常(react-query 会 swallow)
      }
    });

    expect(mockGoalApi.start).toHaveBeenCalled();
    unmount(handle);
  });
});

describe("P2-6 GoalMode - 中止目标", () => {
  it("点击 running 目标的'中止'按钮 → 调用 goal.abort", async () => {
    mockGoalApi.listActive.mockResolvedValue([
      {
        goal_id: "goal-running-1",
        thread_id: "t1",
        description: "测试目标",
        status: "Running", // PascalCase 测试归一化
        progress_percent: 30,
        current_task: "实现中",
        completed_tasks: ["调研"],
        started_at: "2026-06-26T00:00:00Z",
        updated_at: "2026-06-26T00:01:00Z",
      },
    ]);

    const handle = mountGoalMode({ threadId: "t1", visible: true });
    // 等待 listActive 解析(refetchInterval 关闭后 query 会 mount 一次)
    // 使用 setTimeout 给 microtask 充分时间
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    // 再等 react-query 重新渲染
    await act(async () => {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
    });

    // 调试:确认 listActive 被调用
    expect(mockGoalApi.listActive).toHaveBeenCalled();

    const abortBtn = handle.container.querySelector<HTMLElement>(
      '[data-testid="goal-abort-button"]',
    );
    expect(abortBtn).toBeTruthy();

    await act(async () => {
      abortBtn?.click();
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
      }
    });

    expect(mockGoalApi.abort).toHaveBeenCalledWith({
      goalId: "goal-running-1",
      reason: "用户手动中止",
    });
    unmount(handle);
  });
});

describe("P2-6 GoalMode - listActive 错误降级", () => {
  it("listActive 抛错时,UI 不崩溃,显示空列表", async () => {
    mockGoalApi.listActive.mockRejectedValue(new Error("network down"));

    const handle = mountGoalMode({ threadId: "t1", visible: true });
    // 等待 query 完成
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // 面板应正常渲染
    const panel = handle.container.querySelector(
      '[data-testid="goal-mode-panel"]',
    );
    expect(panel).toBeTruthy();
    // 没有 goal card
    expect(
      handle.container.querySelector('[data-testid="goal-card"]'),
    ).toBeNull();
    unmount(handle);
  });
});

describe("P2-6 GoalMode - 状态归一化", () => {
  it("PascalCase 状态(Achieved/Aborted)正确归一化为小写展示", async () => {
    mockGoalApi.listActive.mockResolvedValue([
      {
        goal_id: "g-achieved",
        thread_id: "t1",
        description: "已完成目标",
        status: "Achieved",
        progress_percent: 100,
        current_task: null,
        completed_tasks: ["a", "b", "c"],
        started_at: "2026-06-25T00:00:00Z",
        updated_at: "2026-06-26T00:00:00Z",
      },
      {
        goal_id: "g-aborted",
        thread_id: "t1",
        description: "已中止目标",
        status: "Aborted",
        progress_percent: 30,
        current_task: null,
        completed_tasks: [],
        started_at: "2026-06-25T00:00:00Z",
        updated_at: "2026-06-26T00:00:00Z",
      },
    ]);

    const handle = mountGoalMode({ threadId: "t1", visible: true });
    await act(async () => {
      // 等待 listActive 解析 + 渲染完成(measureGoalApi 增加了一层 await)
      await new Promise((r) => setTimeout(r, 30));
      for (let i = 0; i < 15; i++) {
        await Promise.resolve();
      }
    });

    const cards = handle.container.querySelectorAll(
      '[data-testid="goal-card"]',
    );
    expect(cards.length).toBe(2);
    const achieved = Array.from(cards).find(
      (el) => el.getAttribute("data-goal-id") === "g-achieved",
    );
    const aborted = Array.from(cards).find(
      (el) => el.getAttribute("data-goal-id") === "g-aborted",
    );
    expect(achieved?.getAttribute("data-status")).toBe("achieved");
    expect(aborted?.getAttribute("data-status")).toBe("aborted");
    // achieved/aborted 状态下不显示中止按钮
    expect(
      achieved?.querySelector('[data-testid="goal-abort-button"]'),
    ).toBeNull();
    expect(
      aborted?.querySelector('[data-testid="goal-abort-button"]'),
    ).toBeNull();
    unmount(handle);
  });

  it("running 状态显示中止按钮 + 进度", async () => {
    mockGoalApi.listActive.mockResolvedValue([
      {
        goal_id: "g-running",
        thread_id: "t1",
        description: "运行中",
        status: "running",
        progress_percent: 60,
        current_task: "实现 API",
        completed_tasks: ["a"],
        started_at: "2026-06-25T00:00:00Z",
        updated_at: "2026-06-26T00:00:00Z",
      },
    ]);

    const handle = mountGoalMode({ threadId: "t1", visible: true });
    // 等待 listActive 解析 + 渲染完成
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    await act(async () => {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
    });

    const card = handle.container.querySelector(
      '[data-testid="goal-card"]',
    );
    expect(card?.getAttribute("data-status")).toBe("running");
    expect(card?.getAttribute("data-progress")).toBe("60");
    expect(
      card?.querySelector('[data-testid="goal-abort-button"]'),
    ).toBeTruthy();

    // 头部显示 running count
    const runningBadge = handle.container.querySelector(
      '[data-testid="goal-running-count"]',
    );
    expect(runningBadge?.textContent).toMatch(/1 个运行中/);
    // 面板的 data-running-count 也对
    const panel = handle.container.querySelector(
      '[data-testid="goal-mode-panel"]',
    );
    expect(panel?.getAttribute("data-running-count")).toBe("1");
    unmount(handle);
  });
});

describe("P2-6 GoalMode - thread 隔离", () => {
  it("只显示当前 thread 的目标,不显示其他 thread 的", async () => {
    mockGoalApi.listActive.mockResolvedValue([
      {
        goal_id: "g-mine",
        thread_id: "t1",
        description: "我的目标",
        status: "running",
        progress_percent: 10,
        current_task: null,
        completed_tasks: [],
        started_at: "2026-06-25T00:00:00Z",
        updated_at: "2026-06-26T00:00:00Z",
      },
      {
        goal_id: "g-other",
        thread_id: "t2",
        description: "别人的目标",
        status: "running",
        progress_percent: 50,
        current_task: null,
        completed_tasks: [],
        started_at: "2026-06-25T00:00:00Z",
        updated_at: "2026-06-26T00:00:00Z",
      },
    ]);

    const handle = mountGoalMode({ threadId: "t1", visible: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    await act(async () => {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
    });

    const cards = handle.container.querySelectorAll(
      '[data-testid="goal-card"]',
    );
    expect(cards.length).toBe(1);
    expect(cards[0]?.getAttribute("data-goal-id")).toBe("g-mine");
    unmount(handle);
  });
});
