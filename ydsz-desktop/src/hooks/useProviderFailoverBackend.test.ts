/**
 * @file useProviderFailoverBackend 单元测试
 * @description P1-4: 验证后端化薄壳 hook 正确处理 invoke 返回 / 错误降级
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { useProviderFailoverBackend } = await import("./useProviderFailoverBackend");

const SAMPLE_SNAPSHOT = {
  active_provider: "codex",
  failure_counts: { codex: 0, gemini: 0 },
  history: [],
  config: {
    failure_threshold: 3,
    auto_failover: true,
    enabled_providers: ["codex", "gemini", "grok"],
  },
  status: "monitoring",
};

const SWITCHED_SNAPSHOT = {
  active_provider: "gemini",
  failure_counts: { codex: 3, gemini: 0 },
  history: [
    {
      from: "codex",
      to: "gemini",
      reason: "auto-failover after 3 consecutive failures",
      at_ms: 1700000000000,
      failure_count: 3,
    },
  ],
  config: {
    failure_threshold: 3,
    auto_failover: true,
    enabled_providers: ["codex", "gemini", "grok"],
  },
  status: "switched",
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe("useProviderFailoverBackend - 初始化", () => {
  it("挂载时拉取一次快照", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });
    expect(invokeMock).toHaveBeenCalledWith("failover_get_state");
    expect(result.current.activeProvider).toBe("codex");
    expect(result.current.status).toBe("monitoring");
    expect(result.current.history).toEqual([]);
  });

  it("invoke 失败时降级,snapshot 保持 null,记录 lastError", async () => {
    invokeMock.mockRejectedValueOnce(new Error("backend down"));
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.snapshot).toBeNull();
    expect(result.current.activeProvider).toBeNull();
    expect(result.current.lastError).toContain("backend down");
  });
});

describe("useProviderFailoverBackend - recordFailure", () => {
  it("调用后端命令并用返回快照更新 state", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT); // 初始拉取
    invokeMock.mockResolvedValueOnce(SWITCHED_SNAPSHOT); // 失败触发切换
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.recordFailure("codex", new Error("net"));
    });

    expect(invokeMock).toHaveBeenCalledWith("failover_record_failure", {
      provider: "codex",
      error: "net",
    });
    expect(result.current.activeProvider).toBe("gemini");
    expect(result.current.status).toBe("switched");
    expect(result.current.history.length).toBe(1);
  });

  it("recordFailure 不传 error 时,error 字段为 null", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.recordFailure("codex");
    });

    expect(invokeMock).toHaveBeenLastCalledWith("failover_record_failure", {
      provider: "codex",
      error: null,
    });
  });

  it("后端 invoke 失败时,不更新 snapshot,记录 lastError", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    invokeMock.mockRejectedValueOnce(new Error("rpc failed"));
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.recordFailure("codex", new Error("net"));
    });

    // 保留初始快照
    expect(result.current.activeProvider).toBe("codex");
    expect(result.current.lastError).toContain("rpc failed");
  });
});

describe("useProviderFailoverBackend - recordSuccess", () => {
  it("调用后端命令并用返回快照更新 state", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.recordSuccess("codex");
    });

    expect(invokeMock).toHaveBeenLastCalledWith("failover_record_success", {
      provider: "codex",
    });
  });
});

describe("useProviderFailoverBackend - switchProvider", () => {
  it("调用后端命令,目标存在时返回 true", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    invokeMock.mockResolvedValueOnce(SWITCHED_SNAPSHOT);
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });

    let switched = false;
    await act(async () => {
      switched = await result.current.switchProvider("gemini", "manual test");
    });

    expect(switched).toBe(true);
    expect(invokeMock).toHaveBeenLastCalledWith("failover_switch_to", {
      target: "gemini",
      reason: "manual test",
    });
    expect(result.current.activeProvider).toBe("gemini");
  });

  it("后端返回 null(目标不在启用列表)时,返回 false", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    invokeMock.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });

    let switched = true;
    await act(async () => {
      switched = await result.current.switchProvider("nonexistent");
    });

    expect(switched).toBe(false);
  });
});

describe("useProviderFailoverBackend - setAutoFailover", () => {
  it("用当前 config 合并新值后下发", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    invokeMock.mockResolvedValueOnce({
      ...SAMPLE_SNAPSHOT,
      config: { ...SAMPLE_SNAPSHOT.config, auto_failover: false },
      status: "disabled",
    });
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.setAutoFailover(false);
    });

    expect(invokeMock).toHaveBeenLastCalledWith("failover_set_config", {
      config: expect.objectContaining({
        failure_threshold: 3,
        auto_failover: false,
        enabled_providers: ["codex", "gemini", "grok"],
      }),
    });
    expect(result.current.status).toBe("disabled");
  });

  it("snapshot 还没拉到时不调用后端", async () => {
    // 故意不 resolve 初始 invoke
    invokeMock.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.setAutoFailover(false);
    });

    // 只调用了初始的 get_state,没有 set_config
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenLastCalledWith("failover_get_state");
  });
});

describe("useProviderFailoverBackend - reset", () => {
  it("调用后端 reset 命令", async () => {
    invokeMock.mockResolvedValueOnce(SWITCHED_SNAPSHOT);
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.activeProvider).toBe("gemini");

    await act(async () => {
      await result.current.reset();
    });

    expect(invokeMock).toHaveBeenLastCalledWith("failover_reset");
    expect(result.current.activeProvider).toBe("codex");
    expect(result.current.history).toEqual([]);
  });
});

describe("useProviderFailoverBackend - refresh", () => {
  it("主动拉取最新快照", async () => {
    invokeMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);
    invokeMock.mockResolvedValueOnce(SWITCHED_SNAPSHOT);
    const { result } = renderHook(() => useProviderFailoverBackend());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(result.current.activeProvider).toBe("gemini");
  });
});

/* ============================================================================
 * P2-5: 多 Workspace 隔离
 * ============================================================================
 */

const { useProviderFailoverByWorkspace } = await import(
  "./useProviderFailoverBackend"
);

const WORKSPACE_A_SNAPSHOT = {
  active_provider: "codex",
  failure_counts: { codex: 0, gemini: 0 },
  history: [],
  config: {
    failure_threshold: 3,
    auto_failover: true,
    enabled_providers: ["codex", "gemini", "grok"],
  },
  status: "monitoring",
};

const WORKSPACE_B_SWITCHED = {
  active_provider: "gemini",
  failure_counts: { codex: 3, gemini: 0 },
  history: [
    {
      from: "codex",
      to: "gemini",
      reason: "auto-failover after 3 consecutive failures",
      at_ms: 1700000000000,
      failure_count: 3,
    },
  ],
  config: {
    failure_threshold: 3,
    auto_failover: true,
    enabled_providers: ["codex", "gemini", "grok"],
  },
  status: "switched",
};

describe("useProviderFailoverByWorkspace - 多 workspace 隔离", () => {
  it("挂载时带 workspaceId → 调用后端带 workspaceId 的命令", async () => {
    invokeMock.mockResolvedValueOnce(WORKSPACE_A_SNAPSHOT);
    const { result } = renderHook(() =>
      useProviderFailoverByWorkspace("ws-alpha"),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(invokeMock).toHaveBeenCalledWith("failover_get_state_for_workspace", {
      workspaceId: "ws-alpha",
    });
    expect(result.current.activeProvider).toBe("codex");
  });

  it("workspaceId 为空时,默认跳过(不调后端)", async () => {
    const { result } = renderHook(() =>
      useProviderFailoverByWorkspace(null),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.current.activeProvider).toBeNull();
    expect(result.current.snapshot).toBeNull();
  });

  it("workspaceId 为空且 skipWhenEmpty=false 时,允许调用后端", async () => {
    invokeMock.mockResolvedValueOnce(WORKSPACE_A_SNAPSHOT);
    const { result } = renderHook(() =>
      useProviderFailoverByWorkspace(null, { skipWhenEmpty: false }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(invokeMock).toHaveBeenCalledWith("failover_get_state_for_workspace", {
      workspaceId: null,
    });
    expect(result.current.activeProvider).toBe("codex");
  });

  it("不同 workspaceId 调用独立后端命令(不会共享 snapshot)", async () => {
    invokeMock.mockResolvedValueOnce(WORKSPACE_A_SNAPSHOT); // ws-alpha
    const hookA = renderHook(() => useProviderFailoverByWorkspace("ws-alpha"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(hookA.result.current.activeProvider).toBe("codex");

    // 第二个 workspace 拉取不同快照
    invokeMock.mockResolvedValueOnce(WORKSPACE_B_SWITCHED); // ws-beta
    const hookB = renderHook(() => useProviderFailoverByWorkspace("ws-beta"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(hookB.result.current.activeProvider).toBe("gemini");
    // hookA 仍保持 codex(不串扰)
    expect(hookA.result.current.activeProvider).toBe("codex");

    // 命令分别带了不同的 workspaceId
    const commands = invokeMock.mock.calls.map((c) => c[0]);
    expect(commands).toContain("failover_get_state_for_workspace");
    const alphaCall = invokeMock.mock.calls.find(
      (c) =>
        c[0] === "failover_get_state_for_workspace" &&
        c[1]?.workspaceId === "ws-alpha",
    );
    const betaCall = invokeMock.mock.calls.find(
      (c) =>
        c[0] === "failover_get_state_for_workspace" &&
        c[1]?.workspaceId === "ws-beta",
    );
    expect(alphaCall).toBeTruthy();
    expect(betaCall).toBeTruthy();
  });

  it("recordFailure 带 workspaceId 透传给后端", async () => {
    invokeMock.mockResolvedValueOnce(WORKSPACE_A_SNAPSHOT);
    invokeMock.mockResolvedValueOnce(WORKSPACE_B_SWITCHED);
    const { result } = renderHook(() =>
      useProviderFailoverByWorkspace("ws-gamma"),
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.recordFailure("codex", new Error("net"));
    });

    expect(invokeMock).toHaveBeenLastCalledWith(
      "failover_record_failure_for_workspace",
      {
        workspaceId: "ws-gamma",
        provider: "codex",
        error: "net",
      },
    );
    // snapshot 更新到后端返回的(切换到 gemini)
    expect(result.current.activeProvider).toBe("gemini");
  });

  it("workspaceId 为空时 recordFailure 不调后端", async () => {
    const { result } = renderHook(() =>
      useProviderFailoverByWorkspace(null),
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.recordFailure("codex", new Error("net"));
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("switchProvider 在 workspace 维度独立,目标不存在返回 false", async () => {
    invokeMock.mockResolvedValueOnce(WORKSPACE_A_SNAPSHOT);
    invokeMock.mockResolvedValueOnce(null);
    const { result } = renderHook(() =>
      useProviderFailoverByWorkspace("ws-delta"),
    );
    await act(async () => {
      await Promise.resolve();
    });
    let switched = true;
    await act(async () => {
      switched = await result.current.switchProvider("nonexistent");
    });
    expect(switched).toBe(false);
    expect(invokeMock).toHaveBeenLastCalledWith(
      "failover_switch_to_for_workspace",
      {
        workspaceId: "ws-delta",
        target: "nonexistent",
        reason: null,
      },
    );
  });

  it("workspaceId 变化时 refresh,不清空 state(避免闪烁)", async () => {
    invokeMock.mockResolvedValueOnce(WORKSPACE_A_SNAPSHOT);
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useProviderFailoverByWorkspace(id),
      { initialProps: { id: "ws-1" } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.activeProvider).toBe("codex");

    // 切换 workspaceId
    invokeMock.mockResolvedValueOnce(WORKSPACE_B_SWITCHED);
    rerender({ id: "ws-2" });
    await act(async () => {
      await Promise.resolve();
    });
    // snapshot 已更新到新 workspace
    expect(result.current.activeProvider).toBe("gemini");
  });

  it("reset 在 workspace 维度独立", async () => {
    invokeMock.mockResolvedValueOnce(WORKSPACE_B_SWITCHED);
    invokeMock.mockResolvedValueOnce(WORKSPACE_A_SNAPSHOT);
    const { result } = renderHook(() =>
      useProviderFailoverByWorkspace("ws-epsilon"),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.activeProvider).toBe("gemini");

    await act(async () => {
      await result.current.reset();
    });

    expect(invokeMock).toHaveBeenLastCalledWith(
      "failover_reset_for_workspace",
      { workspaceId: "ws-epsilon" },
    );
    expect(result.current.activeProvider).toBe("codex");
    expect(result.current.history).toEqual([]);
  });
});
