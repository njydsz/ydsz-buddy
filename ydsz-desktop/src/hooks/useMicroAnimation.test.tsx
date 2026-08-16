/**
 * @file useMicroAnimation 单元测试
 *
 * 覆盖:
 * 1. 默认状态：完整动画时长
 * 2. reduced motion: 时长压缩到 ≤ 50ms
 * 3. forceDisabled: 完全无过渡
 * 4. fadeIn / scale / slideIn / expand 行为
 * 5. slideIn 在 reduced motion 下不输出位移
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMicroAnimation, REDUCED_MOTION_MAX_DURATION_MS } from "./useMicroAnimation";
import { useAppearanceStore, applyReducedMotionToDom } from "../shared/appearanceStore";
import { __resetReducedMotionCacheForTest } from "./useReducedMotion";

// 让 happy-dom 下 React 18 的 act() 正常工作
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

function resetAppearance() {
  localStorage.removeItem("ydsz-buddy:reduced-motion-mode");
  useAppearanceStore.setState({ reducedMotionMode: "auto" });
  document.documentElement.removeAttribute("data-reduced-motion");
  document.documentElement.classList.remove("reduce-motion");
}

beforeEach(() => {
  resetAppearance();
  setSystemPrefersReducedMotion(false);
});

afterEach(() => {
  resetAppearance();
});

describe("useMicroAnimation - 时长", () => {
  it("默认 200ms 动画时长", () => {
    const { result } = renderHook(() => useMicroAnimation());
    expect(result.durationMs).toBe(200);
    expect(result.enabled).toBe(true);
    expect(result.isReducedMotionEnabled).toBe(false);
  });

  it("reduced motion: 时长压缩到 50ms 以内", () => {
    setSystemPrefersReducedMotion(true);
    const { result } = renderHook(() => useMicroAnimation());
    expect(result.isReducedMotionEnabled).toBe(true);
    expect(result.durationMs).toBeLessThanOrEqual(REDUCED_MOTION_MAX_DURATION_MS);
  });

  it("forceDisabled 关闭所有过渡", () => {
    const { result } = renderHook(() => useMicroAnimation({ forceDisabled: true }));
    expect(result.enabled).toBe(false);
    expect(result.durationMs).toBe(0);
    expect(result.fadeIn(true).transition).toBe("transition: none");
  });

  it("用户设置 on 也触发 reduce 行为", () => {
    act(() => {
      useAppearanceStore.getState().setReducedMotionMode("on");
    });
    const { result } = renderHook(() => useMicroAnimation());
    expect(result.isReducedMotionEnabled).toBe(true);
    expect(result.durationMs).toBeLessThanOrEqual(REDUCED_MOTION_MAX_DURATION_MS);
  });
});

describe("useMicroAnimation - fadeIn", () => {
  it("visible 状态", () => {
    const { result } = renderHook(() => useMicroAnimation());
    const style = result.fadeIn(true);
    expect(style.opacity).toBe(1);
    expect(style.transition).toMatch(/opacity 200ms/);
  });

  it("hidden 状态", () => {
    const { result } = renderHook(() => useMicroAnimation());
    const style = result.fadeIn(false);
    expect(style.opacity).toBe(0);
  });

  it("reduced motion 下时长缩短", () => {
    setSystemPrefersReducedMotion(true);
    const { result } = renderHook(() => useMicroAnimation());
    const style = result.fadeIn(true);
    expect(style.transition).toMatch(/opacity 50ms/);
  });
});

describe("useMicroAnimation - scale", () => {
  it("visible 状态回到 scale(1)", () => {
    const { result } = renderHook(() => useMicroAnimation());
    const style = result.scale(true);
    expect(style.transform).toBe("scale(1)");
  });

  it("hidden 状态从 0.95 缩放", () => {
    const { result } = renderHook(() => useMicroAnimation());
    const style = result.scale(false);
    expect(style.transform).toBe("scale(0.95)");
  });
});

describe("useMicroAnimation - slideIn", () => {
  it("visible 回到 translate(0,0)", () => {
    const { result } = renderHook(() => useMicroAnimation());
    const style = result.slideIn(true, "up", 20);
    expect(style.transform).toBe("translate(0, 0)");
  });

  it("hidden 时输出方向对应的位移", () => {
    const { result } = renderHook(() => useMicroAnimation());
    expect(result.slideIn(false, "up", 20).transform).toBe("translateY(20px)");
    expect(result.slideIn(false, "down", 10).transform).toBe("translateY(-10px)");
    expect(result.slideIn(false, "left", 5).transform).toBe("translateX(5px)");
    expect(result.slideIn(false, "right", 8).transform).toBe("translateX(-8px)");
  });

  it("reduced motion 下不输出位移", () => {
    setSystemPrefersReducedMotion(true);
    const { result } = renderHook(() => useMicroAnimation());
    const style = result.slideIn(false, "up", 20);
    expect(style.transform).toBe("translate(0, 0)");
    expect(style.transition).toBe("transition: none");
  });
});

describe("useMicroAnimation - expand", () => {
  it("expanded 时 maxHeight", () => {
    const { result } = renderHook(() => useMicroAnimation());
    const style = result.expand(true, 500);
    expect(style.maxHeight).toBe("500px");
    expect(style.opacity).toBe(1);
  });

  it("collapsed 时 maxHeight=0", () => {
    const { result } = renderHook(() => useMicroAnimation());
    const style = result.expand(false, 500);
    expect(style.maxHeight).toBe("0");
    expect(style.opacity).toBe(0);
  });

  it("forceDisabled 时无 transition", () => {
    const { result } = renderHook(() => useMicroAnimation({ forceDisabled: true }));
    const style = result.expand(true);
    expect(style.transition).toBe("transition: none");
  });
});

describe("useMicroAnimation - DOM 联动", () => {
  it("reduced motion 启用时同步 data-reduced-motion", () => {
    setSystemPrefersReducedMotion(true);
    renderHook(() => useMicroAnimation());
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBe("true");
  });
});

// 简单引用 applyReducedMotionToDom 以避免 unused import
void applyReducedMotionToDom;
