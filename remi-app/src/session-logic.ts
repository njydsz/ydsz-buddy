/**
 * @file session-logic.ts
 * @description 浼氳瘽閫昏緫妯″潡锛岃礋璐ｄ粠缂栨帓娲诲姩娴佷腑鎺ㄥ UI 鐘舵€併€? * 鍖呮嫭宸ヤ綔鏃ュ織鏉＄洰鎺ㄥ銆佸緟瀹℃壒璇锋眰绠＄悊銆佸緟澶勭悊鐢ㄦ埛杈撳叆銆? * 娲昏穬浠诲姟鍒楄〃銆佹彁璁鍒掔姸鎬併€佹椂闂寸嚎鏉＄洰缁勮浠ュ強浼氳瘽闃舵鍒ゆ柇銆? */

import {
  ApprovalRequestId,
  isToolLifecycleItemType,
  type OrchestrationLatestTurn,
  type OrchestrationThreadActivity,
  type OrchestrationProposedPlanId,
  type ProviderKind,
  type ToolLifecycleItemType,
  type UserInputQuestion,
  type ThreadId,
  type TurnId,
} from "~/contracts";
import {
  decodeSubagentAgentStates,
  extractSubagentIdentityHints,
  decodeSubagentReceiverAgents,
  decodeSubagentReceiverThreadIds,
} from "~/shared/subagents";
import { summarizeToolRawOutput } from "~/shared/toolOutputSummary";
import { deriveReadableToolTitle, normalizeCompactToolLabel } from "./lib/toolCallLabel";
import { stripProposedPlanBlocksFromText } from "./proposedPlan";

import type {
  ChatMessage,
  ProposedPlan,
  SessionPhase,
  Thread,
  ThreadSession,
  TurnDiffSummary,
} from "./types";

/** Provider 閫夋嫨鍣ㄧ被鍨嬪埆鍚?*/
export type ProviderPickerKind = ProviderKind;

/**
 * 鍙€夌殑 Provider 鍒楄〃锛岀敤浜?Composer 鐨?Provider 閫夋嫨鍣? */
export const PROVIDER_OPTIONS: Array<{
  value: ProviderPickerKind;
  label: string;
  available: boolean;
}> = [
  { value: "codex", label: "Codex", available: true },
  { value: "claudeAgent", label: "Claude", available: true },
  { value: "cursor", label: "Cursor", available: true },
  { value: "gemini", label: "Gemini", available: true },
  { value: "grok", label: "Grok", available: true },
  { value: "kilo", label: "Kilo", available: true },
  { value: "opencode", label: "OpenCode", available: true },
  { value: "pi", label: "Pi", available: true },
];

/**
 * 宸ヤ綔鏃ュ織鏉＄洰锛岃〃绀虹嚎绋嬫椿鍔ㄦ祦涓殑涓€鏉″彲灞曠ず璁板綍
 */
export interface WorkLogEntry {
  /** 鏉＄洰鍞竴 ID */
  id: string;
  /** 鍒涘缓鏃堕棿锛圛SO 鏍煎紡锛?*/
  createdAt: string;
  /** 鏄剧ず鏍囩 */
  label: string;
  /** 璇︾粏淇℃伅 */
  detail?: string;
  /** 鎵ц鐨勫懡浠わ紙鍙鏍煎紡锛?*/
  command?: string;
  /** 鍘熷鍛戒护鏂囨湰 */
  rawCommand?: string;
  /** 鍛戒护棰勮鏂囨湰 */
  preview?: string;
  /** 鍙樻洿鐨勬枃浠跺垪琛?*/
  changedFiles?: ReadonlyArray<string>;
  /** 鏉＄洰璇皵锛歚"thinking"` 鎬濊€冧腑銆乣"tool"` 宸ュ叿璋冪敤銆乣"info"` 淇℃伅銆乣"error"` 閿欒 */
  tone: "thinking" | "tool" | "info" | "error";
  /** 宸ュ叿鍙鏍囬 */
  toolTitle?: string;
  /** 宸ュ叿鍚嶇О */
  toolName?: string;
  /** 宸ュ叿璋冪敤 ID */
  toolCallId?: string;
  /** 宸ュ叿鐢熷懡鍛ㄦ湡椤圭被鍨?*/
  itemType?: ToolLifecycleItemType;
  /** 寰呭鎵硅姹傜被鍨?*/
  requestKind?: PendingApproval["requestKind"];
  /** 瀛愪唬鐞嗗垪琛?*/
  subagents?: ReadonlyArray<WorkLogSubagent>;
  /** 瀛愪唬鐞嗘搷浣滀俊鎭?*/
  subagentAction?: WorkLogSubagentAction;
}

/** 宸ヤ綔鏃ュ織灞曠ず鐗堟湰鍙凤紝鐢ㄤ簬缂撳瓨澶辨晥 */
export const WORK_LOG_PRESENTATION_VERSION = 5;

/**
 * 宸ヤ綔鏃ュ織涓殑瀛愪唬鐞嗕俊鎭? */
export interface WorkLogSubagent {
  threadId: string;
  providerThreadId?: string | undefined;
  resolvedThreadId?: string | undefined;
  agentId?: string | undefined;
  nickname?: string | undefined;
  role?: string | undefined;
  model?: string | undefined;
  prompt?: string | undefined;
  rawStatus?: string | undefined;
  latestUpdate?: string | undefined;
  title?: string | undefined;
  statusLabel?: string | undefined;
  isActive?: boolean | undefined;
}

/** 瀛愪唬鐞嗘搷浣滀俊鎭紝鎻忚堪瀛愪唬鐞嗙殑宸ュ叿璋冪敤鐘舵€?*/
export interface WorkLogSubagentAction {
  tool: string;
  status: string;
  summaryText: string;
  model?: string | undefined;
  prompt?: string | undefined;
}

interface DerivedWorkLogEntry extends WorkLogEntry {
  activityKind: OrchestrationThreadActivity["kind"];
  collapseKey?: string;
  collapseCommand?: string;
  toolName?: string;
}

/** 寰呭鎵硅姹傦紝琛ㄧず闇€瑕佺敤鎴锋壒鍑嗙殑鎿嶄綔 */
export interface PendingApproval {
  requestId: ApprovalRequestId;
  requestKind: "command" | "file-read" | "file-change";
  createdAt: string;
  detail?: string;
}

/** 寰呭鐞嗙殑鐢ㄦ埛杈撳叆璇锋眰锛屽寘鍚渶瑕佺敤鎴峰洖绛旂殑闂 */
export interface PendingUserInput {
  requestId: ApprovalRequestId;
  createdAt: string;
  questions: ReadonlyArray<UserInputQuestion>;
}

/** 娲昏穬浠诲姟鍒楄〃鐘舵€侊紝琛ㄧず褰撳墠杞鐨勪换鍔¤繘搴?*/
export interface ActiveTaskListState {
  createdAt: string;
  turnId: TurnId | null;
  explanation?: string | null;
  tasks: Array<{
    task: string;
    status: "pending" | "inProgress" | "completed";
  }>;
}

/** 娲昏穬鍚庡彴浠诲姟鐘舵€侊紝缁熻褰撳墠姝ｅ湪杩愯鐨勫悗鍙颁换鍔℃暟閲?*/
export interface ActiveBackgroundTasksState {
  activeCount: number;
}

/** 鏈€鏂扮殑鎻愯璁″垝鐘舵€?*/
export interface LatestProposedPlanState {
  id: OrchestrationProposedPlanId;
  createdAt: string;
  updatedAt: string;
  turnId: TurnId | null;
  planMarkdown: string;
  implementedAt: string | null;
  implementationThreadId: ThreadId | null;
}

/**
 * 鏃堕棿绾挎潯鐩被鍨嬶紝鐢ㄤ簬鑱婂ぉ鐣岄潰鐨勬椂闂寸嚎娓叉煋銆? * 鍖呭惈娑堟伅銆佹彁璁鍒掑拰宸ヤ綔鏃ュ織涓夌绫诲瀷銆? */
export type TimelineEntry =
  | {
      id: string;
      kind: "message";
      createdAt: string;
      message: ChatMessage;
    }
  | {
      id: string;
      kind: "proposed-plan";
      createdAt: string;
      proposedPlan: ProposedPlan;
    }
  | {
      id: string;
      kind: "work";
      createdAt: string;
      entry: WorkLogEntry;
    };

/**
 * 鏍煎紡鍖栨寔缁椂闂翠负浜哄彲璇荤殑瀛楃涓? *
 * @param durationMs - 鎸佺画鏃堕棿锛堟绉掞級
 * @returns 鏍煎紡鍖栧悗鐨勫瓧绗︿覆锛堝 "1.5s"銆?2m 30s"锛? *
 * @example
 * formatDuration(500)   // => "500ms"
 * formatDuration(1500)  // => "1.5s"
 * formatDuration(90000) // => "1m 30s"
 */
export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "0ms";
  if (durationMs < 1_000) return `${Math.max(1, Math.round(durationMs))}ms`;
  if (durationMs < 10_000) return `${(durationMs / 1_000).toFixed(1)}s`;
  if (durationMs < 60_000) return `${Math.round(durationMs / 1_000)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  if (seconds === 0) return `${minutes}m`;
  if (seconds === 60) return `${minutes + 1}m`;
  return `${minutes}m ${seconds}s`;
}

/**
 * 鏍煎紡鍖栦袱涓椂闂寸偣涔嬮棿鐨勭粡杩囨椂闂? *
 * @param startIso - 寮€濮嬫椂闂达紙ISO 鏍煎紡锛? * @param endIso - 缁撴潫鏃堕棿锛圛SO 鏍煎紡锛夛紝鏈彁渚涙椂杩斿洖 null
 * @returns 鏍煎紡鍖栧悗鐨勭粡杩囨椂闂达紝鏃堕棿鏃犳晥鏃惰繑鍥?null
 */
export function formatElapsed(startIso: string, endIso: string | undefined): string | null {
  if (!endIso) return null;
  const startedAt = Date.parse(startIso);
  const endedAt = Date.parse(endIso);
  if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
    return null;
  }
  return formatDuration(endedAt - startedAt);
}

type LatestTurnTiming = Pick<
  OrchestrationLatestTurn,
  "turnId" | "state" | "startedAt" | "completedAt"
>;
type SessionActivityState = Pick<ThreadSession, "orchestrationStatus" | "activeTurnId">;

/**
 * 鍒ゆ柇鏈€鏂拌疆娆℃槸鍚﹀凡缁撴潫锛堝畬鎴愩€佷腑鏂垨鍑洪敊锛? *
 * @param latestTurn - 鏈€鏂拌疆娆＄殑鏃堕棿淇℃伅
 * @param session - 浼氳瘽娲诲姩鐘舵€? * @returns 鏈€鏂拌疆娆℃槸鍚﹀凡缁撴潫
 */
export function isLatestTurnSettled(
  latestTurn: LatestTurnTiming | null,
  session: SessionActivityState | null,
): boolean {
  if (!latestTurn?.startedAt) return false;
  if (!latestTurn.completedAt) return false;
  if (latestTurn.state === "interrupted" || latestTurn.state === "error") {
    return true;
  }
  if (!session) return true;
  if (session.orchestrationStatus === "running") return false;
  return true;
}

/**
 * 鍒ゆ柇鏈€鏂拌疆娆℃槸鍚︿粛鍦ㄦ椿璺冿紙涓?isLatestTurnSettled 浜掍负鍙嶅嚱鏁帮級
 *
 * @param latestTurn - 鏈€鏂拌疆娆＄殑鏃堕棿淇℃伅
 * @param session - 浼氳瘽娲诲姩鐘舵€? * @returns 鏈€鏂拌疆娆℃槸鍚︿粛鍦ㄦ椿璺? */
export function hasLiveLatestTurn(
  latestTurn: LatestTurnTiming | null,
  session: SessionActivityState | null,
): boolean {
  if (!latestTurn?.startedAt) {
    return false;
  }
  return !isLatestTurnSettled(latestTurn, session);
}

/**
 * 鎺ㄥ娲昏穬宸ヤ綔鐨勫紑濮嬫椂闂淬€? * 浼樺厛浣跨敤姝ｅ湪杩愯鐨勮疆娆″紑濮嬫椂闂达紝鍏舵浣跨敤娑堟伅鍙戦€佹椂闂淬€? *
 * @param latestTurn - 鏈€鏂拌疆娆＄殑鏃堕棿淇℃伅
 * @param session - 浼氳瘽娲诲姩鐘舵€? * @param sendStartedAt - 娑堟伅鍙戦€佺殑寮€濮嬫椂闂? * @returns 娲昏穬宸ヤ綔鐨勫紑濮嬫椂闂? */
export function deriveActiveWorkStartedAt(
  latestTurn: LatestTurnTiming | null,
  session: SessionActivityState | null,
  sendStartedAt: string | null,
): string | null {
  const runningTurnId =
    session?.orchestrationStatus === "running" ? (session.activeTurnId ?? null) : null;
  if (runningTurnId !== null && runningTurnId === latestTurn?.turnId) {
    return latestTurn?.startedAt ?? sendStartedAt;
  }
  if (runningTurnId !== null) {
    return sendStartedAt;
  }
  if (!isLatestTurnSettled(latestTurn, session)) {
    return latestTurn?.startedAt ?? sendStartedAt;
  }
  return sendStartedAt;
}

function requestKindFromRequestType(requestType: unknown): PendingApproval["requestKind"] | null {
  switch (requestType) {
    case "command_execution_approval":
    case "exec_command_approval":
      return "command";
    case "file_read_approval":
      return "file-read";
    case "file_change_approval":
    case "apply_patch_approval":
      return "file-change";
    default:
      return null;
  }
}

function isStalePendingRequestFailureDetail(detail: string | undefined): boolean {
  const normalized = detail?.toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("stale pending approval request") ||
    normalized.includes("stale pending user-input request") ||
    normalized.includes("unknown pending approval request") ||
    normalized.includes("unknown pending permission request") ||
    normalized.includes("unknown pending user-input request")
  );
}

/**
 * 浠庢椿鍔ㄦ祦涓帹瀵煎綋鍓嶅緟瀹℃壒鐨勮姹傚垪琛ㄣ€? * 璺熻釜瀹℃壒璇锋眰鐨勫紑鍚拰瑙ｅ喅浜嬩欢锛岃嚜鍔ㄦ竻鐞嗚繃鏈熺殑寰呭鎵归」銆? *
 * @param activities - 缂栨帓娲诲姩娴? * @returns 鎸夊垱寤烘椂闂存帓搴忕殑寰呭鎵硅姹傚垪琛? */
export function derivePendingApprovals(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): PendingApproval[] {
  const openByRequestId = new Map<ApprovalRequestId, PendingApproval>();
  const ordered = [...activities].toSorted(compareActivitiesByOrder);

  for (const activity of ordered) {
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const requestId =
      payload && typeof payload.requestId === "string"
        ? payload.requestId as ApprovalRequestId
        : null;
    const requestKind =
      payload &&
      (payload.requestKind === "command" ||
        payload.requestKind === "file-read" ||
        payload.requestKind === "file-change")
        ? payload.requestKind
        : payload
          ? requestKindFromRequestType(payload.requestType)
          : null;
    const detail = payload && typeof payload.detail === "string" ? payload.detail : undefined;

    if (activity.kind === "approval.requested" && requestId && requestKind) {
      openByRequestId.set(requestId, {
        requestId,
        requestKind,
        createdAt: activity.createdAt,
        ...(detail ? { detail } : {}),
      });
      continue;
    }

    if (activity.kind === "approval.resolved" && requestId) {
      openByRequestId.delete(requestId);
      continue;
    }

    if (
      activity.kind === "provider.approval.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openByRequestId.delete(requestId);
      continue;
    }
  }

  return [...openByRequestId.values()].toSorted((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function parseUserInputQuestions(
  payload: Record<string, unknown> | null,
): ReadonlyArray<UserInputQuestion> | null {
  const questions = payload?.questions;
  if (!Array.isArray(questions)) {
    return null;
  }
  const parsed = questions
    .map<UserInputQuestion | null>((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const question = entry as Record<string, unknown>;
      if (
        typeof question.id !== "string" ||
        typeof question.header !== "string" ||
        typeof question.question !== "string" ||
        !Array.isArray(question.options)
      ) {
        return null;
      }
      const options = question.options
        .map<UserInputQuestion["options"][number] | null>((option) => {
          if (!option || typeof option !== "object") return null;
          const optionRecord = option as Record<string, unknown>;
          if (
            typeof optionRecord.label !== "string" ||
            typeof optionRecord.description !== "string"
          ) {
            return null;
          }
          return {
            label: optionRecord.label,
            description: optionRecord.description,
          };
        })
        .filter((option): option is UserInputQuestion["options"][number] => option !== null);
      if (options.length === 0) {
        return null;
      }
      return {
        id: question.id,
        header: question.header,
        question: question.question,
        options,
        ...(question.multiSelect === true ? { multiSelect: true } : {}),
      };
    })
    .filter((question): question is UserInputQuestion => question !== null);
  return parsed.length > 0 ? parsed : null;
}

/**
 * 浠庢椿鍔ㄦ祦涓帹瀵煎綋鍓嶅緟澶勭悊鐨勭敤鎴疯緭鍏ヨ姹傚垪琛ㄣ€? * 璺熻釜鐢ㄦ埛杈撳叆璇锋眰鐨勫紑鍚拰瑙ｅ喅浜嬩欢锛岃嚜鍔ㄦ竻鐞嗚繃鏈熺殑璇锋眰銆? *
 * @param activities - 缂栨帓娲诲姩娴? * @returns 鎸夊垱寤烘椂闂存帓搴忕殑寰呭鐞嗙敤鎴疯緭鍏ュ垪琛? */
export function derivePendingUserInputs(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): PendingUserInput[] {
  const openByRequestId = new Map<ApprovalRequestId, PendingUserInput>();
  const ordered = [...activities].toSorted(compareActivitiesByOrder);

  for (const activity of ordered) {
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const requestId =
      payload && typeof payload.requestId === "string"
        ? payload.requestId as ApprovalRequestId
        : null;
    const detail = payload && typeof payload.detail === "string" ? payload.detail : undefined;

    if (activity.kind === "user-input.requested" && requestId) {
      const questions = parseUserInputQuestions(payload);
      if (!questions) {
        continue;
      }
      openByRequestId.set(requestId, {
        requestId,
        createdAt: activity.createdAt,
        questions,
      });
      continue;
    }

    if (activity.kind === "user-input.resolved" && requestId) {
      openByRequestId.delete(requestId);
      continue;
    }

    if (
      activity.kind === "provider.user-input.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openByRequestId.delete(requestId);
    }
  }

  return [...openByRequestId.values()].toSorted((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function toActiveTaskListState(activity: OrchestrationThreadActivity): ActiveTaskListState | null {
  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  const rawTasks = payload?.tasks;
  if (!Array.isArray(rawTasks)) {
    return null;
  }
  const tasks = rawTasks
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.task !== "string") {
        return null;
      }
      const status =
        record.status === "completed" || record.status === "inProgress" ? record.status : "pending";
      return {
        task: record.task,
        status,
      };
    })
    .filter(
      (
        task,
      ): task is {
        task: string;
        status: "pending" | "inProgress" | "completed";
      } => task !== null,
    );
  if (tasks.length === 0) {
    return null;
  }
  return {
    createdAt: activity.createdAt,
    turnId: activity.turnId,
    ...(payload && "explanation" in payload
      ? { explanation: payload.explanation as string | null }
      : {}),
    tasks,
  };
}

/**
 * 浠庢椿鍔ㄦ祦涓帹瀵煎綋鍓嶆椿璺冪殑浠诲姟鍒楄〃鐘舵€併€? * 浼樺厛鏄剧ず褰撳墠杞鐨勪换鍔★紝鑻ユ棤鍒欏洖閫€鍒版渶杩戞湭瀹屾垚鐨勫厛鍓嶈疆娆′换鍔°€? *
 * @param activities - 缂栨帓娲诲姩娴? * @param latestTurnId - 鏈€鏂拌疆娆?ID
 * @returns 娲昏穬浠诲姟鍒楄〃鐘舵€侊紝鏃犳椿璺冧换鍔℃椂杩斿洖 null
 */
export function deriveActiveTaskListState(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  latestTurnId: TurnId | undefined,
): ActiveTaskListState | null {
  const ordered = [...activities].toSorted(compareActivitiesByOrder);
  const allTaskListActivities = ordered.filter(
    (activity) => activity.kind === "turn.tasks.updated",
  );
  const settledTurnIds = new Set<TurnId>();

  // A prior-turn task list only stays visible while that originating turn is still unresolved.
  for (const activity of ordered) {
    if (!activity.turnId) {
      continue;
    }
    if (activity.kind === "turn.completed" || activity.kind === "turn.aborted") {
      settledTurnIds.add(activity.turnId);
    }
  }

  const currentTurnTaskList = latestTurnId
    ? (allTaskListActivities
        .filter((activity) => activity.turnId === latestTurnId)
        .map(toActiveTaskListState)
        .findLast((taskList) => taskList !== null) ?? null)
    : null;
  if (currentTurnTaskList) {
    return currentTurnTaskList;
  }

  // Keep the most recent unfinished prior task list visible so implementation turns
  // that have started but not emitted their own task update can still show progress.
  const latestPriorTaskList =
    allTaskListActivities.map(toActiveTaskListState).findLast((taskList) => taskList !== null) ??
    null;
  if (!latestPriorTaskList) {
    return null;
  }

  if (latestPriorTaskList.turnId && settledTurnIds.has(latestPriorTaskList.turnId)) {
    return null;
  }

  return latestPriorTaskList.tasks.some((task) => task.status !== "completed")
    ? latestPriorTaskList
    : null;
}

/**
 * 缁熻褰撳墠娲昏穬鐨勫悗鍙颁换鍔℃暟閲忥紙鎺掗櫎 plan 绫诲瀷浠诲姟锛夈€? * 鐢ㄤ簬绱у噾 UI 涓睍绀轰唬鐞嗘椿鍔ㄧ姸鎬併€? *
 * @param activities - 缂栨帓娲诲姩娴? * @param latestTurnId - 鏈€鏂拌疆娆?ID
 * @returns 娲昏穬鍚庡彴浠诲姟鐘舵€侊紝鏃犳椿璺冧换鍔℃椂杩斿洖 null
 */
export function deriveActiveBackgroundTasksState(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  latestTurnId: TurnId | undefined,
): ActiveBackgroundTasksState | null {
  const ordered = [...activities].toSorted(compareActivitiesByOrder);
  const activeTasks = new Map<string, { taskType?: string | undefined }>();

  for (const activity of ordered) {
    if (
      latestTurnId &&
      activity.turnId &&
      activity.turnId !== latestTurnId &&
      activity.kind !== "task.completed"
    ) {
      continue;
    }

    if (
      activity.kind !== "task.started" &&
      activity.kind !== "task.progress" &&
      activity.kind !== "task.completed"
    ) {
      continue;
    }

    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const taskId = payload && typeof payload.taskId === "string" ? payload.taskId : null;
    if (!taskId) {
      continue;
    }

    if (activity.kind === "task.completed") {
      activeTasks.delete(taskId);
      continue;
    }

    const previous = activeTasks.get(taskId);
    const taskType = payload && typeof payload.taskType === "string" ? payload.taskType : undefined;
    activeTasks.set(taskId, {
      taskType: taskType ?? previous?.taskType,
    });
  }

  const activeCount = [...activeTasks.values()].filter((task) => task.taskType !== "plan").length;
  return activeCount > 0 ? { activeCount } : null;
}

/**
 * 鍒ゆ柇鏈€鏂拌疆娆℃槸鍚︿粛鏈?灏鹃儴宸ヤ綔"姝ｅ湪杩涜銆? * 褰?Provider 浠嶆湁鍙鐨勫姪鎵嬫枃鏈湪娴佸紡杈撳嚭鎴栧悗鍙颁换鍔℃洿鏂版椂锛孶I 搴斾繚鎸?宸ヤ綔涓?鐘舵€併€? *
 * @param input.latestTurn - 鏈€鏂拌疆娆′俊鎭? * @param input.messages - 娑堟伅鍒楄〃
 * @param input.activities - 娲诲姩娴? * @param input.session - 浼氳瘽鐘舵€? * @returns 鏄惁浠嶆湁灏鹃儴宸ヤ綔
 */
export function hasLiveTurnTailWork(input: {
  latestTurn: Pick<OrchestrationLatestTurn, "turnId" | "completedAt"> | null;
  messages: ReadonlyArray<Pick<ChatMessage, "role" | "streaming" | "turnId">>;
  activities: ReadonlyArray<OrchestrationThreadActivity>;
  session?: Pick<ThreadSession, "orchestrationStatus"> | null;
}): boolean {
  const latestTurnId = input.latestTurn?.turnId;
  if (!latestTurnId) {
    return false;
  }

  const hasStreamingAssistantText = input.messages.some(
    (message) =>
      message.role === "assistant" && message.turnId === latestTurnId && message.streaming,
  );
  if (hasStreamingAssistantText) {
    // Once the turn is terminal, a stale `streaming` flag should not keep the
    // stop button/timer alive indefinitely.
    return input.latestTurn?.completedAt == null;
  }

  // Some providers can leave task lifecycle bookkeeping behind after the turn
  // has already closed. Once the session is no longer running, those stale
  // task rows should not keep the whole chat in a live state.
  if (input.session?.orchestrationStatus !== "running") {
    return false;
  }

  if (deriveActiveBackgroundTasksState(input.activities, latestTurnId) !== null) {
    return true;
  }

  return false;
}

function isCollabAgentToolActivity(activity: OrchestrationThreadActivity): boolean {
  const payload = asRecord(activity.payload);
  return asTrimmedString(payload?.itemType) === "collab_agent_tool_call";
}

/**
 * 鏌ユ壘鏈€鏂扮殑鎻愯璁″垝鐘舵€併€? * 浼樺厛鏌ユ壘褰撳墠杞鐨勮鍒掞紝鑻ユ棤鍒欏洖閫€鍒板叏灞€鏈€鏂拌鍒掋€? *
 * @param proposedPlans - 鎻愯璁″垝鍒楄〃
 * @param latestTurnId - 鏈€鏂拌疆娆?ID
 * @returns 鏈€鏂扮殑鎻愯璁″垝鐘舵€侊紝鏃犺鍒掓椂杩斿洖 null
 */
export function findLatestProposedPlan(
  proposedPlans: ReadonlyArray<ProposedPlan>,
  latestTurnId: TurnId | string | null | undefined,
): LatestProposedPlanState | null {
  if (latestTurnId) {
    const matchingTurnPlan = [...proposedPlans]
      .filter((proposedPlan) => proposedPlan.turnId === latestTurnId)
      .toSorted(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
      )
      .at(-1);
    if (matchingTurnPlan) {
      return toLatestProposedPlanState(matchingTurnPlan);
    }
  }

  const latestPlan = [...proposedPlans]
    .toSorted(
      (left, right) =>
        left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
    )
    .at(-1);
  if (!latestPlan) {
    return null;
  }

  return toLatestProposedPlanState(latestPlan);
}

/**
 * 鏌ユ壘渚ц竟鏍忓簲鏄剧ず鐨勬彁璁鍒掋€? * 褰撴渶鏂拌疆娆℃湭缁撴潫鏃讹紝浼樺厛鏄剧ず鍏跺叧鑱旂殑婧愯鍒掋€? *
 * @param input.threads - 绾跨▼鍒楄〃
 * @param input.latestTurn - 鏈€鏂拌疆娆′俊鎭? * @param input.latestTurnSettled - 鏈€鏂拌疆娆℃槸鍚﹀凡缁撴潫
 * @param input.threadId - 褰撳墠绾跨▼ ID
 * @returns 渚ц竟鏍忓簲鏄剧ず鐨勬彁璁鍒掔姸鎬? */
export function findSidebarProposedPlan(input: {
  threads: ReadonlyArray<Pick<Thread, "id" | "proposedPlans">>;
  latestTurn: Pick<OrchestrationLatestTurn, "turnId" | "sourceProposedPlan"> | null;
  latestTurnSettled: boolean;
  threadId: ThreadId | string | null | undefined;
}): LatestProposedPlanState | null {
  const activeThreadPlans =
    input.threads.find((thread) => thread.id === input.threadId)?.proposedPlans ?? [];

  if (!input.latestTurnSettled) {
    const sourceProposedPlan = input.latestTurn?.sourceProposedPlan;
    if (sourceProposedPlan) {
      const sourcePlan = input.threads
        .find((thread) => thread.id === sourceProposedPlan.threadId)
        ?.proposedPlans.find((plan) => plan.id === sourceProposedPlan.planId);
      if (sourcePlan) {
        return toLatestProposedPlanState(sourcePlan);
      }
    }
  }

  return findLatestProposedPlan(activeThreadPlans, input.latestTurn?.turnId ?? null);
}

/**
 * 鍒ゆ柇鎻愯璁″垝鏄惁鍙搷浣滐紙灏氭湭瀹炴柦锛? *
 * @param proposedPlan - 鎻愯璁″垝鐘舵€? * @returns 鏄惁鍙搷浣? */
export function hasActionableProposedPlan(
  proposedPlan: LatestProposedPlanState | Pick<ProposedPlan, "implementedAt"> | null,
): boolean {
  return proposedPlan !== null && proposedPlan.implementedAt === null;
}

/**
 * 浠庢椿鍔ㄦ祦涓帹瀵煎伐浣滄棩蹇楁潯鐩垪琛ㄣ€? * 杩囨护鎺変笉闇€瑕佸睍绀虹殑娲诲姩绫诲瀷锛堝浠诲姟鐢熷懡鍛ㄦ湡銆侀€熺巼闄愬埗鏇存柊绛夛級锛? * 骞跺皢鍚屼竴宸ュ叿璋冪敤鐨勫涓敓鍛藉懆鏈熶簨浠跺悎骞朵负鍗曟潯鐩€? *
 * @param activities - 缂栨帓娲诲姩娴? * @param latestTurnId - 鏈€鏂拌疆娆?ID锛屼负 undefined 鏃舵樉绀烘墍鏈夎疆娆? * @returns 宸ヤ綔鏃ュ織鏉＄洰鍒楄〃
 */
export function deriveWorkLogEntries(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  latestTurnId: TurnId | undefined,
): WorkLogEntry[] {
  const ordered = [...activities].toSorted(compareActivitiesByOrder);
  const entries = ordered
    .filter((activity) =>
      latestTurnId
        ? activity.turnId === latestTurnId ||
          (activity.kind === "context-compaction" && activity.turnId === null)
        : true,
    )
    .filter((activity) => !isCollabAgentToolActivity(activity))
    .filter((activity) => activity.kind !== "task.started" && activity.kind !== "task.completed")
    .filter((activity) => activity.kind !== "account.rate-limits.updated")
    .filter(
      (activity) =>
        activity.kind !== "context-window.updated" && activity.kind !== "context-window.configured",
    )
    .filter((activity) => activity.summary !== "Checkpoint captured")
    .filter((activity) => !isPlanBoundaryToolActivity(activity))
    .filter((activity) => !isUninformativeCommandStartActivity(activity))
    .map(toDerivedWorkLogEntry);
  return collapseDerivedWorkLogEntries(entries).map(
    ({
      activityKind: _activityKind,
      collapseCommand: _collapseCommand,
      collapseKey: _collapseKey,
      toolName: _toolName,
      ...entry
    }) => entry,
  );
}

function isUninformativeCommandStartActivity(activity: OrchestrationThreadActivity): boolean {
  if (activity.kind !== "tool.started") {
    return false;
  }
  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  if (extractWorkLogItemType(payload) !== "command_execution") {
    return false;
  }
  const commandAction = extractPrimaryCommandAction(payload);
  const commandPreview = extractToolCommand(payload, commandAction);
  return !commandAction && !commandPreview.command;
}

function isPlanBoundaryToolActivity(activity: OrchestrationThreadActivity): boolean {
  if (activity.kind !== "tool.updated" && activity.kind !== "tool.completed") {
    return false;
  }

  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  return typeof payload?.detail === "string" && payload.detail.startsWith("ExitPlanMode:");
}

function toDerivedWorkLogEntry(activity: OrchestrationThreadActivity): DerivedWorkLogEntry {
  const payload =
    activity.payload && typeof activity.payload === "object"
      ? (activity.payload as Record<string, unknown>)
      : null;
  const commandAction = extractPrimaryCommandAction(payload);
  const commandPreview = extractToolCommand(payload, commandAction);
  const changedFiles = extractChangedFiles(payload);
  const title = extractToolTitle(payload);
  const toolName = extractToolName(payload);
  const toolCallId = extractToolCallId(payload);
  const entry: DerivedWorkLogEntry = {
    id: activity.id,
    createdAt: activity.createdAt,
    label: activity.summary,
    tone: activity.tone === "approval" ? "info" : activity.tone,
    activityKind: activity.kind,
    ...(toolName ? { toolName } : {}),
    ...(toolCallId ? { toolCallId } : {}),
  };
  const itemType = extractWorkLogItemType(payload);
  const requestKind = extractWorkLogRequestKind(payload);
  if (payload && typeof payload.detail === "string" && payload.detail.length > 0) {
    const detail = stripTrailingExitCode(payload.detail).output;
    if (detail) {
      entry.detail = detail;
    }
  }
  const outputDetail = summarizeToolPayloadOutput(payload);
  if (!entry.detail && outputDetail) {
    entry.detail = outputDetail;
  }
  if (commandPreview.command) {
    entry.command = commandPreview.command;
  }
  if (commandPreview.rawCommand) {
    entry.rawCommand = commandPreview.rawCommand;
  }
  const commandActionDisplay = deriveCommandActionDisplay(commandAction, activity.kind);
  if (commandActionDisplay?.preview) {
    entry.preview = commandActionDisplay.preview;
  }
  if (changedFiles.length > 0) {
    entry.changedFiles = changedFiles;
  }
  if (itemType) {
    entry.itemType = itemType;
  }
  if (requestKind) {
    entry.requestKind = requestKind;
  }
  const subagents = extractCollabSubagents(payload);
  if (subagents.length > 0) {
    entry.subagents = subagents;
  }
  const subagentAction = extractCollabAction(payload, subagents);
  if (subagentAction) {
    entry.subagentAction = subagentAction;
  }
  const readableTitle = deriveReadableToolTitle({
    title: commandActionDisplay?.title ?? title,
    fallbackLabel: activity.summary,
    itemType,
    requestKind,
    command: commandPreview.command,
    payload,
    isRunning: activity.kind !== "tool.completed",
  });
  if (readableTitle) {
    entry.toolTitle = readableTitle;
  }
  const collapseKey = deriveToolLifecycleCollapseKey(entry);
  if (collapseKey) {
    entry.collapseKey = collapseKey;
  }
  const collapseCommand = deriveToolLifecycleCollapseCommand(entry);
  if (collapseCommand) {
    entry.collapseCommand = collapseCommand;
  }
  return entry;
}

function summarizeToolPayloadOutput(payload: Record<string, unknown> | null): string | null {
  const data = asRecord(payload?.data);
  return summarizeToolRawOutput(data?.rawOutput) ?? null;
}

function collapseDerivedWorkLogEntries(
  entries: ReadonlyArray<DerivedWorkLogEntry>,
): DerivedWorkLogEntry[] {
  const collapsed: DerivedWorkLogEntry[] = [];
  for (const entry of entries) {
    const previous = collapsed.at(-1);
    if (previous && shouldCollapseToolLifecycleEntries(previous, entry)) {
      collapsed[collapsed.length - 1] = mergeDerivedWorkLogEntries(previous, entry);
      continue;
    }
    collapsed.push(entry);
  }
  return collapsed;
}

function shouldCollapseToolLifecycleEntries(
  previous: DerivedWorkLogEntry,
  next: DerivedWorkLogEntry,
): boolean {
  if (!isRenderableToolLifecycleActivity(previous.activityKind)) {
    return false;
  }
  if (!isRenderableToolLifecycleActivity(next.activityKind)) {
    return false;
  }
  if (previous.activityKind === "tool.completed") {
    return false;
  }
  if (previous.collapseKey !== undefined && previous.collapseKey === next.collapseKey) {
    if (previous.collapseKey.startsWith("tool:")) {
      return true;
    }
    if (!areToolLifecycleChangedFilesCompatible(previous.changedFiles, next.changedFiles)) {
      return false;
    }
    return areToolLifecycleCommandsCompatible(previous.collapseCommand, next.collapseCommand);
  }
  return (
    previous.toolCallId !== undefined &&
    next.toolCallId === undefined &&
    previous.itemType === next.itemType &&
    normalizeCompactToolLabel(previous.toolTitle ?? previous.label) ===
      normalizeCompactToolLabel(next.toolTitle ?? next.label) &&
    areToolLifecycleChangedFilesCompatible(previous.changedFiles, next.changedFiles) &&
    areToolLifecycleCommandsCompatible(previous.collapseCommand, next.collapseCommand)
  );
}

function mergeDerivedWorkLogEntries(
  previous: DerivedWorkLogEntry,
  next: DerivedWorkLogEntry,
): DerivedWorkLogEntry {
  const changedFiles = mergeChangedFiles(previous.changedFiles, next.changedFiles);
  const detail = next.detail ?? previous.detail;
  const command = next.command ?? previous.command;
  const rawCommand = next.rawCommand ?? previous.rawCommand;
  const preview = next.preview ?? previous.preview;
  const toolTitle = next.toolTitle ?? previous.toolTitle;
  const itemType = next.itemType ?? previous.itemType;
  const requestKind = next.requestKind ?? previous.requestKind;
  const subagents = next.subagents ?? previous.subagents;
  const subagentAction = next.subagentAction ?? previous.subagentAction;
  const collapseKey = next.collapseKey ?? previous.collapseKey;
  const toolName = next.toolName ?? previous.toolName;
  const toolCallId = next.toolCallId ?? previous.toolCallId;
  return {
    ...previous,
    ...next,
    ...(detail ? { detail } : {}),
    ...(command ? { command } : {}),
    ...(rawCommand ? { rawCommand } : {}),
    ...(preview ? { preview } : {}),
    ...(changedFiles.length > 0 ? { changedFiles } : {}),
    ...(toolTitle ? { toolTitle } : {}),
    ...(itemType ? { itemType } : {}),
    ...(requestKind ? { requestKind } : {}),
    ...(subagents ? { subagents } : {}),
    ...(subagentAction ? { subagentAction } : {}),
    ...(collapseKey ? { collapseKey } : {}),
    ...(toolName ? { toolName } : {}),
    ...(toolCallId ? { toolCallId } : {}),
  };
}

function mergeChangedFiles(
  previous: ReadonlyArray<string> | undefined,
  next: ReadonlyArray<string> | undefined,
): string[] {
  const merged = [...(previous ?? []), ...(next ?? [])];
  if (merged.length === 0) {
    return [];
  }
  return [...new Set(merged)];
}

// Keep a stable lifecycle key so providers like Claude can stream many
// in-progress tool deltas without turning each partial update into its own row.
function deriveToolLifecycleCollapseKey(entry: DerivedWorkLogEntry): string | undefined {
  if (!isRenderableToolLifecycleActivity(entry.activityKind)) {
    return undefined;
  }
  if (entry.toolCallId) {
    return `tool:${entry.toolCallId}`;
  }
  const normalizedLabel = normalizeCompactToolLabel(entry.toolTitle ?? entry.label);
  const itemType = entry.itemType ?? "";
  const requestKind = entry.requestKind ?? "";
  const toolName = entry.toolName ?? "";
  const command = normalizeCompactToolLabel(entry.command ?? "");
  const detailHint = normalizeCompactToolLabel(extractDetailCollapseHint(entry.detail));
  if (
    normalizedLabel.length === 0 &&
    itemType.length === 0 &&
    requestKind.length === 0 &&
    toolName.length === 0 &&
    detailHint.length === 0
  ) {
    return command.length > 0 ? `command-only${"\u001f"}${command}` : undefined;
  }
  return [itemType, normalizedLabel, requestKind, toolName, detailHint].join("\u001f");
}

function isRenderableToolLifecycleActivity(
  kind: OrchestrationThreadActivity["kind"],
): kind is "tool.started" | "tool.updated" | "tool.completed" {
  return kind === "tool.started" || kind === "tool.updated" || kind === "tool.completed";
}

function deriveToolLifecycleCollapseCommand(entry: DerivedWorkLogEntry): string | undefined {
  const command = normalizeCompactToolLabel(entry.command ?? "");
  return command.length > 0 ? command : undefined;
}

function areToolLifecycleCommandsCompatible(
  previous: string | undefined,
  next: string | undefined,
): boolean {
  if (!previous || !next) {
    return true;
  }
  return previous === next || previous.startsWith(next) || next.startsWith(previous);
}

function areToolLifecycleChangedFilesCompatible(
  previous: ReadonlyArray<string> | undefined,
  next: ReadonlyArray<string> | undefined,
): boolean {
  if (!previous?.length || !next?.length) {
    return true;
  }
  return previous.some((path) => next.includes(path));
}

function toLatestProposedPlanState(proposedPlan: ProposedPlan): LatestProposedPlanState {
  return {
    id: proposedPlan.id,
    createdAt: proposedPlan.createdAt,
    updatedAt: proposedPlan.updatedAt,
    turnId: proposedPlan.turnId,
    planMarkdown: proposedPlan.planMarkdown,
    implementedAt: proposedPlan.implementedAt,
    implementationThreadId: proposedPlan.implementationThreadId,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCollabIdentifier(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.trim().toLowerCase().replaceAll("_", "").replaceAll("-", "");
}

function collabPayloadItem(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const data = asRecord(payload?.data);
  return asRecord(data?.item) ?? data;
}

function inferSubagentActionTool(item: Record<string, unknown> | null): string | null {
  const directTool = asTrimmedString(item?.tool ?? item?.name);
  if (directTool) {
    return directTool;
  }

  const normalizedType = normalizeCollabIdentifier(asTrimmedString(item?.type));
  if (!normalizedType) {
    return null;
  }
  if (normalizedType.includes("spawn")) return "spawnAgent";
  if (normalizedType.includes("wait")) return "waitAgent";
  if (normalizedType.includes("close")) return "closeAgent";
  if (normalizedType.includes("resume")) return "resumeAgent";
  if (normalizedType.includes("interaction")) return "sendInput";
  return "spawnAgent";
}

function summarizeSubagentAction(tool: string, count: number): string {
  const normalizedTool = normalizeCollabIdentifier(tool) ?? "";
  const effectiveCount = Math.max(1, count);
  const noun = effectiveCount === 1 ? "agent" : "agents";
  switch (normalizedTool) {
    case "spawnagent":
      return `Spawning ${effectiveCount} ${noun}`;
    case "wait":
    case "waitagent":
      return `Waiting on ${effectiveCount} ${noun}`;
    case "closeagent":
      return `Closing ${effectiveCount} ${noun}`;
    case "resumeagent":
      return `Resuming ${effectiveCount} ${noun}`;
    case "sendinput":
      return effectiveCount === 1 ? "Updating agent" : "Updating agents";
    default:
      return effectiveCount === 1 ? "Agent activity" : `Agent activity (${effectiveCount})`;
  }
}

function extractCollabAction(
  payload: Record<string, unknown> | null,
  subagents: ReadonlyArray<WorkLogSubagent>,
): WorkLogSubagentAction | undefined {
  const itemType = extractWorkLogItemType(payload);
  if (itemType !== "collab_agent_tool_call") {
    return undefined;
  }

  const item = collabPayloadItem(payload);
  const tool = inferSubagentActionTool(item);
  const status = asTrimmedString(item?.status ?? payload?.status) ?? "in_progress";
  const model = asTrimmedString(
    item?.model ??
      item?.modelName ??
      item?.model_name ??
      item?.requestedModel ??
      item?.requested_model,
  );
  const prompt = asTrimmedString(item?.prompt ?? item?.task ?? item?.message);
  const agentStates = decodeSubagentAgentStates(item);
  const receiverThreadIds = decodeSubagentReceiverThreadIds(item);
  const count = Math.max(
    subagents.length,
    receiverThreadIds.length,
    Object.keys(agentStates).length,
  );

  if (!tool && !model && !prompt && count === 0) {
    return undefined;
  }

  return {
    tool: tool ?? "spawnAgent",
    status,
    summaryText: summarizeSubagentAction(tool ?? "spawnAgent", count),
    ...(model ? { model } : {}),
    ...(prompt ? { prompt } : {}),
  };
}

function extractCollabSubagents(
  payload: Record<string, unknown> | null,
): ReadonlyArray<WorkLogSubagent> {
  const itemType = extractWorkLogItemType(payload);
  if (itemType !== "collab_agent_tool_call") {
    return [];
  }

  const item = collabPayloadItem(payload);
  if (!item) {
    return [];
  }

  const receiverThreadIds = decodeSubagentReceiverThreadIds(item);
  const receiverAgents = decodeSubagentReceiverAgents(item, receiverThreadIds).map((agent) => ({
    threadId: agent.providerThreadId,
    providerThreadId: agent.providerThreadId,
    ...(agent.agentId ? { agentId: agent.agentId } : {}),
    ...(agent.nickname ? { nickname: agent.nickname } : {}),
    ...(agent.role ? { role: agent.role } : {}),
    ...(agent.model ? { model: agent.model } : {}),
    ...(agent.prompt ? { prompt: agent.prompt } : {}),
  }));

  const agentStates = decodeSubagentAgentStates(item);
  if (receiverAgents.length > 0 || Object.keys(agentStates).length > 0) {
    const mergedByThreadId = new Map<string, WorkLogSubagent>();
    for (const agent of receiverAgents) {
      mergedByThreadId.set(agent.threadId, agent);
    }
    for (const [threadId, state] of Object.entries(agentStates)) {
      const previous = mergedByThreadId.get(threadId);
      mergedByThreadId.set(threadId, {
        threadId,
        providerThreadId: previous?.providerThreadId ?? threadId,
        ...previous,
        ...(state.agentId ? { agentId: state.agentId } : {}),
        ...(state.nickname ? { nickname: state.nickname } : {}),
        ...(state.role ? { role: state.role } : {}),
        ...(state.model ? { model: state.model } : {}),
        ...(state.prompt ? { prompt: state.prompt } : {}),
        ...(state.status ? { rawStatus: state.status } : {}),
        ...(state.message ? { latestUpdate: state.message } : {}),
      });
    }
    return [...mergedByThreadId.values()];
  }

  const singularThreadId =
    receiverThreadIds[0] ??
    asTrimmedString(
      item.receiverThreadId ?? item.receiver_thread_id ?? item.threadId ?? item.thread_id,
    );
  if (!singularThreadId) {
    const fallbackIdentity = extractSubagentIdentityHints(item).find(
      (entry) => entry.providerThreadId !== undefined,
    );
    if (!fallbackIdentity?.providerThreadId) {
      return [];
    }
    return [
      {
        threadId: fallbackIdentity.providerThreadId,
        providerThreadId: fallbackIdentity.providerThreadId,
        ...(fallbackIdentity.agentId ? { agentId: fallbackIdentity.agentId } : {}),
        ...(fallbackIdentity.nickname ? { nickname: fallbackIdentity.nickname } : {}),
        ...(fallbackIdentity.role ? { role: fallbackIdentity.role } : {}),
        ...(fallbackIdentity.model ? { model: fallbackIdentity.model } : {}),
        ...(fallbackIdentity.prompt ? { prompt: fallbackIdentity.prompt } : {}),
        ...(fallbackIdentity.status ? { rawStatus: fallbackIdentity.status } : {}),
        ...(fallbackIdentity.message ? { latestUpdate: fallbackIdentity.message } : {}),
      },
    ];
  }
  return [
    {
      threadId: singularThreadId,
      providerThreadId: singularThreadId,
      agentId:
        asTrimmedString(item.agentId ?? item.agent_id ?? item.newAgentId ?? item.new_agent_id) ??
        undefined,
      nickname:
        asTrimmedString(
          item.newAgentNickname ??
            item.new_agent_nickname ??
            item.agentNickname ??
            item.agent_nickname ??
            item.receiverAgentNickname ??
            item.receiver_agent_nickname,
        ) ?? undefined,
      role:
        asTrimmedString(
          item.receiverAgentRole ??
            item.receiver_agent_role ??
            item.newAgentRole ??
            item.new_agent_role ??
            item.agentRole ??
            item.agent_role ??
            item.agentType ??
            item.agent_type,
        ) ?? undefined,
      model:
        asTrimmedString(
          item.model ??
            item.modelName ??
            item.model_name ??
            item.requestedModel ??
            item.requested_model,
        ) ?? undefined,
      prompt: asTrimmedString(item.prompt ?? item.task ?? item.message) ?? undefined,
    },
  ];
}

function normalizeCommandValue(value: unknown): string | null {
  const direct = asTrimmedString(value);
  if (direct) {
    return direct;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const parts = value
    .map((entry) => asTrimmedString(entry))
    .filter((entry): entry is string => entry !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}

function asCommandArgumentRecord(value: unknown): Record<string, unknown> | null {
  const direct = asRecord(value);
  if (direct) {
    return direct;
  }
  const text = asTrimmedString(value);
  if (!text || !text.startsWith("{")) {
    return null;
  }
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function isCommandLikeDetail(payload: Record<string, unknown> | null): boolean {
  if (!payload) {
    return false;
  }
  const itemType = extractWorkLogItemType(payload);
  if (itemType === "command_execution") {
    return true;
  }
  const requestKind = extractWorkLogRequestKind(payload);
  if (requestKind === "command") {
    return true;
  }
  const normalizedTitle = normalizeCompactToolLabel(asTrimmedString(payload.title) ?? "");
  return normalizedTitle === "Ran command" || normalizedTitle === "Command run";
}

interface CommandAction {
  type: string;
  command?: string;
  name?: string;
  path?: string;
  query?: string;
}

interface CommandActionDisplay {
  title: string;
  preview?: string;
}

function makeCommandActionDisplay(
  title: string,
  preview: string | undefined,
): CommandActionDisplay {
  return preview === undefined ? { title } : { title, preview };
}

function extractToolCommand(
  payload: Record<string, unknown> | null,
  commandAction: CommandAction | null = extractPrimaryCommandAction(payload),
): { command: string | null; rawCommand: string | null } {
  const data = asRecord(payload?.data);
  const item = asRecord(data?.item);
  const itemResult = asRecord(item?.result);
  const itemInput = asRecord(item?.input);
  const itemArguments = asCommandArgumentRecord(item?.arguments ?? item?.args ?? item?.params);
  const itemCall = asRecord(item?.call);
  const itemFunction = asRecord(item?.function);
  const dataInput = asRecord(data?.input);
  const dataArguments = asCommandArgumentRecord(data?.arguments ?? data?.args ?? data?.params);
  const rawInput = asCommandArgumentRecord(data?.rawInput);
  const detailCommand =
    isCommandLikeDetail(payload) && typeof payload?.detail === "string"
      ? stripTrailingExitCode(payload.detail).output
      : null;
  const rawCommandCandidates = [
    item?.command,
    item?.cmd,
    itemInput?.command,
    itemInput?.cmd,
    itemArguments?.command,
    itemArguments?.cmd,
    itemCall?.command,
    itemCall?.cmd,
    itemFunction?.arguments,
    itemResult?.command,
    itemResult?.cmd,
    data?.command,
    data?.cmd,
    dataInput?.command,
    dataInput?.cmd,
    dataArguments?.command,
    dataArguments?.cmd,
    rawInput?.command,
    rawInput?.cmd,
    item?.text,
    item?.summary,
    detailCommand,
  ];
  const rawCommand =
    rawCommandCandidates
      .map((candidate) => normalizeCommandValue(candidate))
      .find((candidate) => candidate !== null) ?? null;
  const command =
    normalizeCommandValue(commandAction?.command) ??
    rawCommandCandidates
      .map((candidate) => normalizeCommandValue(candidate))
      .find((candidate) => candidate !== null) ??
    null;
  return {
    command,
    rawCommand: rawCommand && rawCommand !== command ? rawCommand : null,
  };
}

function extractToolTitle(payload: Record<string, unknown> | null): string | null {
  return asTrimmedString(payload?.title);
}

function extractPrimaryCommandAction(
  payload: Record<string, unknown> | null,
): CommandAction | null {
  const data = asRecord(payload?.data);
  const item = asRecord(data?.item);
  const actions = collectCommandActions(payload, data, item);
  for (const action of actions) {
    const actionRecord = asRecord(action);
    if (!actionRecord) {
      continue;
    }
    const type = asTrimmedString(actionRecord.type) ?? "unknown";
    const command = asTrimmedString(actionRecord.command) ?? undefined;
    const name = asTrimmedString(actionRecord.name) ?? undefined;
    const path = asTrimmedString(actionRecord.path) ?? undefined;
    const query = asTrimmedString(actionRecord.query) ?? undefined;
    if (command || name || path || query || type !== "unknown") {
      return {
        type,
        ...(command ? { command } : {}),
        ...(name ? { name } : {}),
        ...(path ? { path } : {}),
        ...(query ? { query } : {}),
      };
    }
  }
  return null;
}

// Codex has emitted commandActions both on the item and on the surrounding raw
// payload; scan the nearby envelopes before falling back to generic command text.
function collectCommandActions(
  payload: Record<string, unknown> | null,
  data: Record<string, unknown> | null,
  item: Record<string, unknown> | null,
): ReadonlyArray<unknown> {
  const candidates = [
    item?.commandActions,
    asCommandArgumentRecord(item?.arguments ?? item?.args ?? item?.params)?.commandActions,
    data?.commandActions,
    asCommandArgumentRecord(data?.arguments ?? data?.args ?? data?.params)?.commandActions,
    asCommandArgumentRecord(data?.rawInput)?.commandActions,
    asCommandArgumentRecord(data?.input)?.commandActions,
    payload?.commandActions,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function deriveCommandActionDisplay(
  action: CommandAction | null,
  activityKind: OrchestrationThreadActivity["kind"],
): CommandActionDisplay | null {
  if (!action) {
    return null;
  }
  const running = activityKind !== "tool.completed";
  switch (normalizeCommandActionType(action.type)) {
    case "read":
    case "readfile":
      return makeCommandActionDisplay(running ? "Reading" : "Read", commandActionTarget(action));
    case "search":
    case "find":
      return makeCommandActionDisplay(
        running ? "Searching" : "Searched",
        commandActionSearchPreview(action),
      );
    case "listfiles":
      return makeCommandActionDisplay(
        running ? "Listing" : "Listed",
        commandActionListPreview(action),
      );
    default:
      return null;
  }
}

function normalizeCommandActionType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function commandActionTarget(action: CommandAction): string | undefined {
  return action.name ?? compactWorkLogPath(action.path) ?? undefined;
}

function commandActionSearchPreview(action: CommandAction): string | undefined {
  const query = action.query ?? action.name;
  const path = compactWorkLogPath(action.path);
  if (query && path) {
    return `for ${query} in ${path}`;
  }
  if (query) {
    return `for ${query}`;
  }
  if (path) {
    return `in ${path}`;
  }
  return commandActionTarget(action);
}

function commandActionListPreview(action: CommandAction): string | undefined {
  return compactWorkLogPath(action.path) ?? action.name ?? undefined;
}

function compactWorkLogPath(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value === ".") {
    return "current directory";
  }
  if (value === "..") {
    return "parent directory";
  }
  const parts = value.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) {
    return value;
  }
  return parts.slice(-2).join("/");
}

function extractToolName(payload: Record<string, unknown> | null): string | null {
  const data = asRecord(payload?.data);
  const item = asRecord(data?.item);
  const itemInput = asRecord(item?.input);
  const candidates = [data?.toolName, data?.tool, item?.toolName, item?.name, itemInput?.toolName];
  for (const candidate of candidates) {
    const normalized = asTrimmedString(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function extractToolCallId(payload: Record<string, unknown> | null): string | null {
  const data = asRecord(payload?.data);
  const item = asRecord(data?.item);
  return asTrimmedString(data?.toolCallId ?? data?.callID ?? data?.callId ?? item?.id);
}

function stripTrailingExitCode(value: string): {
  output: string | null;
  exitCode?: number | undefined;
} {
  const trimmed = value.trim();
  const match = /^(?<output>[\s\S]*?)(?:\s*<exited with exit code (?<code>\d+)>)\s*$/i.exec(
    trimmed,
  );
  if (!match?.groups) {
    return {
      output: trimmed.length > 0 ? trimmed : null,
    };
  }
  const exitCode = Number.parseInt(match.groups.code ?? "", 10);
  const normalizedOutput = match.groups.output?.trim() ?? "";
  return {
    output: normalizedOutput.length > 0 ? normalizedOutput : null,
    ...(Number.isInteger(exitCode) ? { exitCode } : {}),
  };
}

function extractDetailCollapseHint(detail: string | undefined): string {
  if (!detail) {
    return "";
  }
  const firstLine = detail.split("\n", 1)[0]?.trim() ?? "";
  if (firstLine.length === 0) {
    return "";
  }
  const colonIndex = firstLine.indexOf(":");
  if (colonIndex <= 0) {
    return firstLine;
  }
  return firstLine.slice(0, colonIndex);
}

function extractWorkLogItemType(
  payload: Record<string, unknown> | null,
): WorkLogEntry["itemType"] | undefined {
  const topLevel = payload?.itemType;
  if (typeof topLevel === "string" && isToolLifecycleItemType(topLevel)) {
    return topLevel;
  }
  // Defensive: some provider payloads nest the type inside data or data.item
  const data = asRecord(payload?.data);
  const item = asRecord(data?.item);
  const nested = data?.itemType ?? item?.type ?? item?.kind ?? payload?.type ?? payload?.kind;
  if (typeof nested === "string" && isToolLifecycleItemType(nested)) {
    return nested;
  }
  return undefined;
}

function extractWorkLogRequestKind(
  payload: Record<string, unknown> | null,
): WorkLogEntry["requestKind"] | undefined {
  if (
    payload?.requestKind === "command" ||
    payload?.requestKind === "file-read" ||
    payload?.requestKind === "file-change"
  ) {
    return payload.requestKind;
  }
  return requestKindFromRequestType(payload?.requestType) ?? undefined;
}

function pushChangedFile(target: string[], seen: Set<string>, value: unknown) {
  const normalized = asTrimmedString(value);
  if (!normalized || !isLikelyFilePath(normalized) || seen.has(normalized)) {
    return;
  }
  seen.add(normalized);
  target.push(normalized);
}

function isLikelyFilePath(value: string): boolean {
  if (/^(?:file|vscode|cursor):\/\//iu.test(value)) {
    return true;
  }
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }
  if (/^[A-Za-z]:[\\/]/u.test(value)) {
    return true;
  }
  if (value.includes("/") || value.includes("\\")) {
    return true;
  }
  return /^[^\s/\\]+\.[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
}

function collectChangedFiles(value: unknown, target: string[], seen: Set<string>, depth: number) {
  if (depth > 4 || target.length >= 12) {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectChangedFiles(entry, target, seen, depth + 1);
      if (target.length >= 12) {
        return;
      }
    }
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  pushChangedFile(target, seen, record.path);
  pushChangedFile(target, seen, record.file);
  pushChangedFile(target, seen, record.file_path);
  pushChangedFile(target, seen, record.filepath);
  pushChangedFile(target, seen, record.filePath);
  pushChangedFile(target, seen, record.relativePath);
  pushChangedFile(target, seen, record.filename);
  pushChangedFile(target, seen, record.newPath);
  pushChangedFile(target, seen, record.oldPath);

  for (const nestedKey of [
    "item",
    "result",
    "input",
    "rawInput",
    "rawOutput",
    "data",
    "location",
    "locations",
    "changes",
    "files",
    "file",
    "edits",
    "patch",
    "patches",
    "operations",
  ]) {
    if (!(nestedKey in record)) {
      continue;
    }
    collectChangedFiles(record[nestedKey], target, seen, depth + 1);
    if (target.length >= 12) {
      return;
    }
  }
}

function extractChangedFiles(payload: Record<string, unknown> | null): string[] {
  const changedFiles: string[] = [];
  const seen = new Set<string>();
  collectChangedFiles(asRecord(payload?.data), changedFiles, seen, 0);
  return changedFiles;
}

function compareActivitiesByOrder(
  left: OrchestrationThreadActivity,
  right: OrchestrationThreadActivity,
): number {
  if (left.sequence !== undefined && right.sequence !== undefined) {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
  } else if (left.sequence !== undefined) {
    return 1;
  } else if (right.sequence !== undefined) {
    return -1;
  }

  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  const lifecycleRankComparison =
    compareActivityLifecycleRank(left.kind) - compareActivityLifecycleRank(right.kind);
  if (lifecycleRankComparison !== 0) {
    return lifecycleRankComparison;
  }

  return left.id.localeCompare(right.id);
}

function compareActivityLifecycleRank(kind: string): number {
  if (kind.endsWith(".started") || kind === "tool.started") {
    return 0;
  }
  if (kind.endsWith(".progress") || kind.endsWith(".updated")) {
    return 1;
  }
  if (kind.endsWith(".completed") || kind.endsWith(".resolved")) {
    return 2;
  }
  return 1;
}

/**
 * 鍒ゆ柇鎸囧畾杞鏄惁鏈夊伐鍏锋椿鍔? *
 * @param activities - 缂栨帓娲诲姩娴? * @param turnId - 杞 ID
 * @returns 鏄惁鏈夊伐鍏锋椿鍔? */
export function hasToolActivityForTurn(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  turnId: TurnId | null | undefined,
): boolean {
  if (!turnId) return false;
  return activities.some((activity) => activity.turnId === turnId && activity.tone === "tool");
}

/**
 * 灏嗘秷鎭€佹彁璁鍒掑拰宸ヤ綔鏃ュ織鍚堝苟涓虹粺涓€鐨勬椂闂寸嚎鏉＄洰鍒楄〃锛屾寜鍒涘缓鏃堕棿鎺掑簭銆? * 濡傛灉鍔╂墜娑堟伅鍏宠仈浜嗘彁璁鍒掞紝浼氫粠娑堟伅鏂囨湰涓Щ闄よ鍒掑潡銆? *
 * @param messages - 鑱婂ぉ娑堟伅鍒楄〃
 * @param proposedPlans - 鎻愯璁″垝鍒楄〃
 * @param workEntries - 宸ヤ綔鏃ュ織鏉＄洰鍒楄〃
 * @returns 鎸夋椂闂存帓搴忕殑鏃堕棿绾挎潯鐩垪琛? */
export function deriveTimelineEntries(
  messages: ChatMessage[],
  proposedPlans: ProposedPlan[],
  workEntries: WorkLogEntry[],
): TimelineEntry[] {
  const proposedPlanTurnIds = new Set(
    proposedPlans.flatMap((proposedPlan) => (proposedPlan.turnId ? [proposedPlan.turnId] : [])),
  );
  const messageRows: TimelineEntry[] = messages.flatMap((message) => {
    const displayMessage =
      message.role === "assistant" && message.turnId && proposedPlanTurnIds.has(message.turnId)
        ? { ...message, text: stripProposedPlanBlocksFromText(message.text) }
        : message;
    if (
      displayMessage.role === "assistant" &&
      displayMessage.text.length === 0 &&
      displayMessage.turnId &&
      proposedPlanTurnIds.has(displayMessage.turnId)
    ) {
      return [];
    }
    return [
      {
        id: displayMessage.id,
        kind: "message",
        createdAt: displayMessage.createdAt,
        message: displayMessage,
      },
    ];
  });
  const proposedPlanRows: TimelineEntry[] = proposedPlans.map((proposedPlan) => ({
    id: proposedPlan.id,
    kind: "proposed-plan",
    createdAt: proposedPlan.createdAt,
    proposedPlan,
  }));
  const workRows: TimelineEntry[] = workEntries.map((entry) => ({
    id: entry.id,
    kind: "work",
    createdAt: entry.createdAt,
    entry,
  }));
  return [...messageRows, ...proposedPlanRows, ...workRows].toSorted((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * 鏍规嵁杞宸紓鎽樿鎺ㄦ柇姣忎釜杞鐨勬鏌ョ偣搴忓彿
 *
 * @param summaries - 杞宸紓鎽樿鍒楄〃
 * @returns 杞 ID 鍒版鏌ョ偣搴忓彿鐨勬槧灏? */
export function inferCheckpointTurnCountByTurnId(
  summaries: TurnDiffSummary[],
): Record<TurnId, number> {
  const sorted = [...summaries].toSorted((a, b) => a.completedAt.localeCompare(b.completedAt));
  const result: Record<TurnId, number> = {};
  for (let index = 0; index < sorted.length; index += 1) {
    const summary = sorted[index];
    if (!summary) continue;
    result[summary.turnId] = index + 1;
  }
  return result;
}

/**
 * 浠庝細璇濈姸鎬佹帹瀵间細璇濋樁娈? *
 * @param session - 绾跨▼浼氳瘽鐘舵€? * @returns 浼氳瘽闃舵锛歚"disconnected"` 宸叉柇寮€銆乣"connecting"` 杩炴帴涓€乣"running"` 杩愯涓€乣"ready"` 灏辩华
 */
export function derivePhase(session: ThreadSession | null): SessionPhase {
  if (!session || session.status === "closed") return "disconnected";
  if (session.status === "connecting") return "connecting";
  if (session.status === "running") return "running";
  return "ready";
}
