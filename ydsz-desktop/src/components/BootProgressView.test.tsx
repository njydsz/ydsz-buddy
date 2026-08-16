/**
 * @file BootProgressView 组件测试
 *
 * 覆盖:
 *
 * 1. 初始状态：所有阶段显示为 pending，进度 0%，"Starting"
 * 2. 部分阶段 in_progress / done 时，进度按 done 阶段比例计算
 * 3. 全部完成时显示 "Ready" + 100%
 * 4. 阶段错误时显示错误信息 + 重试按钮
 * 5. onRetry 回调：点击触发、错误态可恢复（startStage 后可继续完成）
 * 6. 进度条 ARIA 属性
 * 7. 阶段列表的 status data 属性随 store 更新
 * 8. labelOverride 覆盖默认 label
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  __resetBootProgressStoreForTest,
  useBootProgressStore,
} from "../shared/bootProgressStore";
import { useAppearanceStore, REDUCED_MOTION_STORAGE_KEY } from "../shared/appearanceStore";
import { __resetReducedMotionCacheForTest } from "../hooks/useReducedMotion";
import { BootProgressView } from "./BootProgressView";

// 让 happy-dom 下 React 18 的 act() 正常工作
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setSystemPrefersReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  __resetReducedMotionCacheForTest();
}

function resetStore() {
  __resetBootProgressStoreForTest();
  useAppearanceStore.setState({ reducedMotionMode: "auto" });
  setSystemPrefersReducedMotion(false);
}

function renderView(props: { onRetry?: (() => void) | null } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(createElement(BootProgressView, props));
  });
  return {
    container,
    get root(): Root {
      return root as Root;
    },
    /**
     * 在 act 包裹下驱动 store 状态变更，避免 React 警告。
     */
    dispatch(action: () => void) {
      act(() => {
        action();
      });
    },
    unmount() {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
  localStorage.removeItem(REDUCED_MOTION_STORAGE_KEY);
});

describe("BootProgressView - 初始状态", () => {
  it("所有阶段都渲染为 pending", () => {
    const { container } = renderView();
    const stages = container.querySelectorAll('[data-testid^="boot-stage-"]');
    expect(stages.length).toBe(6);
    stages.forEach((row) => {
      expect(row.getAttribute("data-status")).toBe("pending");
    });
  });

  it("进度条显示 0% 和 Starting 状态", () => {
    const { container } = renderView();
    expect(container.querySelector('[data-testid="boot-progress-percent"]')?.textContent).toBe(
      "0%",
    );
    expect(container.textContent).toContain("Starting");
    expect(container.textContent).not.toContain("Boot failed");
    expect(container.textContent).not.toContain("Ready");
  });

  it("无错误时不显示 retry 按钮和错误提示", () => {
    const { container } = renderView();
    expect(container.querySelector('[data-testid="boot-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="boot-retry"]')).toBeNull();
  });
});

describe("BootProgressView - 阶段进度", () => {
  it("部分阶段 done 时进度按 done 阶段比例计算", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().startStage("native-api");
      useBootProgressStore.getState().completeStage("native-api");
      useBootProgressStore.getState().startStage("server-welcome");
      useBootProgressStore.getState().completeStage("server-welcome");
    });
    // 2/6 = 33%
    expect(handle.container.querySelector('[data-testid="boot-progress-percent"]')?.textContent).toBe(
      "33%",
    );
  });

  it("全部完成时进度 100% + 显示 Ready", () => {
    const handle = renderView();
    handle.dispatch(() => {
      for (const id of ["native-api", "server-welcome", "shell-snapshot", "settings", "route-ready", "ui-ready"] as const) {
        useBootProgressStore.getState().startStage(id);
        useBootProgressStore.getState().completeStage(id);
      }
    });
    expect(handle.container.querySelector('[data-testid="boot-progress-percent"]')?.textContent).toBe(
      "100%",
    );
    expect(handle.container.textContent).toContain("Ready");
  });

  it("阶段行 data-status 跟随 store 状态", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().startStage("settings");
    });
    const row = handle.container.querySelector('[data-testid="boot-stage-settings"]');
    expect(row?.getAttribute("data-status")).toBe("in_progress");

    handle.dispatch(() => {
      useBootProgressStore.getState().completeStage("settings");
    });
    expect(row?.getAttribute("data-status")).toBe("done");
  });

  it("in_progress 阶段的 label 展示默认 label", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().startStage("settings");
    });
    const row = handle.container.querySelector('[data-testid="boot-stage-settings"]');
    expect(row?.textContent).toContain("加载用户设置");
  });

  it("labelOverride 后展示自定义 label", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().startStage("settings", "Loading preferences (en)");
    });
    const row = handle.container.querySelector('[data-testid="boot-stage-settings"]');
    expect(row?.textContent).toContain("Loading preferences (en)");
  });
});

describe("BootProgressView - 错误态", () => {
  it("failStage 后显示错误信息和 Boot failed", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().startStage("settings");
      useBootProgressStore.getState().failStage("settings", "load settings failed");
    });
    expect(handle.container.querySelector('[data-testid="boot-error"]')?.textContent).toContain(
      "load settings failed",
    );
    expect(handle.container.textContent).toContain("Boot failed");
  });

  it("onRetry 存在时显示 Retry 按钮，点击后回调被调用", () => {
    const onRetry = vi.fn();
    const handle = renderView({ onRetry });
    handle.dispatch(() => {
      useBootProgressStore.getState().failStage("settings", "boom");
    });
    const retryBtn = handle.container.querySelector(
      '[data-testid="boot-retry"]',
    ) as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();
    act(() => {
      retryBtn?.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("onRetry 缺失时不显示 Retry 按钮", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().failStage("settings", "boom");
    });
    expect(handle.container.querySelector('[data-testid="boot-retry"]')).toBeNull();
    expect(handle.container.querySelector('[data-testid="boot-error"]')?.textContent).toContain(
      "boom",
    );
  });

  it("failStage 阶段行的 data-status 为 error", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().startStage("settings");
      useBootProgressStore.getState().failStage("settings", "x");
    });
    const row = handle.container.querySelector('[data-testid="boot-stage-settings"]');
    expect(row?.getAttribute("data-status")).toBe("error");
  });
});

describe("BootProgressView - ARIA / a11y", () => {
  it("进度条有 role=progressbar 和 aria-value*", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().startStage("native-api");
      useBootProgressStore.getState().completeStage("native-api");
    });
    const progressbar = handle.container.querySelector('[role="progressbar"]');
    expect(progressbar).not.toBeNull();
    expect(progressbar?.getAttribute("aria-valuemin")).toBe("0");
    expect(progressbar?.getAttribute("aria-valuemax")).toBe("100");
    expect(progressbar?.getAttribute("aria-valuenow")).toBe("17"); // 1/6 ≈ 16.67
    expect(progressbar?.getAttribute("aria-label")).toBe("Application boot progress");
  });

  it("阶段列表有 aria-label=Boot stages", () => {
    const { container } = renderView();
    const list = container.querySelector('ol[aria-label="Boot stages"]');
    expect(list).not.toBeNull();
  });
});

describe("BootProgressView - 错误后重试流程", () => {
  it("failStage 后再 startStage 进度从错误恢复", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().startStage("settings");
      useBootProgressStore.getState().failStage("settings", "boom");
    });
    expect(
      handle.container.querySelector('[data-testid="boot-stage-settings"]')?.getAttribute(
        "data-status",
      ),
    ).toBe("error");

    // 模拟重试：再调用 startStage
    handle.dispatch(() => {
      useBootProgressStore.getState().startStage("settings");
    });
    expect(
      handle.container.querySelector('[data-testid="boot-stage-settings"]')?.getAttribute(
        "data-status",
      ),
    ).toBe("in_progress");

    handle.dispatch(() => {
      useBootProgressStore.getState().completeStage("settings");
    });
    expect(
      handle.container.querySelector('[data-testid="boot-stage-settings"]')?.getAttribute(
        "data-status",
      ),
    ).toBe("done");
  });
});

describe("BootProgressView - fatal 错误处理", () => {
  it("fatal 错误（config）显示 Configuration required，且不显示 Retry 按钮", () => {
    const onRetry = vi.fn();
    const handle = renderView({ onRetry });
    handle.dispatch(() => {
      useBootProgressStore.getState().failStage("settings", "invalid config", "config");
    });

    expect(handle.container.textContent).toContain("Configuration required");
    expect(handle.container.querySelector('[data-testid="boot-retry"]')).toBeNull();
    expect(onRetry).not.toHaveBeenCalled();

    const errorBox = handle.container.querySelector('[data-testid="boot-error"]');
    expect(errorBox?.getAttribute("data-fatal")).toBe("true");
    expect(errorBox?.textContent).toContain("invalid config");
  });

  it("fatal 错误（permission）展示锁定图标与提示文案", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().failStage("settings", "permission denied", "permission");
    });

    expect(handle.container.textContent).toContain("permission denied");
    expect(handle.container.textContent).toContain("请检查配置或授权后重启应用");
    expect(handle.container.querySelector('[data-fatal="true"]')).not.toBeNull();
  });

  it("非 fatal 错误（network）仍然显示 Retry 按钮", () => {
    const onRetry = vi.fn();
    const handle = renderView({ onRetry });
    handle.dispatch(() => {
      useBootProgressStore.getState().failStage("settings", "network down", "network");
    });

    const retryBtn = handle.container.querySelector(
      '[data-testid="boot-retry"]',
    ) as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();
    expect(handle.container.textContent).toContain("Boot failed");
    expect(handle.container.textContent).not.toContain("Configuration required");

    act(() => {
      retryBtn?.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("cancelled 错误类型也是 fatal", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().failStage("settings", "user cancelled", "cancelled");
    });
    expect(handle.container.querySelector('[data-testid="boot-retry"]')).toBeNull();
    expect(handle.container.querySelector('[data-testid="boot-error"]')?.getAttribute("data-fatal")).toBe(
      "true",
    );
  });

  it("fatal 阶段行带 data-fatal 标识", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().failStage("settings", "config broken", "config");
    });
    const row = handle.container.querySelector('[data-testid="boot-stage-settings"]');
    expect(row?.getAttribute("data-fatal")).toBe("true");
  });

  it("重试前调用 clearFatalError，fatal 状态被清除", () => {
    const handle = renderView();
    handle.dispatch(() => {
      useBootProgressStore.getState().failStage("settings", "config broken", "config");
    });
    expect(
      handle.container.querySelector('[data-testid="boot-stage-settings"]')?.getAttribute("data-fatal"),
    ).toBe("true");

    handle.dispatch(() => {
      useBootProgressStore.getState().clearFatalError();
    });
    // fatal 标记被清除（属性值从 "true" → null/undefined）
    expect(
      handle.container.querySelector('[data-testid="boot-stage-settings"]')?.getAttribute("data-fatal"),
    ).toBeNull();
  });
});
