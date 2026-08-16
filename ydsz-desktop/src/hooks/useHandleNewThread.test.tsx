/**
 * @file useHandleNewThread 单元测试
 *
 * 覆盖：
 * - API 形状（返回字段 + handleNewThread 函数）
 * - happy path fresh 路径：调用 navigate 跳转到新 threadId
 * - options.temporary=true → 标记为临时线程
 * - options.fresh=true → 跳过 stored 草稿，强制 fresh
 * - options.entryPoint="terminal" → 调用 openTerminalThreadPage
 * - options.entryPoint="chat"（默认）→ 调用 openChatThreadPage
 * - options.provider 覆盖时调用 setModelSelection
 * - terminal entryPoint 走 createTerminalThread 路径
 *
 * 策略：mock 所有 store / router / nativeApi，让 hook 走 fresh bootstrap plan 路径。
 * 注意：vi.mock 工厂会被提升到文件顶部，工厂内不能引用外部变量。
 * 改用 `vi.hoisted` 共享 mock 状态（vi.hoisted 也会被提升，但比 vi.mock 早）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ProjectId } from "~/contracts";

// =============================================================================
// Mock 状态容器 — 用 vi.hoisted 避免 vi.mock 工厂内引用未初始化变量
// =============================================================================

const { mockState, composerDraftApi } = vi.hoisted(() => {
  const state = {
    navigate: vi.fn(async () => undefined),
    openChatThreadPage: vi.fn(),
    openTerminalThreadPage: vi.fn(),
    markTemporaryThread: vi.fn(),
    dispatchCommand: vi.fn(async () => undefined),
    setDraftThreadContext: vi.fn(),
    getDraftThread: vi.fn(() => null),
    getDraftThreadByProjectId: vi.fn(() => null),
    setProjectDraftThreadId: vi.fn(),
    clearProjectDraftThreadId: vi.fn(),
    applyStickyState: vi.fn(),
    setModelSelection: vi.fn(),
    copyTransferableComposerState: vi.fn(),
    projects: [] as unknown[],
  };
  const api = {
    setDraftThreadContext: state.setDraftThreadContext,
    getDraftThread: state.getDraftThread,
    getDraftThreadByProjectId: state.getDraftThreadByProjectId,
    setProjectDraftThreadId: state.setProjectDraftThreadId,
    clearProjectDraftThreadId: state.clearProjectDraftThreadId,
    applyStickyState: state.applyStickyState,
    setModelSelection: state.setModelSelection,
    copyTransferableComposerState: state.copyTransferableComposerState,
    stickyModelSelectionByProvider: {},
    // hook 通过 useComposerDraftStore.getState().draftsByThreadId[...] 读取
    draftsByThreadId: {} as Record<string, unknown>,
    // hook 通过 useComposerDraftStore.getState().draftThreadsByThreadId[...] 读取
    draftThreadsByThreadId: {} as Record<string, unknown>,
  };
  return { mockState: state, composerDraftApi: api };
});

// =============================================================================
// 依赖 mock
// =============================================================================

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockState.navigate,
}));

vi.mock("../focusedChatContext", () => ({
  useFocusedChatContext: () => ({
    routeThreadId: null,
    splitView: null,
    focusedThreadId: null,
    activeThread: null,
    activeDraftThread: null,
    activeProject: null,
    activeProjectId: null,
  }),
}));

vi.mock("../terminalStateStore", () => ({
  useTerminalStateStore: (selector: (state: unknown) => unknown) =>
    selector({
      openChatThreadPage: mockState.openChatThreadPage,
      openTerminalThreadPage: mockState.openTerminalThreadPage,
    }),
}));

vi.mock("../temporaryThreadStore", () => ({
  useTemporaryThreadStore: (selector: (state: unknown) => unknown) =>
    selector({ markTemporaryThread: mockState.markTemporaryThread }),
}));

vi.mock("~/nativeApi", () => ({
  readNativeApi: () => ({
    orchestration: { dispatchCommand: mockState.dispatchCommand },
  }),
}));

vi.mock(import("../composerDraftStore"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useComposerDraftStore: Object.assign(
      (selector?: (state: unknown) => unknown) => {
        if (typeof selector === "function") return selector(composerDraftApi);
        return composerDraftApi;
      },
      {
        getState: () => composerDraftApi,
        setState: (updater: unknown) => {
          if (typeof updater === "function") updater(composerDraftApi);
        },
      },
    ),
    default: actual,
  };
});

vi.mock("../appSettings", () => ({
  useAppSettings: () => ({ settings: { defaultProvider: "claudeAgent" } }),
  getCustomBinaryPathForProvider: () => "",
}));

vi.mock("../store", () => ({
  useStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ projects: mockState.projects }),
    {
      getState: () => ({ projects: mockState.projects }),
      setState: () => {},
    },
  ),
}));

vi.mock("@njydsz/shared/model", () => ({
  getDefaultModel: (provider: string) => {
    if (provider === "codex") return "codex-default";
    if (provider === "claudeAgent") return "claude-sonnet-4-5";
    return null;
  },
}));

// 必须在 mock 之后导入
import { useHandleNewThread } from "./useHandleNewThread";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================================================
// 测试工具
// =============================================================================

function resetMocks() {
  mockState.navigate.mockReset();
  mockState.navigate.mockResolvedValue(undefined);
  mockState.openChatThreadPage.mockReset();
  mockState.openTerminalThreadPage.mockReset();
  mockState.markTemporaryThread.mockReset();
  mockState.dispatchCommand.mockReset();
  mockState.dispatchCommand.mockResolvedValue(undefined);
  mockState.setDraftThreadContext.mockReset();
  mockState.getDraftThread.mockReset();
  mockState.getDraftThread.mockReturnValue(null);
  mockState.getDraftThreadByProjectId.mockReset();
  mockState.getDraftThreadByProjectId.mockReturnValue(null);
  mockState.setProjectDraftThreadId.mockReset();
  mockState.clearProjectDraftThreadId.mockReset();
  mockState.applyStickyState.mockReset();
  mockState.setModelSelection.mockReset();
  mockState.copyTransferableComposerState.mockReset();
  mockState.projects = [];
}

function makeProject(): {
  id: ProjectId;
  cwd: string;
  name: string;
  defaultModelSelection: { provider: string; model: string };
} {
  return {
    id: "project-1" as ProjectId,
    cwd: "/tmp/repo",
    name: "Test",
    defaultModelSelection: { provider: "claudeAgent", model: "claude-sonnet-4-5" },
  };
}

// =============================================================================
// 1. API 形状
// =============================================================================

describe("useHandleNewThread - API 形状", () => {
  beforeEach(resetMocks);
  afterEach(() => {
    mockState.projects = [];
  });

  it("暴露必要字段", () => {
    const { result } = renderHook(() => useHandleNewThread());
    expect(typeof result.current.handleNewThread).toBe("function");
    expect(result.current.activeDraftThread).toBeNull();
    expect(result.current.activeProjectId).toBeNull();
    expect(result.current.activeThread).toBeNull();
    expect(result.current.activeContextThreadId).toBeNull();
    expect(Array.isArray(result.current.projects)).toBe(true);
    expect(result.current.routeThreadId).toBeNull();
  });
});

// =============================================================================
// 2. happy path - fresh
// =============================================================================

describe("useHandleNewThread - happy path (fresh)", () => {
  beforeEach(() => {
    resetMocks();
    mockState.projects = [makeProject()];
  });
  afterEach(() => {
    mockState.projects = [];
  });

  it("调用 handleNewThread 触发 navigate", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId);
    });
    expect(mockState.navigate).toHaveBeenCalledTimes(1);
    expect(mockState.navigate).toHaveBeenCalledWith({
      to: "/$threadId",
      params: { threadId: expect.any(String) },
    });
  });

  it("默认 entryPoint='chat' 时调用 openChatThreadPage", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId);
    });
    expect(mockState.openChatThreadPage).toHaveBeenCalledTimes(1);
    expect(mockState.openTerminalThreadPage).not.toHaveBeenCalled();
  });

  it("options.entryPoint='terminal' 时调用 openTerminalThreadPage", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId, {
        entryPoint: "terminal",
      });
    });
    expect(mockState.openTerminalThreadPage).toHaveBeenCalledTimes(1);
    expect(mockState.openChatThreadPage).not.toHaveBeenCalled();
  });

  it("options.temporary=true 调用 markTemporaryThread", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId, {
        temporary: true,
      });
    });
    expect(mockState.markTemporaryThread).toHaveBeenCalledTimes(1);
    expect(mockState.markTemporaryThread).toHaveBeenCalledWith(expect.any(String));
  });

  it("options.temporary 未设置时不调用 markTemporaryThread", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId);
    });
    expect(mockState.markTemporaryThread).not.toHaveBeenCalled();
  });

  it("options.fresh=true 调用 clearProjectDraftThreadId", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId, {
        fresh: true,
      });
    });
    expect(mockState.clearProjectDraftThreadId).toHaveBeenCalled();
  });

  it("navigate 后的新 threadId 是 string", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId);
    });
    const call = mockState.navigate.mock.calls[0]?.[0] as { params: { threadId: string } };
    expect(typeof call.params.threadId).toBe("string");
  });
});

// =============================================================================
// 3. terminal 入口点
// =============================================================================

describe("useHandleNewThread - terminal 入口点", () => {
  beforeEach(() => {
    resetMocks();
    mockState.projects = [makeProject()];
  });
  afterEach(() => {
    mockState.projects = [];
  });

  it("terminal entryPoint 同时触发 dispatchCommand (thread.create)", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId, {
        entryPoint: "terminal",
      });
    });
    expect(mockState.dispatchCommand).toHaveBeenCalled();
    const firstCall = mockState.dispatchCommand.mock.calls[0]?.[0] as { type: string };
    expect(firstCall.type).toBe("thread.create");
  });

  it("chat entryPoint 不触发 dispatchCommand", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId);
    });
    expect(mockState.dispatchCommand).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 4. provider 覆盖
// =============================================================================

describe("useHandleNewThread - provider 覆盖", () => {
  beforeEach(() => {
    resetMocks();
    mockState.projects = [makeProject()];
  });
  afterEach(() => {
    mockState.projects = [];
  });

  it("options.provider='codex' 调用 setModelSelection", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId, {
        provider: "codex",
      });
    });
    expect(mockState.setModelSelection).toHaveBeenCalled();
    // setModelSelection(threadId, modelSelection) - 第二个参数是 modelSelection
    const calls = mockState.setModelSelection.mock.calls;
    const modelSelection = calls.map((c) => c[1]).find((v) => v && typeof v === "object");
    expect(modelSelection).toEqual({ provider: "codex", model: "codex-default" });
  });

  it("options.provider 缺失时不调用 setModelSelection", async () => {
    const { result } = renderHook(() => useHandleNewThread());
    await act(async () => {
      await result.current.handleNewThread("project-1" as ProjectId);
    });
    expect(mockState.setModelSelection).not.toHaveBeenCalled();
  });
});
