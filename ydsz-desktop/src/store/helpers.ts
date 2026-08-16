// FILE: store/helpers.ts
// Purpose: 不依赖 React/Zustand / AppState 的纯函数工具集。

import type { ProviderKind } from "@ydsz-buddy/contracts";
import type {
  ChatMessage,
  Thread,
  ThreadShell,
  ThreadSession,
  ThreadTurnState,
} from "../types";

// ─── 项目路径 ─────────────────────────────────────────────────────────────────────

export function basenameOfPath(value: string): string | null {
  const segments = value.split(/[/\\]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? null;
}

// ─── 通用集合比较 ─────────────────────────────────────────────────────────────────

export function arraysShallowEqual<T>(
  left: ReadonlyArray<T> | undefined,
  right: ReadonlyArray<T> | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function recordsShallowEqual<T>(
  left: Record<string, T> | undefined,
  right: Record<string, T> | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

export function deepEqualJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || right === null) return left === right;
  if (typeof left !== "object" || typeof right !== "object") return left === right;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((item, index) => deepEqualJson(item, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) =>
    Object.hasOwn(rightRecord, key) && deepEqualJson(leftRecord[key], rightRecord[key]),
  );
}

// ─── Model Selection ──────────────────────────────────────────────────────────────

export function normalizeModelSelection<T extends { provider: ProviderKind; model: string }>(
  incoming: T,
  previous: T | undefined,
): T {
  if (previous && previous.provider === incoming.provider && previous.model === incoming.model) {
    return previous;
  }
  return incoming;
}

// ─── 提议 Plan 比较 ──────────────────────────────────────────────────────────────

export function sourceProposedPlansEqual(
  left: Thread["pendingSourceProposedPlan"],
  right: Thread["pendingSourceProposedPlan"],
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return left.threadId === right.threadId && left.planId === right.planId;
}

export function latestTurnsEqual(
  left: Thread["latestTurn"],
  right: Thread["latestTurn"],
): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  return (
    left.turnId === right.turnId &&
    left.state === right.state &&
    left.requestedAt === right.requestedAt &&
    left.startedAt === right.startedAt &&
    left.completedAt === right.completedAt &&
    left.assistantMessageId === right.assistantMessageId &&
    sourceProposedPlansEqual(left.sourceProposedPlan, right.sourceProposedPlan)
  );
}

export function threadSessionsEqual(
  left: ThreadSession | null | undefined,
  right: ThreadSession | null | undefined,
): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  return (
    left.provider === right.provider &&
    left.status === right.status &&
    left.orchestrationStatus === right.orchestrationStatus &&
    left.activeTurnId === right.activeTurnId &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.lastError === right.lastError
  );
}

// ─── ThreadShell 比较 / 构造 ────────────────────────────────────────────────────────

export function threadShellsEqual(
  left: ThreadShell | undefined,
  right: ThreadShell,
): boolean {
  return (
    left !== undefined &&
    left.id === right.id &&
    left.codexThreadId === right.codexThreadId &&
    left.projectId === right.projectId &&
    left.title === right.title &&
    left.modelSelection === right.modelSelection &&
    left.runtimeMode === right.runtimeMode &&
    left.interactionMode === right.interactionMode &&
    left.error === right.error &&
    left.createdAt === right.createdAt &&
    (left.archivedAt ?? null) === (right.archivedAt ?? null) &&
    left.updatedAt === right.updatedAt &&
    (left.isPinned ?? false) === (right.isPinned ?? false) &&
    left.envMode === right.envMode &&
    left.branch === right.branch &&
    left.worktreePath === right.worktreePath &&
    (left.associatedWorktreePath ?? null) === (right.associatedWorktreePath ?? null) &&
    (left.associatedWorktreeBranch ?? null) === (right.associatedWorktreeBranch ?? null) &&
    (left.associatedWorktreeRef ?? null) === (right.associatedWorktreeRef ?? null) &&
    (left.createBranchFlowCompleted ?? false) === (right.createBranchFlowCompleted ?? false) &&
    (left.parentThreadId ?? null) === (right.parentThreadId ?? null) &&
    (left.subagentAgentId ?? null) === (right.subagentAgentId ?? null) &&
    (left.subagentNickname ?? null) === (right.subagentNickname ?? null) &&
    (left.subagentRole ?? null) === (right.subagentRole ?? null) &&
    (left.forkSourceThreadId ?? null) === (right.forkSourceThreadId ?? null) &&
    (left.sidechatSourceThreadId ?? null) === (right.sidechatSourceThreadId ?? null) &&
    deepEqualJson(left.lastKnownPr ?? null, right.lastKnownPr ?? null) &&
    (left.handoff ?? null) === (right.handoff ?? null) &&
    left.latestUserMessageAt === right.latestUserMessageAt &&
    left.hasPendingApprovals === right.hasPendingApprovals &&
    left.hasPendingUserInput === right.hasPendingUserInput &&
    left.hasActionableProposedPlan === right.hasActionableProposedPlan &&
    left.lastVisitedAt === right.lastVisitedAt
  );
}

export function threadTurnStatesEqual(
  left: ThreadTurnState | undefined,
  right: ThreadTurnState,
): boolean {
  return (
    left !== undefined &&
    latestTurnsEqual(left.latestTurn, right.latestTurn) &&
    sourceProposedPlansEqual(left.pendingSourceProposedPlan, right.pendingSourceProposedPlan)
  );
}

export function toThreadShell(thread: Thread): ThreadShell {
  return {
    id: thread.id,
    codexThreadId: thread.codexThreadId,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    error: thread.error,
    createdAt: thread.createdAt,
    archivedAt: thread.archivedAt ?? null,
    updatedAt: thread.updatedAt,
    isPinned: thread.isPinned ?? false,
    envMode: thread.envMode,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    associatedWorktreePath: thread.associatedWorktreePath ?? null,
    associatedWorktreeBranch: thread.associatedWorktreeBranch ?? null,
    associatedWorktreeRef: thread.associatedWorktreeRef ?? null,
    createBranchFlowCompleted: thread.createBranchFlowCompleted ?? false,
    parentThreadId: thread.parentThreadId ?? null,
    subagentAgentId: thread.subagentAgentId ?? null,
    subagentNickname: thread.subagentNickname ?? null,
    subagentRole: thread.subagentRole ?? null,
    forkSourceThreadId: thread.forkSourceThreadId ?? null,
    sidechatSourceThreadId: thread.sidechatSourceThreadId ?? null,
    lastKnownPr: thread.lastKnownPr ?? null,
    handoff: thread.handoff ?? null,
    ...(thread.latestUserMessageAt !== undefined
      ? { latestUserMessageAt: thread.latestUserMessageAt }
      : {}),
    ...(thread.hasPendingApprovals !== undefined
      ? { hasPendingApprovals: thread.hasPendingApprovals }
      : {}),
    ...(thread.hasPendingUserInput !== undefined
      ? { hasPendingUserInput: thread.hasPendingUserInput }
      : {}),
    ...(thread.hasActionableProposedPlan !== undefined
      ? { hasActionableProposedPlan: thread.hasActionableProposedPlan }
      : {}),
    ...(thread.lastVisitedAt !== undefined ? { lastVisitedAt: thread.lastVisitedAt } : {}),
  };
}

export function toThreadTurnState(thread: Thread): ThreadTurnState {
  return {
    latestTurn: thread.latestTurn,
    ...(thread.pendingSourceProposedPlan
      ? { pendingSourceProposedPlan: thread.pendingSourceProposedPlan }
      : {}),
  };
}

// ─── Thread 数组更新 ───────────────────────────────────────────────────────────────

export function updateThread(
  threads: Thread[],
  threadId: Thread["id"],
  updater: (t: Thread) => Thread,
): Thread[] {
  let changed = false;
  const next = threads.map((t) => {
    if (t.id !== threadId) return t;
    const updated = updater(t);
    if (updated !== t) changed = true;
    return updated;
  });
  return changed ? next : threads;
}

// ─── Slice 构造 ────────────────────────────────────────────────────────────────────

export function buildMessageSlice(thread: Thread): {
  ids: string[];
  byId: Record<string, ChatMessage>;
} {
  const ids: string[] = [];
  const byId: Record<string, ChatMessage> = {};
  for (const message of thread.messages) {
    ids.push(message.id);
    byId[message.id] = message;
  }
  return { ids, byId };
}

export function buildActivitySlice(thread: Thread): {
  ids: string[];
  byId: Record<string, Thread["activities"][number]>;
} {
  const ids: string[] = [];
  const byId: Record<string, Thread["activities"][number]> = {};
  for (const activity of thread.activities) {
    ids.push(activity.id);
    byId[activity.id] = activity;
  }
  return { ids, byId };
}

export function buildProposedPlanSlice(thread: Thread): {
  ids: string[];
  byId: Record<string, Thread["proposedPlans"][number]>;
} {
  const ids: string[] = [];
  const byId: Record<string, Thread["proposedPlans"][number]> = {};
  for (const plan of thread.proposedPlans) {
    ids.push(plan.id);
    byId[plan.id] = plan;
  }
  return { ids, byId };
}

export function buildTurnDiffSlice(thread: Thread): {
  ids: string[];
  byId: Record<string, Thread["turnDiffSummaries"][number]>;
} {
  const ids: string[] = [];
  const byId: Record<string, Thread["turnDiffSummaries"][number]> = {};
  for (const summary of thread.turnDiffSummaries) {
    ids.push(summary.turnId);
    byId[summary.turnId] = summary;
  }
  return { ids, byId };
}
