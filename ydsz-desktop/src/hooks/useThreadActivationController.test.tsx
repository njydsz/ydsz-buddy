/**
 * @file useThreadActivationController 单元测试
 *
 * 覆盖：
 * - API 形状：返回 { activateThreadFromSidebarIntent }
 * - 单线程激活（无 split）→ 走 single 路径，调用 openChatThreadPage
 * - 单线程 + entryPoint='terminal' → 调用 openTerminalThreadPage
 * - 分屏激活（activeSplitView 命中）→ 走 split 路径
 * - ignore 路径：thread 不存在 或 已在当前路由
 * - 侧聊分屏：source 存在且未在分屏中 → openSidechatSplit
 * - 侧聊优先于 single：sidechat + activation.kind='split' 时仍走 sidechat
 * - selectedThreadCount > 0 → 触发 clearSelection
 * - prewarmThreadDetailForIntent 被调用
 * - 记忆 last thread route
 * - 路由 navigate 参数正确
 *
 * 策略：直接调用 activateThreadFromSidebarIntent 纯函数（不挂载 hook），
 * 验证副作用链路 + 跳过 React 渲染。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectId, ThreadId } from "@ydsz-buddy/contracts";
import type { SplitView, SplitViewId } from "../splitViewStore";
import type { ThreadTerminalStateById } from "../terminalStateStore";

// 必须在 mock 之后导入
import { activateThreadFromSidebarIntent, useThreadActivationController } from "./useThreadActivationController";
import { renderHook } from "@testing-library/react";

// =============================================================================
// Mock 状态容器
// =============================================================================

const { mockState } = vi.hoisted(() => {
  const state = {
    navigate: vi.fn(async () => undefined),
    openChatThreadPage: vi.fn(),
    openTerminalThreadPage: vi.fn(),
    openSidechatSplit: vi.fn(() => "split-new" as SplitViewId),
    prewarmThreadDetailForIntent: vi.fn(),
    rememberLastThreadRouteNow: vi.fn(),
    clearSelection: vi.fn(),
    setOptimisticActiveThreadId: vi.fn(),
    setSelectionAnchor: vi.fn(),
    setSplitFocusedPane: vi.fn(),
  };
  return { mockState: state };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================================================
// 测试工具
// =============================================================================

function resetMocks() {
  for (const fn of Object.values(mockState)) {
    (fn as { mockReset: () => void }).mockReset();
  }
  mockState.openSidechatSplit.mockReturnValue("split-new");
}

const TID_SIDECHAT = "thread-sidechat" as ThreadId;
const TID_SOURCE = "thread-source" as ThreadId;
const TID_OWN = "thread-own" as ThreadId;
const TID_OTHER = "thread-other" as ThreadId;
const PROJECT_A = "project-A" as ProjectId;

function makeInput(overrides: Partial<Parameters<typeof activateThreadFromSidebarIntent>[0]> = {}) {
  return {
    activeSplitView: null as SplitView | null,
    clearSelection: mockState.clearSelection,
    navigate: mockState.navigate as unknown as Parameters<
      typeof activateThreadFromSidebarIntent
    >[0]["navigate"],
    openChatThreadPage: mockState.openChatThreadPage,
    openSidechatSplit: mockState.openSidechatSplit,
    openTerminalThreadPage: mockState.openTerminalThreadPage,
    prewarmThreadDetailForIntent: mockState.prewarmThreadDetailForIntent,
    rememberLastThreadRouteNow: mockState.rememberLastThreadRouteNow,
    routeSplitViewId: null as string | null,
    routeThreadId: null as ThreadId | null,
    selectedThreadCount: 0,
    setOptimisticActiveThreadId: mockState.setOptimisticActiveThreadId,
    setSelectionAnchor: mockState.setSelectionAnchor,
    setSplitFocusedPane: mockState.setSplitFocusedPane,
    sidebarThreadSummaryById: {} as Parameters<
      typeof activateThreadFromSidebarIntent
    >[0]["sidebarThreadSummaryById"],
    splitViewsById: {} as Record<SplitViewId, SplitView | undefined>,
    terminalStateByThreadId: {} as ThreadTerminalStateById,
    ...overrides,
  };
}

// =============================================================================
// 1. API 形状
// =============================================================================

describe("useThreadActivationController - API 形状", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("Hook 暴露 activateThreadFromSidebarIntent 函数", () => {
    const { result } = renderHook(() =>
      useThreadActivationController(makeInput() as Parameters<typeof useThreadActivationController>[0]),
    );
    expect(typeof result.current.activateThreadFromSidebarIntent).toBe("function");
  });
});

// =============================================================================
// 2. ignore 路径
// =============================================================================

describe("activateThreadFromSidebarIntent - ignore", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("thread 不存在 → ignore（无副作用）", () => {
    const input = makeInput();
    activateThreadFromSidebarIntent(input, TID_OTHER);
    expect(mockState.navigate).not.toHaveBeenCalled();
    expect(mockState.openChatThreadPage).not.toHaveBeenCalled();
    expect(mockState.prewarmThreadDetailForIntent).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 3. single 路径
// =============================================================================

describe("activateThreadFromSidebarIntent - single", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("chat 入口点 → openChatThreadPage + navigate", () => {
    const input = makeInput({
      sidebarThreadSummaryById: {
        [TID_OTHER]: { id: TID_OTHER, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
      terminalStateByThreadId: {
        [TID_OTHER]: {
          entryPoint: "chat",
          terminalOpen: false,
          presentationMode: "drawer",
          groups: [],
          activeTerminalId: "default",
          workspace: { tabs: [], activeTab: "chat", layout: "both" },
        },
      } as unknown as ThreadTerminalStateById,
    });
    activateThreadFromSidebarIntent(input, TID_OTHER);
    expect(mockState.openChatThreadPage).toHaveBeenCalledWith(TID_OTHER);
    expect(mockState.openTerminalThreadPage).not.toHaveBeenCalled();
    expect(mockState.prewarmThreadDetailForIntent).toHaveBeenCalledWith(TID_OTHER);
    expect(mockState.setOptimisticActiveThreadId).toHaveBeenCalledWith(TID_OTHER);
    expect(mockState.setSelectionAnchor).toHaveBeenCalledWith(TID_OTHER);
    expect(mockState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/$threadId",
        params: { threadId: TID_OTHER },
      }),
    );
  });

  it("terminal 入口点 → openTerminalThreadPage", () => {
    const input = makeInput({
      sidebarThreadSummaryById: {
        [TID_OTHER]: { id: TID_OTHER, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
      terminalStateByThreadId: {
        [TID_OTHER]: {
          entryPoint: "terminal",
          terminalOpen: false,
          presentationMode: "drawer",
          groups: [],
          activeTerminalId: "default",
          workspace: { tabs: [], activeTab: "terminal", layout: "both" },
        },
      } as unknown as ThreadTerminalStateById,
    });
    activateThreadFromSidebarIntent(input, TID_OTHER);
    expect(mockState.openTerminalThreadPage).toHaveBeenCalledWith(TID_OTHER);
    expect(mockState.openChatThreadPage).not.toHaveBeenCalled();
  });

  it("selectedThreadCount > 0 → 触发 clearSelection", () => {
    const input = makeInput({
      sidebarThreadSummaryById: {
        [TID_OTHER]: { id: TID_OTHER, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
      terminalStateByThreadId: {
        [TID_OTHER]: {
          entryPoint: "chat",
          terminalOpen: false,
          presentationMode: "drawer",
          groups: [],
          activeTerminalId: "default",
          workspace: { tabs: [], activeTab: "chat", layout: "both" },
        },
      } as unknown as ThreadTerminalStateById,
      selectedThreadCount: 3,
    });
    activateThreadFromSidebarIntent(input, TID_OTHER);
    expect(mockState.clearSelection).toHaveBeenCalled();
  });

  it("selectedThreadCount = 0 → 不调用 clearSelection", () => {
    const input = makeInput({
      sidebarThreadSummaryById: {
        [TID_OTHER]: { id: TID_OTHER, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
      terminalStateByThreadId: {
        [TID_OTHER]: {
          entryPoint: "chat",
          terminalOpen: false,
          presentationMode: "drawer",
          groups: [],
          activeTerminalId: "default",
          workspace: { tabs: [], activeTab: "chat", layout: "both" },
        },
      } as unknown as ThreadTerminalStateById,
    });
    activateThreadFromSidebarIntent(input, TID_OTHER);
    expect(mockState.clearSelection).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 4. split 路径
// =============================================================================

describe("activateThreadFromSidebarIntent - split", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("activeSplitView 命中 + 同 thread → ignore（不重复 navigate）", () => {
    const input = makeInput({
      activeSplitView: {
        id: "split-1",
        sourceThreadId: TID_OWN,
        ownerProjectId: PROJECT_A,
        focusedPaneId: "pane-1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        root: {
          kind: "split",
          id: "split-root",
          direction: "horizontal",
          ratio: 0.5,
          first: { kind: "leaf", id: "pane-1", threadId: TID_OTHER, panel: null as never },
          second: { kind: "leaf", id: "pane-2", threadId: TID_OWN, panel: null as never },
        },
      } as unknown as SplitView,
      routeThreadId: TID_OTHER,
      routeSplitViewId: "split-1",
      sidebarThreadSummaryById: {
        [TID_OTHER]: { id: TID_OTHER, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
    });
    activateThreadFromSidebarIntent(input, TID_OTHER);
    expect(mockState.navigate).not.toHaveBeenCalled();
    expect(mockState.setSelectionAnchor).not.toHaveBeenCalled();
  });

  it("activeSplitView 命中 + 不同 thread → 走 split 路径", () => {
    // TID_OTHER 出现在 split 视图中（但不是当前 route thread）
    const input = makeInput({
      activeSplitView: {
        id: "split-1",
        sourceThreadId: TID_OWN,
        ownerProjectId: PROJECT_A,
        focusedPaneId: "pane-1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        root: {
          kind: "split",
          id: "split-root",
          direction: "horizontal",
          ratio: 0.5,
          first: { kind: "leaf", id: "pane-1", threadId: TID_OWN, panel: null as never },
          second: { kind: "leaf", id: "pane-2", threadId: TID_OTHER, panel: null as never },
        },
      } as unknown as SplitView,
      routeThreadId: TID_OWN,
      routeSplitViewId: "split-1",
      sidebarThreadSummaryById: {
        [TID_OTHER]: { id: TID_OTHER, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
      splitViewsById: {
        "split-1": {
          id: "split-1",
          sourceThreadId: TID_OWN,
          ownerProjectId: PROJECT_A,
          focusedPaneId: "pane-1",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          root: {
            kind: "split",
            id: "split-root",
            direction: "horizontal",
            ratio: 0.5,
            first: { kind: "leaf", id: "pane-1", threadId: TID_OWN, panel: null as never },
            second: { kind: "leaf", id: "pane-2", threadId: TID_OTHER, panel: null as never },
          },
        } as unknown as SplitView,
      },
    });
    activateThreadFromSidebarIntent(input, TID_OTHER);
    expect(mockState.prewarmThreadDetailForIntent).toHaveBeenCalledWith(TID_OTHER);
    expect(mockState.setOptimisticActiveThreadId).toHaveBeenCalledWith(TID_OTHER);
    expect(mockState.setSplitFocusedPane).toHaveBeenCalled();
    expect(mockState.rememberLastThreadRouteNow).toHaveBeenCalled();
    expect(mockState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/$threadId",
        params: { threadId: TID_OTHER },
      }),
    );
  });
});

// =============================================================================
// 5. sidechat 路径
// =============================================================================

describe("activateThreadFromSidebarIntent - sidechat", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("sidechat + 无 source → 走 single", () => {
    // 没有 sidechatSourceThreadId → 走普通路径
    const input = makeInput({
      sidebarThreadSummaryById: {
        [TID_OTHER]: { id: TID_OTHER, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
      terminalStateByThreadId: {
        [TID_OTHER]: {
          entryPoint: "chat",
          terminalOpen: false,
          presentationMode: "drawer",
          groups: [],
          activeTerminalId: "default",
          workspace: { tabs: [], activeTab: "chat", layout: "both" },
        },
      } as unknown as ThreadTerminalStateById,
    });
    activateThreadFromSidebarIntent(input, TID_OTHER);
    expect(mockState.openSidechatSplit).not.toHaveBeenCalled();
    expect(mockState.openChatThreadPage).toHaveBeenCalled();
  });

  it("sidechat + 有 source + 无 routeSplitViewId → 走 sidechat", () => {
    const input = makeInput({
      sidebarThreadSummaryById: {
        [TID_SIDECHAT]: {
          id: TID_SIDECHAT,
          projectId: PROJECT_A,
          sidechatSourceThreadId: TID_SOURCE,
        },
        [TID_SOURCE]: { id: TID_SOURCE, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
    });
    activateThreadFromSidebarIntent(input, TID_SIDECHAT);
    expect(mockState.openSidechatSplit).toHaveBeenCalledWith({
      sourceThreadId: TID_SOURCE,
      ownerProjectId: PROJECT_A,
      sidechatThreadId: TID_SIDECHAT,
    });
    expect(mockState.prewarmThreadDetailForIntent).toHaveBeenCalledWith(TID_SOURCE);
    expect(mockState.prewarmThreadDetailForIntent).toHaveBeenCalledWith(TID_SIDECHAT);
    expect(mockState.navigate).toHaveBeenCalled();
  });

  it("sidechat + 有 source + 已有 routeSplitViewId → 不走 sidechat", () => {
    const input = makeInput({
      routeSplitViewId: "split-existing",
      sidebarThreadSummaryById: {
        [TID_SIDECHAT]: {
          id: TID_SIDECHAT,
          projectId: PROJECT_A,
          sidechatSourceThreadId: TID_SOURCE,
        },
        [TID_SOURCE]: { id: TID_SOURCE, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
      terminalStateByThreadId: {
        [TID_SIDECHAT]: {
          entryPoint: "chat",
          terminalOpen: false,
          presentationMode: "drawer",
          groups: [],
          activeTerminalId: "default",
          workspace: { tabs: [], activeTab: "chat", layout: "both" },
        },
      } as unknown as ThreadTerminalStateById,
    });
    activateThreadFromSidebarIntent(input, TID_SIDECHAT);
    expect(mockState.openSidechatSplit).not.toHaveBeenCalled();
  });

  it("sidechat 优先于 single（activation.kind !== split 时）", () => {
    // 即便 activation 是 single，sidechat 仍会优先处理
    const input = makeInput({
      sidebarThreadSummaryById: {
        [TID_SIDECHAT]: {
          id: TID_SIDECHAT,
          projectId: PROJECT_A,
          sidechatSourceThreadId: TID_SOURCE,
        },
        [TID_SOURCE]: { id: TID_SOURCE, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
    });
    activateThreadFromSidebarIntent(input, TID_SIDECHAT);
    expect(mockState.openSidechatSplit).toHaveBeenCalled();
    expect(mockState.openChatThreadPage).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 6. 记忆 last thread route
// =============================================================================

describe("activateThreadFromSidebarIntent - 记忆路由", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("sidechat 路径 → 记忆 splitViewId", () => {
    mockState.openSidechatSplit.mockReturnValue("split-99" as SplitViewId);
    const input = makeInput({
      sidebarThreadSummaryById: {
        [TID_SIDECHAT]: {
          id: TID_SIDECHAT,
          projectId: PROJECT_A,
          sidechatSourceThreadId: TID_SOURCE,
        },
        [TID_SOURCE]: { id: TID_SOURCE, projectId: PROJECT_A, sidechatSourceThreadId: null },
      },
    });
    activateThreadFromSidebarIntent(input, TID_SIDECHAT);
    expect(mockState.rememberLastThreadRouteNow).toHaveBeenCalledWith({
      threadId: TID_SIDECHAT,
      splitViewId: "split-99",
    });
  });
});
