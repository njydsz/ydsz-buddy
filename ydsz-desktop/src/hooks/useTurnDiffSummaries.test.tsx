/**
 * @file useTurnDiffSummaries 单元测试
 *
 * 覆盖：
 * - activeThread=undefined → 空数组 + 空 checkpoint
 * - activeThread 有 summaries → 返回 summaries + checkpoint 计数
 * - 计数按 completedAt 升序：从 1 开始
 * - useMemo 缓存：引用稳定时返回同一对象
 * - activeThread 变化触发重新计算
 *
 * 策略：纯函数 + useMemo，构造 mock Thread，断言输出。
 */

import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { TurnId } from "@ydsz-buddy/contracts";
import type { Thread, TurnDiffSummary } from "../types";
import { useTurnDiffSummaries } from "./useTurnDiffSummaries";

function makeSummary(turnId: string, completedAt: string, filesChanged = 1): TurnDiffSummary {
  return {
    turnId: turnId as TurnId,
    completedAt,
    filesChanged,
    additions: 0,
    deletions: 0,
  };
}

function makeThread(summaries: TurnDiffSummary[]): Thread {
  return {
    id: "thread-1" as never,
    projectId: "project-1" as never,
    title: "test",
    messages: [],
    activities: [],
    proposedPlans: [],
    turnDiffSummaries: summaries,
    session: null,
    turnState: undefined,
  } as unknown as Thread;
}

// =============================================================================
// 1. undefined 输入
// =============================================================================

describe("useTurnDiffSummaries - undefined", () => {
  it("activeThread=undefined → 空 summaries", () => {
    const { result } = renderHook(() => useTurnDiffSummaries(undefined));
    expect(result.current.turnDiffSummaries).toEqual([]);
    expect(result.current.inferredCheckpointTurnCountByTurnId).toEqual({});
  });
});

// =============================================================================
// 2. 有数据
// =============================================================================

describe("useTurnDiffSummaries - 有数据", () => {
  it("返回 summaries 和 checkpoint 计数", () => {
    const summaries = [
      makeSummary("turn-1", "2026-01-01T00:00:01Z"),
      makeSummary("turn-2", "2026-01-01T00:00:02Z"),
      makeSummary("turn-3", "2026-01-01T00:00:03Z"),
    ];
    const { result } = renderHook(() => useTurnDiffSummaries(makeThread(summaries)));
    expect(result.current.turnDiffSummaries).toEqual(summaries);
    expect(result.current.inferredCheckpointTurnCountByTurnId).toEqual({
      "turn-1": 1,
      "turn-2": 2,
      "turn-3": 3,
    });
  });

  it("按 completedAt 升序排序后分配计数（与传入顺序无关）", () => {
    const summaries = [
      makeSummary("turn-3", "2026-01-01T00:00:03Z"),
      makeSummary("turn-1", "2026-01-01T00:00:01Z"),
      makeSummary("turn-2", "2026-01-01T00:00:02Z"),
    ];
    const { result } = renderHook(() => useTurnDiffSummaries(makeThread(summaries)));
    expect(result.current.inferredCheckpointTurnCountByTurnId).toEqual({
      "turn-1": 1,
      "turn-2": 2,
      "turn-3": 3,
    });
  });

  it("空 summaries → 空对象", () => {
    const { result } = renderHook(() => useTurnDiffSummaries(makeThread([])));
    expect(result.current.turnDiffSummaries).toEqual([]);
    expect(result.current.inferredCheckpointTurnCountByTurnId).toEqual({});
  });
});

// =============================================================================
// 3. useMemo 缓存
// =============================================================================

describe("useTurnDiffSummaries - useMemo 缓存", () => {
  it("传入同一 thread 引用 → 返回稳定结果", () => {
    const summaries = [makeSummary("turn-1", "2026-01-01T00:00:01Z")];
    const thread = makeThread(summaries);
    const { result, rerender } = renderHook(({ t }) => useTurnDiffSummaries(t), {
      initialProps: { t: thread },
    });
    const firstSummaries = result.current.turnDiffSummaries;
    rerender({ t: thread });
    expect(result.current.turnDiffSummaries).toBe(firstSummaries);
  });

  it("切换到不同 thread → 重新计算", () => {
    const threadA = makeThread([makeSummary("turn-1", "2026-01-01T00:00:01Z")]);
    const threadB = makeThread([makeSummary("turn-2", "2026-01-01T00:00:02Z")]);
    const { result, rerender } = renderHook(({ t }) => useTurnDiffSummaries(t), {
      initialProps: { t: threadA },
    });
    expect(result.current.inferredCheckpointTurnCountByTurnId).toEqual({ "turn-1": 1 });
    rerender({ t: threadB });
    expect(result.current.inferredCheckpointTurnCountByTurnId).toEqual({ "turn-2": 1 });
  });

  it("从 undefined 切到 thread → 触发计算", () => {
    const { result, rerender } = renderHook(
      ({ t }: { t: Thread | undefined }) => useTurnDiffSummaries(t),
      { initialProps: { t: undefined as Thread | undefined } },
    );
    expect(result.current.turnDiffSummaries).toEqual([]);
    const thread = makeThread([makeSummary("turn-x", "2026-01-01T00:00:01Z")]);
    rerender({ t: thread });
    expect(result.current.inferredCheckpointTurnCountByTurnId).toEqual({ "turn-x": 1 });
  });
});
