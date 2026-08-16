/**
 * @file storeSelectors 单元测试
 *
 * 覆盖线程交互模式选择器等 selector 工厂。
 */

import { describe, expect, it } from "vitest";
import {
  createThreadInteractionModeSelector,
  createThreadProjectIdSelector,
} from "./storeSelectors";
import { ThreadId } from "@ydsz-buddy/contracts";
import { DEFAULT_PROVIDER_INTERACTION_MODE } from "@ydsz-buddy/contracts";
import type { AppState } from "./store";
import type { Thread } from "./types";

const THREAD_ID = ThreadId.makeUnsafe("thread-1");

function makeState(threads: ReadonlyArray<Partial<Thread>>): AppState {
  return {
    threads: threads.map((partial) => ({
      id: THREAD_ID,
      codexThreadId: null,
      title: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
      lastReadAt: null,
      projectId: null,
      runtimeMode: "code",
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      envMode: undefined,
      branch: null,
      worktreePath: null,
      baseBranch: null,
      isWorktreeDirty: false,
      lastUserMessage: null,
      lastAssistantMessage: null,
      modelSelection: { provider: "codex" as const, model: "gpt-5" },
      providerOptions: null,
      sidechatSourceThreadId: null,
      parentThreadId: null,
      session: null,
      messages: [],
      latestUserMessageAt: null,
      latestAssistantMessageAt: null,
      pendingApprovals: [],
      pendingUserInputs: [],
      sessionStatus: "idle",
      sessionError: null,
      error: null,
      totalTokens: 0,
      lastTurnDiffSummary: null,
      pendingSourceProposedPlan: null,
      pinnedAt: null,
      tags: [],
      ...partial,
    })) as Thread[],
    projects: [],
  } as unknown as AppState;
}

describe("createThreadInteractionModeSelector", () => {
  it("返回线程的 interactionMode（review）", () => {
    const state = makeState([{ interactionMode: "review" }]);
    const select = createThreadInteractionModeSelector(THREAD_ID);
    expect(select(state)).toBe("review");
  });

  it("返回线程的 interactionMode（plan）", () => {
    const state = makeState([{ interactionMode: "plan" }]);
    const select = createThreadInteractionModeSelector(THREAD_ID);
    expect(select(state)).toBe("plan");
  });

  it("线程不存在时返回 null", () => {
    const state = makeState([]);
    const select = createThreadInteractionModeSelector(THREAD_ID);
    expect(select(state)).toBe(null);
  });

  it("threadId 为 null 时返回 null", () => {
    const state = makeState([{ interactionMode: "review" }]);
    const select = createThreadInteractionModeSelector(null);
    expect(select(state)).toBe(null);
  });

  it("threadId 为 undefined 时返回 null", () => {
    const state = makeState([{ interactionMode: "review" }]);
    const select = createThreadInteractionModeSelector(undefined);
    expect(select(state)).toBe(null);
  });
});

describe("createThreadProjectIdSelector", () => {
  it("线程有 projectId 时返回", () => {
    const state = makeState([{ projectId: "p-1" }]);
    const select = createThreadProjectIdSelector(THREAD_ID);
    expect(select(state)).toBe("p-1");
  });

  it("线程没有 projectId 时返回 null", () => {
    const state = makeState([{ projectId: null }]);
    const select = createThreadProjectIdSelector(THREAD_ID);
    expect(select(state)).toBe(null);
  });
});
