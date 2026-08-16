/**
 * @file threadBootstrap.ts 单元测试
 *
 * 覆盖：
 * - createActiveThreadSnapshot：项目匹配/不匹配
 * - createActiveDraftThreadSnapshot：项目匹配/不匹配
 * - resolveThreadBootstrapPlan：route / stored / fresh
 * - createFreshDraftThreadSeed
 * - hasDraftContextOverrides
 * - buildDraftThreadContextPatch：含覆盖时返回对象，否则 null
 * - shouldReuseActiveDraftThread
 * - resolveTerminalThreadCreationState
 */

import { describe, expect, it } from "vitest";
import type {
  OrchestrationThreadPullRequest,
  ProjectId,
  ProviderInteractionMode,
  ProviderKind,
  RuntimeMode,
  ThreadEnvironmentMode,
  ThreadId,
} from "~/contracts";
import {
  buildDraftThreadContextPatch,
  createActiveDraftThreadSnapshot,
  createActiveThreadSnapshot,
  createFreshDraftThreadSeed,
  hasDraftContextOverrides,
  resolveTerminalThreadCreationState,
  resolveThreadBootstrapPlan,
  shouldReuseActiveDraftThread,
  type NewThreadOptions,
} from "./threadBootstrap";
import type { DraftThreadState } from "../composerDraftStore";

const PROJECT_A = "proj-a" as ProjectId;
const PROJECT_B = "proj-b" as ProjectId;
const THREAD_X = "thread-x" as ThreadId;

const baseModelSelection = { provider: "codex" as ProviderKind, model: "codex-default" } as const;

const buildDraft = (overrides: Partial<DraftThreadState> = {}): DraftThreadState => ({
  projectId: PROJECT_A,
  createdAt: "2026-06-01T00:00:00.000Z",
  runtimeMode: "code" as RuntimeMode,
  interactionMode: "agent" as ProviderInteractionMode,
  entryPoint: "chat",
  branch: null,
  worktreePath: null,
  lastKnownPr: null,
  envMode: "local" as ThreadEnvironmentMode,
  ...overrides,
});

const buildStoredDraft = (overrides: Partial<DraftThreadState> = {}) => ({
  ...buildDraft(overrides),
  threadId: THREAD_X,
});

const baseActiveThread = {
  projectId: PROJECT_A,
  modelSelection: baseModelSelection,
  runtimeMode: "code" as RuntimeMode,
  interactionMode: "agent" as ProviderInteractionMode,
  envMode: "local" as ThreadEnvironmentMode,
  lastKnownPr: null as OrchestrationThreadPullRequest | null,
};

describe("createActiveThreadSnapshot", () => {
  it("projectId 不匹配 → null", () => {
    const result = createActiveThreadSnapshot(baseActiveThread, PROJECT_B);
    expect(result).toBeNull();
  });

  it("activeThread 为 null → null", () => {
    expect(createActiveThreadSnapshot(null, PROJECT_A)).toBeNull();
    expect(createActiveThreadSnapshot(undefined, PROJECT_A)).toBeNull();
  });

  it("projectId 匹配时返回快照", () => {
    const result = createActiveThreadSnapshot(baseActiveThread, PROJECT_A);
    expect(result).not.toBeNull();
    expect(result?.projectId).toBe(PROJECT_A);
    expect(result?.modelSelection).toEqual(baseModelSelection);
    expect(result?.lastKnownPr).toBeNull();
  });
});

describe("createActiveDraftThreadSnapshot", () => {
  it("null → null", () => {
    expect(createActiveDraftThreadSnapshot(null, PROJECT_A)).toBeNull();
    expect(createActiveDraftThreadSnapshot(undefined, PROJECT_A)).toBeNull();
  });

  it("projectId 不匹配 → null", () => {
    expect(createActiveDraftThreadSnapshot(buildDraft({ projectId: PROJECT_B }), PROJECT_A)).toBeNull();
  });

  it("projectId 匹配时返回归一化快照", () => {
    const draft = buildDraft();
    const snap = createActiveDraftThreadSnapshot(draft, PROJECT_A);
    expect(snap?.projectId).toBe(PROJECT_A);
    expect(snap?.entryPoint).toBe("chat");
  });
});

describe("resolveThreadBootstrapPlan", () => {
  it("路由草稿命中 → kind='route'", () => {
    const draft = buildDraft();
    const plan = resolveThreadBootstrapPlan({
      entryPoint: "chat",
      latestActiveDraftThread: draft,
      projectId: PROJECT_A,
      routeThreadId: THREAD_X,
      storedDraftThread: null,
    });
    expect(plan.kind).toBe("route");
    if (plan.kind === "route") {
      expect(plan.draftThread).toBe(draft);
    }
  });

  it("路由草稿不命中但有 stored → kind='stored'", () => {
    const plan = resolveThreadBootstrapPlan({
      entryPoint: "chat",
      latestActiveDraftThread: null,
      projectId: PROJECT_A,
      routeThreadId: null,
      storedDraftThread: buildStoredDraft(),
    });
    expect(plan.kind).toBe("stored");
    if (plan.kind === "stored") {
      expect(plan.threadId).toBe(THREAD_X);
    }
  });

  it("都没有 → kind='fresh'", () => {
    const plan = resolveThreadBootstrapPlan({
      entryPoint: "chat",
      latestActiveDraftThread: null,
      projectId: PROJECT_A,
      routeThreadId: null,
      storedDraftThread: null,
    });
    expect(plan.kind).toBe("fresh");
  });

  it("routeThreadId 缺失时即使有 draft 也走 stored", () => {
    const plan = resolveThreadBootstrapPlan({
      entryPoint: "chat",
      latestActiveDraftThread: buildDraft(),
      projectId: PROJECT_A,
      routeThreadId: null,
      storedDraftThread: buildStoredDraft(),
    });
    expect(plan.kind).toBe("stored");
  });
});

describe("createFreshDraftThreadSeed", () => {
  it("options 为 undefined 时使用默认值", () => {
    const seed = createFreshDraftThreadSeed({
      createdAt: "2026-06-01T00:00:00.000Z",
      entryPoint: "chat",
      options: undefined,
    });
    expect(seed.branch).toBeNull();
    expect(seed.worktreePath).toBeNull();
    expect(seed.envMode).toBe("local");
    expect(seed.entryPoint).toBe("chat");
  });

  it("options 含 branch/worktree/envMode 时透传", () => {
    const seed = createFreshDraftThreadSeed({
      createdAt: "2026-06-01T00:00:00.000Z",
      entryPoint: "terminal",
      options: {
        branch: "main",
        worktreePath: "/wt",
        envMode: "worktree",
        temporary: true,
      },
    });
    expect(seed.branch).toBe("main");
    expect(seed.worktreePath).toBe("/wt");
    expect(seed.envMode).toBe("worktree");
    expect(seed.entryPoint).toBe("terminal");
    expect(seed.isTemporary).toBe(true);
  });
});

describe("hasDraftContextOverrides", () => {
  it("undefined → false", () => {
    expect(hasDraftContextOverrides(undefined)).toBe(false);
  });

  it("空对象 → false", () => {
    expect(hasDraftContextOverrides({})).toBe(false);
  });

  it("含 branch → true", () => {
    expect(hasDraftContextOverrides({ branch: "main" })).toBe(true);
  });

  it("含 worktreePath → true", () => {
    expect(hasDraftContextOverrides({ worktreePath: "/wt" })).toBe(true);
  });

  it("含 envMode → true", () => {
    expect(hasDraftContextOverrides({ envMode: "worktree" })).toBe(true);
  });

  it("含临时/Provider 等非上下文字段 → false", () => {
    expect(hasDraftContextOverrides({ temporary: true })).toBe(false);
    expect(hasDraftContextOverrides({ provider: "codex" as ProviderKind })).toBe(false);
  });
});

describe("buildDraftThreadContextPatch", () => {
  it("无覆盖 → null", () => {
    expect(buildDraftThreadContextPatch("chat", undefined)).toBeNull();
    expect(buildDraftThreadContextPatch("chat", {})).toBeNull();
  });

  it("envMode='local' 且 worktreePath 未指定时清空 worktreePath", () => {
    const patch = buildDraftThreadContextPatch("chat", { envMode: "local" });
    expect(patch).toEqual({ worktreePath: null, envMode: "local", entryPoint: "chat" });
  });

  it("envMode='worktree' 时保留 worktreePath 字段", () => {
    const patch = buildDraftThreadContextPatch("terminal", {
      envMode: "worktree",
      worktreePath: "/wt",
    });
    expect(patch).toEqual({
      branch: undefined,
      worktreePath: "/wt",
      envMode: "worktree",
      entryPoint: "terminal",
    });
  });

  it("branch 透传", () => {
    const patch = buildDraftThreadContextPatch("chat", { branch: "main" });
    expect(patch?.branch).toBe("main");
  });
});

describe("shouldReuseActiveDraftThread", () => {
  it("routeThreadId 缺失 → false", () => {
    expect(
      shouldReuseActiveDraftThread({
        draftThread: buildDraft(),
        entryPoint: "chat",
        projectId: PROJECT_A,
        routeThreadId: null,
      }),
    ).toBe(false);
  });

  it("draftThread 为 null → false", () => {
    expect(
      shouldReuseActiveDraftThread({
        draftThread: null,
        entryPoint: "chat",
        projectId: PROJECT_A,
        routeThreadId: THREAD_X,
      }),
    ).toBe(false);
  });

  it("entryPoint 不匹配 → false", () => {
    expect(
      shouldReuseActiveDraftThread({
        draftThread: buildDraft({ entryPoint: "terminal" }),
        entryPoint: "chat",
        projectId: PROJECT_A,
        routeThreadId: THREAD_X,
      }),
    ).toBe(false);
  });

  it("projectId 不匹配 → false", () => {
    expect(
      shouldReuseActiveDraftThread({
        draftThread: buildDraft({ projectId: PROJECT_B }),
        entryPoint: "chat",
        projectId: PROJECT_A,
        routeThreadId: THREAD_X,
      }),
    ).toBe(false);
  });

  it("全部匹配 → true", () => {
    expect(
      shouldReuseActiveDraftThread({
        draftThread: buildDraft(),
        entryPoint: "chat",
        projectId: PROJECT_A,
        routeThreadId: THREAD_X,
      }),
    ).toBe(true);
  });
});

describe("resolveTerminalThreadCreationState", () => {
  const baseInput = {
    activeDraftThread: null,
    activeThread: null,
    defaultProvider: undefined,
    draftComposerState: null,
    draftThread: null,
    options: undefined as NewThreadOptions | undefined,
    projectDefaultModelSelection: null,
    projectId: PROJECT_A,
  };

  it("空输入走默认", () => {
    const state = resolveTerminalThreadCreationState(baseInput);
    expect(state.runtimeMode).toBe("code");
    expect(state.interactionMode).toBe("agent");
    expect(state.envMode).toBe("local");
    expect(state.branch).toBeNull();
    expect(state.worktreePath).toBeNull();
  });

  it("options.branch 覆盖", () => {
    const state = resolveTerminalThreadCreationState({
      ...baseInput,
      options: { branch: "feature" },
    });
    expect(state.branch).toBe("feature");
  });

  it("options.worktreePath 覆盖", () => {
    const state = resolveTerminalThreadCreationState({
      ...baseInput,
      options: { worktreePath: "/wt" },
    });
    expect(state.worktreePath).toBe("/wt");
  });

  it("envMode='local' 且 options.worktreePath 未指定时清空 worktreePath", () => {
    const state = resolveTerminalThreadCreationState({
      ...baseInput,
      draftThread: buildDraft({ worktreePath: "/wt" }),
      options: { envMode: "local" },
    });
    expect(state.worktreePath).toBeNull();
    expect(state.envMode).toBe("local");
  });

  it("activeThread projectId 不匹配时不继承", () => {
    const state = resolveTerminalThreadCreationState({
      ...baseInput,
      activeThread: { ...baseActiveThread, projectId: PROJECT_B },
    });
    // 走默认
    expect(state.runtimeMode).toBe("code");
  });

  it("activeThread projectId 匹配时继承 runtimeMode", () => {
    const state = resolveTerminalThreadCreationState({
      ...baseInput,
      activeThread: { ...baseActiveThread, runtimeMode: "work" as RuntimeMode },
    });
    expect(state.runtimeMode).toBe("work");
  });
});
