/**
 * @file 搴旂敤鏍稿績鐘舵€佺鐞? * @description 灏嗙紪鎺掑眰蹇収褰掍竴鍖栦负绋冲畾鐨勫鎴风鐘舵€侊紝椹卞姩 Web 搴旂敤娓叉煋銆? * 瀵煎嚭 Zustand store 鍙婄函鐘舵€佽浆鎹㈣緟鍔╁嚱鏁帮紝渚涜繍琛屾椂寮曞娴佺▼鍏变韩浣跨敤銆? *
 * 鏍稿績璁捐鍘熷垯锛? * - 寮曠敤绋冲畾鎬э細閫氳繃娴呮瘮杈冨拰娣辨瘮杈冧繚鎸佹湭鍙樺寲瀵硅薄鐨勫紩鐢ㄤ笉鍙橈紝鍑忓皯閲嶆覆鏌? * - 褰掍竴鍖栧垏鐗囷細灏嗙嚎绋嬫暟鎹媶鍒嗕负 shell/session/turnState/message 绛夌嫭绔嬪垏鐗囷紝
 *   浣块珮棰戞祦寮忔洿鏂颁粎褰卞搷娲昏穬绾跨▼鐨勫垏鐗囷紝涓嶈Е鍙戜晶杈规爮鍏ㄥ眬閲嶅缓
 * - 鐑矾寰勪紭鍖栵細鎻愪緵 HotPath 鍙樹綋鍑芥暟锛岃烦杩囩嚎绋嬫暟缁勫拰渚ц竟鏍忔憳瑕佹洿鏂帮紝
 *   灏嗘祦寮忔秷鎭殑鍐欏叆寮€閿€闄嶅埌鏈€浣? */

import { Fragment, type ReactNode, createElement, useEffect } from "react";
import {
  EventId,
  MessageId,
  type OrchestrationEvent,
  type ProviderKind,
  ThreadId,
  type OrchestrationReadModel,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamEvent,
  type OrchestrationSessionStatus,
  type TurnId,
} from "~/contracts";
import { resolveThreadBranchRegressionGuard } from "~/shared/git";
import { normalizeModelSlug } from "~/shared/model";
import { normalizeWorkspaceRootForComparison } from "~/shared/threadWorkspace";
import { create } from "zustand";
import {
  type ChatAttachment,
  type ChatMessage,
  type Project,
  type SidebarThreadSummary,
  type Thread,
  type ThreadSession,
  type ThreadShell,
  type ThreadTurnState,
  type ThreadWorkspacePatch,
} from "./types";
import { Debouncer } from "@tanstack/react-pacer";
import { hasLiveTurnTailWork } from "./session-logic";
import { deriveThreadSummaryMetadata } from "~/shared/threadSummary";
import { getThreadFromState, getThreadsFromState } from "./threadDerivation";
import { toAttachmentPreviewUrl } from "./lib/wsHttpUrl";

// 鈹€鈹€ 鐘舵€佸畾涔?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * 搴旂敤鍏ㄥ眬鐘舵€? *
 * @description 閲囩敤褰掍竴鍖栧垏鐗囪璁★紝灏嗙嚎绋嬫暟鎹媶鍒嗕负澶氫釜鎸夌嚎绋?ID 绱㈠紩鐨勭嫭绔嬫槧灏勶紝
 * 浣块珮棰戞祦寮忔洿鏂颁粎褰卞搷娲昏穬绾跨▼鐨勫垏鐗囷紝涓嶈Е鍙戜晶杈规爮鍏ㄥ眬閲嶅缓銆? */
export interface AppState {
  /** 椤圭洰鍒楄〃 */
  projects: Project[];
  /** 绾跨▼瀹屾暣瑙嗗浘妯″瀷鍒楄〃锛堢敱鍒囩墖閲嶅缓锛?*/
  threads: Thread[];
  /** 渚ц竟鏍忕嚎绋嬫憳瑕佹槧灏勶紝鐢ㄤ簬渚ц竟鏍忚鐨勮交閲忔覆鏌?*/
  sidebarThreadSummaryById: Record<string, SidebarThreadSummary>;
  /** 绾跨▼鏁版嵁鏄惁宸插畬鎴愰娆℃按鍚?*/
  threadsHydrated: boolean;
  /** 绾跨▼ ID 鏈夊簭鍒楄〃 */
  threadIds?: ThreadId[];
  /** 绾跨▼澶栧３鏄犲皠锛堜笉鍚秷鎭瓑閲嶅瀷鏁版嵁锛?*/
  threadShellById?: Record<ThreadId, ThreadShell>;
  /** 绾跨▼浼氳瘽鏄犲皠 */
  threadSessionById?: Record<ThreadId, ThreadSession | null>;
  /** 绾跨▼鍥炲悎鐘舵€佹槧灏?*/
  threadTurnStateById?: Record<ThreadId, ThreadTurnState>;
  /** 鎸夌嚎绋嬬储寮曠殑娑堟伅 ID 鍒楄〃 */
  messageIdsByThreadId?: Record<ThreadId, MessageId[]>;
  /** 鎸夌嚎绋嬬储寮曠殑娑堟伅鏄犲皠 */
  messageByThreadId?: Record<ThreadId, Record<MessageId, ChatMessage>>;
  /** 鎸夌嚎绋嬬储寮曠殑娲诲姩 ID 鍒楄〃 */
  activityIdsByThreadId?: Record<ThreadId, string[]>;
  /** 鎸夌嚎绋嬬储寮曠殑娲诲姩鏄犲皠 */
  activityByThreadId?: Record<ThreadId, Record<string, Thread["activities"][number]>>;
  /** 鎸夌嚎绋嬬储寮曠殑鎻愯璁″垝 ID 鍒楄〃 */
  proposedPlanIdsByThreadId?: Record<ThreadId, string[]>;
  /** 鎸夌嚎绋嬬储寮曠殑鎻愯璁″垝鏄犲皠 */
  proposedPlanByThreadId?: Record<ThreadId, Record<string, Thread["proposedPlans"][number]>>;
  /** 鎸夌嚎绋嬬储寮曠殑鍥炲悎宸紓 ID 鍒楄〃 */
  turnDiffIdsByThreadId?: Record<ThreadId, TurnId[]>;
  /** 鎸夌嚎绋嬬储寮曠殑鍥炲悎宸紓鎽樿鏄犲皠 */
  turnDiffSummaryByThreadId?: Record<ThreadId, Record<TurnId, Thread["turnDiffSummaries"][number]>>;
}

type ReadModelProject = OrchestrationReadModel["projects"][number];
type ReadModelThread = OrchestrationReadModel["threads"][number];
type ReadModelMessage = OrchestrationReadModel["threads"][number]["messages"][number];
type ShellSnapshotProject = OrchestrationShellSnapshot["projects"][number];
type ShellSnapshotThread = OrchestrationShellSnapshot["threads"][number];
type ThreadMessageSentEvent = Extract<OrchestrationEvent, { type: "thread.message-sent" }>;
type ThreadActivityAppendedEvent = Extract<
  OrchestrationEvent,
  { type: "thread.activity-appended" }
>;
type ThreadApprovalResponseRequestedEvent = Extract<
  OrchestrationEvent,
  { type: "thread.approval-response-requested" }
>;
type ThreadUserInputResponseRequestedEvent = Extract<
  OrchestrationEvent,
  { type: "thread.user-input-response-requested" }
>;

/** 鎸佷箙鍖栫姸鎬佺殑 localStorage key */
const PERSISTED_STATE_KEY = "remicode:renderer-state:v8";
/** 鏃х増鎸佷箙鍖?key 鍒楄〃锛岄娆″姞杞藉悗鑷姩娓呯悊 */
const LEGACY_PERSISTED_STATE_KEYS = [
  "codething:renderer-state:v4",
  "codething:renderer-state:v3",
  "codething:renderer-state:v2",
  "codething:renderer-state:v1",
] as const;
/** 姣忎釜绾跨▼淇濈暀鐨勬渶澶ф秷鎭暟 */
const MAX_THREAD_MESSAGES = 2_000;
/** 姣忎釜绾跨▼淇濈暀鐨勬渶澶ф椿鍔ㄦ暟 */
const MAX_THREAD_ACTIVITIES = 500;
const EMPTY_THREAD_IDS: ThreadId[] = [];
const EMPTY_THREAD_SHELL_BY_ID: Record<ThreadId, ThreadShell> = {};
const EMPTY_THREAD_SESSION_BY_ID: Record<ThreadId, ThreadSession | null> = {};
const EMPTY_THREAD_TURN_STATE_BY_ID: Record<ThreadId, ThreadTurnState> = {};
const EMPTY_MESSAGE_IDS_BY_THREAD: Record<ThreadId, MessageId[]> = {};
const EMPTY_MESSAGE_BY_THREAD: Record<ThreadId, Record<MessageId, ChatMessage>> = {};
const EMPTY_ACTIVITY_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
const EMPTY_ACTIVITY_BY_THREAD: Record<ThreadId, Record<string, Thread["activities"][number]>> = {};
const EMPTY_PROPOSED_PLAN_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
const EMPTY_PROPOSED_PLAN_BY_THREAD: Record<
  ThreadId,
  Record<string, Thread["proposedPlans"][number]>
> = {};
const EMPTY_TURN_DIFF_IDS_BY_THREAD: Record<ThreadId, TurnId[]> = {};
const EMPTY_TURN_DIFF_BY_THREAD: Record<
  ThreadId,
  Record<TurnId, Thread["turnDiffSummaries"][number]>
> = {};
/** 褰卞搷渚ц竟鏍忔憳瑕佺殑娲诲姩绫诲瀷闆嗗悎 */
const THREAD_SUMMARY_ACTIVITY_KINDS = new Set([
  "approval.requested",
  "approval.resolved",
  "provider.approval.respond.failed",
  "user-input.requested",
  "user-input.resolved",
  "provider.user-input.respond.failed",
]);
/** 寰呭鐞嗙殑浜や簰璇锋眰绫诲瀷闆嗗悎 */
const PENDING_INTERACTION_REQUEST_KINDS = new Set(["approval.requested", "user-input.requested"]);

const initialState: AppState = {
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
const persistedExpandedProjectCwds = new Set<string>();
const persistedProjectOrderCwds: string[] = [];
const persistedProjectNamesByCwd = new Map<string, string>();

function projectCwdKey(cwd: string): string {
  return normalizeWorkspaceRootForComparison(cwd);
}

function basenameOfPath(value: string): string | null {
  const segments = value.split(/[/\\]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? null;
}

function rememberProjectUiState(projects: ReadonlyArray<Pick<Project, "cwd" | "expanded">>): void {
  for (const project of projects) {
    const cwdKey = projectCwdKey(project.cwd);
    if (project.expanded) {
      persistedExpandedProjectCwds.add(cwdKey);
    } else {
      persistedExpandedProjectCwds.delete(cwdKey);
    }
    if (!persistedProjectOrderCwds.includes(cwdKey)) {
      persistedProjectOrderCwds.push(cwdKey);
    }
  }
}

function rememberProjectLocalNames(
  projects: ReadonlyArray<Pick<Project, "cwd" | "localName">>,
): void {
  for (const project of projects) {
    const cwdKey = projectCwdKey(project.cwd);
    const localName = project.localName?.trim() ?? "";
    if (localName.length > 0) {
      persistedProjectNamesByCwd.set(cwdKey, localName);
    } else {
      persistedProjectNamesByCwd.delete(cwdKey);
    }
  }
}

// 鈹€鈹€ 鎸佷箙鍖栬緟鍔?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** 浠?localStorage 璇诲彇鎸佷箙鍖栫姸鎬侊紙椤圭洰灞曞紑/鎺掑簭/鏈湴鍚嶇О锛?*/
function readPersistedState(): AppState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as {
      expandedProjectCwds?: string[];
      projectOrderCwds?: string[];
      projectNamesByCwd?: Record<string, string>;
    };
    persistedExpandedProjectCwds.clear();
    persistedProjectOrderCwds.length = 0;
    persistedProjectNamesByCwd.clear();
    for (const cwd of parsed.expandedProjectCwds ?? []) {
      if (typeof cwd === "string" && cwd.length > 0) {
        persistedExpandedProjectCwds.add(projectCwdKey(cwd));
      }
    }
    for (const cwd of parsed.projectOrderCwds ?? []) {
      const cwdKey = typeof cwd === "string" ? projectCwdKey(cwd) : "";
      if (cwdKey.length > 0 && !persistedProjectOrderCwds.includes(cwdKey)) {
        persistedProjectOrderCwds.push(cwdKey);
      }
    }
    for (const [cwd, name] of Object.entries(parsed.projectNamesByCwd ?? {})) {
      if (typeof cwd !== "string" || cwd.length === 0) continue;
      if (typeof name !== "string") continue;
      const trimmedName = name.trim();
      if (trimmedName.length === 0) continue;
      persistedProjectNamesByCwd.set(projectCwdKey(cwd), trimmedName);
    }
    return { ...initialState };
  } catch {
    return initialState;
  }
}

let legacyKeysCleanedUp = false;

/** 灏嗛」鐩?UI 鐘舵€侊紙灞曞紑/鎺掑簭/鏈湴鍚嶇О锛夊啓鍏?localStorage锛屽悓鏃舵竻鐞嗘棫鐗?key */
function persistState(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    rememberProjectUiState(state.projects);
    rememberProjectLocalNames(state.projects);
    window.localStorage.setItem(
      PERSISTED_STATE_KEY,
      JSON.stringify({
        expandedProjectCwds: state.projects
          .filter((project) => project.expanded)
          .map((project) => project.cwd),
        projectOrderCwds: state.projects.map((project) => project.cwd),
        projectNamesByCwd: Object.fromEntries(persistedProjectNamesByCwd),
      }),
    );
    if (!legacyKeysCleanedUp) {
      legacyKeysCleanedUp = true;
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    }
  } catch {
    // Ignore quota/storage errors to avoid breaking chat UX.
  }
}
/** 闃叉姈鎸佷箙鍖栵紝閬垮厤 localStorage 棰戠箒鍐欏叆 */
const debouncedPersistState = new Debouncer(persistState, { wait: 500 });

/**
 * 绔嬪嵆鍚屾鎸佷箙鍖栧綋鍓嶅簲鐢ㄧ姸鎬? *
 * @param state - 搴旂敤鐘舵€侊紝榛樿鍙栧綋鍓?store 鐘舵€? */
export function persistAppStateNow(state: AppState = useStore.getState()): void {
  persistState(state);
}

// 鈹€鈹€ 绾嚱鏁拌緟鍔?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** 鏇存柊绾跨▼鍒楄〃涓寚瀹?ID 鐨勭嚎绋嬶紝鑻ユ湭鍙樺寲鍒欒繑鍥炲師鏁扮粍寮曠敤 */
function updateThread(
  threads: Thread[],
  threadId: ThreadId,
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

function sourceProposedPlansEqual(
  left: Thread["pendingSourceProposedPlan"],
  right: Thread["pendingSourceProposedPlan"],
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return left.threadId === right.threadId && left.planId === right.planId;
}

function latestTurnsEqual(left: Thread["latestTurn"], right: Thread["latestTurn"]): boolean {
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

function threadSessionsEqual(
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

// 淇濇寔涔愯鐨勫垎鏀祦绋嬪畬鎴愭爣璁板湪鍚屼竴鍒嗘敮/宸ヤ綔鏍戞爣璇嗕笅鎸佺画鏈夋晥锛?// 浣嗗綋绾跨▼鍒囨崲鍒版柊鐨勫垎鏀笂涓嬫枃鏃惰鏈嶅姟鍣ㄩ噸鏂板垵濮嬪寲銆?function resolveCreateBranchFlowCompletedMerge(input: {
  currentBranch: string | null;
  nextBranch: string | null;
  currentWorktreePath: string | null;
  nextWorktreePath: string | null;
  currentAssociatedWorktreePath: string | null | undefined;
  nextAssociatedWorktreePath: string | null | undefined;
  currentAssociatedWorktreeBranch: string | null | undefined;
  nextAssociatedWorktreeBranch: string | null | undefined;
  currentAssociatedWorktreeRef: string | null | undefined;
  nextAssociatedWorktreeRef: string | null | undefined;
  currentCreateBranchFlowCompleted: boolean | undefined;
  nextCreateBranchFlowCompleted: boolean | undefined;
}): boolean {
  const contextChanged =
    input.currentBranch !== input.nextBranch ||
    input.currentWorktreePath !== input.nextWorktreePath ||
    (input.currentAssociatedWorktreePath ?? null) !== (input.nextAssociatedWorktreePath ?? null) ||
    (input.currentAssociatedWorktreeBranch ?? null) !==
      (input.nextAssociatedWorktreeBranch ?? null) ||
    (input.currentAssociatedWorktreeRef ?? null) !== (input.nextAssociatedWorktreeRef ?? null);

  if (contextChanged) {
    return input.nextCreateBranchFlowCompleted ?? false;
  }

  if (input.nextCreateBranchFlowCompleted === undefined) {
    return input.currentCreateBranchFlowCompleted ?? false;
  }

  if ((input.currentCreateBranchFlowCompleted ?? false) && !input.nextCreateBranchFlowCompleted) {
    return true;
  }

  return input.nextCreateBranchFlowCompleted;
}

function threadShellsEqual(left: ThreadShell | undefined, right: ThreadShell): boolean {
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

function threadTurnStatesEqual(left: ThreadTurnState | undefined, right: ThreadTurnState): boolean {
  return (
    left !== undefined &&
    latestTurnsEqual(left.latestTurn, right.latestTurn) &&
    sourceProposedPlansEqual(left.pendingSourceProposedPlan, right.pendingSourceProposedPlan)
  );
}

function toThreadShell(thread: Thread): ThreadShell {
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

function toThreadTurnState(thread: Thread): ThreadTurnState {
  return {
    latestTurn: thread.latestTurn,
    ...(thread.pendingSourceProposedPlan
      ? { pendingSourceProposedPlan: thread.pendingSourceProposedPlan }
      : {}),
  };
}

function buildMessageSlice(thread: Thread): {
  ids: MessageId[];
  byId: Record<MessageId, ChatMessage>;
} {
  return {
    ids: thread.messages.map((message) => message.id),
    byId: Object.fromEntries(
      thread.messages.map((message) => [message.id, message] as const),
    ) as Record<MessageId, ChatMessage>,
  };
}

function buildActivitySlice(thread: Thread): {
  ids: string[];
  byId: Record<string, Thread["activities"][number]>;
} {
  const activities = capThreadActivities(dedupeActivitiesById(thread.activities));
  return {
    ids: activities.map((activity) => activity.id),
    byId: Object.fromEntries(
      activities.map((activity) => [activity.id, activity] as const),
    ) as Record<string, Thread["activities"][number]>,
  };
}

function buildProposedPlanSlice(thread: Thread): {
  ids: string[];
  byId: Record<string, Thread["proposedPlans"][number]>;
} {
  return {
    ids: thread.proposedPlans.map((plan) => plan.id),
    byId: Object.fromEntries(
      thread.proposedPlans.map((plan) => [plan.id, plan] as const),
    ) as Record<string, Thread["proposedPlans"][number]>,
  };
}

function buildTurnDiffSlice(thread: Thread): {
  ids: TurnId[];
  byId: Record<TurnId, Thread["turnDiffSummaries"][number]>;
} {
  return {
    ids: thread.turnDiffSummaries.map((summary) => summary.turnId),
    byId: Object.fromEntries(
      thread.turnDiffSummaries.map((summary) => [summary.turnId, summary] as const),
    ) as Record<TurnId, Thread["turnDiffSummaries"][number]>,
  };
}

// 澶嶇敤璇绘ā鍨嬩腑鏈彉鍖栫殑鍒嗘敮锛屼娇姣忕嚎绋嬮€夋嫨鍣ㄥ湪娴佸紡浼犺緭鏈熼棿淇濇寔寮曠敤绋冲畾銆?function arraysShallowEqual<T>(
  left: ReadonlyArray<T> | undefined,
  right: ReadonlyArray<T>,
): left is ReadonlyArray<T> {
  if (!left || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function recordsShallowEqual<T>(left: Record<string, T>, right: Record<string, T>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!(key in right) || left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function deepEqualJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left == null || right == null || typeof left !== typeof right) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqualJson(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  if (typeof left !== "object" || typeof right !== "object") {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!(key in rightRecord) || !deepEqualJson(leftRecord[key], rightRecord[key])) {
      return false;
    }
  }
  return true;
}

function normalizeModelSelection<T extends { provider: ProviderKind; model: string }>(
  value: T,
  previous: T | null | undefined,
): T {
  const normalizedModel = normalizeModelSlug(value.model, value.provider) ?? value.model;
  const next = normalizedModel === value.model ? value : { ...value, model: normalizedModel };
  return previous && deepEqualJson(previous, next) ? previous : next;
}

function normalizeProjectScripts(
  incoming: ReadModelProject["scripts"],
  previous: Project["scripts"] | undefined,
): Project["scripts"] {
  const nextScripts = incoming.map((script, index) => {
    const existing = previous?.[index];
    return existing && deepEqualJson(existing, script) ? existing : script;
  });
  return arraysShallowEqual(previous, nextScripts) ? previous : nextScripts;
}

function normalizeProjectFromReadModel(
  incoming: ReadModelProject,
  previous: Project | undefined,
): Project {
  const workspaceRootKey = projectCwdKey(incoming.workspaceRoot);
  const folderName = basenameOfPath(incoming.workspaceRoot) ?? incoming.title;
  const localName = previous?.localName ?? persistedProjectNamesByCwd.get(workspaceRootKey) ?? null;
  const defaultModelSelection =
    incoming.defaultModelSelection === null
      ? null
      : normalizeModelSelection(incoming.defaultModelSelection, previous?.defaultModelSelection);
  const scripts = normalizeProjectScripts(incoming.scripts, previous?.scripts);
  const expanded =
    previous?.expanded ??
    (persistedExpandedProjectCwds.size > 0
      ? persistedExpandedProjectCwds.has(workspaceRootKey)
      : true);

  if (
    previous &&
    previous.id === incoming.id &&
    previous.kind === incoming.kind &&
    previous.name === (localName ?? incoming.title) &&
    previous.remoteName === incoming.title &&
    previous.folderName === folderName &&
    previous.localName === localName &&
    previous.cwd === incoming.workspaceRoot &&
    previous.defaultModelSelection === defaultModelSelection &&
    previous.expanded === expanded &&
    previous.createdAt === incoming.createdAt &&
    previous.updatedAt === incoming.updatedAt &&
    previous.scripts === scripts
  ) {
    return previous;
  }

  return {
    id: incoming.id,
    kind: incoming.kind ?? "project",
    name: localName ?? incoming.title,
    remoteName: incoming.title,
    folderName,
    localName,
    cwd: incoming.workspaceRoot,
    defaultModelSelection,
    expanded,
    createdAt: incoming.createdAt,
    updatedAt: incoming.updatedAt,
    scripts,
  } satisfies Project;
}

function normalizeProjectFromShell(
  incoming: ShellSnapshotProject,
  previous: Project | undefined,
): Project {
  const workspaceRootKey = projectCwdKey(incoming.workspaceRoot);
  const folderName = basenameOfPath(incoming.workspaceRoot) ?? incoming.title;
  const localName = previous?.localName ?? persistedProjectNamesByCwd.get(workspaceRootKey) ?? null;
  const defaultModelSelection =
    incoming.defaultModelSelection === null
      ? null
      : normalizeModelSelection(incoming.defaultModelSelection, previous?.defaultModelSelection);
  const scripts = normalizeProjectScripts(incoming.scripts, previous?.scripts);
  const expanded =
    previous?.expanded ??
    (persistedExpandedProjectCwds.size > 0
      ? persistedExpandedProjectCwds.has(workspaceRootKey)
      : true);

  if (
    previous &&
    previous.id === incoming.id &&
    previous.kind === incoming.kind &&
    previous.name === (localName ?? incoming.title) &&
    previous.remoteName === incoming.title &&
    previous.folderName === folderName &&
    previous.localName === localName &&
    previous.cwd === incoming.workspaceRoot &&
    previous.defaultModelSelection === defaultModelSelection &&
    previous.expanded === expanded &&
    previous.createdAt === incoming.createdAt &&
    previous.updatedAt === incoming.updatedAt &&
    previous.scripts === scripts
  ) {
    return previous;
  }

  return {
    id: incoming.id,
    kind: incoming.kind ?? "project",
    name: localName ?? incoming.title,
    remoteName: incoming.title,
    folderName,
    localName,
    cwd: incoming.workspaceRoot,
    defaultModelSelection,
    expanded,
    createdAt: incoming.createdAt,
    updatedAt: incoming.updatedAt,
    scripts,
  } satisfies Project;
}

function upsertProjectFromReadModel(state: AppState, incoming: ReadModelProject): AppState {
  const existingProject = state.projects.find((project) => project.id === incoming.id);
  const nextProject = normalizeProjectFromReadModel(incoming, existingProject);

  if (existingProject) {
    if (existingProject === nextProject) {
      return state;
    }
    return {
      ...state,
      projects: state.projects.map((project) =>
        project.id === incoming.id ? nextProject : project,
      ),
    };
  }

  return {
    ...state,
    projects: [...state.projects, nextProject],
  };
}

function upsertProjectFromShell(state: AppState, incoming: ShellSnapshotProject): AppState {
  const existingProject =
    state.projects.find((project) => project.id === incoming.id) ??
    state.projects.find(
      (project) => projectCwdKey(project.cwd) === projectCwdKey(incoming.workspaceRoot),
    );
  const nextProject = normalizeProjectFromShell(incoming, existingProject);

  if (existingProject) {
    if (existingProject === nextProject) {
      return state;
    }
    return {
      ...state,
      projects: state.projects.map((project) =>
        project.id === existingProject.id ? nextProject : project,
      ),
    };
  }

  return {
    ...state,
    projects: [...state.projects, nextProject],
  };
}

function normalizeChatAttachments(
  incoming: ReadModelMessage["attachments"],
  previous: ChatAttachment[] | undefined,
): ChatAttachment[] | undefined {
  if (!incoming || incoming.length === 0) {
    return undefined;
  }

  const previousById = new Map(previous?.map((attachment) => [attachment.id, attachment] as const));
  const nextAttachments = incoming.map((attachment) => {
    const nextAttachment: ChatAttachment =
      attachment.type === "assistant-selection"
        ? {
            type: "assistant-selection",
            id: attachment.id,
            assistantMessageId: attachment.assistantMessageId,
            text: attachment.text,
          }
        : {
            type: "image",
            id: attachment.id,
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            previewUrl: toAttachmentPreviewUrl(attachmentPreviewRoutePath(attachment.id)),
          };
    const existing = previousById.get(attachment.id);
    if (
      existing &&
      ((existing.type === "assistant-selection" &&
        nextAttachment.type === "assistant-selection" &&
        existing.assistantMessageId === nextAttachment.assistantMessageId &&
        existing.text === nextAttachment.text) ||
        (existing.type === "image" &&
          nextAttachment.type === "image" &&
          existing.name === nextAttachment.name &&
          existing.mimeType === nextAttachment.mimeType &&
          existing.sizeBytes === nextAttachment.sizeBytes &&
          existing.previewUrl === nextAttachment.previewUrl))
    ) {
      return existing;
    }
    return nextAttachment;
  });

  return arraysShallowEqual(previous, nextAttachments) ? previous : nextAttachments;
}

function normalizeChatMessage(
  incoming: ReadModelMessage,
  previous: ChatMessage | undefined,
): ChatMessage {
  const attachments = normalizeChatAttachments(incoming.attachments, previous?.attachments);
  const completedAt = incoming.streaming ? undefined : incoming.updatedAt;
  if (
    previous &&
    previous.role === incoming.role &&
    previous.text === incoming.text &&
    previous.dispatchMode === incoming.dispatchMode &&
    previous.turnId === incoming.turnId &&
    previous.createdAt === incoming.createdAt &&
    previous.streaming === incoming.streaming &&
    previous.source === incoming.source &&
    previous.completedAt === completedAt &&
    previous.attachments === attachments
  ) {
    return previous;
  }

  return {
    id: incoming.id,
    role: incoming.role,
    text: incoming.text,
    ...(incoming.dispatchMode ? { dispatchMode: incoming.dispatchMode } : {}),
    turnId: incoming.turnId,
    createdAt: incoming.createdAt,
    streaming: incoming.streaming,
    source: incoming.source,
    ...(completedAt ? { completedAt } : {}),
    ...(attachments ? { attachments } : {}),
  };
}

function normalizeChatMessages(
  incoming: ReadModelThread["messages"],
  previous: ChatMessage[] | undefined,
): ChatMessage[] {
  const previousById = new Map(previous?.map((message) => [message.id, message] as const));
  const nextMessages = incoming
    .slice(-MAX_THREAD_MESSAGES)
    .map((message) => normalizeChatMessage(message, previousById.get(message.id)));
  return arraysShallowEqual(previous, nextMessages) ? previous : nextMessages;
}

function readModelAttachmentsFromChatMessage(
  attachments: ChatMessage["attachments"],
): ReadModelThread["messages"][number]["attachments"] {
  return (
    attachments?.map((attachment) =>
      attachment.type === "assistant-selection"
        ? {
            id: attachment.id,
            type: "assistant-selection" as const,
            assistantMessageId: attachment.assistantMessageId as MessageId,
            text: attachment.text,
          }
        : {
            id: attachment.id,
            name: attachment.name,
            type: "image" as const,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          },
    ) ?? []
  );
}

function readModelMessageFromChatMessage(
  message: ChatMessage,
): ReadModelThread["messages"][number] {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    ...(message.dispatchMode ? { dispatchMode: message.dispatchMode } : {}),
    turnId: message.turnId ?? null,
    streaming: message.streaming,
    source: message.source ?? "native",
    createdAt: message.createdAt,
    updatedAt: message.completedAt ?? message.createdAt,
    attachments: readModelAttachmentsFromChatMessage(message.attachments),
  };
}

function shouldRetainLiveAssistantMessageForHotPath(
  previousThread: Thread,
  message: ChatMessage,
): boolean {
  if (message.role !== "assistant") {
    return false;
  }
  if (message.streaming) {
    return true;
  }
  const latestTurn = previousThread.latestTurn;
  if (!latestTurn) {
    return false;
  }
  if (latestTurn.assistantMessageId === message.id) {
    return true;
  }
  return (
    previousThread.session?.orchestrationStatus === "running" &&
    message.turnId !== undefined &&
    latestTurn.turnId === message.turnId
  );
}

function mergeReadModelMessagesWithLiveHotPath(
  incomingMessages: ReadModelThread["messages"],
  previousThread: Thread | undefined,
): ReadModelThread["messages"] {
  if (!previousThread || previousThread.messages.length === 0) {
    return incomingMessages;
  }

  const previousMessageById = new Map(
    previousThread.messages.map((message) => [message.id, message] as const),
  );
  const mergedById = new Map<MessageId, ReadModelThread["messages"][number]>();
  let changed = false;

  for (const incomingMessage of incomingMessages) {
    const previousMessage = previousMessageById.get(incomingMessage.id);
    if (!previousMessage || previousMessage.role !== incomingMessage.role) {
      mergedById.set(incomingMessage.id, incomingMessage);
      continue;
    }

    const incomingCompletedAt = incomingMessage.streaming ? undefined : incomingMessage.updatedAt;
    const shouldPreferLiveMessage =
      previousMessage.text.length > incomingMessage.text.length ||
      (!previousMessage.streaming && incomingMessage.streaming) ||
      (previousMessage.completedAt !== undefined &&
        (incomingCompletedAt === undefined || previousMessage.completedAt > incomingCompletedAt));

    if (!shouldPreferLiveMessage) {
      mergedById.set(incomingMessage.id, incomingMessage);
      continue;
    }

    changed = true;
    mergedById.set(incomingMessage.id, {
      ...incomingMessage,
      text: previousMessage.text,
      dispatchMode: previousMessage.dispatchMode ?? incomingMessage.dispatchMode,
      turnId: previousMessage.turnId ?? incomingMessage.turnId ?? null,
      source: previousMessage.source ?? incomingMessage.source ?? "native",
      streaming: previousMessage.streaming,
      updatedAt: previousMessage.completedAt ?? incomingMessage.updatedAt,
      attachments: readModelAttachmentsFromChatMessage(previousMessage.attachments),
    });
  }

  for (const previousMessage of previousThread.messages) {
    if (mergedById.has(previousMessage.id)) {
      continue;
    }
    if (!shouldRetainLiveAssistantMessageForHotPath(previousThread, previousMessage)) {
      continue;
    }
    changed = true;
    mergedById.set(previousMessage.id, readModelMessageFromChatMessage(previousMessage));
  }

  if (!changed) {
    return incomingMessages;
  }

  return [...mergedById.values()].toSorted((left, right) =>
    left.createdAt === right.createdAt
      ? String(left.id).localeCompare(String(right.id))
      : left.createdAt.localeCompare(right.createdAt),
  );
}

function hasLiveAssistantIntro(previousThread: Thread | undefined): boolean {
  if (!previousThread) {
    return false;
  }
  const latestTurn = previousThread.latestTurn;
  if (!latestTurn || latestTurn.state !== "running") {
    return false;
  }
  if (previousThread.session?.orchestrationStatus !== "running") {
    return false;
  }
  return previousThread.messages.some(
    (message) =>
      message.role === "assistant" &&
      message.turnId === latestTurn.turnId &&
      (message.streaming || message.id === latestTurn.assistantMessageId),
  );
}

function shouldPreserveRunningTurn(
  previousThread: Thread | undefined,
  incoming: ReadModelThread,
): boolean {
  if (!hasLiveAssistantIntro(previousThread)) {
    return false;
  }
  const previousTurnId = previousThread?.latestTurn?.turnId;
  if (!previousTurnId) {
    return false;
  }
  if (incoming.latestTurn?.turnId !== previousTurnId) {
    return true;
  }
  if (incoming.latestTurn.completedAt) {
    return false;
  }
  return true;
}

function readModelSessionFromThreadSession(
  previousSession: ThreadSession,
  previousThread: Thread | undefined,
  incomingSession: ReadModelThread["session"],
): NonNullable<ReadModelThread["session"]> {
  return {
    threadId: previousThread?.id ?? incomingSession?.threadId ?? "unknown" as ThreadId,
    status: previousSession.orchestrationStatus,
    providerName: previousSession.provider,
    runtimeMode: previousThread?.runtimeMode ?? incomingSession?.runtimeMode ?? "full-access",
    activeTurnId: previousSession.activeTurnId ?? null,
    lastError: previousSession.lastError ?? null,
    updatedAt: previousSession.updatedAt,
  };
}

function mergeReadModelSessionWithLiveHotPath(
  incomingSession: ReadModelThread["session"],
  previousThread: Thread | undefined,
  options: {
    preserveRunningTurn: boolean;
  },
): ReadModelThread["session"] {
  const previousSession = previousThread?.session;
  if (!previousSession || !options.preserveRunningTurn) {
    return incomingSession;
  }
  if (!incomingSession) {
    return previousSession.orchestrationStatus === "running"
      ? readModelSessionFromThreadSession(previousSession, previousThread, incomingSession)
      : incomingSession;
  }
  if (previousSession.updatedAt > incomingSession.updatedAt) {
    const nextSession = readModelSessionFromThreadSession(
      previousSession,
      previousThread,
      incomingSession,
    );
    return {
      ...nextSession,
      providerName: incomingSession.providerName,
      runtimeMode: incomingSession.runtimeMode,
      activeTurnId: previousSession.activeTurnId ?? incomingSession.activeTurnId,
      lastError: previousSession.lastError ?? incomingSession.lastError,
    };
  }
  if (
    previousSession.orchestrationStatus === "running" &&
    incomingSession.status !== "running" &&
    incomingSession.status !== "error" &&
    previousSession.activeTurnId !== undefined
  ) {
    return {
      ...incomingSession,
      status: "running",
      activeTurnId: previousSession.activeTurnId,
      lastError: previousSession.lastError ?? incomingSession.lastError,
      updatedAt:
        previousSession.updatedAt >= incomingSession.updatedAt
          ? previousSession.updatedAt
          : incomingSession.updatedAt,
    };
  }
  return incomingSession;
}

function mergeReadModelLatestTurnWithLiveHotPath(
  incomingLatestTurn: ReadModelThread["latestTurn"],
  previousThread: Thread | undefined,
  options: {
    preserveRunningTurn: boolean;
  },
): ReadModelThread["latestTurn"] {
  const previousLatestTurn = previousThread?.latestTurn;
  if (!previousLatestTurn) {
    return incomingLatestTurn;
  }
  if (options.preserveRunningTurn) {
    if (incomingLatestTurn === null || incomingLatestTurn.turnId === previousLatestTurn.turnId) {
      return {
        ...(incomingLatestTurn ?? previousLatestTurn),
        turnId: previousLatestTurn.turnId,
        state: "running",
        requestedAt: incomingLatestTurn?.requestedAt ?? previousLatestTurn.requestedAt,
        startedAt: incomingLatestTurn?.startedAt ?? previousLatestTurn.startedAt,
        completedAt: null,
        assistantMessageId:
          previousLatestTurn.assistantMessageId ?? incomingLatestTurn?.assistantMessageId ?? null,
        ...((incomingLatestTurn?.sourceProposedPlan ?? previousLatestTurn.sourceProposedPlan)
          ? {
              sourceProposedPlan:
                incomingLatestTurn?.sourceProposedPlan ?? previousLatestTurn.sourceProposedPlan,
            }
          : {}),
      };
    }
    return incomingLatestTurn;
  }
  if (incomingLatestTurn === null || incomingLatestTurn.turnId !== previousLatestTurn.turnId) {
    return incomingLatestTurn;
  }
  if (
    previousLatestTurn.assistantMessageId === undefined ||
    incomingLatestTurn.assistantMessageId === previousLatestTurn.assistantMessageId
  ) {
    return incomingLatestTurn;
  }
  return {
    ...incomingLatestTurn,
    assistantMessageId: previousLatestTurn.assistantMessageId,
  };
}

function mergeReadModelThreadDetailWithLiveHotPath(
  incoming: ReadModelThread,
  previousThread: Thread | undefined,
): ReadModelThread {
  if (!previousThread) {
    return incoming;
  }

  const preserveRunningTurn = shouldPreserveRunningTurn(previousThread, incoming);
  const messages = mergeReadModelMessagesWithLiveHotPath(incoming.messages, previousThread);
  const session = mergeReadModelSessionWithLiveHotPath(incoming.session, previousThread, {
    preserveRunningTurn,
  });
  const latestTurn = mergeReadModelLatestTurnWithLiveHotPath(incoming.latestTurn, previousThread, {
    preserveRunningTurn,
  });
  if (
    messages === incoming.messages &&
    session === incoming.session &&
    latestTurn === incoming.latestTurn
  ) {
    return incoming;
  }
  return {
    ...incoming,
    messages,
    session,
    latestTurn,
  };
}

function normalizeProposedPlans(
  incoming: ReadModelThread["proposedPlans"],
  previous: Thread["proposedPlans"] | undefined,
): Thread["proposedPlans"] {
  const previousById = new Map(previous?.map((plan) => [plan.id, plan] as const));
  const nextPlans = incoming.map((plan) => {
    const existing = previousById.get(plan.id);
    if (
      existing &&
      existing.turnId === plan.turnId &&
      existing.planMarkdown === plan.planMarkdown &&
      existing.implementedAt === plan.implementedAt &&
      existing.implementationThreadId === plan.implementationThreadId &&
      existing.createdAt === plan.createdAt &&
      existing.updatedAt === plan.updatedAt
    ) {
      return existing;
    }
    return {
      id: plan.id,
      turnId: plan.turnId,
      planMarkdown: plan.planMarkdown,
      implementedAt: plan.implementedAt,
      implementationThreadId: plan.implementationThreadId,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  });
  return arraysShallowEqual(previous, nextPlans) ? previous : nextPlans;
}

function normalizeTurnDiffFiles(
  incoming: ReadonlyArray<Thread["turnDiffSummaries"][number]["files"][number]>,
  previous: Thread["turnDiffSummaries"][number]["files"] | undefined,
): Thread["turnDiffSummaries"][number]["files"] {
  const mergedIncoming = mergeTurnDiffFilesByPath(incoming);
  const nextFiles = mergedIncoming.map((file, index) => {
    const existing = previous?.[index];
    if (
      existing &&
      existing.path === file.path &&
      existing.kind === file.kind &&
      existing.additions === file.additions &&
      existing.deletions === file.deletions
    ) {
      return existing;
    }
    return file;
  });
  return arraysShallowEqual(previous, nextFiles) ? previous : nextFiles;
}

function mergeTurnDiffFilesByPath(
  files: ReadonlyArray<Thread["turnDiffSummaries"][number]["files"][number]>,
): Thread["turnDiffSummaries"][number]["files"] {
  const filesByPath = new Map<string, Thread["turnDiffSummaries"][number]["files"][number]>();
  for (const file of files) {
    const existing = filesByPath.get(file.path);
    if (!existing) {
      filesByPath.set(file.path, file);
      continue;
    }
    filesByPath.set(file.path, {
      path: file.path,
      kind: existing.kind,
      additions: (existing.additions ?? 0) + (file.additions ?? 0),
      deletions: (existing.deletions ?? 0) + (file.deletions ?? 0),
    });
  }
  return Array.from(filesByPath.values());
}

function normalizeTurnDiffSummaries(
  incoming: ReadModelThread["checkpoints"],
  previous: Thread["turnDiffSummaries"] | undefined,
): Thread["turnDiffSummaries"] {
  const previousByTurnId = new Map(previous?.map((summary) => [summary.turnId, summary] as const));
  const nextSummaries = incoming.map((checkpoint) => {
    const existing = previousByTurnId.get(checkpoint.turnId);
    const files = normalizeTurnDiffFiles(checkpoint.files, existing?.files);
    if (
      existing &&
      existing.completedAt === checkpoint.completedAt &&
      existing.status === checkpoint.status &&
      existing.assistantMessageId === (checkpoint.assistantMessageId ?? undefined) &&
      existing.checkpointTurnCount === checkpoint.checkpointTurnCount &&
      existing.checkpointRef === checkpoint.checkpointRef &&
      existing.files === files
    ) {
      return existing;
    }
    return {
      turnId: checkpoint.turnId,
      completedAt: checkpoint.completedAt,
      status: checkpoint.status,
      assistantMessageId: checkpoint.assistantMessageId ?? undefined,
      checkpointTurnCount: checkpoint.checkpointTurnCount,
      checkpointRef: checkpoint.checkpointRef,
      files,
    };
  });
  return arraysShallowEqual(previous, nextSummaries) ? previous : nextSummaries;
}

function normalizeActivities(
  incoming: ReadModelThread["activities"],
  previous: Thread["activities"] | undefined,
): Thread["activities"] {
  const previousActivities = previous ? dedupeActivitiesById(previous) : undefined;
  const incomingActivities = dedupeActivitiesById(incoming);
  const previousById = new Map(
    previousActivities?.map((activity) => [activity.id, activity] as const),
  );
  const nextActivities = incomingActivities.map((activity) => {
    const existing = previousById.get(activity.id);
    if (existing) {
      const preferred = preferRicherActivity(existing, activity);
      if (preferred === existing || activitiesEqual(existing, preferred)) {
        return existing;
      }
      return preferred;
    }
    return activity;
  });
  const cappedActivities = capThreadActivities(nextActivities);
  return arraysShallowEqual(previous, cappedActivities) ? previous : cappedActivities;
}

function capThreadActivities<TActivity extends Thread["activities"][number]>(
  activities: readonly TActivity[],
): TActivity[] {
  if (activities.length <= MAX_THREAD_ACTIVITIES) {
    return activities as TActivity[];
  }
  const retainedIds = new Set(
    activities.slice(-MAX_THREAD_ACTIVITIES).map((activity) => activity.id),
  );
  const pendingRequestIds = pendingInteractionRequestIds(activities);
  for (const activity of activities) {
    const requestId = activityRequestId(activity);
    if (
      requestId !== null &&
      pendingRequestIds.has(requestId) &&
      PENDING_INTERACTION_REQUEST_KINDS.has(activity.kind)
    ) {
      retainedIds.add(activity.id);
    }
  }
  return activities.filter((activity) => retainedIds.has(activity.id));
}

function activityRequestId(activity: Thread["activities"][number]): string | null {
  const payload = asActivityRecord(activity.payload);
  const requestId = payload?.requestId;
  return typeof requestId === "string" && requestId.trim().length > 0 ? requestId : null;
}

function isStalePendingRequestFailureDetail(detail: unknown): boolean {
  if (typeof detail !== "string") {
    return false;
  }
  const normalized = detail.toLowerCase();
  return (
    normalized.includes("stale pending approval request") ||
    normalized.includes("stale pending user-input request") ||
    normalized.includes("unknown pending approval request") ||
    normalized.includes("unknown pending permission request") ||
    normalized.includes("unknown pending user-input request")
  );
}

// 淇濈暀鏃х殑鍙搷浣滄彁绀猴紝鍗充娇鍏舵椂闂磋酱琛屽凡瓒呭嚭涓婇檺銆?function pendingInteractionRequestIds(
  activities: readonly Thread["activities"][number][],
): Set<string> {
  const pendingRequestIds = new Set<string>();
  for (const activity of activities) {
    const requestId = activityRequestId(activity);
    if (requestId === null) {
      continue;
    }
    if (activity.kind === "approval.requested" || activity.kind === "user-input.requested") {
      pendingRequestIds.add(requestId);
      continue;
    }
    if (activity.kind === "approval.resolved" || activity.kind === "user-input.resolved") {
      pendingRequestIds.delete(requestId);
      continue;
    }
    if (
      (activity.kind === "provider.approval.respond.failed" ||
        activity.kind === "provider.user-input.respond.failed") &&
      isStalePendingRequestFailureDetail(asActivityRecord(activity.payload)?.detail)
    ) {
      pendingRequestIds.delete(requestId);
    }
  }
  return pendingRequestIds;
}

function dedupeActivitiesById<TActivity extends Thread["activities"][number]>(
  activities: ReadonlyArray<TActivity>,
): TActivity[] {
  const indexById = new Map<string, number>();
  const result: TActivity[] = [];
  for (const activity of activities) {
    const existingIndex = indexById.get(activity.id);
    if (existingIndex === undefined) {
      indexById.set(activity.id, result.length);
      result.push(activity);
      continue;
    }
    result[existingIndex] = preferRicherActivity(result[existingIndex]!, activity);
  }
  return arraysShallowEqual(activities, result) ? (activities as TActivity[]) : result;
}

// 蹇収涓庡疄鏃朵簨浠剁珵浜夊彲鑳藉鑷撮噸澶嶇殑娲诲姩 ID銆備繚鐣欏叿鏈夋渶澶氬伐鍏风粏鑺傜殑璐熻浇锛?// 闃叉褰掍竴鍖栫姸鎬佸洖閫€鍒伴€氱敤琛屻€?function preferRicherActivity<TActivity extends Thread["activities"][number]>(
  previous: TActivity,
  incoming: TActivity,
): TActivity {
  if (activitiesEqual(previous, incoming)) {
    return previous;
  }
  const previousScore = activityPayloadDetailScore(previous);
  const incomingScore = activityPayloadDetailScore(incoming);
  return incomingScore < previousScore ? previous : incoming;
}

function activitiesEqual(
  left: Thread["activities"][number],
  right: Thread["activities"][number],
): boolean {
  return (
    left.kind === right.kind &&
    left.tone === right.tone &&
    left.summary === right.summary &&
    deepEqualJson(left.payload, right.payload) &&
    left.turnId === right.turnId &&
    left.sequence === right.sequence &&
    left.createdAt === right.createdAt
  );
}

function activityPayloadDetailScore(activity: Thread["activities"][number]): number {
  const payload = asActivityRecord(activity.payload);
  const data = asActivityRecord(payload?.data);
  const item = asActivityRecord(data?.item);
  const commandActions = item?.commandActions ?? data?.commandActions ?? payload?.commandActions;
  let score = 0;
  if (payload?.itemType) score += 4;
  if (payload?.title) score += 1;
  if (payload?.detail) score += 2;
  if (data) score += 2;
  if (item) score += 4;
  if (normalizeActivityCommandValue(item?.command ?? data?.command ?? payload?.command)) score += 8;
  if (Array.isArray(commandActions) && commandActions.length > 0) score += 8;
  return score;
}

function asActivityRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeActivityCommandValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const parts = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return parts.length > 0 ? parts.join(" ") : null;
}

function isNonFatalThreadErrorMessage(message: string | null | undefined): boolean {
  if (!message) {
    return false;
  }
  const normalized = message.trim().toLowerCase();
  return normalized.includes("write_stdin failed: stdin is closed for this session");
}

function normalizeThreadErrorMessage(message: string | null | undefined): string | null {
  return message && !isNonFatalThreadErrorMessage(message) ? message : null;
}

function normalizeThreadSession(
  incoming: ReadModelThread["session"],
  previous: Thread["session"] | undefined | null,
): Thread["session"] {
  if (!incoming) {
    return null;
  }
  const nextLastError =
    incoming.lastError && !isNonFatalThreadErrorMessage(incoming.lastError)
      ? incoming.lastError
      : undefined;
  const nextSession = {
    provider: toLegacyProvider(incoming.providerName),
    status: toLegacySessionStatus(incoming.status),
    orchestrationStatus: incoming.status,
    activeTurnId: incoming.activeTurnId ?? undefined,
    createdAt: incoming.updatedAt,
    updatedAt: incoming.updatedAt,
    ...(nextLastError ? { lastError: nextLastError } : {}),
  } satisfies NonNullable<Thread["session"]>;
  if (
    previous &&
    previous.provider === nextSession.provider &&
    previous.status === nextSession.status &&
    previous.orchestrationStatus === nextSession.orchestrationStatus &&
    previous.activeTurnId === nextSession.activeTurnId &&
    previous.createdAt === nextSession.createdAt &&
    previous.updatedAt === nextSession.updatedAt &&
    previous.lastError === nextSession.lastError
  ) {
    return previous;
  }
  return nextSession;
}

function normalizeLatestTurn(
  incoming: ReadModelThread["latestTurn"],
  previous: Thread["latestTurn"] | undefined | null,
): Thread["latestTurn"] {
  if (!incoming) {
    return null;
  }
  const nextSourceProposedPlan = incoming.sourceProposedPlan
    ? previous?.sourceProposedPlan &&
      previous.sourceProposedPlan.threadId === incoming.sourceProposedPlan.threadId &&
      previous.sourceProposedPlan.planId === incoming.sourceProposedPlan.planId
      ? previous.sourceProposedPlan
      : incoming.sourceProposedPlan
    : undefined;

  if (
    previous &&
    previous.turnId === incoming.turnId &&
    previous.state === incoming.state &&
    previous.requestedAt === incoming.requestedAt &&
    previous.startedAt === incoming.startedAt &&
    previous.completedAt === incoming.completedAt &&
    previous.assistantMessageId === incoming.assistantMessageId &&
    previous.sourceProposedPlan === nextSourceProposedPlan
  ) {
    return previous;
  }

  return {
    turnId: incoming.turnId,
    state: incoming.state,
    requestedAt: incoming.requestedAt,
    startedAt: incoming.startedAt,
    completedAt: incoming.completedAt,
    assistantMessageId: incoming.assistantMessageId,
    ...(nextSourceProposedPlan ? { sourceProposedPlan: nextSourceProposedPlan } : {}),
  };
}

function normalizeThreadFromReadModel(
  incoming: ReadModelThread,
  previous: Thread | undefined,
): Thread {
  const modelSelection = normalizeModelSelection(incoming.modelSelection, previous?.modelSelection);
  const session = normalizeThreadSession(incoming.session, previous?.session);
  const messages = normalizeChatMessages(incoming.messages, previous?.messages);
  const proposedPlans = normalizeProposedPlans(incoming.proposedPlans, previous?.proposedPlans);
  const latestTurn = normalizeLatestTurn(incoming.latestTurn, previous?.latestTurn);
  const handoff =
    previous?.handoff && incoming.handoff && deepEqualJson(previous.handoff, incoming.handoff)
      ? previous.handoff
      : (incoming.handoff ?? null);
  const lastKnownPr =
    previous?.lastKnownPr &&
    incoming.lastKnownPr &&
    deepEqualJson(previous.lastKnownPr, incoming.lastKnownPr)
      ? previous.lastKnownPr
      : (incoming.lastKnownPr ?? null);
  const turnDiffSummaries = normalizeTurnDiffSummaries(
    incoming.checkpoints,
    previous?.turnDiffSummaries,
  );
  const activities = normalizeActivities(incoming.activities, previous?.activities);
  const error = normalizeThreadErrorMessage(incoming.session?.lastError);
  const lastVisitedAt = previous?.lastVisitedAt ?? incoming.updatedAt;
  const resolvedLatestUserMessageAt =
    Object.hasOwn(incoming, "latestUserMessageAt") && incoming.latestUserMessageAt !== undefined
      ? (incoming.latestUserMessageAt ?? null)
      : undefined;
  const resolvedHasPendingApprovals =
    typeof incoming.hasPendingApprovals === "boolean" ? incoming.hasPendingApprovals : undefined;
  const resolvedHasPendingUserInput =
    typeof incoming.hasPendingUserInput === "boolean" ? incoming.hasPendingUserInput : undefined;
  const resolvedHasActionableProposedPlan =
    typeof incoming.hasActionableProposedPlan === "boolean"
      ? incoming.hasActionableProposedPlan
      : undefined;
  const nextWorktreePath = incoming.worktreePath;
  const nextAssociatedWorktreePath = incoming.associatedWorktreePath ?? null;
  const nextAssociatedWorktreeBranch = incoming.associatedWorktreeBranch ?? null;
  const nextAssociatedWorktreeRef = incoming.associatedWorktreeRef ?? null;
  const resolvedBranch = resolveThreadBranchRegressionGuard({
    currentBranch: previous?.branch ?? null,
    nextBranch: incoming.branch,
  });
  const resolvedCreateBranchFlowCompleted = resolveCreateBranchFlowCompletedMerge({
    currentBranch: previous?.branch ?? null,
    nextBranch: resolvedBranch,
    currentWorktreePath: previous?.worktreePath ?? null,
    nextWorktreePath,
    currentAssociatedWorktreePath: previous?.associatedWorktreePath,
    nextAssociatedWorktreePath,
    currentAssociatedWorktreeBranch: previous?.associatedWorktreeBranch,
    nextAssociatedWorktreeBranch,
    currentAssociatedWorktreeRef: previous?.associatedWorktreeRef,
    nextAssociatedWorktreeRef,
    currentCreateBranchFlowCompleted: previous?.createBranchFlowCompleted,
    nextCreateBranchFlowCompleted: incoming.createBranchFlowCompleted,
  });
  const pendingSourceProposedPlan =
    latestTurn?.sourceProposedPlan ??
    (incoming.session?.status === "running" ? previous?.pendingSourceProposedPlan : undefined);

  if (
    previous &&
    previous.projectId === incoming.projectId &&
    previous.title === incoming.title &&
    previous.modelSelection === modelSelection &&
    previous.runtimeMode === incoming.runtimeMode &&
    previous.interactionMode === incoming.interactionMode &&
    previous.session === session &&
    previous.messages === messages &&
    previous.proposedPlans === proposedPlans &&
    previous.error === error &&
    previous.createdAt === incoming.createdAt &&
    (previous.archivedAt ?? null) === (incoming.archivedAt ?? null) &&
    previous.updatedAt === incoming.updatedAt &&
    (previous.isPinned ?? false) === (incoming.isPinned ?? false) &&
    previous.latestTurn === latestTurn &&
    previous.pendingSourceProposedPlan === pendingSourceProposedPlan &&
    previous.lastVisitedAt === lastVisitedAt &&
    (previous.parentThreadId ?? null) === (incoming.parentThreadId ?? null) &&
    (previous.subagentAgentId ?? null) === (incoming.subagentAgentId ?? null) &&
    (previous.subagentNickname ?? null) === (incoming.subagentNickname ?? null) &&
    (previous.subagentRole ?? null) === (incoming.subagentRole ?? null) &&
    previous.envMode === (incoming.envMode ?? "local") &&
    previous.branch === resolvedBranch &&
    previous.worktreePath === nextWorktreePath &&
    (previous.associatedWorktreePath ?? null) === nextAssociatedWorktreePath &&
    (previous.associatedWorktreeBranch ?? null) === nextAssociatedWorktreeBranch &&
    (previous.associatedWorktreeRef ?? null) === nextAssociatedWorktreeRef &&
    (previous.createBranchFlowCompleted ?? false) === resolvedCreateBranchFlowCompleted &&
    previous.latestUserMessageAt === resolvedLatestUserMessageAt &&
    previous.hasPendingApprovals === resolvedHasPendingApprovals &&
    previous.hasPendingUserInput === resolvedHasPendingUserInput &&
    previous.hasActionableProposedPlan === resolvedHasActionableProposedPlan &&
    (previous.forkSourceThreadId ?? null) === (incoming.forkSourceThreadId ?? null) &&
    (previous.sidechatSourceThreadId ?? null) === (incoming.sidechatSourceThreadId ?? null) &&
    deepEqualJson(previous.lastKnownPr ?? null, lastKnownPr) &&
    (previous.handoff ?? null) === handoff &&
    previous.turnDiffSummaries === turnDiffSummaries &&
    previous.activities === activities
  ) {
    return previous;
  }

  return {
    id: incoming.id,
    codexThreadId: null,
    projectId: incoming.projectId,
    title: incoming.title,
    modelSelection,
    runtimeMode: incoming.runtimeMode,
    interactionMode: incoming.interactionMode,
    session,
    messages,
    proposedPlans,
    error,
    createdAt: incoming.createdAt,
    archivedAt: incoming.archivedAt ?? null,
    updatedAt: incoming.updatedAt,
    isPinned: incoming.isPinned ?? false,
    latestTurn,
    ...(pendingSourceProposedPlan ? { pendingSourceProposedPlan } : {}),
    lastVisitedAt,
    parentThreadId: incoming.parentThreadId ?? null,
    subagentAgentId: incoming.subagentAgentId ?? null,
    subagentNickname: incoming.subagentNickname ?? null,
    subagentRole: incoming.subagentRole ?? null,
    envMode: incoming.envMode ?? "local",
    branch: resolvedBranch,
    worktreePath: nextWorktreePath,
    associatedWorktreePath: nextAssociatedWorktreePath,
    associatedWorktreeBranch: nextAssociatedWorktreeBranch,
    associatedWorktreeRef: nextAssociatedWorktreeRef,
    createBranchFlowCompleted: resolvedCreateBranchFlowCompleted,
    forkSourceThreadId: incoming.forkSourceThreadId ?? null,
    sidechatSourceThreadId: incoming.sidechatSourceThreadId ?? null,
    lastKnownPr,
    handoff,
    ...(resolvedLatestUserMessageAt !== undefined
      ? { latestUserMessageAt: resolvedLatestUserMessageAt }
      : {}),
    ...(resolvedHasPendingApprovals !== undefined
      ? { hasPendingApprovals: resolvedHasPendingApprovals }
      : {}),
    ...(resolvedHasPendingUserInput !== undefined
      ? { hasPendingUserInput: resolvedHasPendingUserInput }
      : {}),
    ...(resolvedHasActionableProposedPlan !== undefined
      ? { hasActionableProposedPlan: resolvedHasActionableProposedPlan }
      : {}),
    turnDiffSummaries,
    activities,
  };
}

function normalizeThreadShellSnapshot(
  incoming: ShellSnapshotThread,
  previous: Thread | undefined,
): {
  shell: ThreadShell;
  session: ThreadSession | null;
  turnState: ThreadTurnState;
} {
  const modelSelection = normalizeModelSelection(incoming.modelSelection, previous?.modelSelection);
  const session = normalizeThreadSession(incoming.session, previous?.session);
  const latestTurn = normalizeLatestTurn(incoming.latestTurn, previous?.latestTurn);
  const handoff =
    previous?.handoff && incoming.handoff && deepEqualJson(previous.handoff, incoming.handoff)
      ? previous.handoff
      : (incoming.handoff ?? null);
  const lastKnownPr =
    previous?.lastKnownPr &&
    incoming.lastKnownPr &&
    deepEqualJson(previous.lastKnownPr, incoming.lastKnownPr)
      ? previous.lastKnownPr
      : (incoming.lastKnownPr ?? null);
  const error = normalizeThreadErrorMessage(incoming.session?.lastError);
  const lastVisitedAt = previous?.lastVisitedAt ?? incoming.updatedAt;
  const nextWorktreePath = incoming.worktreePath;
  const nextAssociatedWorktreePath = incoming.associatedWorktreePath ?? null;
  const nextAssociatedWorktreeBranch = incoming.associatedWorktreeBranch ?? null;
  const nextAssociatedWorktreeRef = incoming.associatedWorktreeRef ?? null;
  const resolvedBranch = resolveThreadBranchRegressionGuard({
    currentBranch: previous?.branch ?? null,
    nextBranch: incoming.branch,
  });
  const resolvedCreateBranchFlowCompleted = resolveCreateBranchFlowCompletedMerge({
    currentBranch: previous?.branch ?? null,
    nextBranch: resolvedBranch,
    currentWorktreePath: previous?.worktreePath ?? null,
    nextWorktreePath,
    currentAssociatedWorktreePath: previous?.associatedWorktreePath,
    nextAssociatedWorktreePath,
    currentAssociatedWorktreeBranch: previous?.associatedWorktreeBranch,
    nextAssociatedWorktreeBranch,
    currentAssociatedWorktreeRef: previous?.associatedWorktreeRef,
    nextAssociatedWorktreeRef,
    currentCreateBranchFlowCompleted: previous?.createBranchFlowCompleted,
    nextCreateBranchFlowCompleted: incoming.createBranchFlowCompleted,
  });
  const shell: ThreadShell = {
    id: incoming.id,
    codexThreadId: previous?.codexThreadId ?? null,
    projectId: incoming.projectId,
    title: incoming.title,
    modelSelection,
    runtimeMode: incoming.runtimeMode,
    interactionMode: incoming.interactionMode,
    error,
    createdAt: incoming.createdAt,
    archivedAt: incoming.archivedAt ?? null,
    updatedAt: incoming.updatedAt,
    isPinned: incoming.isPinned ?? false,
    envMode: incoming.envMode ?? "local",
    branch: resolvedBranch,
    worktreePath: nextWorktreePath,
    associatedWorktreePath: nextAssociatedWorktreePath,
    associatedWorktreeBranch: nextAssociatedWorktreeBranch,
    associatedWorktreeRef: nextAssociatedWorktreeRef,
    createBranchFlowCompleted: resolvedCreateBranchFlowCompleted,
    parentThreadId: incoming.parentThreadId ?? null,
    subagentAgentId: incoming.subagentAgentId ?? null,
    subagentNickname: incoming.subagentNickname ?? null,
    subagentRole: incoming.subagentRole ?? null,
    forkSourceThreadId: incoming.forkSourceThreadId ?? null,
    sidechatSourceThreadId: incoming.sidechatSourceThreadId ?? null,
    lastKnownPr,
    handoff,
    ...(incoming.latestUserMessageAt !== undefined
      ? { latestUserMessageAt: incoming.latestUserMessageAt ?? null }
      : {}),
    ...(incoming.hasPendingApprovals !== undefined
      ? { hasPendingApprovals: incoming.hasPendingApprovals }
      : {}),
    ...(incoming.hasPendingUserInput !== undefined
      ? { hasPendingUserInput: incoming.hasPendingUserInput }
      : {}),
    ...(incoming.hasActionableProposedPlan !== undefined
      ? { hasActionableProposedPlan: incoming.hasActionableProposedPlan }
      : {}),
    ...(lastVisitedAt !== undefined ? { lastVisitedAt } : {}),
  };
  return {
    shell,
    session,
    turnState: {
      latestTurn,
      ...(latestTurn?.sourceProposedPlan
        ? { pendingSourceProposedPlan: latestTurn.sourceProposedPlan }
        : {}),
    },
  };
}

function mapProjectsFromReadModel(
  incoming: OrchestrationReadModel["projects"],
  previous: Project[],
): Project[] {
  const previousById = new Map(previous.map((project) => [project.id, project] as const));
  const previousByCwd = new Map(
    previous.map((project) => [projectCwdKey(project.cwd), project] as const),
  );
  const previousOrderById = new Map(previous.map((project, index) => [project.id, index] as const));
  const previousOrderByCwd = new Map(
    previous.map((project, index) => [projectCwdKey(project.cwd), index] as const),
  );
  const persistedOrderByCwd = new Map(
    persistedProjectOrderCwds.map((cwd, index) => [cwd, index] as const),
  );
  const usePersistedOrder = previous.length === 0;

  const mappedProjects = incoming
    .map((project) => {
      const existing =
        previousById.get(project.id) ?? previousByCwd.get(projectCwdKey(project.workspaceRoot));
      return normalizeProjectFromReadModel(project, existing);
    })
    .map((project, incomingIndex) => {
      const previousIndex =
        previousOrderById.get(project.id) ?? previousOrderByCwd.get(projectCwdKey(project.cwd));
      const persistedIndex = usePersistedOrder
        ? persistedOrderByCwd.get(projectCwdKey(project.cwd))
        : undefined;
      const orderIndex =
        previousIndex ??
        persistedIndex ??
        (usePersistedOrder ? persistedProjectOrderCwds.length : previous.length) + incomingIndex;
      return { project, incomingIndex, orderIndex };
    })
    .toSorted((a, b) => {
      const byOrder = a.orderIndex - b.orderIndex;
      if (byOrder !== 0) return byOrder;
      return a.incomingIndex - b.incomingIndex;
    })
    .map((entry) => entry.project);

  return arraysShallowEqual(previous, mappedProjects) ? previous : mappedProjects;
}

function mapProjectsFromShellSnapshot(
  incoming: OrchestrationShellSnapshot["projects"],
  previous: Project[],
): Project[] {
  const previousById = new Map(previous.map((project) => [project.id, project] as const));
  const previousByCwd = new Map(
    previous.map((project) => [projectCwdKey(project.cwd), project] as const),
  );
  const previousOrderById = new Map(previous.map((project, index) => [project.id, index] as const));
  const previousOrderByCwd = new Map(
    previous.map((project, index) => [projectCwdKey(project.cwd), index] as const),
  );
  const persistedOrderByCwd = new Map(
    persistedProjectOrderCwds.map((cwd, index) => [cwd, index] as const),
  );
  const usePersistedOrder = previous.length === 0;

  const mappedProjects = incoming
    .map((project) => {
      const existing =
        previousById.get(project.id) ?? previousByCwd.get(projectCwdKey(project.workspaceRoot));
      return normalizeProjectFromShell(project, existing);
    })
    .map((project, incomingIndex) => {
      const previousIndex =
        previousOrderById.get(project.id) ?? previousOrderByCwd.get(projectCwdKey(project.cwd));
      const persistedIndex = usePersistedOrder
        ? persistedOrderByCwd.get(projectCwdKey(project.cwd))
        : undefined;
      const orderIndex =
        previousIndex ??
        persistedIndex ??
        (usePersistedOrder ? persistedProjectOrderCwds.length : previous.length) + incomingIndex;
      return { project, incomingIndex, orderIndex };
    })
    .toSorted((a, b) => {
      const byOrder = a.orderIndex - b.orderIndex;
      if (byOrder !== 0) return byOrder;
      return a.incomingIndex - b.incomingIndex;
    })
    .map((entry) => entry.project);

  return arraysShallowEqual(previous, mappedProjects) ? previous : mappedProjects;
}

function toLegacySessionStatus(
  status: OrchestrationSessionStatus,
): "connecting" | "ready" | "running" | "error" | "closed" {
  switch (status) {
    case "starting":
      return "connecting";
    case "running":
      return "running";
    case "error":
      return "error";
    case "ready":
    case "interrupted":
      return "ready";
    case "idle":
    case "stopped":
      return "closed";
  }
}

function toLegacyProvider(providerName: string | null): ProviderKind {
  if (
    providerName === "codex" ||
    providerName === "claudeAgent" ||
    providerName === "cursor" ||
    providerName === "gemini" ||
    providerName === "grok" ||
    providerName === "kilo" ||
    providerName === "opencode" ||
    providerName === "pi"
  ) {
    return providerName;
  }
  return "codex";
}

function attachmentPreviewRoutePath(attachmentId: string): string {
  return `/attachments/${encodeURIComponent(attachmentId)}`;
}

function resolveThreadSidebarMetadata(
  thread: Thread,
): Pick<
  SidebarThreadSummary,
  | "latestUserMessageAt"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "hasActionableProposedPlan"
  | "hasLiveTailWork"
> {
  const needsDerivedMetadata =
    thread.latestUserMessageAt === undefined ||
    thread.hasPendingApprovals === undefined ||
    thread.hasPendingUserInput === undefined ||
    thread.hasActionableProposedPlan === undefined;
  const derivedMetadata = needsDerivedMetadata
    ? deriveThreadSummaryMetadata({
        messages: thread.messages,
        activities: thread.activities,
        proposedPlans: thread.proposedPlans,
        latestTurn: thread.latestTurn,
      })
    : null;

  return {
    latestUserMessageAt: thread.latestUserMessageAt ?? derivedMetadata?.latestUserMessageAt ?? null,
    hasPendingApprovals:
      thread.hasPendingApprovals ?? derivedMetadata?.hasPendingApprovals ?? false,
    hasPendingUserInput:
      thread.hasPendingUserInput ?? derivedMetadata?.hasPendingUserInput ?? false,
    hasActionableProposedPlan:
      thread.hasActionableProposedPlan ?? derivedMetadata?.hasActionableProposedPlan ?? false,
    hasLiveTailWork: Boolean(
      hasLiveTurnTailWork({
        latestTurn: thread.latestTurn,
        messages: thread.messages,
        activities: thread.activities,
        session: thread.session,
      }),
    ),
  };
}

function threadMessageUpdatesSummary(event: ThreadMessageSentEvent): boolean {
  return event.payload.role === "user";
}

function threadActivityUpdatesSummary(event: ThreadActivityAppendedEvent): boolean {
  return THREAD_SUMMARY_ACTIVITY_KINDS.has(event.payload.activity.kind);
}

// 渚ц竟鏍忔憳瑕佸彲璺熼殢鍥炲悎杈圭晫鏇存柊锛屼絾涓嶅搷搴旀瘡涓祦寮忓姪鎵嬪閲忋€?function threadMessageUpdatesSidebarSummary(event: ThreadMessageSentEvent): boolean {
  return event.payload.role === "user" || !event.payload.streaming;
}

function resolveThreadSummaryAfterUserInputResponseRequested(
  thread: Thread,
  event: ThreadUserInputResponseRequestedEvent,
) {
  return deriveThreadSummaryMetadata({
    messages: thread.messages,
    activities: [
      ...thread.activities,
      {
        id: `synthetic-user-input-resolved:${event.payload.requestId}:${event.sequence}` as EventId,
        kind: "user-input.resolved",
        payload: {
          requestId: event.payload.requestId,
        },
        createdAt: event.payload.createdAt,
      },
    ],
    proposedPlans: thread.proposedPlans,
    latestTurn: thread.latestTurn,
  });
}

function resolveThreadSummaryAfterApprovalResponseRequested(
  thread: Thread,
  event: ThreadApprovalResponseRequestedEvent,
) {
  return deriveThreadSummaryMetadata({
    messages: thread.messages,
    activities: [
      ...thread.activities,
      {
        id: `synthetic-approval-resolved:${event.payload.requestId}:${event.sequence}` as EventId,
        kind: "approval.resolved",
        payload: {
          requestId: event.payload.requestId,
          decision: event.payload.decision,
        },
        createdAt: event.payload.createdAt,
        sequence: event.sequence,
      },
    ],
    proposedPlans: thread.proposedPlans,
    latestTurn: thread.latestTurn,
  });
}

function sidebarThreadSummariesEqual(
  left: SidebarThreadSummary | undefined,
  right: SidebarThreadSummary,
): boolean {
  return (
    left !== undefined &&
    left.id === right.id &&
    left.projectId === right.projectId &&
    left.title === right.title &&
    left.modelSelection === right.modelSelection &&
    left.interactionMode === right.interactionMode &&
    left.envMode === right.envMode &&
    left.branch === right.branch &&
    left.worktreePath === right.worktreePath &&
    left.session === right.session &&
    left.createdAt === right.createdAt &&
    (left.archivedAt ?? null) === (right.archivedAt ?? null) &&
    left.updatedAt === right.updatedAt &&
    (left.isPinned ?? false) === (right.isPinned ?? false) &&
    left.latestTurn === right.latestTurn &&
    left.lastVisitedAt === right.lastVisitedAt &&
    (left.parentThreadId ?? null) === (right.parentThreadId ?? null) &&
    (left.subagentAgentId ?? null) === (right.subagentAgentId ?? null) &&
    (left.subagentNickname ?? null) === (right.subagentNickname ?? null) &&
    (left.subagentRole ?? null) === (right.subagentRole ?? null) &&
    left.latestUserMessageAt === right.latestUserMessageAt &&
    left.hasPendingApprovals === right.hasPendingApprovals &&
    left.hasPendingUserInput === right.hasPendingUserInput &&
    left.hasActionableProposedPlan === right.hasActionableProposedPlan &&
    left.hasLiveTailWork === right.hasLiveTailWork &&
    (left.forkSourceThreadId ?? null) === (right.forkSourceThreadId ?? null) &&
    (left.sidechatSourceThreadId ?? null) === (right.sidechatSourceThreadId ?? null) &&
    deepEqualJson(left.lastKnownPr ?? null, right.lastKnownPr ?? null) &&
    (left.handoff ?? null) === (right.handoff ?? null)
  );
}

// 淇濇寔渚ц竟鏍忚鐘舵€佽交閲忥紝浣垮疄鏃剁嚎绋嬫洿鏂颁笉浼氬己鍒惰缁勪欢
// 鍦ㄦ瘡娆℃覆鏌撴椂閲嶆柊鎵弿姣忎釜绾跨▼鐨勬秷鎭?娲诲姩闆嗗悎銆?function buildSidebarThreadSummary(
  thread: Thread,
  previous?: SidebarThreadSummary,
): SidebarThreadSummary {
  const metadata = resolveThreadSidebarMetadata(thread);
  const nextSummary: SidebarThreadSummary = {
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection: thread.modelSelection,
    interactionMode: thread.interactionMode,
    envMode: thread.envMode,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    session: thread.session,
    createdAt: thread.createdAt,
    archivedAt: thread.archivedAt ?? null,
    updatedAt: thread.updatedAt,
    isPinned: thread.isPinned ?? false,
    latestTurn: thread.latestTurn,
    lastVisitedAt: thread.lastVisitedAt,
    parentThreadId: thread.parentThreadId ?? null,
    subagentAgentId: thread.subagentAgentId ?? null,
    subagentNickname: thread.subagentNickname ?? null,
    subagentRole: thread.subagentRole ?? null,
    latestUserMessageAt: metadata.latestUserMessageAt,
    hasPendingApprovals: metadata.hasPendingApprovals,
    hasPendingUserInput: metadata.hasPendingUserInput,
    hasActionableProposedPlan: metadata.hasActionableProposedPlan,
    hasLiveTailWork: metadata.hasLiveTailWork,
    forkSourceThreadId: thread.forkSourceThreadId ?? null,
    sidechatSourceThreadId: thread.sidechatSourceThreadId ?? null,
    lastKnownPr: thread.lastKnownPr ?? null,
    handoff: thread.handoff ?? null,
  };
  if (previous && sidebarThreadSummariesEqual(previous, nextSummary)) {
    return previous;
  }
  return nextSummary;
}

function ensureThreadRegistered(state: AppState, threadId: ThreadId): AppState {
  const threadIds = state.threadIds ?? EMPTY_THREAD_IDS;
  if (threadIds.includes(threadId)) {
    return state;
  }
  return {
    ...state,
    threadIds: [...threadIds, threadId],
  };
}

function retainThreadScopedRecord<T>(
  record: Record<ThreadId, T> | undefined,
  nextThreadIds: ReadonlySet<ThreadId>,
): Record<ThreadId, T> {
  if (!record) {
    return {};
  }
  let changed = false;
  const nextRecord: Record<ThreadId, T> = {};
  for (const [threadId, value] of Object.entries(record) as [ThreadId, T][]) {
    if (!nextThreadIds.has(threadId)) {
      changed = true;
      continue;
    }
    nextRecord[threadId] = value;
  }
  return changed ? nextRecord : record;
}

function writeThreadShellProjection(
  state: AppState,
  nextThread: {
    shell: ThreadShell;
    session: ThreadSession | null;
    turnState: ThreadTurnState;
  },
): AppState {
  const previousShell = state.threadShellById?.[nextThread.shell.id];
  let nextState = ensureThreadRegistered(state, nextThread.shell.id);

  if (!threadShellsEqual(previousShell, nextThread.shell)) {
    nextState = {
      ...nextState,
      threadShellById: {
        ...(nextState.threadShellById ?? EMPTY_THREAD_SHELL_BY_ID),
        [nextThread.shell.id]: nextThread.shell,
      },
    };
  }

  if (
    !threadSessionsEqual(
      (nextState.threadSessionById ?? EMPTY_THREAD_SESSION_BY_ID)[nextThread.shell.id] ?? null,
      nextThread.session,
    )
  ) {
    nextState = {
      ...nextState,
      threadSessionById: {
        ...(nextState.threadSessionById ?? EMPTY_THREAD_SESSION_BY_ID),
        [nextThread.shell.id]: nextThread.session,
      },
    };
  }

  if (
    !threadTurnStatesEqual(
      (nextState.threadTurnStateById ?? EMPTY_THREAD_TURN_STATE_BY_ID)[nextThread.shell.id],
      nextThread.turnState,
    )
  ) {
    nextState = {
      ...nextState,
      threadTurnStateById: {
        ...(nextState.threadTurnStateById ?? EMPTY_THREAD_TURN_STATE_BY_ID),
        [nextThread.shell.id]: nextThread.turnState,
      },
    };
  }

  return nextState;
}

// 璇︽儏鍐欏叆淇濇寔娲昏穬绾跨▼鍒囩墖鏈€鏂帮紝浣嗕晶杈规爮鎽樿鐢?shell 绠＄悊锛?// 閬垮厤娲昏穬鑱婂ぉ杞綍鐨勯珮棰戝彉鍔ㄦ墿鏁ｅ埌瀵艰埅鏍戙€?function writeThreadState(state: AppState, nextThread: Thread, previousThread?: Thread): AppState {
  const nextShell = toThreadShell(nextThread);
  const nextTurnState = toThreadTurnState(nextThread);
  const previousShell = state.threadShellById?.[nextThread.id];
  const previousTurnState = state.threadTurnStateById?.[nextThread.id];

  let nextState = ensureThreadRegistered(state, nextThread.id);

  if (!threadShellsEqual(previousShell, nextShell)) {
    nextState = {
      ...nextState,
      threadShellById: {
        ...(nextState.threadShellById ?? EMPTY_THREAD_SHELL_BY_ID),
        [nextThread.id]: nextShell,
      },
    };
  }

  if (!threadSessionsEqual(previousThread?.session ?? null, nextThread.session)) {
    nextState = {
      ...nextState,
      threadSessionById: {
        ...(nextState.threadSessionById ?? EMPTY_THREAD_SESSION_BY_ID),
        [nextThread.id]: nextThread.session,
      },
    };
  }

  if (!threadTurnStatesEqual(previousTurnState, nextTurnState)) {
    nextState = {
      ...nextState,
      threadTurnStateById: {
        ...(nextState.threadTurnStateById ?? EMPTY_THREAD_TURN_STATE_BY_ID),
        [nextThread.id]: nextTurnState,
      },
    };
  }

  if (previousThread?.messages !== nextThread.messages) {
    const nextMessageSlice = buildMessageSlice(nextThread);
    nextState = {
      ...nextState,
      messageIdsByThreadId: {
        ...(nextState.messageIdsByThreadId ?? EMPTY_MESSAGE_IDS_BY_THREAD),
        [nextThread.id]: nextMessageSlice.ids,
      },
      messageByThreadId: {
        ...(nextState.messageByThreadId ?? EMPTY_MESSAGE_BY_THREAD),
        [nextThread.id]: nextMessageSlice.byId,
      },
    };
  }

  if (previousThread?.activities !== nextThread.activities) {
    const nextActivitySlice = buildActivitySlice(nextThread);
    nextState = {
      ...nextState,
      activityIdsByThreadId: {
        ...(nextState.activityIdsByThreadId ?? EMPTY_ACTIVITY_IDS_BY_THREAD),
        [nextThread.id]: nextActivitySlice.ids,
      },
      activityByThreadId: {
        ...(nextState.activityByThreadId ?? EMPTY_ACTIVITY_BY_THREAD),
        [nextThread.id]: nextActivitySlice.byId,
      },
    };
  }

  if (previousThread?.proposedPlans !== nextThread.proposedPlans) {
    const nextProposedPlanSlice = buildProposedPlanSlice(nextThread);
    nextState = {
      ...nextState,
      proposedPlanIdsByThreadId: {
        ...(nextState.proposedPlanIdsByThreadId ?? EMPTY_PROPOSED_PLAN_IDS_BY_THREAD),
        [nextThread.id]: nextProposedPlanSlice.ids,
      },
      proposedPlanByThreadId: {
        ...(nextState.proposedPlanByThreadId ?? EMPTY_PROPOSED_PLAN_BY_THREAD),
        [nextThread.id]: nextProposedPlanSlice.byId,
      },
    };
  }

  if (previousThread?.turnDiffSummaries !== nextThread.turnDiffSummaries) {
    const nextTurnDiffSlice = buildTurnDiffSlice(nextThread);
    nextState = {
      ...nextState,
      turnDiffIdsByThreadId: {
        ...(nextState.turnDiffIdsByThreadId ?? EMPTY_TURN_DIFF_IDS_BY_THREAD),
        [nextThread.id]: nextTurnDiffSlice.ids,
      },
      turnDiffSummaryByThreadId: {
        ...(nextState.turnDiffSummaryByThreadId ?? EMPTY_TURN_DIFF_BY_THREAD),
        [nextThread.id]: nextTurnDiffSlice.byId,
      },
    };
  }

  return nextState;
}

function removeThreadState(state: AppState, threadId: ThreadId): AppState {
  const { [threadId]: _removedShell, ...threadShellById } =
    state.threadShellById ?? EMPTY_THREAD_SHELL_BY_ID;
  const { [threadId]: _removedSession, ...threadSessionById } =
    state.threadSessionById ?? EMPTY_THREAD_SESSION_BY_ID;
  const { [threadId]: _removedTurnState, ...threadTurnStateById } =
    state.threadTurnStateById ?? EMPTY_THREAD_TURN_STATE_BY_ID;
  const { [threadId]: _removedMessageIds, ...messageIdsByThreadId } =
    state.messageIdsByThreadId ?? EMPTY_MESSAGE_IDS_BY_THREAD;
  const { [threadId]: _removedMessages, ...messageByThreadId } =
    state.messageByThreadId ?? EMPTY_MESSAGE_BY_THREAD;
  const { [threadId]: _removedActivityIds, ...activityIdsByThreadId } =
    state.activityIdsByThreadId ?? EMPTY_ACTIVITY_IDS_BY_THREAD;
  const { [threadId]: _removedActivities, ...activityByThreadId } =
    state.activityByThreadId ?? EMPTY_ACTIVITY_BY_THREAD;
  const { [threadId]: _removedPlanIds, ...proposedPlanIdsByThreadId } =
    state.proposedPlanIdsByThreadId ?? EMPTY_PROPOSED_PLAN_IDS_BY_THREAD;
  const { [threadId]: _removedPlans, ...proposedPlanByThreadId } =
    state.proposedPlanByThreadId ?? EMPTY_PROPOSED_PLAN_BY_THREAD;
  const { [threadId]: _removedDiffIds, ...turnDiffIdsByThreadId } =
    state.turnDiffIdsByThreadId ?? EMPTY_TURN_DIFF_IDS_BY_THREAD;
  const { [threadId]: _removedDiffs, ...turnDiffSummaryByThreadId } =
    state.turnDiffSummaryByThreadId ?? EMPTY_TURN_DIFF_BY_THREAD;
  const { [threadId]: _removedSummary, ...sidebarThreadSummaryById } =
    state.sidebarThreadSummaryById;
  const nextThreadIds = (state.threadIds ?? EMPTY_THREAD_IDS).filter((id) => id !== threadId);
  const nextThreads = state.threads.filter((thread) => thread.id !== threadId);

  if (
    nextThreadIds === state.threadIds &&
    nextThreads === state.threads &&
    sidebarThreadSummaryById === state.sidebarThreadSummaryById
  ) {
    return state;
  }

  return {
    ...state,
    threadIds: nextThreadIds,
    threadShellById,
    threadSessionById,
    threadTurnStateById,
    messageIdsByThreadId,
    messageByThreadId,
    activityIdsByThreadId,
    activityByThreadId,
    proposedPlanIdsByThreadId,
    proposedPlanByThreadId,
    turnDiffIdsByThreadId,
    turnDiffSummaryByThreadId,
    sidebarThreadSummaryById,
    threads: nextThreads,
  };
}

// Drop a project and any thread-scoped state that still points at it.
function removeProjectState(state: AppState, projectId: Project["id"]): AppState {
  const threadIds = new Set<ThreadId>();
  for (const thread of state.threads) {
    if (thread.projectId === projectId) {
      threadIds.add(thread.id);
    }
  }
  for (const shell of Object.values(state.threadShellById ?? EMPTY_THREAD_SHELL_BY_ID)) {
    if (shell.projectId === projectId) {
      threadIds.add(shell.id);
    }
  }

  const nextProjects = state.projects.filter((project) => project.id !== projectId);
  const nextState = [...threadIds].reduce((currentState, threadId) => {
    return removeThreadState(currentState, threadId);
  }, state);

  if (nextProjects === state.projects && nextState === state) {
    return state;
  }

  return nextProjects === nextState.projects
    ? nextState
    : {
        ...nextState,
        projects: nextProjects,
      };
}

function commitThreadProjection(
  state: AppState,
  threadId: ThreadId,
  options?: {
    updateThreadArray?: boolean;
    updateSidebarSummary?: boolean;
  },
): AppState {
  const nextThread = getThreadFromState(state, threadId);
  const previousThread = state.threads.find((thread) => thread.id === threadId);
  if (!nextThread) {
    return state;
  }

// 璁╃儹璺緞璇︽儏鍚屾璺宠繃鏁扮粍鍙樺姩锛屼笉寮哄埗渚ц竟鏍忔墍鏈夋潈鍥炲埌绾跨▼璇︽儏璺緞銆?const shouldUpdateThreadArray = options?.updateThreadArray ?? true;
  const shouldUpdateSidebarSummary = options?.updateSidebarSummary ?? true;
  const threadExists = previousThread !== undefined;
  const threads = shouldUpdateThreadArray
    ? threadExists
      ? updateThread(state.threads, threadId, (thread) =>
          nextThread === thread ? thread : nextThread,
        )
      : [...state.threads, nextThread]
    : state.threads;

  const previousSummary = state.sidebarThreadSummaryById[threadId];
  const nextSummary =
    shouldUpdateSidebarSummary || previousSummary === undefined
      ? buildSidebarThreadSummary(nextThread, previousSummary)
      : previousSummary;

  if (threads === state.threads && nextSummary === previousSummary) {
    return state;
  }

  return {
    ...state,
    threads,
    sidebarThreadSummaryById:
      nextSummary === previousSummary || nextSummary === undefined
        ? state.sidebarThreadSummaryById
        : {
            ...state.sidebarThreadSummaryById,
            [threadId]: nextSummary,
          },
  };
}

function normalizeSingleTurnDiffSummary(
  incoming: Thread["turnDiffSummaries"][number],
  previous: Thread["turnDiffSummaries"][number] | undefined,
): Thread["turnDiffSummaries"][number] {
  const files = normalizeTurnDiffFiles(incoming.files, previous?.files);
  if (
    previous &&
    previous.turnId === incoming.turnId &&
    previous.completedAt === incoming.completedAt &&
    previous.status === incoming.status &&
    previous.assistantMessageId === incoming.assistantMessageId &&
    previous.checkpointTurnCount === incoming.checkpointTurnCount &&
    previous.checkpointRef === incoming.checkpointRef &&
    previous.files === files
  ) {
    return previous;
  }
  return {
    ...incoming,
    files,
  };
}

function sortTurnDiffSummaries(
  summaries: ReadonlyArray<Thread["turnDiffSummaries"][number]>,
): Thread["turnDiffSummaries"] {
  return [...summaries].toSorted(
    (left, right) =>
      (left.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER) -
        (right.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER) ||
      left.completedAt.localeCompare(right.completedAt) ||
      left.turnId.localeCompare(right.turnId),
  );
}

function checkpointStatusToLatestTurnState(
  status: Thread["turnDiffSummaries"][number]["status"],
): NonNullable<Thread["latestTurn"]>["state"] {
  if (status === "error") {
    return "error";
  }
  if (status === "missing") {
    return "interrupted";
  }
  return "completed";
}

function isProviderDiffPlaceholderRef(checkpointRef: string | null | undefined): boolean {
  return checkpointRef?.startsWith("provider-diff:") === true;
}

// 鍦ㄦ彁璁鍒掑叧鑱旂殑瀹炴椂鍥炲悎鏇存柊涓繚鐣欏叧鑱旓紝鐩村埌蹇収杩戒笂銆?function buildLatestTurn(params: {
  previous: Thread["latestTurn"];
  turnId: NonNullable<Thread["latestTurn"]>["turnId"];
  state: NonNullable<Thread["latestTurn"]>["state"];
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  assistantMessageId: NonNullable<Thread["latestTurn"]>["assistantMessageId"];
  sourceProposedPlan?: Thread["pendingSourceProposedPlan"];
}): NonNullable<Thread["latestTurn"]> {
  const sourceProposedPlan =
    params.previous?.turnId === params.turnId
      ? (params.previous.sourceProposedPlan ?? params.sourceProposedPlan)
      : params.sourceProposedPlan;
  return {
    turnId: params.turnId,
    state: params.state,
    requestedAt: params.requestedAt,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    assistantMessageId: params.assistantMessageId,
    ...(sourceProposedPlan ? { sourceProposedPlan } : {}),
  };
}

function reconcileLatestTurnFromSession(
  thread: Thread,
  session: NonNullable<ReadModelThread["session"]>,
  error: string | null,
): Thread["latestTurn"] {
  if (session.status === "running" && session.activeTurnId !== null) {
    return buildLatestTurn({
      previous: thread.latestTurn,
      turnId: session.activeTurnId,
      state: "running",
      requestedAt:
        thread.latestTurn?.turnId === session.activeTurnId
          ? thread.latestTurn.requestedAt
          : session.updatedAt,
      startedAt:
        thread.latestTurn?.turnId === session.activeTurnId
          ? (thread.latestTurn.startedAt ?? session.updatedAt)
          : session.updatedAt,
      completedAt: null,
      assistantMessageId:
        thread.latestTurn?.turnId === session.activeTurnId
          ? thread.latestTurn.assistantMessageId
          : null,
      sourceProposedPlan: thread.pendingSourceProposedPlan,
    });
  }

  if (session.status === "error" && thread.latestTurn?.state === "running") {
    return buildLatestTurn({
      previous: thread.latestTurn,
      turnId: thread.latestTurn.turnId,
      state: "error",
      requestedAt: thread.latestTurn.requestedAt,
      startedAt: thread.latestTurn.startedAt,
      completedAt: session.updatedAt,
      assistantMessageId: thread.latestTurn.assistantMessageId,
      sourceProposedPlan: thread.pendingSourceProposedPlan,
    });
  }

  void error;
  return thread.latestTurn;
}

function rebindTurnDiffSummariesForAssistantMessage(
  turnDiffSummaries: ReadonlyArray<Thread["turnDiffSummaries"][number]>,
  turnId: Thread["turnDiffSummaries"][number]["turnId"],
  assistantMessageId: NonNullable<Thread["latestTurn"]>["assistantMessageId"],
): Thread["turnDiffSummaries"] {
  let changed = false;
  const nextSummaries = turnDiffSummaries.map((summary) => {
    if (summary.turnId !== turnId || summary.assistantMessageId === assistantMessageId) {
      return summary;
    }
    changed = true;
    return {
      ...summary,
      assistantMessageId: assistantMessageId ?? undefined,
    };
  });
  return changed ? nextSummaries : [...turnDiffSummaries];
}

function retainThreadMessagesAfterRevert(
  messages: ReadonlyArray<ChatMessage>,
  retainedTurnIds: ReadonlySet<string>,
  turnCount: number,
): ChatMessage[] {
  const retainedMessageIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "system") {
      retainedMessageIds.add(message.id);
      continue;
    }
    if (
      message.turnId !== undefined &&
      message.turnId !== null &&
      retainedTurnIds.has(message.turnId)
    ) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedUserCount = messages.filter(
    (message) => message.role === "user" && retainedMessageIds.has(message.id),
  ).length;
  const missingUserCount = Math.max(0, turnCount - retainedUserCount);
  if (missingUserCount > 0) {
    const fallbackUserMessages = messages
      .filter(
        (message) =>
          message.role === "user" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === undefined ||
            message.turnId === null ||
            retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingUserCount);
    for (const message of fallbackUserMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedAssistantCount = messages.filter(
    (message) => message.role === "assistant" && retainedMessageIds.has(message.id),
  ).length;
  const missingAssistantCount = Math.max(0, turnCount - retainedAssistantCount);
  if (missingAssistantCount > 0) {
    const fallbackAssistantMessages = messages
      .filter(
        (message) =>
          message.role === "assistant" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === undefined ||
            message.turnId === null ||
            retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingAssistantCount);
    for (const message of fallbackAssistantMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  return messages.filter((message) => retainedMessageIds.has(message.id));
}

function retainThreadActivitiesAfterRevert(
  activities: ReadonlyArray<Thread["activities"][number]>,
  retainedTurnIds: ReadonlySet<string>,
): Thread["activities"] {
  return activities.filter(
    (activity) => activity.turnId === null || retainedTurnIds.has(activity.turnId),
  );
}

function retainThreadProposedPlansAfterRevert(
  proposedPlans: ReadonlyArray<Thread["proposedPlans"][number]>,
  retainedTurnIds: ReadonlySet<string>,
): Thread["proposedPlans"] {
  return proposedPlans.filter(
    (proposedPlan) => proposedPlan.turnId === null || retainedTurnIds.has(proposedPlan.turnId),
  );
}

function rollbackThreadMessagesFromMessage(
  messages: ReadonlyArray<ChatMessage>,
  messageId: string,
): {
  readonly messages: ChatMessage[];
  readonly removedTurnIds: ReadonlySet<string>;
} {
  const targetIndex = messages.findIndex((message) => message.id === messageId);
  if (targetIndex < 0) {
    return { messages: [...messages], removedTurnIds: new Set() };
  }

  const removedMessages = messages.slice(targetIndex);
  return {
    messages: messages.slice(0, targetIndex),
    removedTurnIds: new Set(
      removedMessages.flatMap((message) =>
        message.turnId === undefined || message.turnId === null ? [] : [message.turnId],
      ),
    ),
  };
}

function applyTurnDiffSummaryToThread(
  thread: Thread,
  summary: Thread["turnDiffSummaries"][number],
): Thread {
  const previousSummary = thread.turnDiffSummaries.find(
    (existingSummary) => existingSummary.turnId === summary.turnId,
  );
  const nextSummary = normalizeSingleTurnDiffSummary(summary, previousSummary);
  if (previousSummary && previousSummary.status !== "missing" && nextSummary.status === "missing") {
    return thread;
  }
  const turnDiffSummaries = previousSummary
    ? thread.turnDiffSummaries.map((existingSummary) =>
        existingSummary.turnId === nextSummary.turnId ? nextSummary : existingSummary,
      )
    : sortTurnDiffSummaries([...thread.turnDiffSummaries, nextSummary]);

  const isActivePlaceholder =
    isProviderDiffPlaceholderRef(nextSummary.checkpointRef) &&
    nextSummary.status === "missing" &&
    thread.latestTurn?.turnId === nextSummary.turnId &&
    thread.latestTurn.state === "running";
  const latestTurn =
    thread.latestTurn === null || thread.latestTurn.turnId === nextSummary.turnId
      ? isActivePlaceholder
        ? thread.latestTurn
        : buildLatestTurn({
            previous: thread.latestTurn,
            turnId: nextSummary.turnId,
            state: checkpointStatusToLatestTurnState(nextSummary.status),
            requestedAt: thread.latestTurn?.requestedAt ?? nextSummary.completedAt,
            startedAt: thread.latestTurn?.startedAt ?? nextSummary.completedAt,
            completedAt: nextSummary.completedAt,
            // 浼樺厛浣跨敤浼犲叆鐨?assistantMessageId锛涘惁鍒欎繚鐣欏悓涓€鍥炲悎鐨勬棫鍊笺€?            // 鍥炲悎宸紓浜嬩欢鍙兘鍦ㄦ秷鎭渶缁堢‘瀹氬墠鍒拌揪骞舵惡甯?null id鈥斺€?            // 瀹冧滑涓嶈兘鎶归櫎宸茶 thread.message-sent 璁板綍鐨勭湡瀹?id銆?            assistantMessageId:
              nextSummary.assistantMessageId ??
              (thread.latestTurn?.turnId === nextSummary.turnId
                ? thread.latestTurn.assistantMessageId
                : null) ??
              null,
            sourceProposedPlan: thread.pendingSourceProposedPlan,
          })
      : thread.latestTurn;

  if (
    previousSummary === nextSummary &&
    turnDiffSummaries === thread.turnDiffSummaries &&
    latestTurn === thread.latestTurn &&
    (thread.updatedAt ?? thread.createdAt) >= nextSummary.completedAt
  ) {
    return thread;
  }

  return {
    ...thread,
    turnDiffSummaries:
      arraysShallowEqual(thread.turnDiffSummaries, turnDiffSummaries) &&
      thread.turnDiffSummaries.length === turnDiffSummaries.length
        ? thread.turnDiffSummaries
        : turnDiffSummaries,
    latestTurn,
    updatedAt:
      (thread.updatedAt ?? thread.createdAt) > nextSummary.completedAt
        ? thread.updatedAt
        : nextSummary.completedAt,
  };
}

function deriveThreadStateSignals(
  thread: Thread,
): Pick<
  Thread,
  | "latestUserMessageAt"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "hasActionableProposedPlan"
> {
  const metadata = deriveThreadSummaryMetadata({
    messages: thread.messages,
    activities: thread.activities,
    proposedPlans: thread.proposedPlans,
    latestTurn: thread.latestTurn,
  });
  return {
    latestUserMessageAt: metadata.latestUserMessageAt,
    hasPendingApprovals: metadata.hasPendingApprovals,
    hasPendingUserInput: metadata.hasPendingUserInput,
    hasActionableProposedPlan: metadata.hasActionableProposedPlan,
  };
}

function withDerivedThreadStateSignals(thread: Thread): Thread {
  const nextSignals = deriveThreadStateSignals(thread);
  if (
    thread.latestUserMessageAt === nextSignals.latestUserMessageAt &&
    thread.hasPendingApprovals === nextSignals.hasPendingApprovals &&
    thread.hasPendingUserInput === nextSignals.hasPendingUserInput &&
    thread.hasActionableProposedPlan === nextSignals.hasActionableProposedPlan
  ) {
    return thread;
  }
  return {
    ...thread,
    ...nextSignals,
  };
}

function applyThreadUpdate(
  state: AppState,
  threadId: ThreadId,
  updater: (thread: Thread) => Thread,
  options?: {
    updateThreadArray?: boolean;
    recomputeSummarySignals?: boolean;
    updateSidebarSummary?: boolean;
  },
): AppState {
  const currentThread =
    getThreadFromState(state, threadId) ?? state.threads.find((thread) => thread.id === threadId);
  if (!currentThread) {
    return state;
  }
  const updatedThread =
    options?.recomputeSummarySignals === false
      ? updater(currentThread)
      : withDerivedThreadStateSignals(updater(currentThread));
  if (updatedThread === currentThread) {
    return state;
  }
  return commitThreadProjection(writeThreadState(state, updatedThread, currentThread), threadId, {
    updateThreadArray: options?.updateThreadArray ?? true,
    updateSidebarSummary: options?.updateSidebarSummary ?? true,
  });
}

function mergeStreamingMessage(
  existingMessage: ChatMessage,
  incomingMessage: ChatMessage,
): ChatMessage | null {
  let nextText: string;
  if (
    existingMessage.role === "user" &&
    incomingMessage.role === "user" &&
    !incomingMessage.streaming
  ) {
    nextText = incomingMessage.text;
  } else if (incomingMessage.streaming || incomingMessage.text.length === 0) {
    nextText = `${existingMessage.text}${incomingMessage.text}`;
  } else if (incomingMessage.text.startsWith(existingMessage.text)) {
    nextText = incomingMessage.text;
  } else if (existingMessage.text.startsWith(incomingMessage.text)) {
    nextText = existingMessage.text;
  } else {
    nextText = `${existingMessage.text}${incomingMessage.text}`;
  }
  const nextAttachments = incomingMessage.attachments ?? existingMessage.attachments;
  const nextCompletedAt = incomingMessage.streaming
    ? existingMessage.completedAt
    : (incomingMessage.completedAt ?? existingMessage.completedAt);
  const nextTurnId =
    incomingMessage.turnId !== undefined ? incomingMessage.turnId : existingMessage.turnId;
  const nextDispatchMode =
    incomingMessage.dispatchMode !== undefined
      ? incomingMessage.dispatchMode
      : existingMessage.dispatchMode;
  const nextSource = incomingMessage.source ?? existingMessage.source;

  if (
    existingMessage.text === nextText &&
    existingMessage.streaming === incomingMessage.streaming &&
    existingMessage.attachments === nextAttachments &&
    existingMessage.completedAt === nextCompletedAt &&
    existingMessage.turnId === nextTurnId &&
    existingMessage.dispatchMode === nextDispatchMode &&
    existingMessage.source === nextSource
  ) {
    return null;
  }

  return {
    ...existingMessage,
    text: nextText,
    streaming: incomingMessage.streaming,
    ...(nextAttachments ? { attachments: nextAttachments } : {}),
    ...(nextTurnId !== undefined ? { turnId: nextTurnId } : {}),
    ...(nextDispatchMode !== undefined ? { dispatchMode: nextDispatchMode } : {}),
    ...(nextSource !== undefined ? { source: nextSource } : {}),
    ...(nextCompletedAt !== undefined ? { completedAt: nextCompletedAt } : {}),
  };
}

function applyThreadMessageSentEvent(thread: Thread, event: ThreadMessageSentEvent): Thread {
  const payload = event.payload;
  const incomingMessage = normalizeChatMessage(
    {
      id: payload.messageId,
      role: payload.role,
      text: payload.text,
      dispatchMode: payload.dispatchMode,
      turnId: payload.turnId,
      attachments: payload.attachments ?? [],
      streaming: payload.streaming,
      source: payload.source,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    },
    thread.messages.find((message) => message.id === payload.messageId),
  );
  const existingIndex = thread.messages.findIndex((message) => message.id === payload.messageId);
  let messages = thread.messages;

  if (existingIndex >= 0) {
    const existingMessage = thread.messages[existingIndex];
    if (!existingMessage) {
      return thread;
    }
    const mergedMessage = mergeStreamingMessage(existingMessage, incomingMessage);
    if (mergedMessage !== null) {
      messages = thread.messages.map((message, index) =>
        index === existingIndex ? mergedMessage : message,
      );
    }
  } else {
    messages = [...thread.messages, incomingMessage].slice(-MAX_THREAD_MESSAGES);
  }

  const turnDiffSummaries =
    payload.role === "assistant" && payload.turnId !== null
      ? rebindTurnDiffSummariesForAssistantMessage(
          thread.turnDiffSummaries,
          payload.turnId,
          payload.messageId,
        )
      : thread.turnDiffSummaries;

  let latestTurn = thread.latestTurn;
  if (
    payload.role === "assistant" &&
    payload.turnId !== null &&
    (thread.latestTurn === null || thread.latestTurn.turnId === payload.turnId)
  ) {
    const previousTurn = thread.latestTurn;
    latestTurn = buildLatestTurn({
      previous: previousTurn,
      turnId: payload.turnId,
      state: payload.streaming
        ? "running"
        : previousTurn?.state === "interrupted"
          ? "interrupted"
          : previousTurn?.state === "error"
            ? "error"
            : "completed",
      requestedAt: previousTurn?.requestedAt ?? payload.createdAt,
      startedAt: previousTurn?.startedAt ?? payload.createdAt,
      completedAt: payload.streaming ? (previousTurn?.completedAt ?? null) : payload.updatedAt,
      assistantMessageId: payload.messageId,
      sourceProposedPlan: thread.pendingSourceProposedPlan,
    });
  }

  const updatedAt =
    thread.updatedAt && thread.updatedAt > payload.updatedAt ? thread.updatedAt : payload.updatedAt;
  if (
    messages === thread.messages &&
    turnDiffSummaries === thread.turnDiffSummaries &&
    latestTurn === thread.latestTurn &&
    updatedAt === thread.updatedAt
  ) {
    return thread;
  }

  return {
    ...thread,
    messages,
    turnDiffSummaries,
    latestTurn,
    updatedAt,
  };
}

function applyOrchestrationEvent(
  state: AppState,
  event: OrchestrationEvent,
  options?: {
    updateThreadArray?: boolean;
    updateSidebarSummary?: boolean;
  },
): AppState {
  switch (event.type) {
    case "project.created":
      return upsertProjectFromReadModel(state, {
        id: event.payload.projectId,
        kind: event.payload.kind,
        title: event.payload.title,
        workspaceRoot: event.payload.workspaceRoot,
        defaultModelSelection: event.payload.defaultModelSelection,
        scripts: event.payload.scripts,
        createdAt: event.payload.createdAt,
        updatedAt: event.payload.updatedAt,
        deletedAt: null,
      });

    case "project.meta-updated": {
      const existingProject = state.projects.find(
        (project) => project.id === event.payload.projectId,
      );
      if (!existingProject) {
        return state;
      }
      return upsertProjectFromReadModel(state, {
        id: existingProject.id,
        kind: event.payload.kind ?? existingProject.kind,
        title: event.payload.title ?? existingProject.remoteName,
        workspaceRoot: event.payload.workspaceRoot ?? existingProject.cwd,
        defaultModelSelection:
          event.payload.defaultModelSelection !== undefined
            ? event.payload.defaultModelSelection
            : existingProject.defaultModelSelection,
        scripts: event.payload.scripts ?? existingProject.scripts,
        createdAt: existingProject.createdAt ?? event.payload.updatedAt,
        updatedAt: event.payload.updatedAt,
        deletedAt: null,
      });
    }

    case "project.deleted": {
      const existingIndex = state.projects.findIndex(
        (project) => project.id === event.payload.projectId,
      );
      if (existingIndex < 0) {
        return state;
      }
      return {
        ...state,
        projects: state.projects.filter((project) => project.id !== event.payload.projectId),
      };
    }

    case "thread.meta-updated":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          const modelSelection =
            event.payload.modelSelection !== undefined
              ? normalizeModelSelection(event.payload.modelSelection, thread.modelSelection)
              : thread.modelSelection;
          const nextBranch =
            event.payload.branch !== undefined
              ? resolveThreadBranchRegressionGuard({
                  currentBranch: thread.branch,
                  nextBranch: event.payload.branch,
                })
              : thread.branch;
          const nextWorktreePath =
            event.payload.worktreePath !== undefined
              ? event.payload.worktreePath
              : thread.worktreePath;
          const nextAssociatedWorktreePath =
            event.payload.associatedWorktreePath !== undefined
              ? event.payload.associatedWorktreePath
              : (thread.associatedWorktreePath ?? null);
          const nextAssociatedWorktreeBranch =
            event.payload.associatedWorktreeBranch !== undefined
              ? event.payload.associatedWorktreeBranch
              : (thread.associatedWorktreeBranch ?? null);
          const nextAssociatedWorktreeRef =
            event.payload.associatedWorktreeRef !== undefined
              ? event.payload.associatedWorktreeRef
              : (thread.associatedWorktreeRef ?? null);
          const nextCreateBranchFlowCompleted = resolveCreateBranchFlowCompletedMerge({
            currentBranch: thread.branch,
            nextBranch,
            currentWorktreePath: thread.worktreePath,
            nextWorktreePath,
            currentAssociatedWorktreePath: thread.associatedWorktreePath,
            nextAssociatedWorktreePath,
            currentAssociatedWorktreeBranch: thread.associatedWorktreeBranch,
            nextAssociatedWorktreeBranch,
            currentAssociatedWorktreeRef: thread.associatedWorktreeRef,
            nextAssociatedWorktreeRef,
            currentCreateBranchFlowCompleted: thread.createBranchFlowCompleted,
            nextCreateBranchFlowCompleted: event.payload.createBranchFlowCompleted,
          });
          const nextUpdatedAt =
            (thread.updatedAt ?? thread.createdAt) > event.payload.updatedAt
              ? thread.updatedAt
              : event.payload.updatedAt;
          const cwdChanged = thread.worktreePath !== nextWorktreePath;

          if (
            (event.payload.title === undefined || event.payload.title === thread.title) &&
            modelSelection === thread.modelSelection &&
            (event.payload.envMode === undefined || event.payload.envMode === thread.envMode) &&
            nextBranch === thread.branch &&
            nextWorktreePath === thread.worktreePath &&
            nextAssociatedWorktreePath === (thread.associatedWorktreePath ?? null) &&
            nextAssociatedWorktreeBranch === (thread.associatedWorktreeBranch ?? null) &&
            nextAssociatedWorktreeRef === (thread.associatedWorktreeRef ?? null) &&
            nextCreateBranchFlowCompleted === (thread.createBranchFlowCompleted ?? false) &&
            (event.payload.isPinned === undefined ||
              event.payload.isPinned === (thread.isPinned ?? false)) &&
            (event.payload.parentThreadId === undefined ||
              (event.payload.parentThreadId ?? null) === (thread.parentThreadId ?? null)) &&
            (event.payload.subagentAgentId === undefined ||
              (event.payload.subagentAgentId ?? null) === (thread.subagentAgentId ?? null)) &&
            (event.payload.subagentNickname === undefined ||
              (event.payload.subagentNickname ?? null) === (thread.subagentNickname ?? null)) &&
            (event.payload.subagentRole === undefined ||
              (event.payload.subagentRole ?? null) === (thread.subagentRole ?? null)) &&
            (event.payload.lastKnownPr === undefined ||
              deepEqualJson(event.payload.lastKnownPr ?? null, thread.lastKnownPr ?? null)) &&
            (event.payload.handoff === undefined ||
              (event.payload.handoff ?? null) === (thread.handoff ?? null)) &&
            nextUpdatedAt === thread.updatedAt
          ) {
            return thread;
          }

          return {
            ...thread,
            ...(event.payload.title !== undefined ? { title: event.payload.title } : {}),
            modelSelection,
            ...(event.payload.envMode !== undefined ? { envMode: event.payload.envMode } : {}),
            branch: nextBranch,
            worktreePath: nextWorktreePath,
            associatedWorktreePath: nextAssociatedWorktreePath,
            associatedWorktreeBranch: nextAssociatedWorktreeBranch,
            associatedWorktreeRef: nextAssociatedWorktreeRef,
            createBranchFlowCompleted: nextCreateBranchFlowCompleted,
            ...(event.payload.isPinned !== undefined ? { isPinned: event.payload.isPinned } : {}),
            ...(event.payload.parentThreadId !== undefined
              ? { parentThreadId: event.payload.parentThreadId }
              : {}),
            ...(event.payload.subagentAgentId !== undefined
              ? { subagentAgentId: event.payload.subagentAgentId }
              : {}),
            ...(event.payload.subagentNickname !== undefined
              ? { subagentNickname: event.payload.subagentNickname }
              : {}),
            ...(event.payload.subagentRole !== undefined
              ? { subagentRole: event.payload.subagentRole }
              : {}),
            ...(event.payload.lastKnownPr !== undefined
              ? { lastKnownPr: event.payload.lastKnownPr }
              : {}),
            ...(event.payload.handoff !== undefined ? { handoff: event.payload.handoff } : {}),
            updatedAt: nextUpdatedAt,
            ...(cwdChanged ? { session: null } : {}),
          };
        },
        {
          ...options,
          updateThreadArray:
            options?.updateThreadArray !== false || event.payload.title !== undefined,
          updateSidebarSummary: true,
        },
      );

    case "thread.message-sent":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => applyThreadMessageSentEvent(thread, event),
        {
          ...options,
          recomputeSummarySignals: threadMessageUpdatesSummary(event),
          updateSidebarSummary:
            options?.updateSidebarSummary === true || threadMessageUpdatesSidebarSummary(event),
        },
      );

    case "thread.session-set":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          const session = normalizeThreadSession(event.payload.session, thread.session);
          const error = normalizeThreadErrorMessage(event.payload.session.lastError);
          const latestTurn = reconcileLatestTurnFromSession(thread, event.payload.session, error);
          if (
            session === thread.session &&
            error === thread.error &&
            latestTurn === thread.latestTurn
          ) {
            return thread;
          }
          return {
            ...thread,
            session,
            error,
            latestTurn,
            updatedAt:
              (thread.updatedAt ?? thread.createdAt) > event.occurredAt
                ? thread.updatedAt
                : event.occurredAt,
          };
        },
        {
          ...options,
          updateSidebarSummary: true,
        },
      );

    case "thread.turn-interrupt-requested": {
      // 涓柇璇锋眰鏄敖鍔涜€屼负鐨勶紝鍙兘澶辫触鎴栬秴鏃躲€備繚鎸佹渶鏂板洖鍚堟椂閽?鐘舵€佹椿璺冿紝
      // 鐩村埌鎻愪緵鑰呯‘璁ょ粓绔簨浠躲€?      return state;
    }

    case "thread.session-stop-requested":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          if (thread.session === null) {
            return thread;
          }
          const latestTurn =
            thread.latestTurn !== null &&
            thread.latestTurn.state === "running" &&
            thread.latestTurn.completedAt === null
              ? buildLatestTurn({
                  previous: thread.latestTurn,
                  turnId: thread.latestTurn.turnId,
                  state: "interrupted",
                  requestedAt: thread.latestTurn.requestedAt,
                  startedAt: thread.latestTurn.startedAt ?? event.payload.createdAt,
                  completedAt: event.payload.createdAt,
                  assistantMessageId: thread.latestTurn.assistantMessageId,
                })
              : thread.latestTurn;
          return {
            ...thread,
            session: {
              ...thread.session,
              status: "closed",
              orchestrationStatus: "stopped",
              activeTurnId: undefined,
              updatedAt: event.payload.createdAt,
            },
            latestTurn,
            updatedAt:
              (thread.updatedAt ?? thread.createdAt) > event.occurredAt
                ? thread.updatedAt
                : event.occurredAt,
          };
        },
        {
          ...options,
          updateSidebarSummary: true,
        },
      );

    case "thread.turn-start-requested":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          const modelSelection =
            event.payload.modelSelection !== undefined
              ? normalizeModelSelection(event.payload.modelSelection, thread.modelSelection)
              : thread.modelSelection;
          if (
            modelSelection === thread.modelSelection &&
            thread.runtimeMode === event.payload.runtimeMode &&
            thread.interactionMode === event.payload.interactionMode &&
            thread.pendingSourceProposedPlan === event.payload.sourceProposedPlan &&
            (thread.updatedAt ?? thread.createdAt) >= event.payload.createdAt
          ) {
            return thread;
          }
          return {
            ...thread,
            modelSelection,
            runtimeMode: event.payload.runtimeMode,
            interactionMode: event.payload.interactionMode,
            pendingSourceProposedPlan: event.payload.sourceProposedPlan,
            updatedAt:
              (thread.updatedAt ?? thread.createdAt) > event.payload.createdAt
                ? thread.updatedAt
                : event.payload.createdAt,
          };
        },
        {
          ...options,
          updateSidebarSummary: true,
        },
      );

    case "thread.user-input-response-requested":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          // 鍝嶅簲鍛戒护琚帴鍙楀悗绔嬪嵆闅愯棌缂栬緫鍣ㄦ彁绀猴紱
          // 鎻愪緵鑰呭彲鑳界◢鍚庤拷鍔犺嚜宸辩殑宸茶В鍐虫椿鍔ㄣ€?          const syntheticResolvedActivity = {
            id: `synthetic-user-input-resolved:${event.payload.requestId}:${event.sequence}` as EventId,
            tone: "info",
            kind: "user-input.resolved",
            summary: "User input submitted",
            payload: {
              requestId: event.payload.requestId,
            },
            turnId: null,
            sequence: event.sequence,
            createdAt: event.payload.createdAt,
          } satisfies Thread["activities"][number];
          const hasResolvedActivity = thread.activities.some(
            (activity) => activity.id === syntheticResolvedActivity.id,
          );
          const activities = hasResolvedActivity
            ? thread.activities
            : [...thread.activities, syntheticResolvedActivity];
          const summary = resolveThreadSummaryAfterUserInputResponseRequested(thread, event);
          return {
            ...thread,
            activities,
            hasPendingUserInput: summary.hasPendingUserInput,
            updatedAt:
              (thread.updatedAt ?? thread.createdAt) > event.payload.createdAt
                ? thread.updatedAt
                : event.payload.createdAt,
          };
        },
        {
          ...options,
          recomputeSummarySignals: false,
          updateSidebarSummary: true,
        },
      );

    case "thread.approval-response-requested":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          const summary = resolveThreadSummaryAfterApprovalResponseRequested(thread, event);
          return {
            ...thread,
            hasPendingApprovals: summary.hasPendingApprovals,
            updatedAt:
              (thread.updatedAt ?? thread.createdAt) > event.payload.createdAt
                ? thread.updatedAt
                : event.payload.createdAt,
          };
        },
        {
          ...options,
          recomputeSummarySignals: false,
          updateSidebarSummary: true,
        },
      );

    case "thread.activity-appended":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          const nextActivities = normalizeActivities(
            [...thread.activities, event.payload.activity],
            thread.activities,
          );
          if (nextActivities === thread.activities) {
            return thread;
          }
          return {
            ...thread,
            activities: nextActivities,
            updatedAt:
              (thread.updatedAt ?? thread.createdAt) > event.payload.activity.createdAt
                ? thread.updatedAt
                : event.payload.activity.createdAt,
          };
        },
        {
          ...options,
          recomputeSummarySignals: threadActivityUpdatesSummary(event),
          updateSidebarSummary:
            options?.updateSidebarSummary === true || threadActivityUpdatesSummary(event),
        },
      );

    case "thread.proposed-plan-upserted":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          const previousPlanIndex = thread.proposedPlans.findIndex(
            (plan) => plan.id === event.payload.proposedPlan.id,
          );
          const nextPlan = normalizeProposedPlans(
            [event.payload.proposedPlan],
            previousPlanIndex >= 0 ? [thread.proposedPlans[previousPlanIndex]!] : undefined,
          )[0];
          if (!nextPlan) {
            return thread;
          }
          const proposedPlans =
            previousPlanIndex >= 0
              ? thread.proposedPlans.map((plan, index) =>
                  index === previousPlanIndex ? nextPlan : plan,
                )
              : [...thread.proposedPlans, nextPlan];
          if (arraysShallowEqual(thread.proposedPlans, proposedPlans)) {
            return thread;
          }
          return {
            ...thread,
            proposedPlans,
            updatedAt:
              (thread.updatedAt ?? thread.createdAt) > event.payload.proposedPlan.updatedAt
                ? thread.updatedAt
                : event.payload.proposedPlan.updatedAt,
          };
        },
        {
          ...options,
          updateSidebarSummary: true,
        },
      );

    case "thread.turn-diff-completed":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) =>
          applyTurnDiffSummaryToThread(thread, {
            turnId: event.payload.turnId,
            completedAt: event.payload.completedAt,
            status: event.payload.status,
            files: event.payload.files.map((file) => ({
              path: file.path,
              ...(file.kind !== undefined ? { kind: file.kind } : {}),
              ...(file.additions !== undefined ? { additions: file.additions } : {}),
              ...(file.deletions !== undefined ? { deletions: file.deletions } : {}),
            })),
            checkpointRef: event.payload.checkpointRef,
            assistantMessageId: event.payload.assistantMessageId ?? undefined,
            checkpointTurnCount: event.payload.checkpointTurnCount,
          }),
        {
          ...options,
          updateSidebarSummary: true,
        },
      );

    case "thread.reverted":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          const turnDiffSummaries = thread.turnDiffSummaries
            .filter(
              (entry) =>
                entry.checkpointTurnCount !== undefined &&
                entry.checkpointTurnCount <= event.payload.turnCount,
            )
            .toSorted(
              (left, right) =>
                (left.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER) -
                (right.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER),
            );
          const retainedTurnIds = new Set(turnDiffSummaries.map((entry) => entry.turnId));
          const messages = retainThreadMessagesAfterRevert(
            thread.messages,
            retainedTurnIds,
            event.payload.turnCount,
          ).slice(-MAX_THREAD_MESSAGES);
          const proposedPlans = retainThreadProposedPlansAfterRevert(
            thread.proposedPlans,
            retainedTurnIds,
          );
          const activities = retainThreadActivitiesAfterRevert(thread.activities, retainedTurnIds);
          const latestCheckpoint = turnDiffSummaries.at(-1) ?? null;

          return {
            ...thread,
            turnDiffSummaries,
            messages,
            proposedPlans,
            activities,
            pendingSourceProposedPlan: undefined,
            latestTurn:
              latestCheckpoint === null
                ? null
                : {
                    turnId: latestCheckpoint.turnId,
                    state: checkpointStatusToLatestTurnState(latestCheckpoint.status),
                    requestedAt: latestCheckpoint.completedAt,
                    startedAt: latestCheckpoint.completedAt,
                    completedAt: latestCheckpoint.completedAt,
                    assistantMessageId: latestCheckpoint.assistantMessageId ?? null,
                  },
            updatedAt:
              (thread.updatedAt ?? thread.createdAt) > event.occurredAt
                ? thread.updatedAt
                : event.occurredAt,
          };
        },
        {
          ...options,
          updateSidebarSummary: true,
        },
      );

    case "thread.conversation-rolled-back":
      if (event.payload.numTurns === 0) {
        return state;
      }
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => {
          const rollback = rollbackThreadMessagesFromMessage(
            thread.messages,
            event.payload.messageId,
          );
          const removedTurnIds = new Set([
            ...rollback.removedTurnIds,
            ...(event.payload.removedTurnIds ?? []),
          ]);
          if (rollback.messages.length === thread.messages.length && removedTurnIds.size === 0) {
            return thread;
          }

          const turnDiffSummaries = thread.turnDiffSummaries
            .filter((entry) => !removedTurnIds.has(entry.turnId))
            .toSorted(
              (left, right) =>
                (left.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER) -
                (right.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER),
            );
          const proposedPlans = thread.proposedPlans.filter(
            (plan) => plan.turnId === null || !removedTurnIds.has(plan.turnId),
          );
          const activities = thread.activities.filter(
            (activity) => activity.turnId === null || !removedTurnIds.has(activity.turnId),
          );
          const latestCheckpoint = turnDiffSummaries.at(-1) ?? null;

          return {
            ...thread,
            turnDiffSummaries,
            messages: rollback.messages.slice(-MAX_THREAD_MESSAGES),
            proposedPlans,
            activities,
            pendingSourceProposedPlan: undefined,
            latestTurn:
              latestCheckpoint === null
                ? null
                : {
                    turnId: latestCheckpoint.turnId,
                    state: checkpointStatusToLatestTurnState(latestCheckpoint.status),
                    requestedAt: latestCheckpoint.completedAt,
                    startedAt: latestCheckpoint.completedAt,
                    completedAt: latestCheckpoint.completedAt,
                    assistantMessageId: latestCheckpoint.assistantMessageId ?? null,
                  },
            updatedAt:
              (thread.updatedAt ?? thread.createdAt) > event.occurredAt
                ? thread.updatedAt
                : event.occurredAt,
          };
        },
        {
          ...options,
          updateSidebarSummary: true,
        },
      );

    case "thread.archived":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => ({
          ...thread,
          archivedAt: event.payload.archivedAt ?? event.occurredAt,
          updatedAt: event.payload.updatedAt ?? event.occurredAt,
        }),
        {
          ...options,
          updateSidebarSummary: true,
        },
      );

    case "thread.unarchived":
      return applyThreadUpdate(
        state,
        event.payload.threadId,
        (thread) => ({
          ...thread,
          archivedAt: null,
          updatedAt: event.payload.updatedAt ?? event.occurredAt,
        }),
        {
          ...options,
          updateSidebarSummary: true,
        },
      );

    default:
      return state;
  }
}

/**
 * 搴旂敤缂栨帓浜嬩欢鍒扮姸鎬? *
 * @description 澶勭悊缂栨帓灞備簨浠跺垪琛紝鏇存柊绾跨▼鏁扮粍鍜屼晶杈规爮鎽樿銆? * 閫傜敤浜庨潪娴佸紡鍦烘櫙锛堝鍒濆鍔犺浇銆佸揩鐓у悓姝ワ級銆? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param events - 缂栨帓浜嬩欢鍒楄〃
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function applyOrchestrationEvents(
  state: AppState,
  events: ReadonlyArray<OrchestrationEvent>,
): AppState {
  return applyOrchestrationEventsHotPath(state, events, {
    updateThreadArray: true,
    updateSidebarSummary: false,
  });
}

/**
 * 搴旂敤缂栨帓浜嬩欢鍒扮姸鎬侊紙鐑矾寰勶級
 *
 * @description 楂樻€ц兘鍙樹綋锛岄粯璁よ烦杩囩嚎绋嬫暟缁勫拰渚ц竟鏍忔憳瑕佹洿鏂帮紝
 * 閫傜敤浜庢祦寮忔秷鎭瓑楂橀鍦烘櫙銆傝皟鐢ㄦ柟鍙€氳繃 options 瑕嗙洊榛樿琛屼负銆? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param events - 缂栨帓浜嬩欢鍒楄〃
 * @param options - 鍙€夐厤缃? * @param options.updateThreadArray - 鏄惁鏇存柊绾跨▼鏁扮粍锛岄粯璁?false
 * @param options.updateSidebarSummary - 鏄惁鏇存柊渚ц竟鏍忔憳瑕侊紝榛樿 false
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function applyOrchestrationEventsHotPath(
  state: AppState,
  events: ReadonlyArray<OrchestrationEvent>,
  options?: {
    updateThreadArray?: boolean;
    updateSidebarSummary?: boolean;
  },
): AppState {
  const normalizedOptions = {
    updateThreadArray: options?.updateThreadArray ?? true,
    updateSidebarSummary: options?.updateSidebarSummary ?? false,
  };
  let nextState = state;
  for (const event of events) {
    nextState = applyOrchestrationEvent(nextState, event, normalizedOptions);
  }
  return nextState;
}

// 鈹€鈹€ 绾姸鎬佽浆鎹㈠嚱鏁?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * 鍚屾鏈嶅姟鍣?Shell 蹇収鍒扮姸鎬? *
 * @description 澶勭悊缂栨帓灞傜殑 Shell 蹇収锛屾洿鏂伴」鐩垪琛ㄥ拰绾跨▼澶栧３淇℃伅锛? * 骞堕噸寤轰晶杈规爮鎽樿銆傛爣璁?threadsHydrated 涓?true銆? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param snapshot - 鏈嶅姟鍣?Shell 蹇収
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function syncServerShellSnapshot(
  state: AppState,
  snapshot: OrchestrationShellSnapshot,
): AppState {
  rememberProjectUiState(state.projects);
  rememberProjectLocalNames(state.projects);
  const projects = mapProjectsFromShellSnapshot(snapshot.projects, state.projects);
  const nextThreadIds = new Set(snapshot.threads.map((thread) => thread.id));

  let normalizedState: AppState = {
    ...state,
    threadIds: [],
    threadShellById: {},
    threadSessionById: {},
    threadTurnStateById: {},
    messageIdsByThreadId: retainThreadScopedRecord(state.messageIdsByThreadId, nextThreadIds),
    messageByThreadId: retainThreadScopedRecord(state.messageByThreadId, nextThreadIds),
    activityIdsByThreadId: retainThreadScopedRecord(state.activityIdsByThreadId, nextThreadIds),
    activityByThreadId: retainThreadScopedRecord(state.activityByThreadId, nextThreadIds),
    proposedPlanIdsByThreadId: retainThreadScopedRecord(
      state.proposedPlanIdsByThreadId,
      nextThreadIds,
    ),
    proposedPlanByThreadId: retainThreadScopedRecord(state.proposedPlanByThreadId, nextThreadIds),
    turnDiffIdsByThreadId: retainThreadScopedRecord(state.turnDiffIdsByThreadId, nextThreadIds),
    turnDiffSummaryByThreadId: retainThreadScopedRecord(
      state.turnDiffSummaryByThreadId,
      nextThreadIds,
    ),
  };

  for (const thread of snapshot.threads) {
    const previousThread = getThreadFromState(state, thread.id);
    normalizedState = writeThreadShellProjection(
      normalizedState,
      normalizeThreadShellSnapshot(thread, previousThread),
    );
  }

  const derivedThreads = getThreadsFromState(normalizedState);
  const threads = arraysShallowEqual(state.threads, derivedThreads)
    ? state.threads
    : derivedThreads;
  const nextSidebarThreadSummaryById = Object.fromEntries(
    threads.map((thread) => [
      thread.id,
      buildSidebarThreadSummary(thread, state.sidebarThreadSummaryById[thread.id]),
    ]),
  ) as Record<string, SidebarThreadSummary>;
  const sidebarThreadSummaryById = recordsShallowEqual(
    state.sidebarThreadSummaryById,
    nextSidebarThreadSummaryById,
  )
    ? state.sidebarThreadSummaryById
    : nextSidebarThreadSummaryById;

  return {
    ...normalizedState,
    projects,
    threads,
    sidebarThreadSummaryById,
    threadsHydrated: true,
  };
}

function syncServerThreadDetailWithOptions(
  state: AppState,
  thread: ReadModelThread,
  options?: {
    updateThreadArray?: boolean;
  },
): AppState {
  const previousThread =
    getThreadFromState(state, thread.id) ?? state.threads.find((entry) => entry.id === thread.id);
  const nextThreadDetail =
    options?.updateThreadArray === false
      ? mergeReadModelThreadDetailWithLiveHotPath(thread, previousThread)
      : thread;
  return commitThreadProjection(
    writeThreadState(
      state,
      normalizeThreadFromReadModel(nextThreadDetail, previousThread),
      previousThread,
    ),
    thread.id,
    {
      updateThreadArray: options?.updateThreadArray ?? true,
      updateSidebarSummary: false,
    },
  );
}

/**
 * 鍚屾鏈嶅姟鍣ㄧ嚎绋嬭鎯呭埌鐘舵€? *
 * @description 鍚堝苟鏈嶅姟鍣ㄨ妯″瀷涓殑绾跨▼璇︽儏鍒板綋鍓嶇姸鎬侊紝
 * 鏇存柊绾跨▼鏁扮粍鍜屼晶杈规爮鎽樿銆? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param thread - 鏈嶅姟鍣ㄨ妯″瀷涓殑绾跨▼鏁版嵁
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function syncServerThreadDetail(state: AppState, thread: ReadModelThread): AppState {
  return syncServerThreadDetailWithOptions(state, thread, { updateThreadArray: true });
}

/**
 * 鍚屾鏈嶅姟鍣ㄧ嚎绋嬭鎯呭埌鐘舵€侊紙鐑矾寰勶級
 *
 * @description 楂樻€ц兘鍙樹綋锛岃烦杩囩嚎绋嬫暟缁勬洿鏂帮紝灏嗗疄鏃舵祦寮忔暟鎹悎骞跺埌鐜版湁鐘舵€佷腑锛? * 閬垮厤娲昏穬鑱婂ぉ杞綍鐨勯珮棰戝彉鍔ㄦ墿鏁ｅ埌瀵艰埅鏍戙€? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param thread - 鏈嶅姟鍣ㄨ妯″瀷涓殑绾跨▼鏁版嵁
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function syncServerThreadDetailHotPath(state: AppState, thread: ReadModelThread): AppState {
  return syncServerThreadDetailWithOptions(state, thread, { updateThreadArray: false });
}

/**
 * 搴旂敤 Shell 娴佷簨浠跺埌鐘舵€? *
 * @description 澶勭悊 Shell 娴佷簨浠讹紙椤圭洰澧炲垹銆佺嚎绋嬪鍒狅級锛? * 鏇存柊瀵瑰簲鐨勭姸鎬佸垏鐗囧拰渚ц竟鏍忔憳瑕併€? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param event - Shell 娴佷簨浠? * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function applyShellEvent(state: AppState, event: OrchestrationShellStreamEvent): AppState {
  switch (event.kind) {
    case "project-upserted":
      return upsertProjectFromShell(state, event.project);
    case "project-removed":
      return removeProjectState(state, event.projectId);
    case "thread-upserted": {
      const nextState = writeThreadShellProjection(
        state,
        normalizeThreadShellSnapshot(event.thread, getThreadFromState(state, event.thread.id)),
      );
      return commitThreadProjection(nextState, event.thread.id);
    }
    case "thread-removed":
      return removeThreadState(state, event.threadId);
  }
}

/**
 * 鍚屾鏈嶅姟鍣ㄨ妯″瀷鍒扮姸鎬? *
 * @description 鍏ㄩ噺鍚屾缂栨帓灞傝妯″瀷锛岄噸寤烘墍鏈夐」鐩€佺嚎绋嬪拰渚ц竟鏍忔憳瑕侊紝
 * 娓呯悊涓嶅瓨鍦ㄧ殑绾跨▼鍒囩墖鏁版嵁銆傛爣璁?threadsHydrated 涓?true銆? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param readModel - 鏈嶅姟鍣ㄨ妯″瀷
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function syncServerReadModel(state: AppState, readModel: OrchestrationReadModel): AppState {
  rememberProjectUiState(state.projects);
  rememberProjectLocalNames(state.projects);
  const projects = mapProjectsFromReadModel(
    readModel.projects.filter((project) => project.deletedAt === null),
    state.projects,
  );
  const existingThreadById = new Map(state.threads.map((thread) => [thread.id, thread] as const));
  const nextThreads = readModel.threads
    .filter((thread) => thread.deletedAt === null)
    .map((thread) => {
      const existing = existingThreadById.get(thread.id);
      return normalizeThreadFromReadModel(thread, existing);
    });
  const nextThreadIds = new Set(nextThreads.map((thread) => thread.id));
  let normalizedState: AppState = {
    ...state,
    threadIds: [],
    threadShellById: retainThreadScopedRecord(state.threadShellById, nextThreadIds),
    threadSessionById: retainThreadScopedRecord(state.threadSessionById, nextThreadIds),
    threadTurnStateById: retainThreadScopedRecord(state.threadTurnStateById, nextThreadIds),
    messageIdsByThreadId: retainThreadScopedRecord(state.messageIdsByThreadId, nextThreadIds),
    messageByThreadId: retainThreadScopedRecord(state.messageByThreadId, nextThreadIds),
    activityIdsByThreadId: retainThreadScopedRecord(state.activityIdsByThreadId, nextThreadIds),
    activityByThreadId: retainThreadScopedRecord(state.activityByThreadId, nextThreadIds),
    proposedPlanIdsByThreadId: retainThreadScopedRecord(
      state.proposedPlanIdsByThreadId,
      nextThreadIds,
    ),
    proposedPlanByThreadId: retainThreadScopedRecord(state.proposedPlanByThreadId, nextThreadIds),
    turnDiffIdsByThreadId: retainThreadScopedRecord(state.turnDiffIdsByThreadId, nextThreadIds),
    turnDiffSummaryByThreadId: retainThreadScopedRecord(
      state.turnDiffSummaryByThreadId,
      nextThreadIds,
    ),
  };
  for (const thread of nextThreads) {
    normalizedState = writeThreadState(normalizedState, thread);
  }
  const derivedThreads = getThreadsFromState(normalizedState);
  const threads = arraysShallowEqual(state.threads, derivedThreads)
    ? state.threads
    : derivedThreads;
  const nextSidebarThreadSummaryById = Object.fromEntries(
    threads.map((thread) => [
      thread.id,
      buildSidebarThreadSummary(thread, state.sidebarThreadSummaryById[thread.id]),
    ]),
  ) as Record<string, SidebarThreadSummary>;
  const sidebarThreadSummaryById = recordsShallowEqual(
    state.sidebarThreadSummaryById,
    nextSidebarThreadSummaryById,
  )
    ? state.sidebarThreadSummaryById
    : nextSidebarThreadSummaryById;
  if (
    projects === state.projects &&
    threads === state.threads &&
    sidebarThreadSummaryById === state.sidebarThreadSummaryById &&
    normalizedState.threadIds === state.threadIds &&
    normalizedState.threadShellById === state.threadShellById &&
    normalizedState.threadSessionById === state.threadSessionById &&
    normalizedState.threadTurnStateById === state.threadTurnStateById &&
    normalizedState.messageIdsByThreadId === state.messageIdsByThreadId &&
    normalizedState.messageByThreadId === state.messageByThreadId &&
    normalizedState.activityIdsByThreadId === state.activityIdsByThreadId &&
    normalizedState.activityByThreadId === state.activityByThreadId &&
    normalizedState.proposedPlanIdsByThreadId === state.proposedPlanIdsByThreadId &&
    normalizedState.proposedPlanByThreadId === state.proposedPlanByThreadId &&
    normalizedState.turnDiffIdsByThreadId === state.turnDiffIdsByThreadId &&
    normalizedState.turnDiffSummaryByThreadId === state.turnDiffSummaryByThreadId &&
    state.threadsHydrated
  ) {
    return state;
  }
  return {
    ...normalizedState,
    projects,
    threads,
    sidebarThreadSummaryById,
    threadsHydrated: true,
  };
}

/**
 * 鏍囪绾跨▼涓哄凡璁块棶
 *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param threadId - 绾跨▼ ID
 * @param visitedAt - 璁块棶鏃堕棿锛圛SO 瀛楃涓诧級锛岄粯璁や负褰撳墠鏃堕棿
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function markThreadVisited(
  state: AppState,
  threadId: ThreadId,
  visitedAt?: string,
): AppState {
  const at = visitedAt ?? new Date().toISOString();
  const visitedAtMs = Date.parse(at);
  return applyThreadUpdate(state, threadId, (thread) => {
    const previousVisitedAtMs = thread.lastVisitedAt ? Date.parse(thread.lastVisitedAt) : NaN;
    if (
      Number.isFinite(previousVisitedAtMs) &&
      Number.isFinite(visitedAtMs) &&
      previousVisitedAtMs >= visitedAtMs
    ) {
      return thread;
    }
    return { ...thread, lastVisitedAt: at };
  });
}

/**
 * 鏍囪绾跨▼涓烘湭璇? *
 * @description 灏?lastVisitedAt 璁剧疆涓烘渶鏂板洖鍚堝畬鎴愭椂闂翠箣鍓?1ms锛? * 浣跨嚎绋嬪湪渚ц竟鏍忎腑鏄剧ず涓烘湭璇荤姸鎬併€? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param threadId - 绾跨▼ ID
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function markThreadUnread(state: AppState, threadId: ThreadId): AppState {
  return applyThreadUpdate(state, threadId, (thread) => {
    if (!thread.latestTurn?.completedAt) return thread;
    const latestTurnCompletedAtMs = Date.parse(thread.latestTurn.completedAt);
    if (Number.isNaN(latestTurnCompletedAtMs)) return thread;
    const unreadVisitedAt = new Date(latestTurnCompletedAtMs - 1).toISOString();
    if (thread.lastVisitedAt === unreadVisitedAt) return thread;
    return { ...thread, lastVisitedAt: unreadVisitedAt };
  });
}

/**
 * 鍒囨崲椤圭洰灞曞紑/鎶樺彔鐘舵€? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param projectId - 椤圭洰 ID
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function toggleProject(state: AppState, projectId: Project["id"]): AppState {
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === projectId ? { ...p, expanded: !p.expanded } : p)),
  };
}

/**
 * 璁剧疆椤圭洰灞曞紑鐘舵€? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param projectId - 椤圭洰 ID
 * @param expanded - 鏄惁灞曞紑
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function setProjectExpanded(
  state: AppState,
  projectId: Project["id"],
  expanded: boolean,
): AppState {
  let changed = false;
  const projects = state.projects.map((p) => {
    if (p.id !== projectId || p.expanded === expanded) return p;
    changed = true;
    return { ...p, expanded };
  });
  return changed ? { ...state, projects } : state;
}

/**
 * 璁剧疆鎵€鏈夐」鐩殑灞曞紑鐘舵€? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param expanded - 鏄惁灞曞紑
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function setAllProjectsExpanded(state: AppState, expanded: boolean): AppState {
  let changed = false;
  const projects = state.projects.map((project) => {
    if (project.expanded === expanded) return project;
    changed = true;
    return { ...project, expanded };
  });
  return changed ? { ...state, projects } : state;
}

// 浠呬繚鐣欎竴涓」鐩睍寮€锛屼娇鎵归噺鎶樺彔淇濈暀娲昏穬鑱婂ぉ鐨勪笂涓嬫枃銆?/**
 * 鎶樺彔闄ゆ寚瀹氶」鐩鐨勬墍鏈夐」鐩? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param activeProjectId - 淇濇寔灞曞紑鐨勯」鐩?ID锛屼负 null 鏃舵姌鍙犲叏閮? * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function collapseProjectsExcept(
  state: AppState,
  activeProjectId: Project["id"] | null,
): AppState {
  let changed = false;
  const projects = state.projects.map((project) => {
    const nextExpanded = activeProjectId !== null && project.id === activeProjectId;
    if (project.expanded === nextExpanded) return project;
    changed = true;
    return { ...project, expanded: nextExpanded };
  });
  return changed ? { ...state, projects } : state;
}

/**
 * 閲嶆帓椤圭洰椤哄簭
 *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param draggedProjectId - 琚嫋鎷界殑椤圭洰 ID
 * @param targetProjectId - 鐩爣浣嶇疆鐨勯」鐩?ID
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function reorderProjects(
  state: AppState,
  draggedProjectId: Project["id"],
  targetProjectId: Project["id"],
): AppState {
  if (draggedProjectId === targetProjectId) return state;
  const draggedIndex = state.projects.findIndex((project) => project.id === draggedProjectId);
  const targetIndex = state.projects.findIndex((project) => project.id === targetProjectId);
  if (draggedIndex < 0 || targetIndex < 0) return state;
  const projects = [...state.projects];
  const [draggedProject] = projects.splice(draggedIndex, 1);
  if (!draggedProject) return state;
  projects.splice(targetIndex, 0, draggedProject);
  return { ...state, projects };
}

/**
 * 鏈湴閲嶅懡鍚嶉」鐩? *
 * @description 浠呬慨鏀规湰鍦板睍绀哄悕绉帮紝涓嶅奖鍝嶈繙绋嬩粨搴撳悕绉般€? * 閲嶅懡鍚嶅悗绔嬪嵆鎸佷箙鍖栧埌 localStorage銆? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param projectId - 椤圭洰 ID
 * @param name - 鏂板悕绉帮紝涓?null 鏃舵仮澶嶄负杩滅▼鍚嶇О
 * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function renameProjectLocally(
  state: AppState,
  projectId: Project["id"],
  name: string | null,
): AppState {
  const normalizedName = name?.trim() ?? null;
  let changed = false;
  const projects = state.projects.map((project) => {
    if (project.id !== projectId) {
      return project;
    }
    const nextLocalName = normalizedName && normalizedName.length > 0 ? normalizedName : null;
    const nextName = nextLocalName ?? project.remoteName;
    if (project.localName === nextLocalName && project.name === nextName) {
      return project;
    }
    changed = true;
    return {
      ...project,
      name: nextName,
      localName: nextLocalName,
    };
  });
  return changed ? { ...state, projects } : state;
}

/**
 * 璁剧疆绾跨▼閿欒淇℃伅
 *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param threadId - 绾跨▼ ID
 * @param error - 閿欒淇℃伅锛屼负 null 鏃舵竻闄? * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function setError(state: AppState, threadId: ThreadId, error: string | null): AppState {
  return applyThreadUpdate(state, threadId, (thread) => {
    if (thread.error === error) return thread;
    return { ...thread, error };
  });
}

/**
 * 璁剧疆绾跨▼宸ヤ綔鍖虹姸鎬? *
 * @description 閮ㄥ垎鏇存柊绾跨▼鐨勫伐浣滃尯淇℃伅锛堢幆澧冩ā寮忋€佸垎鏀€佸伐浣滄爲璺緞绛夛級锛? * 褰撳伐浣滅洰褰曞彉鍖栨椂娓呴櫎浼氳瘽鐘舵€併€? *
 * @param state - 褰撳墠搴旂敤鐘舵€? * @param threadId - 绾跨▼ ID
 * @param patch - 宸ヤ綔鍖虹姸鎬佽ˉ涓? * @returns 鏇存柊鍚庣殑搴旂敤鐘舵€? */
export function setThreadWorkspace(
  state: AppState,
  threadId: ThreadId,
  patch: ThreadWorkspacePatch,
): AppState {
  return applyThreadUpdate(state, threadId, (t) => {
    const nextEnvMode = patch.envMode !== undefined ? patch.envMode : t.envMode;
    const nextBranch = resolveThreadBranchRegressionGuard({
      currentBranch: t.branch,
      nextBranch: patch.branch !== undefined ? patch.branch : t.branch,
    });
    const nextWorktreePath = patch.worktreePath !== undefined ? patch.worktreePath : t.worktreePath;
    const nextAssociatedWorktreePath =
      patch.associatedWorktreePath !== undefined
        ? patch.associatedWorktreePath
        : (t.associatedWorktreePath ?? null);
    const nextAssociatedWorktreeBranch =
      patch.associatedWorktreeBranch !== undefined
        ? patch.associatedWorktreeBranch
        : (t.associatedWorktreeBranch ?? null);
    const nextAssociatedWorktreeRef =
      patch.associatedWorktreeRef !== undefined
        ? patch.associatedWorktreeRef
        : (t.associatedWorktreeRef ?? null);
    const nextCreateBranchFlowCompleted = resolveCreateBranchFlowCompletedMerge({
      currentBranch: t.branch,
      nextBranch,
      currentWorktreePath: t.worktreePath,
      nextWorktreePath,
      currentAssociatedWorktreePath: t.associatedWorktreePath,
      nextAssociatedWorktreePath,
      currentAssociatedWorktreeBranch: t.associatedWorktreeBranch,
      nextAssociatedWorktreeBranch,
      currentAssociatedWorktreeRef: t.associatedWorktreeRef,
      nextAssociatedWorktreeRef,
      currentCreateBranchFlowCompleted: t.createBranchFlowCompleted,
      nextCreateBranchFlowCompleted: patch.createBranchFlowCompleted,
    });
    if (
      t.envMode === nextEnvMode &&
      t.branch === nextBranch &&
      t.worktreePath === nextWorktreePath &&
      (t.associatedWorktreePath ?? null) === nextAssociatedWorktreePath &&
      (t.associatedWorktreeBranch ?? null) === nextAssociatedWorktreeBranch &&
      (t.associatedWorktreeRef ?? null) === nextAssociatedWorktreeRef &&
      (t.createBranchFlowCompleted ?? false) === nextCreateBranchFlowCompleted
    ) {
      return t;
    }
    const cwdChanged = t.worktreePath !== nextWorktreePath;
    return {
      ...t,
      envMode: nextEnvMode,
      branch: nextBranch,
      worktreePath: nextWorktreePath,
      associatedWorktreePath: nextAssociatedWorktreePath,
      associatedWorktreeBranch: nextAssociatedWorktreeBranch,
      associatedWorktreeRef: nextAssociatedWorktreeRef,
      createBranchFlowCompleted: nextCreateBranchFlowCompleted,
      ...(cwdChanged ? { session: null } : {}),
    };
  });
}

// 鈹€鈹€ Zustand Store 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** 搴旂敤 Store 鎺ュ彛锛屾墿灞?AppState 澧炲姞鎿嶄綔鏂规硶 */
interface AppStore extends AppState {
  syncServerShellSnapshot: (snapshot: OrchestrationShellSnapshot) => void;
  syncServerThreadDetail: (thread: ReadModelThread) => void;
  syncServerThreadDetailHotPath: (thread: ReadModelThread) => void;
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

/** Zustand 搴旂敤 Store 瀹炰緥 */
export const useStore = create<AppStore>((set) => ({
  ...readPersistedState(),
  syncServerShellSnapshot: (snapshot) => set((state) => syncServerShellSnapshot(state, snapshot)),
  syncServerThreadDetail: (thread) => set((state) => syncServerThreadDetail(state, thread)),
  syncServerThreadDetailHotPath: (thread) =>
    set((state) => syncServerThreadDetailHotPath(state, thread)),
  syncServerReadModel: (readModel) => set((state) => syncServerReadModel(state, readModel)),
  applyShellEvent: (event) => set((state) => applyShellEvent(state, event)),
  applyOrchestrationEvents: (events) => set((state) => applyOrchestrationEvents(state, events)),
  applyOrchestrationEventsHotPath: (events) =>
    set((state) =>
      applyOrchestrationEventsHotPath(state, events, {
        updateThreadArray: false,
        updateSidebarSummary: false,
      }),
    ),
  markThreadVisited: (threadId, visitedAt) =>
    set((state) => markThreadVisited(state, threadId, visitedAt)),
  markThreadUnread: (threadId) => set((state) => markThreadUnread(state, threadId)),
  toggleProject: (projectId) => set((state) => toggleProject(state, projectId)),
  setProjectExpanded: (projectId, expanded) =>
    set((state) => setProjectExpanded(state, projectId, expanded)),
  setAllProjectsExpanded: (expanded) => set((state) => setAllProjectsExpanded(state, expanded)),
  collapseProjectsExcept: (activeProjectId) =>
    set((state) => collapseProjectsExcept(state, activeProjectId)),
  reorderProjects: (draggedProjectId, targetProjectId) =>
    set((state) => reorderProjects(state, draggedProjectId, targetProjectId)),
  renameProjectLocally: (projectId, name) => {
    set((state) => renameProjectLocally(state, projectId, name));
    persistAppStateNow();
  },
  setError: (threadId, error) => set((state) => setError(state, threadId, error)),
  setThreadWorkspace: (threadId, patch) =>
    set((state) => setThreadWorkspace(state, threadId, patch)),
}));

// 閫氳繃闃叉姈璁㈤槄鎸佷箙鍖栫姸鎬佸彉鏇达紝閬垮厤 localStorage 棰戠箒鍐欏叆
useStore.subscribe((state) => {
  rememberProjectUiState(state.projects);
  rememberProjectLocalNames(state.projects);
  debouncedPersistState.maybeExecute(state);
});

// 椤甸潰鍗歌浇鍓嶅悓姝ュ埛鏂板緟鍐欏叆鐨勬寔涔呭寲鏁版嵁锛岄槻姝㈡暟鎹涪澶?if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    persistAppStateNow();
  });
}

/**
 * Store Provider 缁勪欢
 *
 * @description 鍦ㄧ粍浠舵寕杞芥椂绔嬪嵆鎸佷箙鍖栧綋鍓嶇姸鎬侊紝纭繚鍒濆鐘舵€佽姝ｇ‘淇濆瓨銆? * 浠呬綔涓?Zustand Store 鐨勫叆鍙ｅ寘瑁咃紝涓嶆彁渚?Context銆? *
 * @param props.children - 瀛愮粍浠? */
export function StoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    persistAppStateNow();
  }, []);
  return createElement(Fragment, null, children);
}
