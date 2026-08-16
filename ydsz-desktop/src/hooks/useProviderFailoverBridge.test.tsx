/**
 * @file useProviderFailoverBridge 单元测试
 *
 * 覆盖：
 * - 成功调用后 controller.failureCounts 被重置
 * - 失败抛出后 controller.failureCounts[provider] 增加
 * - AbortError 不增加 failureCounts
 * - enabled=false 时 failureCounts 不变
 * - activeProvider 为 null 时 failureCounts 不变
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  AutoProviderFailoverProvider,
  useAutoProviderFailover,
  type ControllerApi,
} from "./useAutoProviderFailover";
import { useProviderFailoverBridge } from "./useProviderFailoverBridge";
import type { UseSmartRetryResult } from "./useSmartRetry";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  // 测试间清理
});

function makeRetryStub(executeImpl: () => Promise<unknown>): UseSmartRetryResult {
  const executeFn = (async (...args: unknown[]) => {
    // 优先使用参数中的 fn（bridge 传入），其次回落到 executeImpl
    const fn = (args[0] as (() => Promise<unknown>) | undefined) ?? executeImpl;
    return await fn();
  }) as unknown as UseSmartRetryResult["execute"];
  return {
    status: "idle",
    currentAttempt: 0,
    maxRetries: 0,
    remainingDelayMs: 0,
    history: [],
    currentTimeoutMs: 30_000,
    execute: executeFn,
    cancel: () => {},
    reset: () => {},
  };
}

interface HarnessHandle {
  wrapped: UseSmartRetryResult["execute"];
  controller: ControllerApi;
  unmount: () => void;
}

function renderBridge(opts: {
  activeProvider: "codex" | "claudeAgent" | null;
  enabled?: boolean;
  retry: UseSmartRetryResult;
}): HarnessHandle {
  let captured: ControllerApi | null = null;
  let wrappedRef: { current: UseSmartRetryResult["execute"] | null } = { current: null };

  const ControllerCapture = () => {
    const c = useAutoProviderFailover();
    captured = c;
    return null;
  };

  const Bridge = ({
    retry,
    activeProvider,
    enabled,
  }: {
    retry: UseSmartRetryResult;
    activeProvider: "codex" | "claudeAgent" | null;
    enabled?: boolean;
  }) => {
    const wrapped = useProviderFailoverBridge(retry, { activeProvider, enabled });
    wrappedRef.current = wrapped;
    return null;
  };

  const Inner = () => {
    const [retry] = useState(opts.retry);
    const [provider] = useState(opts.activeProvider);
    return (
      <>
        <ControllerCapture />
        <Bridge retry={retry} activeProvider={provider} enabled={opts.enabled} />
      </>
    );
  };

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <AutoProviderFailoverProvider
      enabled={false}
      enabledProviders={["codex", "claudeAgent"] as never}
    >
      {children}
    </AutoProviderFailoverProvider>
  );

  const { unmount } = render(<Inner />, { wrapper: Wrapper });

  return {
    get wrapped() {
      return wrappedRef.current!;
    },
    get controller() {
      return captured!;
    },
    unmount,
  };
}

describe("useProviderFailoverBridge", () => {
  it("resets failure counter on resolve when activeProvider set", async () => {
    const h = renderBridge({
      activeProvider: "codex",
      retry: makeRetryStub(async () => "ok"),
    });
    // 先制造 2 次失败，让计数 > 0
    await act(async () => {
      h.controller.recordFailure("codex");
      h.controller.recordFailure("codex");
    });
    expect(h.controller.failureCounts.codex).toBe(2);

    await act(async () => {
      await h.wrapped(async () => "ok");
    });
    expect(h.controller.failureCounts.codex).toBe(0);
    h.unmount();
  });

  it("increments failure counter on reject (non-Abort) when activeProvider set", async () => {
    const h = renderBridge({
      activeProvider: "claudeAgent",
      retry: makeRetryStub(async () => undefined),
    });
    expect(h.controller.failureCounts.claudeAgent).toBe(0);

    await act(async () => {
      try {
        await h.wrapped(async () => {
          throw new Error("network down");
        });
      } catch {
        // 预期
      }
    });
    expect(h.controller.failureCounts.claudeAgent).toBe(1);
    h.unmount();
  });

  it("does NOT increment failure counter for AbortError", async () => {
    const h = renderBridge({
      activeProvider: "codex",
      retry: makeRetryStub(async () => undefined),
    });

    await act(async () => {
      try {
        await h.wrapped(async () => {
          throw new DOMException("aborted", "AbortError");
        });
      } catch {
        // 预期
      }
    });
    expect(h.controller.failureCounts.codex).toBe(0);
    h.unmount();
  });

  it("does nothing when enabled is false", async () => {
    const h = renderBridge({
      activeProvider: "codex",
      enabled: false,
      retry: makeRetryStub(async () => undefined),
    });

    await act(async () => {
      try {
        await h.wrapped(async () => {
          throw new Error("boom");
        });
      } catch {
        // 预期
      }
    });
    expect(h.controller.failureCounts.codex).toBe(0);
    h.unmount();
  });

  it("does nothing when activeProvider is null", async () => {
    const h = renderBridge({
      activeProvider: null,
      retry: makeRetryStub(async () => undefined),
    });

    await act(async () => {
      try {
        await h.wrapped(async () => {
          throw new Error("boom");
        });
      } catch {
        // 预期
      }
    });
    expect(h.controller.failureCounts.codex).toBe(0);
    expect(h.controller.failureCounts.claudeAgent).toBe(0);
    h.unmount();
  });
});
