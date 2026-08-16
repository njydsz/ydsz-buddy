/**
 * @file appearanceStore 单元测试
 *
 * 覆盖:
 *
 * 1. 默认值与 localStorage 持久化
 * 2. setFontSizeScale / setHighContrastMode 写入并立即同步
 * 3. 规范化非法值
 * 4. resetXxx 回到默认值
 * 5. 跨标签页 storage 事件触发 hydrateFromStorage
 * 6. 多 hook 订阅同一 store 时实时联动
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAppearanceStore } from "./appearanceStore";
import { useFontSizeScale } from "../hooks/useFontSizeScale";
import { useHighContrastDetection } from "../hooks/useHighContrastDetection";
import {
  FONT_SIZE_STORAGE_KEY,
  HIGH_CONTRAST_STORAGE_KEY,
  REDUCED_MOTION_STORAGE_KEY,
  applyFontSizeToDom,
  applyHighContrastToDom,
  applyReducedMotionToDom,
  applyThemeTransitionToDom,
  installAppearanceStorageBridge,
  __resetAppearanceStorageBridgeForTest,
} from "./appearanceStore";

// 让 happy-dom 下 React 18 的 act() 正常工作
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetBridgeForTest() {
  __resetAppearanceStorageBridgeForTest();
}

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

function resetAppearanceStore() {
  localStorage.removeItem(FONT_SIZE_STORAGE_KEY);
  localStorage.removeItem(HIGH_CONTRAST_STORAGE_KEY);
  localStorage.removeItem(REDUCED_MOTION_STORAGE_KEY);
  useAppearanceStore.setState({
    fontSizeScale: "medium",
    highContrastMode: "auto",
    reducedMotionMode: "auto",
  });
  document.documentElement.removeAttribute("data-font-size-scale");
  document.documentElement.style.removeProperty("--font-size-base");
  document.documentElement.style.removeProperty("font-size");
  document.documentElement.removeAttribute("data-high-contrast");
  document.documentElement.classList.remove("high-contrast");
  document.documentElement.removeAttribute("data-reduced-motion");
  document.documentElement.classList.remove("reduce-motion");
}

beforeEach(() => {
  resetAppearanceStore();
});

afterEach(() => {
  resetAppearanceStore();
});

describe("appearanceStore - 持久化与同步", () => {
  it("defaults to medium fontSize, auto highContrast, auto reducedMotion", () => {
    const state = useAppearanceStore.getState();
    expect(state.fontSizeScale).toBe("medium");
    expect(state.highContrastMode).toBe("auto");
    expect(state.reducedMotionMode).toBe("auto");
  });

  it("setFontSizeScale persists to localStorage", () => {
    act(() => {
      useAppearanceStore.getState().setFontSizeScale("large");
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("large");
    expect(JSON.parse(localStorage.getItem(FONT_SIZE_STORAGE_KEY) ?? "null")).toBe("large");
  });

  it("setHighContrastMode persists to localStorage", () => {
    act(() => {
      useAppearanceStore.getState().setHighContrastMode("on");
    });
    expect(useAppearanceStore.getState().highContrastMode).toBe("on");
    expect(JSON.parse(localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY) ?? "null")).toBe("on");
  });

  it("setFontSizeScale ignores invalid values", () => {
    act(() => {
      useAppearanceStore.getState().setFontSizeScale("huge" as never);
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("medium");
  });

  it("setHighContrastMode normalises unknown values to auto", () => {
    act(() => {
      useAppearanceStore.getState().setHighContrastMode("maybe" as never);
    });
    expect(useAppearanceStore.getState().highContrastMode).toBe("auto");
  });

  it("resetFontSizeScale returns to medium", () => {
    act(() => {
      useAppearanceStore.getState().setFontSizeScale("xlarge");
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("xlarge");

    act(() => {
      useAppearanceStore.getState().resetFontSizeScale();
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("medium");
    expect(JSON.parse(localStorage.getItem(FONT_SIZE_STORAGE_KEY) ?? "null")).toBe("medium");
  });

  it("resetHighContrastMode returns to auto", () => {
    act(() => {
      useAppearanceStore.getState().setHighContrastMode("on");
    });

    act(() => {
      useAppearanceStore.getState().resetHighContrastMode();
    });
    expect(useAppearanceStore.getState().highContrastMode).toBe("auto");
    expect(JSON.parse(localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY) ?? "null")).toBe("auto");
  });

  it("setReducedMotionMode persists to localStorage", () => {
    act(() => {
      useAppearanceStore.getState().setReducedMotionMode("on");
    });
    expect(useAppearanceStore.getState().reducedMotionMode).toBe("on");
    expect(JSON.parse(localStorage.getItem(REDUCED_MOTION_STORAGE_KEY) ?? "null")).toBe("on");
  });

  it("setReducedMotionMode normalises unknown values to auto", () => {
    act(() => {
      useAppearanceStore.getState().setReducedMotionMode("nope" as never);
    });
    expect(useAppearanceStore.getState().reducedMotionMode).toBe("auto");
  });

  it("resetReducedMotionMode returns to auto", () => {
    act(() => {
      useAppearanceStore.getState().setReducedMotionMode("off");
    });

    act(() => {
      useAppearanceStore.getState().resetReducedMotionMode();
    });
    expect(useAppearanceStore.getState().reducedMotionMode).toBe("auto");
    expect(JSON.parse(localStorage.getItem(REDUCED_MOTION_STORAGE_KEY) ?? "null")).toBe("auto");
  });
});

describe("appearanceStore - DOM 应用", () => {
  it("applyFontSizeToDom sets CSS variables and data attribute", () => {
    applyFontSizeToDom("large");
    expect(document.documentElement.style.getPropertyValue("--font-size-base")).toBe("18px");
    expect(document.documentElement.style.getPropertyValue("font-size")).toBe("18px");
    expect(document.documentElement.getAttribute("data-font-size-scale")).toBe("large");
  });

  it("applyHighContrastToDom sets data attribute and class", () => {
    applyHighContrastToDom(true);
    expect(document.documentElement.getAttribute("data-high-contrast")).toBe("true");
    expect(document.documentElement.classList.contains("high-contrast")).toBe(true);

    applyHighContrastToDom(false);
    expect(document.documentElement.getAttribute("data-high-contrast")).toBe("false");
    expect(document.documentElement.classList.contains("high-contrast")).toBe(false);
  });

  it("applyReducedMotionToDom sets data attribute and class", () => {
    applyReducedMotionToDom(true);
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBe("true");
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);

    applyReducedMotionToDom(false);
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBe("false");
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
  });

  it("applyThemeTransitionToDom(W5-D-9) sets class and data attribute", () => {
    applyThemeTransitionToDom(true);
    expect(document.documentElement.getAttribute("data-theme-transition")).toBe("true");
    expect(document.documentElement.classList.contains("theme-transition")).toBe(true);

    applyThemeTransitionToDom(false);
    expect(document.documentElement.getAttribute("data-theme-transition")).toBe("false");
    expect(document.documentElement.classList.contains("theme-transition")).toBe(false);
  });

  it("applyThemeTransitionToDom 默认启用", () => {
    applyThemeTransitionToDom();
    expect(document.documentElement.classList.contains("theme-transition")).toBe(true);
  });
});

describe("appearanceStore - 多组件实时联动", () => {
  it("useFontSizeScale and store stay in sync", () => {
    const handle = renderHook(() => useFontSizeScale());
    expect(handle.result.fontSizeScale).toBe("medium");

    act(() => {
      handle.result.setFontSizeScale("xlarge");
    });
    expect(handle.result.fontSizeScale).toBe("xlarge");
    expect(useAppearanceStore.getState().fontSizeScale).toBe("xlarge");
    handle.unmount();
  });

  it("store mutation propagates to useFontSizeScale", () => {
    const handle = renderHook(() => useFontSizeScale());
    expect(handle.result.fontSizeScale).toBe("medium");

    act(() => {
      useAppearanceStore.getState().setFontSizeScale("small");
    });
    expect(handle.result.fontSizeScale).toBe("small");
    handle.unmount();
  });

  it("useHighContrastDetection toggles DOM and isHighContrastEnabled", () => {
    const handle = renderHook(() => useHighContrastDetection());
    expect(handle.result.highContrastMode).toBe("auto");
    expect(handle.result.isHighContrastEnabled).toBe(false);

    act(() => {
      handle.result.setHighContrastMode("on");
    });
    expect(handle.result.highContrastMode).toBe("on");
    expect(handle.result.isHighContrastEnabled).toBe(true);
    expect(document.documentElement.getAttribute("data-high-contrast")).toBe("true");
    handle.unmount();
  });

  it("store mutation propagates to useHighContrastDetection", () => {
    const handle = renderHook(() => useHighContrastDetection());
    expect(handle.result.highContrastMode).toBe("auto");

    act(() => {
      useAppearanceStore.getState().setHighContrastMode("on");
    });
    expect(handle.result.highContrastMode).toBe("on");
    expect(handle.result.isHighContrastEnabled).toBe(true);
    handle.unmount();
  });
});

describe("appearanceStore - useReducedMotion 联动", () => {
  it("store mutation propagates to useReducedMotion 风格的 reactivity", async () => {
    // 不直接 import useReducedMotion(会触发 matchMedia 副作用);改为验证 store getter 行为
    act(() => {
      useAppearanceStore.getState().setReducedMotionMode("on");
    });
    expect(useAppearanceStore.getState().reducedMotionMode).toBe("on");
    act(() => {
      useAppearanceStore.getState().setReducedMotionMode("auto");
    });
    expect(useAppearanceStore.getState().reducedMotionMode).toBe("auto");
  });
});

describe("appearanceStore - 跨标签页 hydrate", () => {
  it("hydrateFromStorage picks up FONT_SIZE change from localStorage", () => {
    act(() => {
      useAppearanceStore.getState().setFontSizeScale("medium");
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("medium");

    // 模拟其他标签页写入 localStorage
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, JSON.stringify("xlarge"));
    act(() => {
      useAppearanceStore.getState().hydrateFromStorage();
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("xlarge");
  });

  it("hydrateFromStorage picks up HIGH_CONTRAST change from localStorage", () => {
    act(() => {
      useAppearanceStore.getState().setHighContrastMode("auto");
    });

    localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, JSON.stringify("off"));
    act(() => {
      useAppearanceStore.getState().hydrateFromStorage();
    });
    expect(useAppearanceStore.getState().highContrastMode).toBe("off");
  });

  it("hydrateFromStorage normalises invalid persisted values", () => {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, JSON.stringify("bogus"));
    localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, JSON.stringify("nope"));
    localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, JSON.stringify("maybe"));
    act(() => {
      useAppearanceStore.getState().hydrateFromStorage();
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("medium");
    expect(useAppearanceStore.getState().highContrastMode).toBe("auto");
    expect(useAppearanceStore.getState().reducedMotionMode).toBe("auto");
  });

  it("installAppearanceStorageBridge hydrates on storage event", () => {
    // 重置模块级单例,确保当前测试注册一次 listener
    resetBridgeForTest();
    installAppearanceStorageBridge();

    act(() => {
      useAppearanceStore.getState().setFontSizeScale("medium");
    });
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, JSON.stringify("xlarge"));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: FONT_SIZE_STORAGE_KEY }));
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("xlarge");
  });
});
