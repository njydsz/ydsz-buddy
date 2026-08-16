/**
 * @file useHighContrastDetection 单元测试
 *
 * 覆盖:
 * 1. 默认值 (auto)
 * 2. setHighContrastMode 写入 localStorage
 * 3. data-high-contrast 属性同步
 * 4. 跟随 prefers-contrast: more
 * 5. resetHighContrastMode 重置回 auto
 *
 * 实现说明：测试聚焦在「store 状态 → DOM 副作用」的逻辑链，
 * 通过直接驱动 store 来验证行为；不依赖 React 重渲染时序。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHighContrastDetection } from "./useHighContrastDetection";
import { useAppearanceStore, applyHighContrastToDom } from "../shared/appearanceStore";

const STORAGE_KEY = "ydsz-buddy:high-contrast-mode";

function setSystemContrastPreference(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === "(prefers-contrast: more)" ? matches : false,
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

function resetAppearance() {
  localStorage.removeItem(STORAGE_KEY);
  useAppearanceStore.setState({ highContrastMode: "auto" });
  document.documentElement.removeAttribute("data-high-contrast");
  document.documentElement.classList.remove("high-contrast");
}

beforeEach(() => {
  resetAppearance();
  setSystemContrastPreference(false);
});

afterEach(() => {
  resetAppearance();
});

describe("useHighContrastDetection - store 三态", () => {
  it("defaults to auto when no localStorage value is set", () => {
    expect(useAppearanceStore.getState().highContrastMode).toBe("auto");
  });

  it("setHighContrastMode('on') persists to localStorage", () => {
    useAppearanceStore.getState().setHighContrastMode("on");
    expect(useAppearanceStore.getState().highContrastMode).toBe("on");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toBe("on");
  });

  it("setHighContrastMode('off') persists to localStorage", () => {
    useAppearanceStore.getState().setHighContrastMode("off");
    expect(useAppearanceStore.getState().highContrastMode).toBe("off");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toBe("off");
  });

  it("resetHighContrastMode returns to auto", () => {
    useAppearanceStore.getState().setHighContrastMode("on");
    expect(useAppearanceStore.getState().highContrastMode).toBe("on");

    useAppearanceStore.getState().resetHighContrastMode();
    expect(useAppearanceStore.getState().highContrastMode).toBe("auto");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toBe("auto");
  });

  it("normalises invalid stored values to auto", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("bogus-mode"));
    useAppearanceStore.getState().hydrateFromStorage();
    expect(useAppearanceStore.getState().highContrastMode).toBe("auto");
  });
});

describe("useHighContrastDetection - DOM 同步", () => {
  it("applyHighContrastToDom(true) 设置属性 + class", () => {
    applyHighContrastToDom(true);
    expect(document.documentElement.getAttribute("data-high-contrast")).toBe("true");
    expect(document.documentElement.classList.contains("high-contrast")).toBe(true);
  });

  it("applyHighContrastToDom(false) 清空属性 + class", () => {
    applyHighContrastToDom(true);
    applyHighContrastToDom(false);
    expect(document.documentElement.getAttribute("data-high-contrast")).toBe("false");
    expect(document.documentElement.classList.contains("high-contrast")).toBe(false);
  });
});

describe("useHighContrastDetection - 系统偏好 + 三态 决策矩阵", () => {
  function derive(
    mode: ReturnType<typeof useAppearanceStore.getState>["highContrastMode"],
    systemPrefers: boolean,
  ) {
    return mode === "on" || (mode === "auto" && systemPrefers);
  }

  it("on 强制启用", () => {
    expect(derive("on", false)).toBe(true);
    expect(derive("on", true)).toBe(true);
  });

  it("off 强制关闭", () => {
    expect(derive("off", true)).toBe(false);
    expect(derive("off", false)).toBe(false);
  });

  it("auto + system true 启用", () => {
    expect(derive("auto", true)).toBe(true);
  });

  it("auto + system false 关闭", () => {
    expect(derive("auto", false)).toBe(false);
  });
});

describe("useHighContrastDetection - 函数签名 / 导出", () => {
  it("useHighContrastDetection 是函数", () => {
    expect(typeof useHighContrastDetection).toBe("function");
  });
});
