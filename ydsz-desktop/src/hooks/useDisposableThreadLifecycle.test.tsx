/**
 * @file useDisposableThreadLifecycle 单元测试
 *
 * 覆盖：
 * - 路由切换不调用任何清理函数（无 disposable 线程）
 * - 路由切换 + previousThreadWasTemporary=true → 触发完整清理链
 * - 同一 threadId 切换 → 不触发清理（disposingThreadIds ref 也会拦截重复）
 * - 草稿 isTemporary 标记触发清理
 * - 重新进入同一临时线程 ID → disposing ref 拦截，防止重复清理
 * - session.status === 'closed' → 跳过 thread.session.stop
 * - 清理失败不阻塞后续步骤（catch 吃掉）
 * - 没有 nativeApi → 走 fallback 路径，只清理本地 store
 *
 * 策略：mock 所有 store + nativeApi + 路由状态，让 effect 在受控环境下触发。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ThreadId } from "@ydsz-buddy/contracts";

// =============================================================================
// Mock 状态容器
// =============================================================================

const { mockState } = vi.hoisted(() => {
  const state = {
    // Stores
    syncServerShellSnapshot: vi.fn(),
    clearDraftThread: vi.fn(),
    clearTerminalState: vi.fn(),
    removeThreadFromSplitViews: vi.fn(),
    temporaryThreadIds: {} as Record<string, true | undefined>,
    clearTemporaryThread: vi.fn(),
    draftThreadsByThreadId: {} as Record<
      string,
      { projectId: string; isTemporary?: boolean } | undefined
    >,
    // Native API
    api: null as null | {
      orchestration: {
        dispatchCommand: ReturnType<typeof vi.fn>;
        getShellSnapshot: ReturnType<typeof vi.fn>;
      };
      terminal: { close: ReturnType<typeof vi.fn> };
    },
    serverThread: null as null | {
      session?: { status: string } | null;
    } | undefined,
    // utils
    newCommandId: vi.fn(() => "cmd-1"),
  };
  return { mockState: state };
});

vi.mock("../composerDraftStore", () => ({
  useComposerDraftStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        clearDraftThread: mockState.clearDraftThread,
        draftThreadsByThreadId: mockState.draftThreadsByThreadId,
      }),
    {
      getState: () => ({
        clearDraftThread: mockState.clearDraftThread,
        draftThreadsByThreadId: mockState.draftThreadsByThreadId,
      }),
      setState: () => {},
    },
  ),
}));

vi.mock("../terminalStateStore", () => ({
  useTerminalStateStore: (selector: (state: unknown) => unknown) =>
    selector({ clearTerminalState: mockState.clearTerminalState }),
}));

vi.mock("../splitViewStore", () => ({
  useSplitViewStore: (selector: (state: unknown) => unknown) =>
    selector({ removeThreadFromSplitViews: mockState.removeThreadFromSplitViews }),
}));

vi.mock("../temporaryThreadStore", () => ({
  useTemporaryThreadStore: (selector: (state: unknown) => unknown) =>
    selector({
      temporaryThreadIds: mockState.temporaryThreadIds,
      clearTemporaryThread: mockState.clearTemporaryThread,
    }),
}));

vi.mock("../store", () => ({
  useStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ syncServerShellSnapshot: mockState.syncServerShellSnapshot }),
    {
      getState: () => ({
        syncServerShellSnapshot: mockState.syncServerShellSnapshot,
      }),
      setState: () => {},
    },
  ),
}));

vi.mock("../threadDerivation", () => ({
  getThreadFromState: () => mockState.serverThread,
}));

vi.mock("../nativeApi", () => ({
  readNativeApi: () => mockState.api,
}));

vi.mock("../lib/utils", () => ({
  newCommandId: () => mockState.newCommandId(),
}));

// 必须在 mock 之后导入
import { useDisposableThreadLifecycle } from "./useDisposableThreadLifecycle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================================================
// 测试工具
// =============================================================================

function resetMocks() {
  mockState.syncServerShellSnapshot.mockReset();
  mockState.clearDraftThread.mockReset();
  mockState.clearTerminalState.mockReset();
  mockState.removeThreadFromSplitViews.mockReset();
  mockState.clearTemporaryThread.mockReset();
  mockState.temporaryThreadIds = {};
  mockState.draftThreadsByThreadId = {};
  mockState.api = null;
  mockState.serverThread = null;
  mockState.newCommandId.mockReset();
  mockState.newCommandId.mockImplementation(() => "cmd-1");
}

function makeApi() {
  return {
    orchestration: {
      dispatchCommand: vi.fn(async () => undefined),
      getShellSnapshot: vi.fn(async () => ({ projects: [], threads: [] })),
    },
    terminal: { close: vi.fn(async () => undefined) },
  };
}

const TID_OLD = "thread-old" as ThreadId;
const TID_NEW = "thread-new" as ThreadId;

// =============================================================================
// 1. 不触发清理的场景
// =============================================================================

describe("useDisposableThreadLifecycle - 不清理", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("没有 nativeApi + 没有临时标记 → 不调用任何清理", async () => {
    mockState.api = null;
    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    // 等异步 effect
    await new Promise((r) => setTimeout(r, 10));
    expect(mockState.clearDraftThread).not.toHaveBeenCalled();
    expect(mockState.clearTerminalState).not.toHaveBeenCalled();
    expect(mockState.removeThreadFromSplitViews).not.toHaveBeenCalled();
    expect(mockState.clearTemporaryThread).not.toHaveBeenCalled();
  });

  it("没有 nativeApi，但有临时标记 → 仍然走本地 store 清理", async () => {
    mockState.api = null;
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockState.clearDraftThread).toHaveBeenCalledWith(TID_OLD);
    expect(mockState.clearTerminalState).toHaveBeenCalledWith(TID_OLD);
    expect(mockState.removeThreadFromSplitViews).toHaveBeenCalledWith(TID_OLD);
    expect(mockState.clearTemporaryThread).toHaveBeenCalledWith(TID_OLD);
  });

  it("切换到相同 threadId → 不清理", async () => {
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const api = makeApi();
    mockState.api = api;
    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_OLD });
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(api.terminal.close).not.toHaveBeenCalled();
  });

  it("activeThreadId=null + 前一个不是临时线程 → 不清理", async () => {
    // 注意：initial 阶段（null → TID_OLD）previousThreadWasTemporary 为 false
    // 所以 TID_OLD 不会被标为 disposable
    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: null as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_OLD });
    });
    await new Promise((r) => setTimeout(r, 10));
    // 切到 null：TID_OLD 不是临时线程，不清理
    await act(async () => {
      rerender({ id: null });
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockState.clearDraftThread).not.toHaveBeenCalled();
  });

  it("activeThreadId 从临时线程切到 null → 触发清理", async () => {
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: null });
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockState.clearDraftThread).toHaveBeenCalledWith(TID_OLD);
  });
});

// =============================================================================
// 2. 触发完整清理链
// =============================================================================

describe("useDisposableThreadLifecycle - 完整清理链", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("session.status=running → dispatch session.stop + terminal.close + thread.delete", async () => {
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const api = makeApi();
    mockState.api = api;
    mockState.serverThread = { session: { status: "running" } };

    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    await new Promise((r) => setTimeout(r, 20));

    // session.stop 应被 dispatch
    const dispatchCalls = api.orchestration.dispatchCommand.mock.calls.map((c) => c[0]);
    expect(dispatchCalls.some((c) => c.type === "thread.session.stop")).toBe(true);
    // terminal.close 应被调用
    expect(api.terminal.close).toHaveBeenCalledWith({
      threadId: TID_OLD,
      deleteHistory: true,
    });
    // thread.delete 应被 dispatch（因为 serverThread 存在）
    expect(dispatchCalls.some((c) => c.type === "thread.delete")).toBe(true);
    // shell snapshot 应被刷新
    expect(api.orchestration.getShellSnapshot).toHaveBeenCalled();
    expect(mockState.syncServerShellSnapshot).toHaveBeenCalled();
    // 本地 store 全部清理
    expect(mockState.clearDraftThread).toHaveBeenCalledWith(TID_OLD);
    expect(mockState.clearTerminalState).toHaveBeenCalledWith(TID_OLD);
    expect(mockState.removeThreadFromSplitViews).toHaveBeenCalledWith(TID_OLD);
    expect(mockState.clearTemporaryThread).toHaveBeenCalledWith(TID_OLD);
  });

  it("session.status=closed → 跳过 session.stop", async () => {
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const api = makeApi();
    mockState.api = api;
    mockState.serverThread = { session: { status: "closed" } };

    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    await new Promise((r) => setTimeout(r, 20));

    const dispatchCalls = api.orchestration.dispatchCommand.mock.calls.map((c) => c[0]);
    expect(dispatchCalls.some((c) => c.type === "thread.session.stop")).toBe(false);
    expect(api.terminal.close).toHaveBeenCalled();
  });

  it("serverThread 不存在 → 跳过 thread.delete 和 shell snapshot", async () => {
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const api = makeApi();
    mockState.api = api;
    mockState.serverThread = null;

    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    await new Promise((r) => setTimeout(r, 20));

    const dispatchCalls = api.orchestration.dispatchCommand.mock.calls.map((c) => c[0]);
    expect(dispatchCalls.some((c) => c.type === "thread.delete")).toBe(false);
    expect(api.orchestration.getShellSnapshot).not.toHaveBeenCalled();
  });

  it("shell snapshot 返回 null → 不调用 syncServerShellSnapshot", async () => {
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const api = makeApi();
    mockState.api = api;
    mockState.serverThread = { session: { status: "running" } };
    api.orchestration.getShellSnapshot.mockResolvedValueOnce(null);

    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(api.orchestration.getShellSnapshot).toHaveBeenCalled();
    expect(mockState.syncServerShellSnapshot).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 3. 草稿 isTemporary 触发
// =============================================================================

describe("useDisposableThreadLifecycle - 草稿 isTemporary 触发", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("草稿 store 标记 isTemporary → 触发清理", async () => {
    mockState.draftThreadsByThreadId = {
      [TID_OLD]: { projectId: "p1", isTemporary: true },
    };
    const api = makeApi();
    mockState.api = api;

    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(api.terminal.close).toHaveBeenCalledWith({
      threadId: TID_OLD,
      deleteHistory: true,
    });
    expect(mockState.clearDraftThread).toHaveBeenCalledWith(TID_OLD);
  });
});

// =============================================================================
// 4. disposing ref 拦截重复
// =============================================================================

describe("useDisposableThreadLifecycle - 防止重复清理", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("同一 threadId 多次进入 effect → terminal.close 只调用一次", async () => {
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const api = makeApi();
    mockState.api = api;
    mockState.serverThread = { session: { status: "running" } };

    // 模拟组件挂载：previous=null → next=TID_OLD
    // 重渲染：previous=TID_OLD → next=TID_NEW 触发清理（disposable=true）
    // 再重渲染：previous=TID_NEW → next=TID_OLD 触发清理（disposable=true）
    // 再重渲染：previous=TID_OLD → next=TID_NEW 又触发（disposable=true）
    // 因为 disposing ref 已经清理掉了，再次进入会重新走
    // 这里重点验证 effect 自身在 effect 内部重复触发同一 id 不会重入
    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: null as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_OLD });
    });
    await new Promise((r) => setTimeout(r, 10));
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    await new Promise((r) => setTimeout(r, 20));

    // 应该发生过清理（previousThreadWasTemporary=true 来自 initialDraftThread）
    expect(api.terminal.close).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// 5. 错误吞咽
// =============================================================================

describe("useDisposableThreadLifecycle - 错误吞咽", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("terminal.close 失败 → 后续步骤仍执行", async () => {
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const api = makeApi();
    mockState.api = api;
    api.terminal.close.mockRejectedValueOnce(new Error("boom"));
    mockState.serverThread = { session: { status: "running" } };

    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    await new Promise((r) => setTimeout(r, 30));

    // 后续的 thread.delete 仍被 dispatch
    const dispatchCalls = api.orchestration.dispatchCommand.mock.calls.map((c) => c[0]);
    expect(dispatchCalls.some((c) => c.type === "thread.delete")).toBe(true);
    // 本地清理仍执行
    expect(mockState.clearDraftThread).toHaveBeenCalled();
  });

  it("thread.session.stop 失败 → terminal.close 仍执行", async () => {
    mockState.temporaryThreadIds = { [TID_OLD]: true };
    const api = makeApi();
    mockState.api = api;
    mockState.serverThread = { session: { status: "running" } };
    api.orchestration.dispatchCommand.mockRejectedValueOnce(new Error("boom"));

    const { rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useDisposableThreadLifecycle(id),
      { initialProps: { id: TID_OLD as ThreadId | null } },
    );
    await act(async () => {
      rerender({ id: TID_NEW });
    });
    await new Promise((r) => setTimeout(r, 30));

    expect(api.terminal.close).toHaveBeenCalled();
  });
});
