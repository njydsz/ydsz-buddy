/**
 * @file ComposerReviewModeHint.test.tsx
 * @description Review 模式提示横幅的单元测试
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerReviewModeHint } from "./ComposerReviewModeHint";

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

describe("ComposerReviewModeHint", () => {
  let handle: MountedHandle | null = null;

  afterEach(() => {
    if (handle) {
      act(() => {
        handle!.root.unmount();
      });
      handle.container.remove();
      handle = null;
    }
  });

  it("未激活时不渲染任何节点", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ComposerReviewModeHint, { active: false, diffOpen: false }),
      );
      await flushMicrotasks();
    });
    expect(handle.container.querySelector("[data-testid='composer-review-mode-hint']")).toBeNull();
  });

  it("激活时渲染提示横幅并默认高亮", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ComposerReviewModeHint, { active: true, diffOpen: false }),
      );
      await flushMicrotasks();
    });
    const hint = handle.container.querySelector("[data-testid='composer-review-mode-hint']");
    expect(hint).toBeTruthy();
    expect(hint?.getAttribute("data-highlighted")).toBe("true");
    expect(hint?.textContent).toContain("Review 模式");
  });

  it("6 秒后从高亮转为低饱和度", async () => {
    vi.useFakeTimers();
    try {
      handle = mountInDocument();
      await act(async () => {
        handle!.root.render(
          createElement(ComposerReviewModeHint, { active: true, diffOpen: false }),
        );
      });
      expect(
        handle.container
          .querySelector("[data-testid='composer-review-mode-hint']")
          ?.getAttribute("data-highlighted"),
      ).toBe("true");
      // 推进 fake timers 到 6 秒之后
      await act(async () => {
        vi.advanceTimersByTime(6_500);
      });
      expect(
        handle.container
          .querySelector("[data-testid='composer-review-mode-hint']")
          ?.getAttribute("data-highlighted"),
      ).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Diff 已打开时不显示打开按钮", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(ComposerReviewModeHint, { active: true, diffOpen: true }),
      );
      await flushMicrotasks();
    });
    const hint = handle.container.querySelector("[data-testid='composer-review-mode-hint']");
    const buttons = hint?.querySelectorAll("button") ?? [];
    const buttonTexts = Array.from(buttons).map((btn) => btn.textContent ?? "");
    expect(buttonTexts.some((t) => t.includes("打开 Diff"))).toBe(false);
  });

  it("Diff 未打开且提供回调时显示并触发打开按钮", async () => {
    handle = mountInDocument();
    const onOpen = vi.fn();
    await act(async () => {
      handle!.root.render(
        createElement(ComposerReviewModeHint, {
          active: true,
          diffOpen: false,
          onOpenDiffPanel: onOpen,
        }),
      );
      await flushMicrotasks();
    });
    const hint = handle.container.querySelector("[data-testid='composer-review-mode-hint']");
    const buttons = hint?.querySelectorAll("button") ?? [];
    const openButton = Array.from(buttons).find((btn) =>
      (btn.textContent ?? "").includes("打开 Diff"),
    );
    expect(openButton).toBeTruthy();
    await act(async () => {
      (openButton as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
