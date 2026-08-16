/**
 * @file session-logic 核心会话状态推导测试
 * @description 覆盖 pending approvals、user inputs、background tasks、
 *              worklog lifecycle collapse、timeline merge、phase 推导等纯函数。
 */

import { describe, expect, it } from "vitest";
import {
  deriveActiveBackgroundTasksState,
  deriveActiveTaskListState,
  deriveActiveWorkStartedAt,
  derivePendingApprovals,
  derivePendingUserInputs,
  derivePhase,
  deriveTimelineEntries,
  deriveWorkLogEntries,
  findLatestProposedPlan,
  formatDuration,
  formatElapsed,
  hasActionableProposedPlan,
  hasLiveLatestTurn,
  hasLiveTurnTailWork,
  hasToolActivityForTurn,
  inferCheckpointTurnCountByTurnId,
  isLatestTurnSettled,
  WORK_LOG_PRESENTATION_VERSION,
  type PendingApproval,
} from "./session-logic";
import type {
  OrchestrationLatestTurn,
  OrchestrationThreadActivity,
} from "@ydsz-buddy/contracts";
import type {
  ProposedPlan,
  Thread,
  ThreadSession,
  TurnDiffSummary,
} from "./types";

// ---------------------------------------------------------------------------
// 测试装置 helpers
// ---------------------------------------------------------------------------

function makeActivity(overrides: Partial<OrchestrationThreadActivity>): OrchestrationThreadActivity {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    sequence: overrides.sequence,
    kind: overrides.kind ?? "tool.started",
    summary: overrides.summary ?? "",
    tone: overrides.tone ?? "tool",
    payload: overrides.payload,
    turnId: overrides.turnId,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

function makeApprovalActivity(
  requestId: string,
  kind: OrchestrationThreadActivity["kind"],
  createdAt: string,
  payload: Record<string, unknown> = {},
): OrchestrationThreadActivity {
  return makeActivity({
    id: `approval-${requestId}-${kind}-${createdAt}`,
    kind,
    tone: "approval",
    payload: { requestId, ...payload },
    createdAt,
  });
}

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("formats sub-second durations with ms", () => {
    expect(formatDuration(0)).toBe("1ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("formats seconds range with 1-decimal s", () => {
    expect(formatDuration(1_000)).toBe("1.0s");
    expect(formatDuration(5_400)).toBe("5.4s");
    expect(formatDuration(9_999)).toBe("10.0s");
  });

  it("formats 10s-60s as integer seconds", () => {
    expect(formatDuration(10_000)).toBe("10s");
    expect(formatDuration(45_000)).toBe("45s");

    expect(formatDuration(59_500)).toBe("60s");
  });

  it("formats minutes with remaining seconds", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(60_001)).toBe("1m");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatDuration(3_540_000)).toBe("59m");
  });

  it("guards against invalid input", () => {
    expect(formatDuration(Number.NaN)).toBe("0ms");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0ms");
    expect(formatDuration(-1)).toBe("0ms");
  });
});

// ---------------------------------------------------------------------------
// formatElapsed
// ---------------------------------------------------------------------------

describe("formatElapsed", () => {
  it("returns formatted diff between valid ISO timestamps", () => {
    expect(formatElapsed("2024-01-01T00:00:00Z", "2024-01-01T00:00:05Z")).toBe("5.0s");
    expect(formatElapsed("2024-01-01T00:00:00Z", "2024-01-01T00:02:30Z")).toBe("2m 30s");
  });

  it("returns null for missing end timestamp", () => {
    expect(formatElapsed("2024-01-01T00:00:00Z", undefined)).toBeNull();
  });

  it("returns null when end precedes start or input is invalid", () => {
    expect(formatElapsed("2024-01-01T00:00:05Z", "2024-01-01T00:00:00Z")).toBeNull();
    expect(formatElapsed("invalid", "2024-01-01T00:00:00Z")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isLatestTurnSettled
// ---------------------------------------------------------------------------

describe("isLatestTurnSettled", () => {
  it("is false when turn has not started", () => {
    expect(
      isLatestTurnSettled({ turnId: "t1", state: "running", startedAt: null, completedAt: null }, null),
    ).toBe(false);
  });

  it("is false when running turn is still in progress", () => {
    const turn: OrchestrationLatestTurn = {
      turnId: "t1",
      state: "running",
      startedAt: "2024-01-01T00:00:00Z",
      requestedAt: "2024-01-01T00:00:00Z",
    };
    const session: ThreadSession = {
      status: "running",
      orchestrationStatus: "running",
      activeTurnId: "t1",
      provider: "codex",
    } as ThreadSession;
    expect(isLatestTurnSettled(turn, session)).toBe(false);
  });

  it("is true when turn is completed", () => {
    const turn: OrchestrationLatestTurn = {
      turnId: "t1",
      state: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      completedAt: "2024-01-01T00:00:10Z",
      requestedAt: "2024-01-01T00:00:00Z",
    };
    expect(isLatestTurnSettled(turn, null)).toBe(true);
  });

  it("is true when turn is interrupted or in error state", () => {
    const interrupted: OrchestrationLatestTurn = {
      turnId: "t1",
      state: "interrupted",
      startedAt: "2024-01-01T00:00:00Z",
      completedAt: null,
      requestedAt: "2024-01-01T00:00:00Z",
    };
    const error: OrchestrationLatestTurn = {
      ...interrupted,
      state: "error",
    };
    expect(isLatestTurnSettled(interrupted, null)).toBe(true);
    expect(isLatestTurnSettled(error, null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasLiveLatestTurn
// ---------------------------------------------------------------------------

describe("hasLiveLatestTurn", () => {
  it("is false when no turn has started", () => {
    expect(hasLiveLatestTurn(null, null)).toBe(false);
  });

  it("is true when there is an unsettled running turn", () => {
    const turn: OrchestrationLatestTurn = {
      turnId: "t1",
      state: "running",
      startedAt: "2024-01-01T00:00:00Z",
      requestedAt: "2024-01-01T00:00:00Z",
    };
    const session: ThreadSession = {
      status: "running",
      orchestrationStatus: "running",
      activeTurnId: "t1",
      provider: "codex",
    } as ThreadSession;
    expect(hasLiveLatestTurn(turn, session)).toBe(true);
  });

  it("is false when the completed turn is settled", () => {
    const turn: OrchestrationLatestTurn = {
      turnId: "t1",
      state: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      completedAt: "2024-01-01T00:00:10Z",
      requestedAt: "2024-01-01T00:00:00Z",
    };
    expect(hasLiveLatestTurn(turn, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deriveActiveWorkStartedAt
// ---------------------------------------------------------------------------

describe("deriveActiveWorkStartedAt", () => {
  it("returns latestTurn startedAt when runningTurnId matches latestTurn", () => {
    const latestTurn: OrchestrationLatestTurn = {
      turnId: "t1",
      state: "running",
      startedAt: "2024-01-01T00:00:00Z",
      requestedAt: "2024-01-01T00:00:00Z",
    };
    const session: ThreadSession = {
      status: "running",
      orchestrationStatus: "running",
      activeTurnId: "t1",
      provider: "codex",
    } as ThreadSession;
    expect(deriveActiveWorkStartedAt(latestTurn, session, "2024-01-01T00:01:00Z")).toBe(
      "2024-01-01T00:00:00Z",
    );
  });

  it("falls back to sendStartedAt when runningTurnId differs from latestTurnId", () => {
    const latestTurn: OrchestrationLatestTurn = {
      turnId: "t1",
      state: "running",
      startedAt: "2024-01-01T00:00:00Z",
      requestedAt: "2024-01-01T00:00:00Z",
    };
    const session: ThreadSession = {
      status: "running",
      orchestrationStatus: "running",
      activeTurnId: "t2",
      provider: "codex",
    } as ThreadSession;
    expect(deriveActiveWorkStartedAt(latestTurn, session, "2024-01-01T00:01:00Z")).toBe(
      "2024-01-01T00:01:00Z",
    );
  });

  it("returns sendStartedAt when turn is settled", () => {
    const settledTurn: OrchestrationLatestTurn = {
      turnId: "t1",
      state: "completed",
      startedAt: "2024-01-01T00:00:00Z",
      completedAt: "2024-01-01T00:00:10Z",
      requestedAt: "2024-01-01T00:00:00Z",
    };
    expect(deriveActiveWorkStartedAt(settledTurn, null, "2024-01-01T00:01:00Z")).toBe(
      "2024-01-01T00:01:00Z",
    );
  });

  it("returns null when nothing is available", () => {
    expect(deriveActiveWorkStartedAt(null, null, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// derivePendingApprovals
// ---------------------------------------------------------------------------

describe("derivePendingApprovals", () => {
  it("collects open approval requests in chronological order", () => {
    const activities = [
      makeApprovalActivity("req-2", "approval.requested", "2024-01-01T00:02:00Z", {
        requestKind: "command",
      }),
      makeApprovalActivity("req-1", "approval.requested", "2024-01-01T00:01:00Z", {
        requestKind: "file-read",
      }),
    ];
    const result = derivePendingApprovals(activities);
    expect(result.map((r) => r.requestId)).toEqual(["req-1", "req-2"]);
    expect(result.map((r) => r.requestKind)).toEqual(["file-read", "command"]);
  });

  it("removes resolved approvals", () => {
    const activities = [
      makeApprovalActivity("req-1", "approval.requested", "2024-01-01T00:01:00Z", {
        requestKind: "command",
      }),
      makeApprovalActivity("req-1", "approval.resolved", "2024-01-01T00:01:10Z"),
    ];
    expect(derivePendingApprovals(activities)).toEqual([]);
  });

  it("removes stale failed approval requests with matching detail", () => {
    const activities = [
      makeApprovalActivity("req-1", "approval.requested", "2024-01-01T00:01:00Z", {
        requestKind: "command",
      }),
      makeApprovalActivity("req-1", "provider.approval.respond.failed", "2024-01-01T00:01:05Z", {
        detail: "Stale pending approval request — already resolved",
      }),
    ];
    expect(derivePendingApprovals(activities)).toEqual([]);
  });

  it("preserves approval requests when failure detail is non-stale", () => {
    const activities = [
      makeApprovalActivity("req-1", "approval.requested", "2024-01-01T00:01:00Z", {
        requestKind: "file-change",
      }),
      makeApprovalActivity("req-1", "provider.approval.respond.failed", "2024-01-01T00:01:05Z", {
        detail: "Network error",
      }),
    ];
    const result = derivePendingApprovals(activities);
    expect(result).toHaveLength(1);
    expect(result[0].requestId).toBe("req-1");
  });

  it("maps requestType variants to requestKind", () => {
    const activities = [
      {
        ...makeApprovalActivity("req-exec", "approval.requested", "2024-01-01T00:01:00Z"),
        payload: { requestId: "req-exec", requestType: "exec_command_approval" },
      },
      {
        ...makeApprovalActivity("req-read", "approval.requested", "2024-01-01T00:02:00Z"),
        payload: { requestId: "req-read", requestType: "file_read_approval" },
      },
      {
        ...makeApprovalActivity("req-patch", "approval.requested", "2024-01-01T00:03:00Z"),
        payload: { requestId: "req-patch", requestType: "apply_patch_approval" },
      },
    ];
    const result = new Map(derivePendingApprovals(activities).map((r) => [r.requestId, r.requestKind]));
    expect(result.get("req-exec")).toBe("command");
    expect(result.get("req-read")).toBe("file-read");
    expect(result.get("req-patch")).toBe("file-change");
  });

  it("ignores approval.requested without requestId", () => {
    const activity = makeActivity({ kind: "approval.requested", tone: "approval", payload: {} });
    expect(derivePendingApprovals([activity])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// derivePendingUserInputs
// ---------------------------------------------------------------------------

describe("derivePendingUserInputs", () => {
  const baseQuestion = {
    id: "q1",
    header: "Pick one",
    question: "Choose",
    options: [
      { label: "a", description: "Option A" },
      { label: "b", description: "Option B" },
    ],
  } as const;

  it("collects open user-input requests with parsed questions", () => {
    const activities = [
      makeActivity({
        kind: "user-input.requested",
        tone: "approval",
        payload: {
          requestId: "ui-1",
          questions: [baseQuestion],
        },
        createdAt: "2024-01-01T00:01:00Z",
      }),
    ];
    const result = derivePendingUserInputs(activities);
    expect(result).toHaveLength(1);
    expect(result[0].requestId).toBe("ui-1");
    expect(result[0].questions).toHaveLength(1);
    expect(result[0].questions[0].id).toBe("q1");
  });

  it("removes resolved user-input requests", () => {
    const activities = [
      makeActivity({
        kind: "user-input.requested",
        tone: "approval",
        payload: { requestId: "ui-1", questions: [baseQuestion] },
        createdAt: "2024-01-01T00:01:00Z",
      }),
      makeActivity({
        kind: "user-input.resolved",
        tone: "approval",
        payload: { requestId: "ui-1" },
        createdAt: "2024-01-01T00:01:05Z",
      }),
    ];
    expect(derivePendingUserInputs(activities)).toEqual([]);
  });

  it("skips user-input.requested with no valid questions", () => {
    const activities = [
      makeActivity({
        kind: "user-input.requested",
        tone: "approval",
        payload: { requestId: "ui-bad", questions: [{ id: "x", header: "x", question: "x", options: [] }] },
      }),
    ];
    expect(derivePendingUserInputs(activities)).toEqual([]);
  });

  it("strips invalid options and skips malformed questions", () => {
    const activities = [
      makeActivity({
        kind: "user-input.requested",
        tone: "approval",
        payload: {
          requestId: "ui-mixed",
          questions: [
            { id: "q1", header: "h1", question: "QQ", options: [{ label: "L", description: "D" }] },
            { id: "broken", header: "x", question: "y", options: [{ label: "", description: "" }] },
          ],
        },
        createdAt: "2024-01-01T00:01:00Z",
      }),
    ];
    const result = derivePendingUserInputs(activities);
    expect(result).toHaveLength(1);
    expect(result[0].questions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// deriveActiveTaskListState
// ---------------------------------------------------------------------------

describe("deriveActiveTaskListState", () => {
  it("returns the latest task list for the current turn", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        kind: "turn.tasks.updated",
        tone: "info",
        payload: {
          tasks: [
            { task: "Step 1", status: "completed" },
            { task: "Step 2", status: "inProgress" },
          ],
        },
        turnId: "t1",
        createdAt: "2024-01-01T00:05:00Z",
        sequence: 1,
      }),
    ];
    const result = deriveActiveTaskListState(activities, "t1");
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0].status).toBe("completed");
    expect(result?.tasks[1].status).toBe("inProgress");
  });

  it("normalizes unknown task status to pending", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        kind: "turn.tasks.updated",
        tone: "info",
        payload: { tasks: [{ task: "Do X", status: "unknown" }] },
        turnId: "t1",
        sequence: 1,
      }),
    ];
    const result = deriveActiveTaskListState(activities, "t1");
    expect(result?.tasks[0].status).toBe("pending");
  });

  it("returns null when the originating turn is settled and tasks are complete", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        kind: "turn.tasks.updated",
        tone: "info",
        payload: { tasks: [{ task: "Done", status: "completed" }] },
        turnId: "t1",
        sequence: 1,
      }),
      makeActivity({ kind: "turn.completed", turnId: "t1", sequence: 2 }),
    ];
    expect(deriveActiveTaskListState(activities, "t1")).toBeNull();
  });

  it("returns null when there are no task activities", () => {
    expect(deriveActiveTaskListState([], "t1")).toBeNull();
  });

  it("does not expose task list from a prior turn that has been aborted", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        kind: "turn.tasks.updated",
        tone: "info",
        payload: { tasks: [{ task: "stale", status: "pending" }] },
        turnId: "t-old",
        sequence: 1,
      }),
      makeActivity({ kind: "turn.aborted", turnId: "t-old", sequence: 2 }),
    ];
    expect(deriveActiveTaskListState(activities, "t-current")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deriveActiveBackgroundTasksState
// ---------------------------------------------------------------------------

describe("deriveActiveBackgroundTasksState", () => {
  it("returns activeCount when tasks are in progress", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        kind: "task.started",
        tone: "info",
        payload: { taskId: "bg-1", taskType: "parallel" },
        turnId: "t1",
        sequence: 1,
      }),
      makeActivity({
        kind: "task.progress",
        tone: "info",
        payload: { taskId: "bg-1" },
        turnId: "t1",
        sequence: 2,
      }),
    ];
    expect(deriveActiveBackgroundTasksState(activities, "t1")?.activeCount).toBe(1);
  });

  it("excludes plan task types from active count", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({
        kind: "task.started",
        tone: "info",
        payload: { taskId: "plan-1", taskType: "plan" },
        turnId: "t1",
      }),
    ];
    expect(deriveActiveBackgroundTasksState(activities, "t1")).toBeNull();
  });

  it("removes tasks once completed", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({ kind: "task.started", tone: "info", payload: { taskId: "bg-1" }, turnId: "t1", sequence: 1 }),
      makeActivity({ kind: "task.completed", tone: "info", payload: { taskId: "bg-1" }, turnId: "t1", sequence: 2 }),
    ];
    expect(deriveActiveBackgroundTasksState(activities, "t1")).toBeNull();
  });

  it("returns null when no background tasks are active", () => {
    expect(deriveActiveBackgroundTasksState([], "t1")).toBeNull();
  });

  it("counts multiple in-progress tasks", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({ kind: "task.started", tone: "info", payload: { taskId: "bg-1" }, turnId: "t1" }),
      makeActivity({ kind: "task.started", tone: "info", payload: { taskId: "bg-2" }, turnId: "t1" }),
      makeActivity({ kind: "task.started", tone: "info", payload: { taskId: "bg-3" }, turnId: "t1" }),
    ];
    expect(deriveActiveBackgroundTasksState(activities, "t1")?.activeCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// hasLiveTurnTailWork
// ---------------------------------------------------------------------------

describe("hasLiveTurnTailWork", () => {
  it("is true when the latest turn has streaming assistant text", () => {
    const result = hasLiveTurnTailWork({
      latestTurn: { turnId: "t1", completedAt: null },
      messages: [{ role: "assistant", turnId: "t1", streaming: true, id: "m1", createdAt: "2024-01-01T00:00:00Z" }] as any,
      activities: [],
    });
    expect(result).toBe(true);
  });

  it("is false when streaming text belongs to a completed turn", () => {
    const result = hasLiveTurnTailWork({
      latestTurn: { turnId: "t1", completedAt: "2024-01-01T00:00:10Z" },
      messages: [{ role: "assistant", turnId: "t1", streaming: true, id: "m1", createdAt: "2024-01-01T00:00:00Z" }] as any,
      activities: [],
    });
    expect(result).toBe(false);
  });

  it("is false when session is not running", () => {
    const result = hasLiveTurnTailWork({
      latestTurn: { turnId: "t1", completedAt: null },
      messages: [],
      activities: [],
      session: { status: "ready", orchestrationStatus: "idle", provider: "codex" } as any,
    });
    expect(result).toBe(false);
  });

  it("is true when background tasks are still active and session is running", () => {
    const result = hasLiveTurnTailWork({
      latestTurn: { turnId: "t1", completedAt: null },
      messages: [],
      activities: [makeActivity({ kind: "task.started", tone: "info", payload: { taskId: "bg-1" }, turnId: "t1" })],
      session: { status: "running", orchestrationStatus: "running", activeTurnId: "t1", provider: "codex" } as any,
    });
    expect(result).toBe(true);
  });

  it("is false when no latest turn exists", () => {
    expect(hasLiveTurnTailWork({ latestTurn: null, messages: [], activities: [] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// derivePhase
// ---------------------------------------------------------------------------

describe("derivePhase", () => {
  it.each([
    ["disconnected", null],
    ["disconnected", { status: "closed" }],
    ["connecting", { status: "connecting" }],
    ["running", { status: "running" }],
    ["ready", { status: "ready" }],
    ["ready", { status: "idle" }],
  ])("returns %s when session status is %s", (expected, session) => {
    expect(derivePhase(session as ThreadSession | null)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// hasToolActivityForTurn
// ---------------------------------------------------------------------------

describe("hasToolActivityForTurn", () => {
  it("is true when any tool activity belongs to the turn", () => {
    const activities = [
      makeActivity({ kind: "tool.started", tone: "tool", turnId: "t1" }),
    ];
    expect(hasToolActivityForTurn(activities, "t1")).toBe(true);
  });

  it("is false when turnId is missing", () => {
    const activities = [makeActivity({ kind: "tool.started", tone: "tool", turnId: "t1" })];
    expect(hasToolActivityForTurn(activities, null)).toBe(false);
    expect(hasToolActivityForTurn(activities, undefined)).toBe(false);
  });

  it("is false when no tool activity matches turn", () => {
    const activities = [makeActivity({ kind: "tool.started", tone: "tool", turnId: "t2" })];
    expect(hasToolActivityForTurn(activities, "t1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findLatestProposedPlan / hasActionableProposedPlan
// ---------------------------------------------------------------------------

describe("findLatestProposedPlan", () => {
  const plans: ProposedPlan[] = [
    {
      id: "plan-1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:01:00Z",
      turnId: "t1",
      planMarkdown: "# Plan 1",
      implementedAt: null,
      implementationThreadId: null,
    },
    {
      id: "plan-2",
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:01:00Z",
      turnId: "t2",
      planMarkdown: "# Plan 2",
      implementedAt: "2024-01-02T00:05:00Z",
      implementationThreadId: "impl-thread",
    },
  ];

  it("matches plan from the same turn first", () => {
    const result = findLatestProposedPlan(plans, "t1");
    expect(result?.id).toBe("plan-1");
  });

  it("falls back to the latest plan by updatedAt when turnId has no match", () => {
    const result = findLatestProposedPlan(plans, "unknown");
    expect(result?.id).toBe("plan-2");
  });

  it("returns null when no plans exist", () => {
    expect(findLatestProposedPlan([], "t1")).toBeNull();
  });
});

describe("hasActionableProposedPlan", () => {
  it("is true when a plan is not yet implemented", () => {
    expect(hasActionableProposedPlan({ id: "p1", implementedAt: null } as any)).toBe(true);
  });

  it("is false when the plan is implemented", () => {
    expect(hasActionableProposedPlan({ id: "p1", implementedAt: "2024-01-01T00:00:00Z" } as any)).toBe(false);
  });

  it("is false when no plan is provided", () => {
    expect(hasActionableProposedPlan(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deriveWorkLogEntries
// ---------------------------------------------------------------------------

describe("deriveWorkLogEntries", () => {
  it("includes tool.started and tool.completed activities only for the latest turn", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({ id: "a1", kind: "tool.started", summary: "Run build", turnId: "t1", sequence: 1 }),
      makeActivity({ id: "a2", kind: "tool.completed", summary: "Build done", turnId: "t1", sequence: 2 }),
      makeActivity({ id: "a3", kind: "tool.started", summary: "Old tool", turnId: "t0", sequence: 1 }),
    ];
    const result = deriveWorkLogEntries(activities, "t1");
    expect(result.map((r) => r.id)).toEqual(["a1", "a2"]);
  });

  it("skips check-point marker summaries", () => {
    const activities: OrchestrationThreadActivity[] = [
      makeActivity({ id: "cp", kind: "tool.completed", summary: "Checkpoint captured", turnId: "t1", sequence: 1 }),
    ];
    expect(deriveWorkLogEntries(activities, "t1")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deriveTimelineEntries
// ---------------------------------------------------------------------------

describe("deriveTimelineEntries", () => {
  const emptyMessages: any[] = [];
  const emptyPlans: ProposedPlan[] = [];
  const emptyWork: any[] = [];

  it("merges messages, plans and work entries sorted by createdAt", () => {
    const messages = [
      { id: "m1", role: "user", text: "hi", createdAt: "2024-01-01T00:03:00Z", turnId: null },
    ] as any;
    const plans: ProposedPlan[] = [
      {
        id: "plan-1",
        createdAt: "2024-01-01T00:01:00Z",
        updatedAt: "2024-01-01T00:01:00Z",
        turnId: "t1",
        planMarkdown: "# Plan",
        implementedAt: null,
        implementationThreadId: null,
      },
    ];
    const workEntries = [{ id: "w1", createdAt: "2024-01-01T00:02:00Z", label: "work", tone: "tool" as const }] as any;

    const result = deriveTimelineEntries(messages, plans, workEntries);
    expect(result.map((r) => r.kind)).toEqual(["proposed-plan", "work", "message"]);
  });

  it("returns an empty array when nothing is provided", () => {
    expect(deriveTimelineEntries(emptyMessages, emptyPlans, emptyWork)).toEqual([]);
  });

  it("strips proposed-plan messages that have an empty body from timeline", () => {
    const plans: ProposedPlan[] = [
      {
        id: "plan-only",
        createdAt: "2024-01-01T00:01:00Z",
        updatedAt: "2024-01-01T00:01:00Z",
        turnId: "plan-turn",
        planMarkdown: "# Long plan",
        implementedAt: null,
        implementationThreadId: null,
      },
    ];
    const messages = [
      {
        id: "m1",
        role: "assistant",
        text: "",
        createdAt: "2024-01-01T00:02:00Z",
        turnId: "plan-turn",
      },
    ] as any;
    const result = deriveTimelineEntries(messages, plans, emptyWork);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("proposed-plan");
  });
});

// ---------------------------------------------------------------------------
// inferCheckpointTurnCountByTurnId
// ---------------------------------------------------------------------------

describe("inferCheckpointTurnCountByTurnId", () => {
  it("assigns 1-based ordinal by ascending completedAt", () => {
    const summaries: TurnDiffSummary[] = [
      { turnId: "t1", completedAt: "2024-01-01T00:02:00Z" } as TurnDiffSummary,
      { turnId: "t2", completedAt: "2024-01-01T00:01:00Z" } as TurnDiffSummary,
      { turnId: "t3", completedAt: "2024-01-01T00:03:00Z" } as TurnDiffSummary,
    ];
    const result = inferCheckpointTurnCountByTurnId(summaries);
    expect(result.t2).toBe(1);
    expect(result.t1).toBe(2);
    expect(result.t3).toBe(3);
  });

  it("returns empty object for empty input", () => {
    expect(inferCheckpointTurnCountByTurnId([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// WORK_LOG_PRESENTATION_VERSION sanity
// ---------------------------------------------------------------------------

describe("WORK_LOG_PRESENTATION_VERSION", () => {
  it("is a stable integer sentinel", () => {
    expect(WORK_LOG_PRESENTATION_VERSION).toBeTypeOf("number");
    expect(Number.isInteger(WORK_LOG_PRESENTATION_VERSION)).toBe(true);
  });
});
