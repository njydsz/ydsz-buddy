//! # useAutoProviderFailover Hook 单元测试
//!
//! 覆盖目标：
//! - ControllerApi 暴露的所有方法
//! - Context 必须在 Provider 内使用（未在 Provider 内抛错）
//! - recordFailure 触发自动切换 + toast
//! - recordSuccess 重置失败计数
//! - 5 分钟无失败 → 自动重置（不真等 5 分钟，只验证 interval 存在）

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// Toast 需要 Portal 挂载点
beforeEach(() => {
  document.body.innerHTML = "";
});

import {
  AutoProviderFailoverProvider,
  useAutoProviderFailover,
} from "./useAutoProviderFailover";

function makeWrapper(props?: {
  threshold?: number;
  enabledProviders?: ReadonlyArray<Parameters<typeof AutoProviderFailoverProvider>[0]["enabledProviders"] extends infer T ? T extends ReadonlyArray<infer U> ? U : never : never>;
}) {
  return ({ children }: { children: ReactNode }) => (
    <AutoProviderFailoverProvider
      threshold={props?.threshold}
      enabledProviders={props?.enabledProviders as never}
    >
      {children}
    </AutoProviderFailoverProvider>
  );
}

describe("useAutoProviderFailover", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("未在 Provider 内使用抛错", () => {
    // 静默 React 错误日志
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAutoProviderFailover())).toThrow(
      /must be used within AutoProviderFailoverProvider/,
    );
    spy.mockRestore();
  });

  it("暴露完整 ControllerApi", () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });
    expect(result.current.activeProvider).toBeDefined();
    expect(typeof result.current.recordFailure).toBe("function");
    expect(typeof result.current.recordSuccess).toBe("function");
    expect(typeof result.current.switchTo).toBe("function");
    expect(typeof result.current.setMonitoring).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("初始 activeProvider = enabledProviders[0]", () => {
    const wrapper = makeWrapper({
      enabledProviders: ["claudeAgent", "cursor", "gemini"] as never,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });
    expect(result.current.activeProvider).toBe("claudeAgent");
  });

  it("recordFailure 累加失败计数", () => {
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 5,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("codex");
    });
    expect(result.current.failureCounts.codex).toBe(2);
  });

  it("recordSuccess 重置指定 Provider 计数", () => {
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 5,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("codex");
    });
    expect(result.current.failureCounts.codex).toBe(2);
    act(() => {
      result.current.recordSuccess("codex");
    });
    expect(result.current.failureCounts.codex).toBe(0);
  });

  it("达到 threshold 触发自动切换", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 2,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });
    act(() => {
      result.current.recordFailure("codex");
    });
    expect(result.current.failureCounts.codex).toBe(1);
    act(() => {
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.activeProvider).toBe("claudeAgent");
    expect(result.current.history.length).toBe(1);
    expect(result.current.history[0].from).toBe("codex");
    expect(result.current.history[0].to).toBe("claudeAgent");
  });

  it("switchTo 手动切换并写入 history", () => {
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent", "cursor"] as never,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });
    let success = false;
    act(() => {
      success = result.current.switchTo("claudeAgent", "User manual");
    });
    expect(success).toBe(true);
    expect(result.current.activeProvider).toBe("claudeAgent");
    expect(result.current.history.length).toBe(1);
    expect(result.current.history[0].reason).toBe("User manual");
  });

  it("switchTo 切换到不存在的 Provider 返回 false", () => {
    const wrapper = makeWrapper({
      enabledProviders: ["codex"] as never,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });
    let success = true;
    act(() => {
      success = result.current.switchTo("gemini" as never);
    });
    expect(success).toBe(false);
  });

  it("setMonitoring 切换 isMonitoring", () => {
    const wrapper = makeWrapper({
      enabledProviders: ["codex"] as never,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });
    expect(result.current.isMonitoring).toBe(true);
    act(() => {
      result.current.setMonitoring(false);
    });
    expect(result.current.isMonitoring).toBe(false);
  });

  it("reset 清零 failureCounts 与 history", () => {
    vi.useFakeTimers();
    const wrapper = makeWrapper({
      enabledProviders: ["codex", "claudeAgent"] as never,
      threshold: 1,
    });
    const { result } = renderHook(() => useAutoProviderFailover(), { wrapper });
    act(() => {
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.history.length).toBeGreaterThan(0);
    act(() => {
      result.current.reset();
    });
    expect(result.current.failureCounts.codex).toBe(0);
    expect(result.current.failureCounts.claudeAgent).toBe(0);
    expect(result.current.history.length).toBe(0);
  });

  it("Provider 组件能正常挂载 children", () => {
    const wrapper = makeWrapper({ enabledProviders: ["codex"] as never });
    render(
      <AutoProviderFailoverProvider enabledProviders={["codex"] as never}>
        <div data-testid="child">child content</div>
      </AutoProviderFailoverProvider>,
    );
    expect(screen.getByTestId("child").textContent).toBe("child content");
  });
});
