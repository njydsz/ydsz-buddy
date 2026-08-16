/**
 * @file useTurnAiShare 单元测试
 *
 * 覆盖:
 * - activeThread=undefined → 空态
 * - thread 携带 turnDiffSummaries → 正确聚合
 * - 切换 thread 引用 → 重新计算(useMemo 失效)
 * - 同 thread 引用 → 稳定返回(避免下游渲染抖动)
 * - turnDiffSummaries 引用变化 → 重新计算
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { TurnId } from "@ydsz-buddy/contracts";
import type { Thread, TurnDiffFileChange, TurnDiffSummary } from "../types";
import { useTurnAiShare } from "./useTurnAiShare";

function makeFile(
  path: string,
  additions: number,
  author: TurnDiffFileChange["author"] = "ai",
): TurnDiffFileChange {
  return { path, additions, author };
}

function makeSummary(
  turnId: string,
  files: TurnDiffFileChange[],
  completedAt = "2026-06-25T00:00:00.000Z",
): TurnDiffSummary {
  return {
    turnId: turnId as TurnId,
    completedAt,
    files,
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
  } as unknown as Thread;
}

describe("useTurnAiShare - undefined", () => {
  it("activeThread=undefined → 返回空态", () => {
    const { result } = renderHook(() => useTurnAiShare(undefined));
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.aiShare).toBeNull();
    expect(result.current.aiLines).toBe(0);
    expect(result.current.humanLines).toBe(0);
    expect(result.current.turnCount).toBe(0);
    expect(result.current.fileCount).toBe(0);
  });
});

describe("useTurnAiShare - 有数据", () => {
  it("单 turn 全 AI → aiShare = 1", () => {
    const thread = makeThread([
      makeSummary("t1", [
        makeFile("/a.ts", 10, "ai"),
        makeFile("/b.ts", 5, "ai"),
      ]),
    ]);
    const { result } = renderHook(() => useTurnAiShare(thread));
    expect(result.current.aiLines).toBe(15);
    expect(result.current.humanLines).toBe(0);
    expect(result.current.aiShare).toBe(1);
    expect(result.current.turnCount).toBe(1);
    expect(result.current.fileCount).toBe(2);
    expect(result.current.isEmpty).toBe(false);
  });

  it("AI + User 混合 → 比例精确", () => {
    const thread = makeThread([
      makeSummary("t1", [
        makeFile("/a.ts", 30, "ai"),
        makeFile("/b.ts", 10, "user"),
      ]),
    ]);
    const { result } = renderHook(() => useTurnAiShare(thread));
    expect(result.current.aiLines).toBe(30);
    expect(result.current.humanLines).toBe(10);
    expect(result.current.aiShare).toBeCloseTo(0.75, 6);
    expect(result.current.humanShare).toBeCloseTo(0.25, 6);
  });

  it("多 turn 累加,同路径去重", () => {
    const thread = makeThread([
      makeSummary("t1", [makeFile("/a.ts", 5, "ai")]),
      makeSummary("t2", [makeFile("/a.ts", 3, "ai")]),
    ]);
    const { result } = renderHook(() => useTurnAiShare(thread));
    expect(result.current.aiLines).toBe(8);
    expect(result.current.turnCount).toBe(2);
    expect(result.current.fileCount).toBe(1);
  });
});

describe("useTurnAiShare - useMemo 缓存", () => {
  it("同 thread 引用 → 返回稳定对象(useMemo 命中)", () => {
    const thread = makeThread([makeSummary("t1", [makeFile("/a.ts", 5, "ai")])]);
    const { result, rerender } = renderHook(
      ({ t }: { t: Thread | undefined }) => useTurnAiShare(t),
      { initialProps: { t: thread } },
    );
    const firstStats = result.current;
    rerender({ t: thread });
    expect(result.current).toBe(firstStats);
  });

  it("切换 thread 引用 → 重新计算", () => {
    const threadA = makeThread([makeSummary("t1", [makeFile("/a.ts", 5, "ai")])]);
    const threadB = makeThread([makeSummary("t2", [makeFile("/b.ts", 7, "user")])]);
    const { result, rerender } = renderHook(
      ({ t }: { t: Thread | undefined }) => useTurnAiShare(t),
      { initialProps: { t: threadA } },
    );
    expect(result.current.aiLines).toBe(5);
    rerender({ t: threadB });
    expect(result.current.aiLines).toBe(0);
    expect(result.current.humanLines).toBe(7);
  });

  it("turnDiffSummaries 引用变化 → 重新计算", () => {
    const thread = makeThread([makeSummary("t1", [makeFile("/a.ts", 5, "ai")])]);
    const { result, rerender } = renderHook(
      ({ t }: { t: Thread | undefined }) => useTurnAiShare(t),
      { initialProps: { t: thread } },
    );
    expect(result.current.aiLines).toBe(5);
    // 替换 turnDiffSummaries(同一 thread 对象,但内部数组换引用)
    const newThread = {
      ...thread,
      turnDiffSummaries: [makeSummary("t1", [makeFile("/a.ts", 99, "ai")])],
    } as Thread;
    rerender({ t: newThread });
    expect(result.current.aiLines).toBe(99);
  });

  it("从 undefined 切到 thread → 触发计算", () => {
    const { result, rerender } = renderHook(
      ({ t }: { t: Thread | undefined }) => useTurnAiShare(t),
      { initialProps: { t: undefined as Thread | undefined } },
    );
    expect(result.current.isEmpty).toBe(true);
    const thread = makeThread([makeSummary("tx", [makeFile("/a.ts", 7, "ai")])]);
    rerender({ t: thread });
    expect(result.current.aiLines).toBe(7);
    expect(result.current.isEmpty).toBe(false);
  });
});
