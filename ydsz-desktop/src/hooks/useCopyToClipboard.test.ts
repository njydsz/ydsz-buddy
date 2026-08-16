//! # useCopyToClipboard Hook 单元测试
//!
//! 覆盖目标：
//! - 纯函数 `copyTextToClipboard`：Clipboard API / execCommand 降级 / 不可用 / 空值 / 失败链路
//! - Hook 行为：复制成功状态、自动重置、onCopy/onError 回调、ctx 透传、timeout:0、卸载清理

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { copyTextToClipboard, useCopyToClipboard } from "./useCopyToClipboard";

// ──────────────────────────────────────────────────────────────────────────────
// 工具函数:copyTextToClipboard
// ──────────────────────────────────────────────────────────────────────────────

describe("copyTextToClipboard", () => {
  let writeText: ReturnType<typeof vi.fn>;
  let execCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = execCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("空字符串 → 直接 return,不调用任何 API", async () => {
    await copyTextToClipboard("");
    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("Clipboard API 可用 → 优先使用 writeText", async () => {
    await copyTextToClipboard("hello");
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("Clipboard API 失败 + execCommand 成功 → 走降级且不抛错", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    execCommand.mockReturnValueOnce(true);
    await expect(copyTextToClipboard("hello")).resolves.toBeUndefined();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("Clipboard API 失败 + execCommand 也失败 → 抛出原始 Clipboard 错误", async () => {
    const original = new Error("denied");
    writeText.mockRejectedValueOnce(original);
    execCommand.mockReturnValueOnce(false);
    await expect(copyTextToClipboard("hello")).rejects.toBe(original);
  });

  it("Clipboard API 不可用 + execCommand 成功 → 走降级", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    execCommand.mockReturnValueOnce(true);
    await copyTextToClipboard("hello");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("Clipboard API 不存在(无 writeText)+ execCommand 成功", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: undefined },
    });
    execCommand.mockReturnValueOnce(true);
    await copyTextToClipboard("hello");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("Clipboard API 不可用 + execCommand 失败 → 抛 Clipboard API unavailable.", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    execCommand.mockReturnValueOnce(false);
    await expect(copyTextToClipboard("hello")).rejects.toThrow(
      "Clipboard API unavailable.",
    );
  });

  it("window 不存在 → 抛 Clipboard API unavailable.", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    // @ts-expect-error: 测试临时清空 window
    delete (globalThis as { window?: unknown }).window;
    try {
      await expect(copyTextToClipboard("hello")).rejects.toThrow(
        "Clipboard API unavailable.",
      );
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Hook 行为
// ──────────────────────────────────────────────────────────────────────────────

describe("useCopyToClipboard Hook", () => {
  let writeText: ReturnType<typeof vi.fn>;
  let execCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    writeText = vi.fn().mockResolvedValue(undefined);
    execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    document.execCommand = execCommand;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("初始 isCopied 为 false", () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.isCopied).toBe(false);
  });

  it("复制成功 → isCopied 变 true,onCopy 被调用并透传 ctx", async () => {
    const onCopy = vi.fn();
    const { result } = renderHook(() =>
      useCopyToClipboard<{ id: string }>({ onCopy }),
    );
    await act(async () => {
      result.current.copyToClipboard("hello", { id: "x" });
      // 让内部 promise 链 resolve
      await Promise.resolve();
    });
    expect(result.current.isCopied).toBe(true);
    expect(onCopy).toHaveBeenCalledWith({ id: "x" });
  });

  it("自动重置:timeout 后 isCopied 回到 false", async () => {
    const { result } = renderHook(() =>
      useCopyToClipboard({ timeout: 1000 }),
    );
    await act(async () => {
      result.current.copyToClipboard("hello", undefined);
      await Promise.resolve();
    });
    expect(result.current.isCopied).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.isCopied).toBe(false);
  });

  it("连续复制:旧 timer 取消,新 timer 启用", async () => {
    const { result } = renderHook(() =>
      useCopyToClipboard({ timeout: 1000 }),
    );
    await act(async () => {
      result.current.copyToClipboard("first", undefined);
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
      result.current.copyToClipboard("second", undefined);
      await Promise.resolve();
    });
    // 此时 isCopied 仍为 true(因为新 timer 重置)
    expect(result.current.isCopied).toBe(true);
    // 500ms 后(新 timer 起点 + 500ms)不应重置
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.isCopied).toBe(true);
    // 再走 500ms 才到 1000ms
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.isCopied).toBe(false);
  });

  it("timeout:0 → 不自动重置,isCopied 保持 true", async () => {
    const { result } = renderHook(() =>
      useCopyToClipboard({ timeout: 0 }),
    );
    await act(async () => {
      result.current.copyToClipboard("hello", undefined);
      await Promise.resolve();
    });
    expect(result.current.isCopied).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.isCopied).toBe(true);
  });

  it("复制失败 + 提供 onError → 调用 onError(error, ctx),isCopied 不变", async () => {
    const err = new Error("denied");
    writeText.mockRejectedValueOnce(err);
    execCommand.mockReturnValueOnce(false);
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useCopyToClipboard<number>({ onError }),
    );
    await act(async () => {
      result.current.copyToClipboard("hello", 42);
      // 等待 promise 链 + 微任务
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBe(err);
    expect(onError.mock.calls[0]?.[1]).toBe(42);
    expect(result.current.isCopied).toBe(false);
  });

  it("复制失败 + 未提供 onError → 走 console.error,isCopied 不变", async () => {
    const err = new Error("denied");
    writeText.mockRejectedValueOnce(err);
    execCommand.mockReturnValueOnce(false);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      result.current.copyToClipboard("hello", undefined);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(consoleError).toHaveBeenCalledWith(err);
    expect(result.current.isCopied).toBe(false);
  });

  it("onCopy / onError 引用更新后:最新回调生效(闭包 ref)", async () => {
    const firstOnCopy = vi.fn();
    const secondOnCopy = vi.fn();
    const { result, rerender } = renderHook(
      ({ onCopy }: { onCopy: (ctx: string) => void }) =>
        useCopyToClipboard<string>({ onCopy }),
      { initialProps: { onCopy: firstOnCopy } },
    );
    rerender({ onCopy: secondOnCopy });
    await act(async () => {
      result.current.copyToClipboard("hello", "ctx");
      await Promise.resolve();
    });
    expect(firstOnCopy).not.toHaveBeenCalled();
    expect(secondOnCopy).toHaveBeenCalledWith("ctx");
  });

  it("卸载时清理 timer(避免 setState-after-unmount)", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { result, unmount } = renderHook(() =>
      useCopyToClipboard({ timeout: 1000 }),
    );
    await act(async () => {
      result.current.copyToClipboard("hello", undefined);
      await Promise.resolve();
    });
    clearSpy.mockClear();
    unmount();
    // useEffect 清理函数应当 clearTimeout
    expect(clearSpy).toHaveBeenCalled();
  });

  it("空字符串调用 copyToClipboard → 不触发底层 API,但 isCopied 仍变 true(实现细节,见源码)", async () => {
    // 纯函数 copyTextToClipboard 对空字符串直接 return,所以 navigator.clipboard / execCommand 都不会被调用。
    // 但 Hook 层 copyToClipboard 把 Promise 视为成功(then 分支),从而触发 isCopied=true 与 onCopy。
    // 这里锁定当前实现行为,避免后续无意识回归。
    const onCopy = vi.fn();
    const { result } = renderHook(() => useCopyToClipboard({ onCopy }));
    await act(async () => {
      result.current.copyToClipboard("", undefined);
      await Promise.resolve();
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
    expect(onCopy).toHaveBeenCalledWith(undefined);
    expect(result.current.isCopied).toBe(true);
  });
});
