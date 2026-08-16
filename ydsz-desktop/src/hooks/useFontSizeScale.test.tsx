/**
 * @file useFontSizeScale 单元测试
 *
 * 覆盖:
 *
 * 1. 默认值与 localStorage 持久化
 * 2. 规范化非法值
 * 3. 应用到 DOM (--font-size-base、font-size、data-attr)
 * 4. resetFontSizeScale 重置回 medium
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFontSizeScale, FONT_SIZE_PX } from "./useFontSizeScale";
import { useAppearanceStore, FONT_SIZE_STORAGE_KEY } from "../shared/appearanceStore";

// 让 happy-dom 下 React 18 的 act() 正常工作
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE_KEY = FONT_SIZE_STORAGE_KEY;

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

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  useAppearanceStore.setState({ fontSizeScale: "medium" });
  document.documentElement.removeAttribute("data-font-size-scale");
  document.documentElement.style.removeProperty("--font-size-base");
  document.documentElement.style.removeProperty("font-size");
});

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

describe("useFontSizeScale", () => {
  it("defaults to medium when no localStorage value is set", () => {
    const { result } = renderHook(() => useFontSizeScale());
    expect(result.fontSizeScale).toBe("medium");
    expect(result.fontSizePx).toBe(FONT_SIZE_PX.medium);
  });

  it("applies the medium scale to <html> on mount", () => {
    renderHook(() => useFontSizeScale());
    expect(document.documentElement.style.getPropertyValue("--font-size-base")).toBe(
      `${FONT_SIZE_PX.medium}px`,
    );
    expect(document.documentElement.style.getPropertyValue("font-size")).toBe(
      `${FONT_SIZE_PX.medium}px`,
    );
    expect(document.documentElement.getAttribute("data-font-size-scale")).toBe("medium");
  });

  it("setFontSizeScale persists to localStorage and updates DOM", () => {
    const { result } = renderHook(() => useFontSizeScale());

    act(() => {
      result.setFontSizeScale("large");
    });

    // 验证 store + localStorage + DOM 三个层面都同步
    expect(useAppearanceStore.getState().fontSizeScale).toBe("large");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toBe("large");
    expect(document.documentElement.style.getPropertyValue("--font-size-base")).toBe(
      `${FONT_SIZE_PX.large}px`,
    );
    expect(document.documentElement.getAttribute("data-font-size-scale")).toBe("large");
  });

  it("rejects invalid values via the public setter", () => {
    const { result } = renderHook(() => useFontSizeScale());
    act(() => {
      // 类型层面不允许,但运行时也应兜底
      result.setFontSizeScale("huge" as never);
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("medium");
  });

  it("resetFontSizeScale returns to medium", () => {
    const { result } = renderHook(() => useFontSizeScale());
    act(() => {
      result.setFontSizeScale("xlarge");
    });
    expect(useAppearanceStore.getState().fontSizeScale).toBe("xlarge");

    act(() => {
      result.resetFontSizeScale();
    });

    expect(useAppearanceStore.getState().fontSizeScale).toBe("medium");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toBe("medium");
  });
});
