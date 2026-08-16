/**
 * @file OnboardingTour 测试
 * @description 验证 W5-P-1 任务：OnboardingTour 7 步引导
 *   - 必须有 7 步（包含 dual-domain / mobile-pairing 新增步骤）
 *   - 步骤切换时应用 list-item-slide-in 微交互动画
 *   - 键盘导航 / 跳过 / 完成流程
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OnboardingTour } from "./OnboardingTour";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function clickElement(element: Element): void {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text.trim() || b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

function renderTour(props: Partial<ComponentProps<typeof OnboardingTour>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(
      createElement(OnboardingTour, {
        isOpen: true,
        onClose: () => {},
        ...props,
      }),
    );
  });
  return {
    container,
    unmount() {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("W5-P-1 OnboardingTour - 7 步引导", () => {
  it("默认渲染第 1 步：创建工作区", () => {
    const { container } = renderTour();
    expect(container.textContent).toContain("创建工作区");
    expect(container.textContent).toContain("1 / 7");
  });

  it("包含双域介绍（dual-domain）步骤", () => {
    const { container } = renderTour();
    for (let i = 0; i < 5; i++) {
      const nextBtn = findButtonByText(container, "下一步");
      if (nextBtn) {
        act(() => {
          clickElement(nextBtn);
        });
      }
    }
    expect(container.textContent).toContain("双域");
    expect(container.textContent).toContain("6 / 7");
  });

  it("包含移动端配对（mobile-pairing）步骤", () => {
    const { container } = renderTour();
    for (let i = 0; i < 6; i++) {
      const nextBtn = findButtonByText(container, "下一步");
      if (nextBtn) {
        act(() => {
          clickElement(nextBtn);
        });
      }
    }
    expect(container.textContent).toContain("移动端配对");
    expect(container.textContent).toContain("7 / 7");
  });

  it("第 7 步是最后一步，按钮显示'完成'", () => {
    const { container } = renderTour();
    for (let i = 0; i < 6; i++) {
      const nextBtn = findButtonByText(container, "下一步");
      if (nextBtn) {
        act(() => {
          clickElement(nextBtn);
        });
      }
    }
    expect(container.textContent).toContain("完成");
  });

  it("步骤内容应用 list-item-slide-in 微交互动画（D-9 W5）", () => {
    const { container } = renderTour();
    const slideInElement = container.querySelector(".list-item-slide-in");
    expect(slideInElement).toBeTruthy();
  });

  it("操作按钮应用 button-micro-interaction 微交互动画", () => {
    const { container } = renderTour();
    const buttons = container.querySelectorAll("button.button-micro-interaction");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});

describe("W5-P-1 OnboardingTour - 交互", () => {
  it("点击下一步按钮推进到下一步", () => {
    const { container } = renderTour();
    const nextBtn = findButtonByText(container, "下一步");
    if (nextBtn) {
      act(() => {
        clickElement(nextBtn);
      });
    }
    expect(container.textContent).toContain("选择 AI 提供商");
    expect(container.textContent).toContain("2 / 7");
  });

  it("第 1 步不显示上一步按钮", () => {
    const { container } = renderTour();
    expect(container.textContent).not.toContain("上一步");
  });

  it("中间步骤显示上一步按钮并能回退", () => {
    const { container } = renderTour();
    const nextBtn = findButtonByText(container, "下一步");
    if (nextBtn) {
      act(() => {
        clickElement(nextBtn);
      });
    }
    expect(container.textContent).toContain("2 / 7");
    expect(container.textContent).toContain("上一步");
    const prevBtn = findButtonByText(container, "上一步");
    if (prevBtn) {
      act(() => {
        clickElement(prevBtn);
      });
    }
    expect(container.textContent).toContain("1 / 7");
  });

  it("点击完成触发 onComplete 回调", () => {
    const onComplete = vi.fn();
    const { container } = renderTour({ onComplete });
    for (let i = 0; i < 6; i++) {
      const nextBtn = findButtonByText(container, "下一步");
      if (nextBtn) {
        act(() => {
          clickElement(nextBtn);
        });
      }
    }
    const completeBtn = findButtonByText(container, "完成");
    if (completeBtn) {
      act(() => {
        clickElement(completeBtn);
      });
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("点击跳过触发 onSkip 回调", () => {
    const onSkip = vi.fn();
    const { container } = renderTour({ onSkip });
    const skipBtn = findButtonByText(container, "跳过");
    if (skipBtn) {
      act(() => {
        clickElement(skipBtn);
      });
    }
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("关闭按钮触发 onClose 回调", () => {
    const onClose = vi.fn();
    const { container } = renderTour({ onClose });
    const closeBtn = container.querySelector('button[aria-label="关闭"]');
    if (closeBtn) {
      act(() => {
        clickElement(closeBtn);
      });
    }
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("W5-P-1 OnboardingTour - 进度条", () => {
  it("第 1 步进度条宽度为 1/7", () => {
    const { container } = renderTour();
    const progressBar = container.querySelector('[style*="width"]') as HTMLElement;
    const expectedProgress = `${(1 / 7) * 100}%`;
    expect(progressBar?.style.width).toBe(expectedProgress);
  });

  it("最后一步进度条宽度为 100%", () => {
    const { container } = renderTour();
    for (let i = 0; i < 6; i++) {
      const nextBtn = findButtonByText(container, "下一步");
      if (nextBtn) {
        act(() => {
          clickElement(nextBtn);
        });
      }
    }
    const progressBar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(progressBar?.style.width).toBe("100%");
  });
});
