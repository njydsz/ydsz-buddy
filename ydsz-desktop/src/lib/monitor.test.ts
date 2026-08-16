/**
 * @file monitor.test.ts
 * @description monitor SDK 行为测试:默认 noop + 注入/重置 + 降级不抛错。
 *
 * 互联网大厂基线:
 * - 监控 SDK 必须可注入(便于单元测试与生产接入 Sentry)
 * - SDK 自身抛错时必须降级到 console,不能阻塞主流程
 * - withSpan 必须捕获异常并转发给 monitor
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  monitor,
  setMonitorImpl,
  resetMonitorImpl,
  getMonitorImpl,
  withSpan,
  type MonitorImpl,
  type ErrorPayload,
  type Span,
} from "./monitor";

describe("monitor", () => {
  beforeEach(() => {
    resetMonitorImpl();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMonitorImpl();
  });

  it("默认走 console stub 不抛错", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    monitor.captureError({
      type: "TypeError",
      message: "test",
      level: "error",
    });
    expect(errSpy).toHaveBeenCalled();
  });

  it("setMonitorImpl 后使用注入的实现", () => {
    const captureError = vi.fn();
    const impl: MonitorImpl = {
      captureError,
      captureMessage: vi.fn(),
      startSpan: (n) => ({ name: n, start: 0 }),
      endSpan: vi.fn(),
    };
    setMonitorImpl(impl);
    expect(getMonitorImpl()).toBe(impl);
    monitor.captureError({ type: "X", message: "y" });
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("resetMonitorImpl 回到 console stub", () => {
    const impl: MonitorImpl = {
      captureError: vi.fn(),
      captureMessage: vi.fn(),
      startSpan: (n) => ({ name: n, start: 0 }),
      endSpan: vi.fn(),
    };
    setMonitorImpl(impl);
    resetMonitorImpl();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    monitor.captureError({ type: "X", message: "y" });
    expect(errSpy).toHaveBeenCalled();
  });

  it("SDK 自身抛错时降级到 console,不阻塞主流程", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const impl: MonitorImpl = {
      captureError: () => {
        throw new Error("sdk down");
      },
      captureMessage: vi.fn(),
      startSpan: (n) => ({ name: n, start: 0 }),
      endSpan: vi.fn(),
    };
    setMonitorImpl(impl);
    expect(() =>
      monitor.captureError({ type: "X", message: "y" }),
    ).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
  });

  it("captureMessage 同样走注入实现", () => {
    const captureMessage = vi.fn();
    setMonitorImpl({
      captureError: vi.fn(),
      captureMessage,
      startSpan: (n) => ({ name: n, start: 0 }),
      endSpan: vi.fn(),
    });
    monitor.captureMessage("hello", { foo: "bar" });
    expect(captureMessage).toHaveBeenCalledWith("hello", { foo: "bar" });
  });

  it("startSpan 注入失败时回退到本地 span", () => {
    setMonitorImpl({
      captureError: vi.fn(),
      captureMessage: vi.fn(),
      startSpan: () => {
        throw new Error("sdk down");
      },
      endSpan: vi.fn(),
    });
    const span = monitor.startSpan("op", { tag: "t" });
    expect(span.name).toBe("op");
    expect(typeof span.start).toBe("number");
  });

  it("endSpan 注入失败时静默降级", () => {
    setMonitorImpl({
      captureError: vi.fn(),
      captureMessage: vi.fn(),
      startSpan: (n) => ({ name: n, start: 0 }),
      endSpan: () => {
        throw new Error("sdk down");
      },
    });
    const span: Span = { name: "x", start: performance.now() };
    expect(() => monitor.endSpan(span)).not.toThrow();
  });
});

describe("withSpan", () => {
  beforeEach(() => resetMonitorImpl());
  afterEach(() => {
    vi.restoreAllMocks();
    resetMonitorImpl();
  });

  it("正常路径:不调用 captureError", async () => {
    const captureError = vi.fn();
    setMonitorImpl({
      captureError,
      captureMessage: vi.fn(),
      startSpan: (n) => ({ name: n, start: 0 }),
      endSpan: vi.fn(),
    });
    const result = await withSpan("op", async () => 42);
    expect(result).toBe(42);
    expect(captureError).not.toHaveBeenCalled();
  });

  it("异常路径:捕获并上报 + 重新抛出", async () => {
    const captureError = vi.fn();
    setMonitorImpl({
      captureError,
      captureMessage: vi.fn(),
      startSpan: (n) => ({ name: n, start: 0 }),
      endSpan: vi.fn(),
    });
    await expect(
      withSpan("op", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(captureError).toHaveBeenCalledTimes(1);
    const payload = captureError.mock.calls[0][0] as ErrorPayload;
    expect(payload.type).toBe("Error");
    expect(payload.message).toBe("boom");
    expect(payload.context?.span).toBe("op");
  });
});
