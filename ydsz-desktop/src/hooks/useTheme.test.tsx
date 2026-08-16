//! # useTheme Hook 单元测试
//!
//! 覆盖目标（最小集）：
//! - 默认主题状态：mode = "system" / isDefaultActiveTheme = true
//! - setTheme("dark") 持久化到 localStorage
//! - setTheme("light") 持久化到 localStorage
//! - resetAllThemes() 还原到默认
//! - resolvedTheme 在 mode="dark" 时返回 "dark"
//! - 模块顶层副作用：DOM root 属性被正确设置
//!
//! tauriBridge 与 env 通过 mock 完全隔离。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// 隔离 Tauri bridge
vi.mock("../lib/tauri-bridge", () => ({
  tauriBridge: {
    setTheme: vi.fn().mockResolvedValue(undefined),
  },
}));

import { useTheme } from "./useTheme";
import { DEFAULT_THEME_STATE } from "../theme/theme.logic";

const STORAGE_KEY = "ydsz-buddy:theme";

beforeEach(() => {
  localStorage.clear();
  // 清空 DOM root 属性
  document.documentElement.removeAttribute("data-code-theme-id");
  document.documentElement.removeAttribute("data-theme-mode");
  document.documentElement.removeAttribute("data-theme-variant");
  document.documentElement.removeAttribute("data-window-material");
  document.documentElement.classList.remove("dark", "no-transitions");
});

afterEach(() => {
  localStorage.clear();
});

describe("useTheme", () => {
  it("初始默认：mode='system'，isDefaultActiveTheme=true", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
    expect(result.current.isDefaultActiveTheme).toBe(true);
    expect(result.current.themeState.mode).toBe("system");
  });

  it("setTheme('dark') 持久化到 localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.theme).toBe("dark");
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).mode).toBe("dark");
  });

  it("setTheme('light') 持久化到 localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("light");
    });
    expect(result.current.theme).toBe("light");
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.mode).toBe("light");
  });

  it("resolvedTheme 跟随 setTheme('dark') 变为 'dark'", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe("light"); // 系统未深色 → 解析为 light
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("resetAllThemes() 还原到 DEFAULT_THEME_STATE", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.theme).toBe("dark");
    act(() => {
      result.current.resetAllThemes();
    });
    expect(result.current.theme).toBe(DEFAULT_THEME_STATE.mode);
    expect(result.current.isDefaultActiveTheme).toBe(true);
  });

  it("isDefaultThemePack('light') 初始为 true", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDefaultThemePack("light")).toBe(true);
    expect(result.current.isDefaultThemePack("dark")).toBe(true);
  });

  it("updateThemePack 修改后 isDefaultThemePack 返回 false", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.updateThemePack("light", { accent: "#ff0000" } as never);
    });
    expect(result.current.isDefaultThemePack("light")).toBe(false);
  });

  it("setCodeThemeId 修改 codeThemeId", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setCodeThemeId("dark", "catppuccin");
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    // codeThemeId 持久化在 codeThemeIds[variant] 字段
    // catppuccin 是 CODE_THEME_OPTIONS 中有效的 dark 主题
    expect(stored.codeThemeIds.dark).toBe("catppuccin");
  });

  it("DOM root 属性在 setTheme 后更新", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(document.documentElement.getAttribute("data-theme-mode")).toBe("dark");
  });

  it("exportThemeString 返回非空字符串", () => {
    const { result } = renderHook(() => useTheme());
    const s = result.current.exportThemeString("light");
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });
});
