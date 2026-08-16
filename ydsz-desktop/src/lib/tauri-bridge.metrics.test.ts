/**
 * @file tauriMetrics measureTauriInvoke 集成测试
 *
 * 验证 `measureTauriInvoke` 包装器能够：
 * - 成功调用后自动记录 P99 采样
 * - 失败调用也会被记录（successRate=0）
 * - 多次调用同一命令会累加 count
 * - 不同命令的样本独立累加
 *
 * 注意：测试覆盖 `measureTauriInvoke` 而非 `tauri-bridge` 的实际调用，
 * 因为产品代码当前直接调 `invoke(...)`（这是已知的 todo,见后续性能监控
 * 集成 plan），由调用方显式包 measureTauriInvoke 触发埋点。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  clearAllTauriCommandMetrics,
  measureTauriInvoke,
  useAllTauriCommandMetrics,
} from "./tauriMetrics";

beforeEach(() => {
  clearAllTauriCommandMetrics();
});

afterEach(() => {
  clearAllTauriCommandMetrics();
});

describe("measureTauriInvoke P99 埋点", () => {
  it("成功调用后会记录 P99 采样", async () => {
    const invoker = vi.fn().mockResolvedValueOnce(undefined);
    await measureTauriInvoke("set_theme", invoker);

    const { result } = renderHook(() => useAllTauriCommandMetrics());
    expect(result.current.length).toBe(1);
    expect(result.current[0].command).toBe("set_theme");
    expect(result.current[0].count).toBe(1);
  });

  it("不同命令独立记录", async () => {
    const setThemeInvoker = vi.fn().mockResolvedValue(undefined);
    const showInFolderInvoker = vi.fn().mockResolvedValue(undefined);

    await measureTauriInvoke("set_theme", setThemeInvoker);
    await measureTauriInvoke("show_in_folder", showInFolderInvoker);
    await measureTauriInvoke("show_in_folder", showInFolderInvoker);

    const { result } = renderHook(() => useAllTauriCommandMetrics());
    expect(result.current.length).toBe(2);
    const setThemeMetric = result.current.find((m) => m.command === "set_theme");
    const showInFolderMetric = result.current.find(
      (m) => m.command === "show_in_folder",
    );
    expect(setThemeMetric?.count).toBe(1);
    expect(showInFolderMetric?.count).toBe(2);
  });

  it("多次调用同一命令会累加 count", async () => {
    const invoker = vi.fn().mockResolvedValue(undefined);
    await measureTauriInvoke("set_theme", invoker);
    await measureTauriInvoke("set_theme", invoker);
    await measureTauriInvoke("set_theme", invoker);

    const { result } = renderHook(() => useAllTauriCommandMetrics());
    expect(result.current.length).toBe(1);
    expect(result.current[0].count).toBe(3);
  });

  it("失败调用也会被记录（successRate=0）", async () => {
    const invoker = vi.fn().mockRejectedValueOnce(new Error("invoke failed"));
    await expect(
      measureTauriInvoke("set_theme", invoker),
    ).rejects.toThrow("invoke failed");

    const { result } = renderHook(() => useAllTauriCommandMetrics());
    expect(result.current.length).toBe(1);
    expect(result.current[0].command).toBe("set_theme");
    expect(result.current[0].count).toBe(1);
    expect(result.current[0].successRate).toBe(0);
  });

  it("成功后清空 metrics,下次调用会重新开始累积", async () => {
    const invoker = vi.fn().mockResolvedValue(undefined);
    await measureTauriInvoke("set_theme", invoker);
    await measureTauriInvoke("set_theme", invoker);

    const before = renderHook(() => useAllTauriCommandMetrics());
    expect(before.result.current[0].count).toBe(2);

    clearAllTauriCommandMetrics();

    await measureTauriInvoke("set_theme", invoker);

    const after = renderHook(() => useAllTauriCommandMetrics());
    expect(after.result.current[0].count).toBe(1);
  });
});
