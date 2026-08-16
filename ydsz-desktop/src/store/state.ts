// FILE: store/state.ts
// Purpose: 应用状态 AppState / AppStore 接口定义、类型别名、常量与初始状态。
// 注意: 本模块仅包含类型与纯数据，不依赖 Zustand / React，可独立 import。

import {
  type OrchestrationEvent,
  type OrchestrationReadModel,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamEvent,
  ThreadId,
  TurnId,
} from "@ydsz-buddy/contracts";
import {
  type Project,
  type SidebarThreadSummary,
  type Thread,
  type ThreadSession,
  type ThreadShell,
  type ThreadTurnState,
  type ThreadWorkspacePatch,
} from "../types";

// ─── 主要公共接口 ────────────────────────────────────────────────────────────────

export interface AppState {
  projects: Project[];
  threads: Thread[];
  sidebarThreadSummaryById: Record<string, SidebarThreadSummary>;
  threadsHydrated: boolean;
  threadIds?: ThreadId[];
  threadShellById?: Record<ThreadId, ThreadShell>;
  threadSessionById?: Record<ThreadId, ThreadSession | null>;
  threadTurnStateById?: Record<ThreadId, ThreadTurnState>;
  messageIdsByThreadId?: Record<ThreadId, string[]>;
  messageByThreadId?: Record<ThreadId, Record<string, import("../types").ChatMessage>>;
  activityIdsByThreadId?: Record<ThreadId, string[]>;
  activityByThreadId?: Record<ThreadId, Record<string, Thread["activities"][number]>>;
  proposedPlanIdsByThreadId?: Record<ThreadId, string[]>;
  proposedPlanByThreadId?: Record<ThreadId, Record<string, Thread["proposedPlans"][number]>>;
  turnDiffIdsByThreadId?: Record<ThreadId, TurnId[]>;
  turnDiffSummaryByThreadId?: Record<ThreadId, Record<TurnId, Thread["turnDiffSummaries"][number]>>;
}

export interface AppStore extends AppState {
  syncServerShellSnapshot: (snapshot: OrchestrationShellSnapshot) => void;
  syncServerThreadDetail: (thread: OrchestrationReadModel["threads"][number]) => void;
  syncServerThreadDetailHotPath: (thread: OrchestrationReadModel["threads"][number]) => void;
  syncServerReadModel: (readModel: OrchestrationReadModel) => void;
  applyShellEvent: (event: OrchestrationShellStreamEvent) => void;
  applyOrchestrationEvents: (events: ReadonlyArray<OrchestrationEvent>) => void;
  applyOrchestrationEventsHotPath: (events: ReadonlyArray<OrchestrationEvent>) => void;
  markThreadVisited: (threadId: ThreadId, visitedAt?: string) => void;
  markThreadUnread: (threadId: ThreadId) => void;
  toggleProject: (projectId: Project["id"]) => void;
  setProjectExpanded: (projectId: Project["id"], expanded: boolean) => void;
  setAllProjectsExpanded: (expanded: boolean) => void;
  collapseProjectsExcept: (activeProjectId: Project["id"] | null) => void;
  reorderProjects: (draggedProjectId: Project["id"], targetProjectId: Project["id"]) => void;
  renameProjectLocally: (projectId: Project["id"], name: string | null) => void;
  setError: (threadId: ThreadId, error: string | null) => void;
  setThreadWorkspace: (threadId: ThreadId, patch: ThreadWorkspacePatch) => void;
}

// ─── 内部类型别名 ─────────────────────────────────────────────────────────────────

export type ReadModelProject = OrchestrationReadModel["projects"][number];
export type ReadModelThread = OrchestrationReadModel["threads"][number];
export type ReadModelMessage = OrchestrationReadModel["threads"][number]["messages"][number];
export type ShellSnapshotProject = OrchestrationShellSnapshot["projects"][number];
export type ShellSnapshotThread = OrchestrationShellSnapshot["threads"][number];
export type ThreadMessageSentEvent = Extract<OrchestrationEvent, { type: "thread.message-sent" }>;
export type ThreadActivityAppendedEvent = Extract<
  OrchestrationEvent,
  { type: "thread.activity-appended" }
>;
export type ThreadApprovalResponseRequestedEvent = Extract<
  OrchestrationEvent,
  { type: "thread.approval-response-requested" }
>;
export type ThreadUserInputResponseRequestedEvent = Extract<
  OrchestrationEvent,
  { type: "thread.user-input-response-requested" }
>;

// ─── 常量 ─────────────────────────────────────────────────────────────────────────

export const MAX_THREAD_MESSAGES = 2_000;
export const MAX_THREAD_ACTIVITIES = 500;

export const EMPTY_THREAD_IDS: ThreadId[] = [];
export const EMPTY_THREAD_SHELL_BY_ID: Record<ThreadId, ThreadShell> = {};
export const EMPTY_THREAD_SESSION_BY_ID: Record<ThreadId, ThreadSession | null> = {};
export const EMPTY_THREAD_TURN_STATE_BY_ID: Record<ThreadId, ThreadTurnState> = {};
export const EMPTY_MESSAGE_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
export const EMPTY_MESSAGE_BY_THREAD: Record<ThreadId, Record<string, import("../types").ChatMessage>> =
  {};
export const EMPTY_ACTIVITY_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
export const EMPTY_ACTIVITY_BY_THREAD: Record<
  ThreadId,
  Record<string, Thread["activities"][number]>
> = {};
export const EMPTY_PROPOSED_PLAN_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
export const EMPTY_PROPOSED_PLAN_BY_THREAD: Record<
  ThreadId,
  Record<string, Thread["proposedPlans"][number]>
> = {};
export const EMPTY_TURN_DIFF_IDS_BY_THREAD: Record<ThreadId, TurnId[]> = {};
export const EMPTY_TURN_DIFF_BY_THREAD: Record<
  ThreadId,
  Record<TurnId, Thread["turnDiffSummaries"][number]>
> = {};

export const THREAD_SUMMARY_ACTIVITY_KINDS = new Set([
  "approval.requested",
  "approval.resolved",
  "provider.approval.respond.failed",
  "user-input.requested",
  "user-input.resolved",
  "provider.user-input.respond.failed",
]);

export const PENDING_INTERACTION_REQUEST_KINDS = new Set([
  "approval.requested",
  "user-input.requested",
]);

// ─── 初始状态 ─────────────────────────────────────────────────────────────────────

export const initialState: AppState = {
  projects: [],
  threads: [],
  sidebarThreadSummaryById: {},
  threadsHydrated: false,
  threadIds: [],
  threadShellById: {},
  threadSessionById: {},
  threadTurnStateById: {},
  messageIdsByThreadId: {},
  messageByThreadId: {},
  activityIdsByThreadId: {},
  activityByThreadId: {},
  proposedPlanIdsByThreadId: {},
  proposedPlanByThreadId: {},
  turnDiffIdsByThreadId: {},
  turnDiffSummaryByThreadId: {},
};
