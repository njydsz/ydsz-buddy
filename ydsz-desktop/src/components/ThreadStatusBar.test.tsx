/**
 * @file ThreadStatusBar 单元测试
 * @description 覆盖 Mode / Provider / Model / 网络状态 / 离线草稿徽标 / 任务数等核心展示
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ThreadStatusBar } from "./ThreadStatusBar";
import { useOfflineDraftStore, type OfflineDraftEntry } from "~/offlineDraftStore";
import { __testing as networkTesting } from "~/hooks/useNetworkStatus";
import type { ProviderKind } from "~/contracts";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface MountedHandle {
  container: HTMLDivElement;
  root: Root;
}

function mountInDocument(): MountedHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

function makeDraft(id: string, _threadId: string): OfflineDraftEntry {
  return {
    id,
    kind: "chat",
    createdAt: new Date().toISOString(),
    previewText: `draft ${id}`,
    prompt: `draft ${id}`,
    images: [],
    assistantSelections: [],
    terminalContexts: [],
    skills: [],
    mentions: [],
    selectedProvider: "codex",
    selectedModel: null,
    selectedPromptEffort: null,
    modelSelection: { provider: "codex", model: "gpt-5" },
    runtimeMode: "code",
    interactionMode: "agent",
    envMode: "local",
    enqueuedAt: Date.now(),
    reason: "offline",
  };
}

function setNetworkStatus(status: "online" | "offline" | "degraded"): void {
  // 反射式地通过全局 navigator.onLine 触发 happy-dom 的同步路径
  // 然后用 mark* 强制覆盖到目标状态
  act(() => {
    if (status === "online") {
      window.dispatchEvent(new Event("online"));
    } else {
      window.dispatchEvent(new Event("offline"));
    }
  });
  // 使用 hook 实例统一覆盖：把 store 直接 setState 到目标值
  // 通过使用 __testing.reset + 触发 mark 来确保 store 内部状态正确
  act(() => {
    // 通过打开一个最小 hook 实例并调用 mark* 来更新 store
    // 由于 store 内部无 setState 公开 API，这里采用 mark* 路线
    // 为避免引入复杂 hook 测试样板，直接修改 navigator.onLine + 触发事件
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => status === "online",
    });
    if (status === "offline") {
      window.dispatchEvent(new Event("offline"));
    } else {
      window.dispatchEvent(new Event("online"));
    }
  });
}

describe("ThreadStatusBar", () => {
  let handle: MountedHandle | null = null;

  beforeEach(() => {
    // 重置 network / offline draft store
    networkTesting.reset();
    useOfflineDraftStore.setState({ draftsByThreadId: {} });
  });

  afterEach(() => {
    if (handle) {
      act(() => {
        handle!.root.unmount();
      });
      handle.container.remove();
      handle = null;
    }
  });

  it("渲染 Mode · Provider · Model 三个核心分段", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "codex" as ProviderKind,
          providerAvailable: true,
          model: "gpt-5",
        }),
      );
      await flushMicrotasks();
    });

    const bar = handle.container.querySelector("[data-testid='thread-status-bar']");
    expect(bar).toBeTruthy();
    expect(bar?.textContent).toContain("Code");
    expect(bar?.textContent).toContain("Agent");
    expect(bar?.textContent).toContain("gpt-5");
  });

  it("Provider 不可用时显示红点标识", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Work",
          interactionModeLabel: "Task",
          provider: "claudeAgent" as ProviderKind,
          providerAvailable: false,
          model: "claude-3-5-sonnet",
        }),
      );
      await flushMicrotasks();
    });

    const bar = handle.container.querySelector("[data-testid='thread-status-bar']");
    expect(bar).toBeTruthy();
    const dot = bar?.querySelector("[aria-label='Provider 当前不可用']");
    expect(dot).toBeTruthy();
  });

  it("无离线草稿时不显示草稿徽标", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "codex" as ProviderKind,
          providerAvailable: true,
          model: "gpt-5",
        }),
      );
      await flushMicrotasks();
    });
    const draftsBadge = handle.container.querySelector(
      "[data-testid='status-bar-offline-drafts']",
    );
    expect(draftsBadge).toBeNull();
  });

  it("存在离线草稿时显示草稿徽标并带数量", async () => {
    act(() => {
      useOfflineDraftStore.getState().enqueue("thread-a", makeDraft("d1", "thread-a"));
      useOfflineDraftStore.getState().enqueue("thread-a", makeDraft("d2", "thread-a"));
      useOfflineDraftStore.getState().enqueue("thread-b", makeDraft("d3", "thread-b"));
    });
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "codex" as ProviderKind,
          providerAvailable: true,
          model: "gpt-5",
        }),
      );
      await flushMicrotasks();
    });
    const draftsBadge = handle.container.querySelector(
      "[data-testid='status-bar-offline-drafts']",
    );
    expect(draftsBadge).toBeTruthy();
    expect(draftsBadge?.textContent).toContain("3");
  });

  it("网络状态变化时更新 data-network-status（online → offline）", async () => {
    setNetworkStatus("online");
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "codex" as ProviderKind,
          providerAvailable: true,
          model: "gpt-5",
        }),
      );
      await flushMicrotasks();
    });
    const network = handle.container.querySelector("[data-testid='status-bar-network']");
    expect(network).toBeTruthy();
    expect(network?.getAttribute("data-network-status")).toBe("online");
    expect(network?.textContent).toContain("在线");

    setNetworkStatus("offline");
    await act(async () => {
      await flushMicrotasks();
    });
    expect(network?.getAttribute("data-network-status")).toBe("offline");
    expect(network?.textContent).toContain("离线");
  });

  it("长 model 名称会被截断展示", async () => {
    handle = mountInDocument();
    const longModel = "claude-3-5-sonnet-20241022-very-long-version";
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "claudeAgent" as ProviderKind,
          providerAvailable: true,
          model: longModel,
        }),
      );
      await flushMicrotasks();
    });
    const bar = handle.container.querySelector("[data-testid='thread-status-bar']");
    expect(bar?.textContent).toContain("…");
    expect(bar?.textContent).not.toContain(longModel);
  });

  it("activeTaskCount > 0 时显示任务数", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "codex" as ProviderKind,
          providerAvailable: true,
          model: "gpt-5",
          activeTaskCount: 5,
        }),
      );
      await flushMicrotasks();
    });
    const bar = handle.container.querySelector("[data-testid='thread-status-bar']");
    expect(bar?.textContent).toContain("5");
  });

  it("空状态时（无任务数、无草稿）不显示额外徽标", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "codex" as ProviderKind,
          providerAvailable: true,
          model: "gpt-5",
        }),
      );
      await flushMicrotasks();
    });
    const bar = handle.container.querySelector("[data-testid='thread-status-bar']");
    expect(bar?.querySelector("[data-testid='status-bar-offline-drafts']")).toBeNull();
  });

  // ==========================================================================
  // AI 生产占比徽标 (P0-P1 新增)
  // ==========================================================================

  it("未传 aiShare 时不显示 AI 占比徽标", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "codex" as ProviderKind,
          providerAvailable: true,
          model: "gpt-5",
        }),
      );
      await flushMicrotasks();
    });
    const badge = handle.container.querySelector("[data-testid='status-bar-ai-share']");
    expect(badge).toBeNull();
  });

  it("aiShare 空态时(isEmpty)不显示徽标", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "codex" as ProviderKind,
          providerAvailable: true,
          model: "gpt-5",
          aiShare: {
            aiLines: 0,
            humanLines: 0,
            mixedLines: 0,
            totalAuthoredLines: 0,
            aiShare: null,
            humanShare: null,
            mixedShare: null,
            turnCount: 0,
            fileCount: 0,
            isEmpty: true,
          },
        }),
      );
      await flushMicrotasks();
    });
    const badge = handle.container.querySelector("[data-testid='status-bar-ai-share']");
    expect(badge).toBeNull();
  });

  it("aiShare 有数据时显示徽标 + 占比数字", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ThreadStatusBar, {
          runtimeModeLabel: "Code",
          interactionModeLabel: "Agent",
          provider: "codex" as ProviderKind,
          providerAvailable: true,
          model: "gpt-5",
          aiShare: {
            aiLines: 75,
            humanLines: 25,
            mixedLines: 0,
            totalAuthoredLines: 100,
            aiShare: 0.75,
            humanShare: 0.25,
            mixedShare: 0,
            turnCount: 3,
            fileCount: 5,
            isEmpty: false,
          },
        }),
      );
      await flushMicrotasks();
    });
    const badge = handle.container.querySelector("[data-testid='status-bar-ai-share']");
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute("data-ai-share")).toBe("75%");
    expect(badge?.getAttribute("data-ai-lines")).toBe("75");
    expect(badge?.getAttribute("data-ai-total")).toBe("100");
    expect(badge?.textContent).toContain("AI 75%");
    // a11y
    expect(badge?.getAttribute("aria-label")).toContain("75");
  });
});
