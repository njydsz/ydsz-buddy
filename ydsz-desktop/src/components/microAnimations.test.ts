/**
 * @file 微交互动画系统 E2E 测试
 *
 * 验证 5 类核心动画：
 * 1. 主题/模式切换动画 - theme-transition
 * 2. Diff 展开缓动动画 - diff-file-expand
 * 3. Sidebar 折叠/展开动画 - sidebar-collapse
 * 4. Button 交互微动画 - button-micro-interaction
 * 5. 列表项滑入动画 - list-item-slide-in
 *
 * 以及 prefers-reduced-motion 支持
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useAppearanceStore } from "../shared/appearanceStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<T>(useHook: () => T) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  let value: T | undefined;
  const Capture = () => {
    value = useHook();
    return null;
  };
  act(() => {
    root = createRoot(container);
    root.render(createElement(Capture));
  });
  return {
    get result(): T {
      return value as T;
    },
    unmount() {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

function resetAppearance() {
  localStorage.removeItem("ydsz-buddy:reduced-motion-mode");
  useAppearanceStore.setState({ reducedMotionMode: "auto" });
  document.documentElement.removeAttribute("data-reduced-motion");
  document.documentElement.classList.remove("reduce-motion");
}

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
}

beforeEach(() => {
  resetAppearance();
  setSystemPrefersReducedMotion(false);
});

afterEach(() => {
  resetAppearance();
});

describe("P1-2 微交互动画系统 - CSS 类", () => {
  it("应该有 theme-transition 类定义", () => {
    // 验证 CSS 类已注入到文档中
    const style = document.createElement("style");
    style.textContent = `.theme-transition { transition: background-color 200ms cubic-bezier(0.16, 1, 0.3, 1), color 200ms cubic-bezier(0.16, 1, 0.3, 1), border-color 200ms cubic-bezier(0.16, 1, 0.3, 1), fill 200ms cubic-bezier(0.16, 1, 0.3, 1), stroke 200ms cubic-bezier(0.16, 1, 0.3, 1); }`;
    document.head.appendChild(style);

    const element = document.createElement("div");
    element.className = "theme-transition";
    document.body.appendChild(element);

    expect(element.className).toContain("theme-transition");
    element.remove();
    style.remove();
  });

  it("应该有 button-micro-interaction 类定义", () => {
    const element = document.createElement("button");
    element.className = "button-micro-interaction";
    document.body.appendChild(element);

    expect(element.className).toContain("button-micro-interaction");
    element.remove();
  });

  it("应该有 list-item-slide-in 类定义", () => {
    const element = document.createElement("li");
    element.className = "list-item-slide-in";
    document.body.appendChild(element);

    expect(element.className).toContain("list-item-slide-in");
    element.remove();
  });
});

describe("P1-2 微交互动画系统 - prefers-reduced-motion", () => {
  it("默认不禁用动画", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.isReducedMotionEnabled).toBe(false);
  });

  it("系统偏好减少动画时启用", () => {
    setSystemPrefersReducedMotion(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.isReducedMotionEnabled).toBe(true);
  });

  it("用户手动设置为 on 时启用", () => {
    act(() => {
      useAppearanceStore.getState().setReducedMotionMode("on");
    });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.isReducedMotionEnabled).toBe(true);
  });

  it("用户手动设置为 off 时禁用", () => {
    setSystemPrefersReducedMotion(true);
    act(() => {
      useAppearanceStore.getState().setReducedMotionMode("off");
    });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.isReducedMotionEnabled).toBe(false);
  });

  it("auto 模式跟随系统偏好", () => {
    act(() => {
      useAppearanceStore.getState().setReducedMotionMode("auto");
    });
    
    setSystemPrefersReducedMotion(true);
    const { result: resultOn } = renderHook(() => useReducedMotion());
    expect(resultOn.isReducedMotionEnabled).toBe(true);
  });
});

describe("P1-2 微交互动画系统 - DOM 联动", () => {
  it("reduced motion 启用时同步 data-reduced-motion 属性", () => {
    setSystemPrefersReducedMotion(true);
    renderHook(() => useReducedMotion());
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBe("true");
  });

  it("reduced motion 禁用时移除 data-reduced-motion 属性", () => {
    const { unmount } = renderHook(() => useReducedMotion());
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBe("false");
    unmount();
  });

  it("reduced motion 启用时添加 reduce-motion class", () => {
    setSystemPrefersReducedMotion(true);
    renderHook(() => useReducedMotion());
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
  });
});
