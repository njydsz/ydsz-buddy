//! # useProviderFailover Hook 单元测试
//!
//! 覆盖目标：
//! - 工具函数：`checkProviderCapability` / `providerSupportsAllCapabilities`
//! - Hook 行为：activeProvider 初始化 / recordFailure 累加 / 阈值触发自动切换 / recordSuccess 重置 / 手动切换

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  checkProviderCapability,
  providerSupportsAllCapabilities,
  useProviderFailover,
} from "./useProviderFailover";

// ──────────────────────────────────────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────────────────────────────────────

describe("checkProviderCapability", () => {
  it("codex 支持 tool-calling / vision / reasoning-effort / fast-mode", () => {
    expect(checkProviderCapability("codex", "tool-calling")).toBe(true);
    expect(checkProviderCapability("codex", "vision")).toBe(true);
    expect(checkProviderCapability("codex", "reasoning-effort")).toBe(true);
    expect(checkProviderCapability("codex", "fast-mode")).toBe(true);
  });

  it("pi 仅支持 tool-calling", () => {
    expect(checkProviderCapability("pi", "tool-calling")).toBe(true);
    expect(checkProviderCapability("pi", "vision")).toBe(false);
    expect(checkProviderCapability("pi", "fast-mode")).toBe(false);
  });

  it("未知 Provider 视为不支持任何能力", () => {
    const fakeMap = {};
    expect(checkProviderCapability("codex" as never, "tool-calling", fakeMap)).toBe(
      false,
    );
  });

  it("自定义 capabilityMap 生效", () => {
    const map = {
      custom: { capabilities: ["tool-calling"] },
    } as const;
    expect(checkProviderCapability("custom" as never, "tool-calling", map)).toBe(true);
    expect(checkProviderCapability("custom" as never, "vision", map)).toBe(false);
  });
});

describe("providerSupportsAllCapabilities", () => {
  it("codex 支持所有能力", () => {
    expect(
      providerSupportsAllCapabilities("codex", [
        "tool-calling",
        "vision",
        "reasoning-effort",
      ]),
    ).toBe(true);
  });

  it("pi 不支持 vision 时返回 false", () => {
    expect(
      providerSupportsAllCapabilities("pi", ["tool-calling", "vision"]),
    ).toBe(false);
  });

  it("空必需能力列表返回 true", () => {
    expect(providerSupportsAllCapabilities("pi", [])).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Hook 行为
// ──────────────────────────────────────────────────────────────────────────────

describe("useProviderFailover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("默认 activeProvider = enabledProviders[0]", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent"],
      }),
    );
    expect(result.current.activeProvider).toBe("codex");
  });

  it("初始 failureCounts 全为 0", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent", "cursor"],
      }),
    );
    expect(result.current.failureCounts.codex).toBe(0);
    expect(result.current.failureCounts.claudeAgent).toBe(0);
    expect(result.current.failureCounts.cursor).toBe(0);
  });

  it("recordFailure 单次累加", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent"],
        failureThreshold: 3,
      }),
    );
    act(() => {
      result.current.recordFailure("codex");
    });
    expect(result.current.failureCounts.codex).toBe(1);
  });

  it("recordSuccess 重置指定 Provider 计数", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent"],
        failureThreshold: 3,
      }),
    );
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

  it("达到阈值触发自动切换到备用 Provider", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent"],
        failureThreshold: 2,
        autoFailover: true,
      }),
    );
    act(() => {
      result.current.recordFailure("codex");
    });
    expect(result.current.activeProvider).toBe("codex");
    expect(result.current.failureCounts.codex).toBe(1);

    act(() => {
      result.current.recordFailure("codex");
    });
    // 第二次失败后应自动切换
    expect(result.current.failureCounts.codex).toBe(2);
    // switchProvider 内部使用 setTimeout 0 异步触发，需要推进 timer
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.activeProvider).toBe("claudeAgent");
    expect(result.current.history.length).toBe(1);
    expect(result.current.history[0].fromProvider).toBe("codex");
    expect(result.current.history[0].toProvider).toBe("claudeAgent");
  });

  it("autoFailover=false 时达到阈值不自动切换", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent"],
        failureThreshold: 1,
        autoFailover: false,
      }),
    );
    expect(result.current.autoFailoverEnabled).toBe(false);
    act(() => {
      result.current.recordFailure("codex");
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.activeProvider).toBe("codex");
  });

  it("switchProvider 手动切换：更新 activeProvider + 写入 history", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent", "cursor"],
      }),
    );
    let success = false;
    act(() => {
      success = result.current.switchProvider("claudeAgent", "User manual switch");
    });
    expect(success).toBe(true);
    expect(result.current.activeProvider).toBe("claudeAgent");
    expect(result.current.history.length).toBe(1);
    expect(result.current.history[0].reason).toBe("User manual switch");
  });

  it("switchProvider 切换到不存在的 Provider 返回 false", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex"],
      }),
    );
    let success = true;
    act(() => {
      success = result.current.switchProvider("gemini" as never, "bad");
    });
    expect(success).toBe(false);
  });

  it("switchProvider 切换到当前 activeProvider 返回 true 且不写入 history", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent"],
      }),
    );
    let success = false;
    act(() => {
      success = result.current.switchProvider("codex");
    });
    expect(success).toBe(true);
    expect(result.current.history.length).toBe(0);
  });

  it("getRecommendedFallback 返回失败次数少且能力匹配高的 Provider", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent", "pi"],
        failureThreshold: 5,
      }),
    );
    // 故意增加 pi 的失败次数
    act(() => {
      result.current.recordFailure("pi");
      result.current.recordFailure("pi");
    });
    const fallback = result.current.getRecommendedFallback("codex");
    // pi 有失败计数，应该不优先选
    expect(fallback).not.toBe("pi");
    // 应优先选能力匹配高的（claudeAgent > codex 的子集）
    expect(["codex", "claudeAgent"]).toContain(fallback);
  });

  it("resetFailureCounts 清零所有计数", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex", "claudeAgent"],
        failureThreshold: 10,
      }),
    );
    act(() => {
      result.current.recordFailure("codex");
      result.current.recordFailure("claudeAgent");
    });
    expect(result.current.failureCounts.codex).toBe(1);
    expect(result.current.failureCounts.claudeAgent).toBe(1);
    act(() => {
      result.current.resetFailureCounts();
    });
    expect(result.current.failureCounts.codex).toBe(0);
    expect(result.current.failureCounts.claudeAgent).toBe(0);
  });

  it("setAutoFailover(false) 切换 autoFailoverEnabled", () => {
    const { result } = renderHook(() =>
      useProviderFailover({
        enabledProviders: ["codex"],
        autoFailover: true,
      }),
    );
    expect(result.current.autoFailoverEnabled).toBe(true);
    act(() => {
      result.current.setAutoFailover(false);
    });
    expect(result.current.autoFailoverEnabled).toBe(false);
    expect(result.current.status).toBe("disabled");
  });
});
