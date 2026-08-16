/**
 * @file threadCreatePromotion 单元测试
 *
 * 覆盖：
 * - isDuplicateThreadCreateError：精确匹配错误模式
 * - promoteThreadCreate：api=undefined → unavailable
 * - promoteThreadCreate：线程已在 store → exists（不发 command）
 * - promoteThreadCreate：正常 dispatch → created
 * - promoteThreadCreate：duplicate 错误 + snapshot 包含线程 → exists（恢复）
 * - promoteThreadCreate：duplicate 错误 + snapshot 不含线程 → 重新抛出
 * - promoteThreadCreate：非 duplicate 错误 → 重新抛出
 * - in-flight 去重：相同 threadId 并发调用共享 promise
 *
 * 策略：mock store + threadDerivation + nativeApi。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeApi, ThreadId } from "@ydsz-buddy/contracts";

// =============================================================================
// Mock 状态
// =============================================================================

const { mockState } = vi.hoisted(() => {
  const state = {
    syncServerShellSnapshot: vi.fn(),
    markPromotedDraftThreads: vi.fn(),
    threadInStore: null as null | { id: ThreadId },
    snapshotThreads: [] as Array<{ id: ThreadId }>,
    api: null as null | {
      orchestration: {
        dispatchCommand: ReturnType<typeof vi.fn>;
        getShellSnapshot: ReturnType<typeof vi.fn>;
      };
    },
  };
  return { mockState: state };
});

vi.mock("../nativeApi", () => ({
  readNativeApi: () => mockState.api,
}));

vi.mock("../store", () => ({
  useStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ syncServerShellSnapshot: mockState.syncServerShellSnapshot }),
    {
      getState: () => ({
        syncServerShellSnapshot: mockState.syncServerShellSnapshot,
        threadShellById: mockState.threadInStore ? { [mockState.threadInStore.id]: {} } : {},
      }),
      setState: () => {},
    },
  ),
}));

vi.mock("../threadDerivation", () => ({
  getThreadFromState: (_state: unknown, id: ThreadId) =>
    mockState.threadInStore?.id === id ? { id } : null,
}));

vi.mock("../composerDraftStore", () => ({
  markPromotedDraftThreads: (...args: unknown[]) =>
    mockState.markPromotedDraftThreads(...args),
}));

import { promoteThreadCreate, isDuplicateThreadCreateError } from "./threadCreatePromotion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function resetMocks() {
  mockState.syncServerShellSnapshot.mockReset();
  mockState.markPromotedDraftThreads.mockReset();
  mockState.threadInStore = null;
  mockState.snapshotThreads = [];
  mockState.api = null;
}

const TID = "thread-1" as ThreadId;

const baseCommand = {
  type: "thread.create" as const,
  commandId: "cmd-1",
  threadId: TID,
  projectId: "project-1" as never,
  title: "Test",
  modelSelection: { provider: "codex" as const, model: "codex-default" },
  runtimeMode: "code" as const,
  interactionMode: "agent" as const,
  envMode: "local" as const,
  branch: null,
  worktreePath: null,
  associatedWorktreePath: null,
  associatedWorktreeBranch: null,
  associatedWorktreeRef: null,
  createBranchFlowCompleted: false,
  isPinned: false,
  parentThreadId: null,
  subagentAgentId: null,
  subagentNickname: null,
  subagentRole: null,
  lastKnownPr: null,
  createdAt: "2026-01-01T00:00:00Z",
};

function makeApi() {
  return {
    orchestration: {
      dispatchCommand: vi.fn(async () => undefined),
      getShellSnapshot: vi.fn(async () => ({ projects: [], threads: mockState.snapshotThreads })),
    },
  };
}

// =============================================================================
// 1. isDuplicateThreadCreateError
// =============================================================================

describe("isDuplicateThreadCreateError", () => {
  it("匹配 thread.create 重复错误 → true", () => {
    const msg = `Orchestration command invariant failed (thread.create): Thread '${TID}' already exists and cannot be created twice.`;
    expect(isDuplicateThreadCreateError(new Error(msg), TID)).toBe(true);
  });

  it("string 形式的错误也能匹配", () => {
    const msg = `Orchestration command invariant failed (thread.create): Thread '${TID}' already exists and cannot be created twice.`;
    expect(isDuplicateThreadCreateError(msg, TID)).toBe(true);
  });

  it("不相关错误 → false", () => {
    expect(isDuplicateThreadCreateError(new Error("network down"), TID)).toBe(false);
  });

  it("thread.create 但不是 duplicate 原因 → false", () => {
    expect(
      isDuplicateThreadCreateError(
        new Error("Orchestration command invariant failed (thread.create): something else"),
        TID,
      ),
    ).toBe(false);
  });

  it("非 Error/String/对象 → false", () => {
    expect(isDuplicateThreadCreateError(null, TID)).toBe(false);
    expect(isDuplicateThreadCreateError(undefined, TID)).toBe(false);
    expect(isDuplicateThreadCreateError(42, TID)).toBe(false);
  });
});

// =============================================================================
// 2. promoteThreadCreate
// =============================================================================

describe("promoteThreadCreate - 基础路径", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("api=undefined → unavailable", async () => {
    mockState.api = null;
    const result = await promoteThreadCreate(baseCommand);
    expect(result).toBe("unavailable");
  });

  it("线程已在 store → exists（不发 dispatch）", async () => {
    mockState.threadInStore = { id: TID };
    const api = makeApi();
    mockState.api = api;

    const result = await promoteThreadCreate(baseCommand, api as unknown as NativeApi);
    expect(result).toBe("exists");
    expect(api.orchestration.dispatchCommand).not.toHaveBeenCalled();
    expect(mockState.markPromotedDraftThreads).toHaveBeenCalledWith(new Set([TID]));
  });

  it("正常 dispatch → created", async () => {
    const api = makeApi();
    mockState.api = api;

    const result = await promoteThreadCreate(baseCommand, api as unknown as NativeApi);
    expect(result).toBe("created");
    expect(api.orchestration.dispatchCommand).toHaveBeenCalledWith(baseCommand);
    expect(mockState.markPromotedDraftThreads).toHaveBeenCalledWith(new Set([TID]));
  });
});

describe("promoteThreadCreate - 重复错误处理", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("duplicate 错误 + snapshot 包含线程 → exists（恢复）", async () => {
    const api = makeApi();
    api.orchestration.dispatchCommand.mockRejectedValueOnce(
      new Error(
        `Orchestration command invariant failed (thread.create): Thread '${TID}' already exists and cannot be created twice.`,
      ),
    );
    mockState.snapshotThreads = [{ id: TID }];
    mockState.api = api;
    // 模拟 snapshot 同步后 store 已包含线程
    api.orchestration.getShellSnapshot.mockImplementationOnce(async () => {
      // 在 snapshot 返回前把线程放进 store
      mockState.threadInStore = { id: TID };
      return { projects: [], threads: mockState.snapshotThreads };
    });

    const result = await promoteThreadCreate(baseCommand, api as unknown as NativeApi);
    expect(result).toBe("exists");
    expect(api.orchestration.getShellSnapshot).toHaveBeenCalled();
    expect(mockState.syncServerShellSnapshot).toHaveBeenCalled();
  });

  it("duplicate 错误 + snapshot 不含线程 → 重新抛出", async () => {
    const api = makeApi();
    api.orchestration.dispatchCommand.mockRejectedValueOnce(
      new Error(
        `Orchestration command invariant failed (thread.create): Thread '${TID}' already exists and cannot be created twice.`,
      ),
    );
    mockState.snapshotThreads = [];
    mockState.api = api;

    await expect(
      promoteThreadCreate(baseCommand, api as unknown as NativeApi),
    ).rejects.toThrow(/already exists/);
  });

  it("非 duplicate 错误 → 重新抛出", async () => {
    const api = makeApi();
    api.orchestration.dispatchCommand.mockRejectedValueOnce(new Error("network down"));
    mockState.api = api;

    await expect(
      promoteThreadCreate(baseCommand, api as unknown as NativeApi),
    ).rejects.toThrow(/network down/);
  });

  it("duplicate 错误 + snapshot 调用失败 → 重新抛出原 duplicate 错误", async () => {
    const api = makeApi();
    api.orchestration.dispatchCommand.mockRejectedValueOnce(
      new Error(
        `Orchestration command invariant failed (thread.create): Thread '${TID}' already exists and cannot be created twice.`,
      ),
    );
    api.orchestration.getShellSnapshot.mockRejectedValueOnce(new Error("snapshot failed"));
    mockState.api = api;

    await expect(
      promoteThreadCreate(baseCommand, api as unknown as NativeApi),
    ).rejects.toThrow(/already exists/);
  });
});

describe("promoteThreadCreate - in-flight 去重", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("相同 threadId 并发调用共享 promise（dispatch 只调一次）", async () => {
    const api = makeApi();
    mockState.api = api;
    // 让 dispatch 延迟以模拟并发
    let resolveDispatch: (() => void) | null = null;
    api.orchestration.dispatchCommand.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveDispatch = resolve;
      }),
    );

    const p1 = promoteThreadCreate(baseCommand, api as unknown as NativeApi);
    const p2 = promoteThreadCreate(baseCommand, api as unknown as NativeApi);

    // resolve dispatch
    resolveDispatch?.();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(api.orchestration.dispatchCommand).toHaveBeenCalledTimes(1);
    expect(r1).toBe("created");
    expect(r2).toBe("exists"); // 第二个并发拿到 in-flight 返回
  });
});
