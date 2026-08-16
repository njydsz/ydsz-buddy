//! # useSmartRetry Hook 单元测试
//!
//! 覆盖目标：
//! - 工具函数：`classifyError` / `computeBackoffDelay` / `parseRetryAfter` / `isRetriableError`
//! - Hook 行为：execute 成功 / 客户端错误不重试 / 取消

import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  classifyError,
  computeBackoffDelay,
  isRetriableError,
  parseRetryAfter,
  useSmartRetry,
} from "./useSmartRetry";

// ──────────────────────────────────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────────────────────────────────

describe("classifyError", () => {
  it("按 HTTP 状态码分类 429 → rate-limit", () => {
    expect(classifyError(new Error("ignored"), 429)).toBe("rate-limit");
  });

  it("按 HTTP 状态码分类 4xx → client-error", () => {
    expect(classifyError(new Error("x"), 400)).toBe("client-error");
    expect(classifyError(new Error("x"), 401)).toBe("client-error");
    expect(classifyError(new Error("x"), 404)).toBe("client-error");
    expect(classifyError(new Error("x"), 418)).toBe("client-error");
  });

  it("按 HTTP 状态码分类 5xx → server-error", () => {
    expect(classifyError(new Error("x"), 500)).toBe("server-error");
    expect(classifyError(new Error("x"), 502)).toBe("server-error");
    expect(classifyError(new Error("x"), 503)).toBe("server-error");
  });

  it("按 error.name='TypeError' + 网络关键词 → network", () => {
    const e = new TypeError("fetch failed");
    e.name = "TypeError";
    expect(classifyError(e)).toBe("network");
  });

  it("按 error.message 匹配 ECONNREFUSED → network", () => {
    expect(classifyError(new Error("connect ECONNREFUSED 127.0.0.1:443"))).toBe(
      "network",
    );
  });

  it("按 error.name='AbortError' → timeout", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(classifyError(e)).toBe("timeout");
  });

  it("按 message 包含 'timed out' → timeout", () => {
    expect(classifyError(new Error("Request timed out after 30s"))).toBe(
      "timeout",
    );
  });

  it("按 message 包含 'rate limit' → rate-limit", () => {
    expect(classifyError(new Error("rate limit exceeded"))).toBe("rate-limit");
  });

  it("显式 retryAfterHeader 触发 rate-limit 分类", () => {
    expect(classifyError(new Error("oops"), 200, "30")).toBe("rate-limit");
  });

  it("按 message 包含 '500' / '502' → server-error", () => {
    expect(classifyError(new Error("internal server error"))).toBe("server-error");
    expect(classifyError(new Error("502 bad gateway"))).toBe("server-error");
    expect(classifyError(new Error("service unavailable"))).toBe("server-error");
  });

  it("按 message 包含 'unauthorized' → client-error", () => {
    expect(classifyError(new Error("401 unauthorized"))).toBe("client-error");
  });

  it("无法分类 → unknown", () => {
    expect(classifyError(new Error("??? 完全未知错误"))).toBe("unknown");
    expect(classifyError("字符串错误")).toBe("unknown");
  });
});

describe("computeBackoffDelay", () => {
  it("无 jitter：严格按 baseDelay * 2^attempt", () => {
    expect(computeBackoffDelay(0, 1000, false)).toBe(1000);
    expect(computeBackoffDelay(1, 1000, false)).toBe(2000);
    expect(computeBackoffDelay(2, 1000, false)).toBe(4000);
    expect(computeBackoffDelay(3, 1000, false)).toBe(8000);
  });

  it("有 jitter：结果在 ±25% 范围内", () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const base = 1000 * Math.pow(2, attempt);
      const lower = base * 0.75;
      const upper = base * 1.25;
      for (let i = 0; i < 20; i++) {
        const v = computeBackoffDelay(attempt, 1000, true);
        expect(v).toBeGreaterThanOrEqual(lower - 1);
        expect(v).toBeLessThanOrEqual(upper + 1);
      }
    }
  });

  it("默认开启 jitter（omit 参数）", () => {
    const a = computeBackoffDelay(2, 1000);
    const b = computeBackoffDelay(2, 1000);
    expect(typeof a).toBe("number");
    expect(a).toBeGreaterThanOrEqual(0);
    const samples = new Set(Array.from({ length: 10 }, () => computeBackoffDelay(2, 1000)));
    expect(samples.size).toBeGreaterThan(1);
  });
});

describe("parseRetryAfter", () => {
  it("纯秒数字符串", () => {
    expect(parseRetryAfter("30")).toBe(30_000);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("带空格的秒数", () => {
    expect(parseRetryAfter("  60  ")).toBe(60_000);
  });

  it("HTTP 日期格式", () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).not.toBeNull();
    if (ms !== null) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThan(60_000);
    }
  });

  it("无效字符串 → null", () => {
    expect(parseRetryAfter("not a number or date")).toBeNull();
  });

  it("空字符串 → null", () => {
    expect(parseRetryAfter("")).toBeNull();
  });
});

describe("isRetriableError", () => {
  it("client-error 不可重试", () => {
    expect(isRetriableError("client-error")).toBe(false);
  });

  it("其他所有错误类可重试", () => {
    expect(isRetriableError("network")).toBe(true);
    expect(isRetriableError("timeout")).toBe(true);
    expect(isRetriableError("rate-limit")).toBe(true);
    expect(isRetriableError("server-error")).toBe(true);
    expect(isRetriableError("unknown")).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Hook 行为（仅验证不依赖真实定时的部分）
// ──────────────────────────────────────────────────────────────────────────────

describe("useSmartRetry / execute", () => {
  it("成功一次：status='success'，currentAttempt=0", async () => {
    const { result } = renderHook(() => useSmartRetry({ maxRetries: 3, jitter: false }));
    const value = await act(async () => {
      return await result.current.execute(async () => 42);
    });
    expect(value).toBe(42);
    expect(result.current.status).toBe("success");
    expect(result.current.currentAttempt).toBe(0);
  });

  it("客户端错误（4xx）不重试，直接抛错", async () => {
    const { result } = renderHook(() =>
      useSmartRetry({ maxRetries: 3, baseDelayMs: 1, jitter: false }),
    );
    const clientErr: Error & { status?: number } = new Error("Bad Request");
    clientErr.status = 400;
    await act(async () => {
      await expect(
        result.current.execute(async () => {
          throw clientErr;
        }),
      ).rejects.toThrow("Bad Request");
    });
    expect(result.current.status).toBe("exhausted");
    // 4xx 直接失败：未触发任何重试历史
    expect(result.current.history.length).toBe(0);
  });

  it("cancel() 设置 status=cancelled", () => {
    const { result } = renderHook(() =>
      useSmartRetry({ maxRetries: 5, baseDelayMs: 100, jitter: false }),
    );
    act(() => {
      result.current.cancel();
    });
    expect(result.current.status).toBe("cancelled");
  });

  it("reset() 恢复 idle 状态与空 history", () => {
    const { result } = renderHook(() =>
      useSmartRetry({ maxRetries: 0, baseDelayMs: 1, jitter: false }),
    );
    // 触发 cancel 让状态非 idle
    act(() => {
      result.current.cancel();
    });
    expect(result.current.status).toBe("cancelled");

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.currentAttempt).toBe(0);
    expect(result.current.history.length).toBe(0);
    expect(result.current.remainingDelayMs).toBe(0);
  });

  it("外部 AbortSignal 触发后 status=cancelled 且抛出 AbortError", async () => {
    const { result } = renderHook(() =>
      useSmartRetry({ maxRetries: 5, baseDelayMs: 1, jitter: false }),
    );
    const external = new AbortController();
    let rejectFn: ((reason?: unknown) => void) | null = null;
    await act(async () => {
      const p = result.current.execute(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectFn = reject;
          }),
        external.signal,
      );
      external.abort();
      // 直接通过 reject 抛 AbortError,模拟 fn 收到 abort 信号
      rejectFn?.(new DOMException("Aborted", "AbortError"));
      await expect(p).rejects.toBeInstanceOf(DOMException);
    });
    expect(result.current.status).toBe("cancelled");
  });
});
