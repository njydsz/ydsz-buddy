/**
 * @file useIsDisposableThread 单元测试
 *
 * 覆盖：
 * - threadId=null/undefined → 返回 false
 * - temporaryThreadStore 中有标记 → 返回 true
 * - composerDraftStore 中有 isTemporary 草稿 → 返回 true
 * - 都没有标记 → 返回 false
 * - 已 latch 为 true 后清除标记 → 仍然返回 true（防抖防闪烁）
 * - re-render 后未变化 → 仍返回 true
 *
 * 策略：mock 两个 store 暴露 selector 接口，让 hook 走完所有分支。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ThreadId } from "@ydsz-buddy/contracts";

// =============================================================================
// Mock 状态容器
// =============================================================================

const { mockState } = vi.hoisted(() => {
  const state = {
    temporaryThreadIds: {} as Record<string, true | undefined>,
    draftThreadsByThreadId: {} as Record<string, { isTemporary?: boolean } | undefined>,
    markTemporaryThread: vi.fn(),
    clearTemporaryThread: vi.fn(),
  };
  return { mockState: state };
});

vi.mock("../temporaryThreadStore", () => ({
  useTemporaryThreadStore: (selector: (state: unknown) => unknown) =>
    selector({
      temporaryThreadIds: mockState.temporaryThreadIds,
      markTemporaryThread: mockState.markTemporaryThread,
      clearTemporaryThread: mockState.clearTemporaryThread,
    }),
}));

vi.mock("../composerDraftStore", () => ({
  useComposerDraftStore: (selector: (state: unknown) => unknown) =>
    selector({
      draftThreadsByThreadId: mockState.draftThreadsByThreadId,
    }),
}));

// 必须在 mock 之后导入
import { useIsDisposableThread } from "./useIsDisposableThread";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================================================
// 测试工具
// =============================================================================

function resetMocks() {
  mockState.temporaryThreadIds = {};
  mockState.draftThreadsByThreadId = {};
  mockState.markTemporaryThread.mockReset();
  mockState.clearTemporaryThread.mockReset();
}

const TID_A = "thread-A" as ThreadId;
const TID_B = "thread-B" as ThreadId;
const TID_C = "thread-C" as ThreadId;

// =============================================================================
// 1. threadId 为空
// =============================================================================

describe("useIsDisposableThread - 空 threadId", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("threadId=null → false", () => {
    const { result } = renderHook(() => useIsDisposableThread(null));
    expect(result.current).toBe(false);
  });

  it("threadId=undefined → false", () => {
    const { result } = renderHook(() => useIsDisposableThread(undefined));
    expect(result.current).toBe(false);
  });
});

// =============================================================================
// 2. 仅有临时线程标记
// =============================================================================

describe("useIsDisposableThread - temporaryThreadIds 标记", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("临时线程 store 中已标记 → true", () => {
    mockState.temporaryThreadIds = { [TID_A]: true };
    const { result } = renderHook(() => useIsDisposableThread(TID_A));
    expect(result.current).toBe(true);
  });

  it("其他线程被标记，传入的 threadId 未标记 → false", () => {
    mockState.temporaryThreadIds = { [TID_B]: true };
    const { result } = renderHook(() => useIsDisposableThread(TID_A));
    expect(result.current).toBe(false);
  });
});

// =============================================================================
// 3. 仅有草稿 isTemporary
// =============================================================================

describe("useIsDisposableThread - 草稿 isTemporary", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("草稿 store 中 isTemporary=true → true", () => {
    mockState.draftThreadsByThreadId = { [TID_A]: { isTemporary: true } };
    const { result } = renderHook(() => useIsDisposableThread(TID_A));
    expect(result.current).toBe(true);
  });

  it("草稿 isTemporary=false → false", () => {
    mockState.draftThreadsByThreadId = { [TID_A]: { isTemporary: false } };
    const { result } = renderHook(() => useIsDisposableThread(TID_A));
    expect(result.current).toBe(false);
  });

  it("其他线程有草稿 → false", () => {
    mockState.draftThreadsByThreadId = { [TID_B]: { isTemporary: true } };
    const { result } = renderHook(() => useIsDisposableThread(TID_A));
    expect(result.current).toBe(false);
  });
});

// =============================================================================
// 4. latch 防抖
// =============================================================================

describe("useIsDisposableThread - latch 防抖", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("曾为 true 后清除标记 → 仍然返回 true（防抖）", async () => {
    // 第一轮：被标记为临时
    mockState.temporaryThreadIds = { [TID_A]: true };
    const { result, rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useIsDisposableThread(id),
      { initialProps: { id: TID_A as ThreadId | null } },
    );
    expect(result.current).toBe(true);

    // 清除临时线程标记（晋升为永久线程）
    await act(async () => {
      mockState.temporaryThreadIds = {};
    });
    rerender({ id: TID_A });
    // 即便已清除，仍返回 true，避免 UI 闪烁
    expect(result.current).toBe(true);
  });

  it("latch 后切换到不同 threadId → 反映新状态", async () => {
    mockState.temporaryThreadIds = { [TID_A]: true };
    const { result, rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useIsDisposableThread(id),
      { initialProps: { id: TID_A as ThreadId | null } },
    );
    expect(result.current).toBe(true);

    // 切换到未被标记的 threadId
    rerender({ id: TID_B });
    expect(result.current).toBe(false);
  });

  it("latch 后切换到 null → 返回 false", () => {
    mockState.temporaryThreadIds = { [TID_A]: true };
    const { result, rerender } = renderHook(
      ({ id }: { id: ThreadId | null }) => useIsDisposableThread(id),
      { initialProps: { id: TID_A as ThreadId | null } },
    );
    expect(result.current).toBe(true);

    rerender({ id: null });
    expect(result.current).toBe(false);
  });
});

// =============================================================================
// 5. 多源联合
// =============================================================================

describe("useIsDisposableThread - 多源联合", () => {
  beforeEach(resetMocks);
  afterEach(resetMocks);

  it("两个 store 都标记 → true", () => {
    mockState.temporaryThreadIds = { [TID_A]: true };
    mockState.draftThreadsByThreadId = { [TID_A]: { isTemporary: true } };
    const { result } = renderHook(() => useIsDisposableThread(TID_A));
    expect(result.current).toBe(true);
  });

  it("只有草稿标记 → true（仍然为 true）", () => {
    mockState.temporaryThreadIds = {};
    mockState.draftThreadsByThreadId = { [TID_C]: { isTemporary: true } };
    const { result } = renderHook(() => useIsDisposableThread(TID_C));
    expect(result.current).toBe(true);
  });

  it("都未标记 → false", () => {
    mockState.temporaryThreadIds = {};
    mockState.draftThreadsByThreadId = {};
    const { result } = renderHook(() => useIsDisposableThread(TID_A));
    expect(result.current).toBe(false);
  });
});
