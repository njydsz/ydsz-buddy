//! # useUIFont Hook 单元测试
//!
//! 覆盖目标：
//! - 设置 uiFontFamily → 写入 CSS 变量
//! - 清空 uiFontFamily → 移除 CSS 变量
//! - 切换 uiFontFamily → 重新应用

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useUIFont } from "./useUIFont";

// mock useAppSettings
vi.mock("../appSettings", () => ({
  useAppSettings: vi.fn(),
}));

import { useAppSettings } from "../appSettings";

const mockedUseAppSettings = useAppSettings as unknown as ReturnType<typeof vi.fn>;

const VAR_NAME = "--app-font-ui-override";

function setUiFontFamily(value: string | null | undefined) {
  mockedUseAppSettings.mockReturnValue({
    settings: { uiFontFamily: value },
  });
}

describe("useUIFont Hook", () => {
  beforeEach(() => {
    // 清理根元素的 inline style
    document.documentElement.removeAttribute("style");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uiFontFamily 为字符串 → 写入 CSS 变量", () => {
    setUiFontFamily("Inter");
    renderHook(() => useUIFont());
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("Inter");
  });

  it("uiFontFamily 包含空格 → 标准化为带引号", () => {
    setUiFontFamily("Helvetica Neue");
    renderHook(() => useUIFont());
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe('"Helvetica Neue"');
  });

  it("uiFontFamily 为 CSS 通用关键字 → 直接保留", () => {
    setUiFontFamily("system-ui");
    renderHook(() => useUIFont());
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("system-ui");
  });

  it("uiFontFamily 为空字符串 → 移除 CSS 变量", () => {
    // 先设置一个值
    document.documentElement.style.setProperty(VAR_NAME, "Inter");
    setUiFontFamily("");
    renderHook(() => useUIFont());
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("");
  });

  it("uiFontFamily 为 null → 移除 CSS 变量", () => {
    document.documentElement.style.setProperty(VAR_NAME, "Inter");
    setUiFontFamily(null);
    renderHook(() => useUIFont());
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("");
  });

  it("uiFontFamily 为 undefined → 移除 CSS 变量", () => {
    document.documentElement.style.setProperty(VAR_NAME, "Inter");
    setUiFontFamily(undefined);
    renderHook(() => useUIFont());
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("");
  });

  it("uiFontFamily 变化 → 重新应用(更新 CSS 变量)", () => {
    setUiFontFamily("Inter");
    const { rerender } = renderHook(() => useUIFont());
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("Inter");
    // 切换
    setUiFontFamily("Roboto");
    rerender();
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("Roboto");
  });

  it("uiFontFamily 从有值变为 null → 移除 CSS 变量", () => {
    setUiFontFamily("Inter");
    const { rerender } = renderHook(() => useUIFont());
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("Inter");
    setUiFontFamily(null);
    rerender();
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("");
  });

  it("uiFontFamily 包含多字体族(逗号分隔)→ 整体规范化为合法 CSS", () => {
    setUiFontFamily("Inter, Roboto, system-ui");
    renderHook(() => useUIFont());
    // 多个 family 中,只有含空格的会被加引号,通用关键字直接保留
    expect(
      document.documentElement.style.getPropertyValue(VAR_NAME),
    ).toBe("Inter, Roboto, system-ui");
  });
});
