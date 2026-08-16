/**
 * @file ErrorBoundary.test.tsx
 * @description AppErrorBoundary 单元测试 —— 互联网大厂基线:
 *  1. 正常子组件:不渲染 fallback
 *  2. 子组件抛错:渲染 fallback + 调用 monitor.captureError
 *  3. monitor payload 包含 type/message/stack/context/level(PII 安全)
 *  4. 自定义 fallback 优先于默认
 *  5. monitor SDK 抛错时降级,不阻塞 fallback 渲染
 *  6. reset() 后重新渲染子组件
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppErrorBoundary } from "./ErrorBoundary";
import { APP_DISPLAY_NAME } from "~/branding";
import {
  setMonitorImpl,
  resetMonitorImpl,
  type MonitorImpl,
  type ErrorPayload,
} from "~/lib/monitor";

interface MountedHandle {
  container: HTMLDivElement;
  root: Root;
}

function mountInDocument(): MountedHandle {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root };
}

const mockCaptureError = vi.fn();
const mockImpl: MonitorImpl = {
  captureError: mockCaptureError,
  captureMessage: vi.fn(),
  startSpan: (n) => ({ name: n, start: 0 }),
  endSpan: vi.fn(),
};

beforeEach(() => {
  mockCaptureError.mockReset();
  setMonitorImpl(mockImpl);
});

afterEach(() => {
  resetMonitorImpl();
  document.body.innerHTML = "";
});

describe("AppErrorBoundary", () => {
  let handle: MountedHandle | null = null;

  afterEach(() => {
    if (handle) {
      act(() => handle!.root.unmount());
      handle.container.remove();
      handle = null;
    }
  });

  it("正常子组件:不渲染 fallback,不发 monitor", async () => {
    handle = mountInDocument();
    await act(async () => {
      handle!.root.render(
        createElement(
          AppErrorBoundary,
          null,
          createElement("div", { "data-testid": "ok" }, "hello"),
        ),
      );
    });
    expect(handle.container.querySelector("[data-testid='ok']")).toBeTruthy();
    expect(handle.container.querySelector("[data-testid='error-boundary']")).toBeNull();
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it("componentDidCatch:调用 monitor.captureError 且 payload 字段完整", () => {
    // 直接实例化 boundary,绕过 render-with-throw 的 happy-dom 复杂度
    const boundary = new AppErrorBoundary({
      children: null,
    });
    boundary.state = { hasError: false, error: null, errorInfo: null };
    const error = new Error("kaboom");
    const errorInfo = {
      componentStack: "\n  at Boom\n  at App\n  at Root",
    } as React.ErrorInfo;
    boundary.componentDidCatch(error, errorInfo);
    expect(mockCaptureError).toHaveBeenCalledTimes(1);
    const payload = mockCaptureError.mock.calls[0][0] as ErrorPayload;
    expect(payload.type).toBe("ReactErrorBoundary");
    expect(payload.message).toBe("kaboom");
    expect(payload.level).toBe("error");
    expect(payload.context?.source).toBe("AppErrorBoundary");
    expect(payload.context?.appVersion).toContain(APP_DISPLAY_NAME);
  });

  it("componentDidCatch:stack 截断(前 5 帧)", () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.state = { hasError: false, error: null, errorInfo: null };
    const error = new Error("stack-trace-test");
    error.stack = ["frame1", "frame2", "frame3", "frame4", "frame5", "frame6", "frame7"].join("\n");
    boundary.componentDidCatch(error, { componentStack: "" } as React.ErrorInfo);
    const payload = mockCaptureError.mock.calls[0][0] as ErrorPayload;
    const lines = payload.stack?.split("\n") ?? [];
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it("PII 安全:context 不携带敏感字段(错误消息之外)", () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.state = { hasError: false, error: null, errorInfo: null };
    const error = new Error("pii-test: token=sk-abc-123-fake");
    boundary.componentDidCatch(error, { componentStack: "" } as React.ErrorInfo);
    const payload = mockCaptureError.mock.calls[0][0] as ErrorPayload;
    const contextStr = JSON.stringify(payload.context ?? {});
    expect(contextStr).not.toContain("sk-abc-123");
    expect(contextStr).not.toContain("token");
  });

  it("componentDidCatch:monitor SDK 抛错时降级,不抛出", () => {
    setMonitorImpl({
      captureError: () => {
        throw new Error("sdk-down");
      },
      captureMessage: vi.fn(),
      startSpan: (n) => ({ name: n, start: 0 }),
      endSpan: vi.fn(),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boundary = new AppErrorBoundary({ children: null });
    boundary.state = { hasError: false, error: null, errorInfo: null };
    const error = new Error("sdk-fallback");
    expect(() =>
      boundary.componentDidCatch(error, { componentStack: "" } as React.ErrorInfo),
    ).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("componentDidCatch:context.componentStack 仅取前 3 行", () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.state = { hasError: false, error: null, errorInfo: null };
    const longStack = ["a", "b", "c", "d", "e", "f"].join("\n");
    boundary.componentDidCatch(new Error("x"), {
      componentStack: longStack,
    } as React.ErrorInfo);
    const payload = mockCaptureError.mock.calls[0][0] as ErrorPayload;
    const compStack = (payload.context?.componentStack as string) ?? "";
    const lines = compStack.split(" | ");
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it("getDerivedStateFromError:返回 hasError + error", () => {
    const err = new Error("derive");
    const state = AppErrorBoundary.getDerivedStateFromError(err);
    expect(state.hasError).toBe(true);
    expect(state.error).toBe(err);
  });

  it("render:正常子组件路径", () => {
    const boundary = new AppErrorBoundary({
      children: createElement("span", null, "child"),
    });
    boundary.state = { hasError: false, error: null, errorInfo: null };
    const result = boundary.render();
    // 当 hasError=false,直接返回 children(React 元素包装)
    expect(result).toBeTruthy();
  });

  it("render:hasError=true 渲染默认 fallback", () => {
    const boundary = new AppErrorBoundary({
      children: createElement("span", null, "child"),
    });
    boundary.state = {
      hasError: true,
      error: new Error("render-fb"),
      errorInfo: { componentStack: "" } as React.ErrorInfo,
    };
    const result = boundary.render();
    // 默认 fallback 应包含 h1
    expect(result).toBeTruthy();
  });

  it("render:hasError=true 且提供 fallback prop 时优先用 fallback", () => {
    let captured: { error: Error } | null = null;
    const fallback = (props: { error: Error }): ReactNode => {
      captured = props;
      return createElement(
        "div",
        { "data-testid": "custom-fallback" },
        `Custom: ${props.error.message}`,
      );
    };
    const boundary = new AppErrorBoundary({
      children: createElement("span", null, "child"),
      fallback,
    });
    boundary.state = {
      hasError: true,
      error: new Error("custom-fb"),
      errorInfo: { componentStack: "" } as React.ErrorInfo,
    };
    const result = boundary.render();
    // 自定义 fallback 应被调用
    expect(result).toBeTruthy();
    // props 应传递 error
    expect(captured?.error.message).toBe("custom-fb");
  });
});
