/**
 * @file session-logic.ts
 * @description 娴兼俺鐦介柅鏄忕帆濡€虫健閿涘矁绀嬬拹锝勭矤缂傛牗甯撳ú璇插З濞翠椒鑵戦幒銊ヮ嚤 UI 閻樿埖鈧降鈧? * 閸栧懏瀚銉ょ稊閺冦儱绻旈弶锛勬窗閹恒劌顕遍妴浣哥窡鐎光剝澹掔拠閿嬬湴缁狅紕鎮婇妴浣哥窡婢跺嫮鎮婇悽銊﹀煕鏉堟挸鍙嗛妴? * 濞叉槒绌禒璇插閸掓銆冮妴浣瑰絹鐠侇喛顓搁崚鎺斿Ц閹降鈧焦妞傞梻瀵稿殠閺夛紕娲扮紒鍕棅娴犮儱寮锋导姘崇樈闂冭埖顔岄崚銈嗘焽閵? */

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

/** Provider 闁瀚ㄩ崳銊ц閸ㄥ鍩嗛崥?*/
export type ProviderPickerKind = ProviderKind;

/**
 * 閸欘垶鈧娈?Provider 閸掓銆冮敍宀€鏁ゆ禍?Composer 閻?Provider 闁瀚ㄩ崳? */
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
 * 瀹搞儰缍旈弮銉ョ箶閺夛紕娲伴敍宀冦€冪粈铏瑰殠缁嬪妞块崝銊︾ウ娑擃厾娈戞稉鈧弶鈥冲讲鐏炴洜銇氱拋鏉跨秿
 */
export interface WorkLogEntry {
  /** 閺夛紕娲伴崬顖欑 ID */
  id: string;
  /** 閸掓稑缂撻弮鍫曟？閿涘湜SO 閺嶇厧绱￠敍?*/
  createdAt: string;
  /** 閺勫墽銇氶弽鍥╊劮 */
  label: string;
  /** 鐠囷妇绮忔穱鈩冧紖 */
  detail?: string;
  /** 閹笛嗩攽閻ㄥ嫬鎳℃禒銈忕礄閸欘垵顕伴弽鐓庣础閿?*/
  command?: string;
  /** 閸樼喎顫愰崨鎴掓姢閺傚洦婀?*/
  rawCommand?: string;
  /** 閸涙垝鎶ゆ０鍕潔閺傚洦婀?*/
  preview?: string;
  /** 閸欐ɑ娲块惃鍕瀮娴犺泛鍨悰?*/
  changedFiles?: ReadonlyArray<string>;
  /** 閺夛紕娲扮拠顓熺毜閿涙瓪"thinking"` 閹繆鈧啩鑵戦妴涔?tool"` 瀹搞儱鍙跨拫鍐暏閵嗕梗"info"` 娣団剝浼呴妴涔?error"` 闁挎瑨顕?*/
  tone: "thinking" | "tool" | "info" | "error";
  /** 瀹搞儱鍙块崣顖濐嚢閺嶅洭顣?*/
  toolTitle?: string;
  /** 瀹搞儱鍙块崥宥囆?*/
  toolName?: string;
  /** 瀹搞儱鍙跨拫鍐暏 ID */
  toolCallId?: string;
  /** 瀹搞儱鍙块悽鐔锋嚒閸涖劍婀℃い鍦閸?*/
  itemType?: ToolLifecycleItemType;
  /** 瀵板懎顓搁幍纭咁嚞濮瑰倻琚崹?*/
  requestKind?: PendingApproval["requestKind"];
  /** 鐎涙劒鍞悶鍡楀灙鐞?*/
  subagents?: ReadonlyArray<WorkLogSubagent>;
  /** 鐎涙劒鍞悶鍡樻惙娴ｆ粈淇婇幁?*/
  subagentAction?: WorkLogSubagentAction;
}

/** 瀹搞儰缍旈弮銉ョ箶鐏炴洜銇氶悧鍫熸拱閸欏嚖绱濋悽銊ょ艾缂傛挸鐡ㄦ径杈ㄦ櫏 */
export const WORK_LOG_PRESENTATION_VERSION = 5;

/**
 * 瀹搞儰缍旈弮銉ョ箶娑擃厾娈戠€涙劒鍞悶鍡曚繆閹? */
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

/** 鐎涙劒鍞悶鍡樻惙娴ｆ粈淇婇幁顖ょ礉閹诲繗鍫€涙劒鍞悶鍡欐畱瀹搞儱鍙跨拫鍐暏閻樿埖鈧?*/
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

/** 瀵板懎顓搁幍纭咁嚞濮瑰偊绱濈悰銊с仛闂団偓鐟曚胶鏁ら幋閿嬪閸戝棛娈戦幙宥勭稊 */
export interface PendingApproval {
  requestId: ApprovalRequestId;
  requestKind: "command" | "file-read" | "file-change";
  createdAt: string;
  detail?: string;
}

/** 瀵板懎顦╅悶鍡欐畱閻劍鍩涙潏鎾冲弳鐠囬攱鐪伴敍灞藉瘶閸氼偊娓剁憰浣烘暏閹村嘲娲栫粵鏃傛畱闂傤噣顣?*/
export interface PendingUserInput {
  requestId: ApprovalRequestId;
  createdAt: string;
  questions: ReadonlyArray<UserInputQuestion>;
}

/** 濞叉槒绌禒璇插閸掓銆冮悩鑸碘偓渚婄礉鐞涖劎銇氳ぐ鎾冲鏉烆喗顐奸惃鍕崲閸斅ょ箻鎼?*/
export interface ActiveTaskListState {
  createdAt: string;
  turnId: TurnId | null;
  explanation?: string | null;
  tasks: Array<{
    task: string;
    status: "pending" | "inProgress" | "completed";
  }>;
}

/** 濞叉槒绌崥搴″酱娴犺濮熼悩鑸碘偓渚婄礉缂佺喕顓歌ぐ鎾冲濮濓絽婀潻鎰攽閻ㄥ嫬鎮楅崣棰佹崲閸斺剝鏆熼柌?*/
export interface ActiveBackgroundTasksState {
  activeCount: number;
}

/** 閺堚偓閺傛壆娈戦幓鎰唴鐠佲€冲灊閻樿埖鈧?*/
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
 * 閺冨爼妫跨痪鎸庢蒋閻╊喚琚崹瀣剁礉閻劋绨懕濠傘亯閻ｅ矂娼伴惃鍕闂傚鍤庡〒鍙夌厠閵? * 閸栧懎鎯堝☉鍫熶紖閵嗕焦褰佺拋顔款吀閸掓帒鎷板銉ょ稊閺冦儱绻旀稉澶岊潚缁鐎烽妴? */
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
 * 閺嶇厧绱￠崠鏍ㄥ瘮缂侇厽妞傞梻缈犺礋娴滃搫褰茬拠鑽ゆ畱鐎涙顑佹稉? *
 * @param durationMs - 閹镐胶鐢婚弮鍫曟？閿涘牊顕犵粔鎺炵礆
 * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫬鐡х粭锔胯閿涘牆顩?"1.5s"閵?2m 30s"閿? *
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
 * 閺嶇厧绱￠崠鏍﹁⒈娑擃亝妞傞梻瀵稿仯娑斿妫块惃鍕病鏉╁洦妞傞梻? *
 * @param startIso - 瀵偓婵妞傞梻杈剧礄ISO 閺嶇厧绱￠敍? * @param endIso - 缂佹挻娼弮鍫曟？閿涘湜SO 閺嶇厧绱￠敍澶涚礉閺堫亝褰佹笟娑欐鏉╂柨娲?null
 * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫮绮℃潻鍥ㄦ闂傝揪绱濋弮鍫曟？閺冪姵鏅ラ弮鎯扮箲閸?null
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
 * 閸掋倖鏌囬張鈧弬鎷岀枂濞嗏剝妲搁崥锕€鍑＄紒鎾存将閿涘牆鐣幋鎰┾偓浣疯厬閺傤厽鍨ㄩ崙娲晩閿? *
 * @param latestTurn - 閺堚偓閺傛媽鐤嗗▎锛勬畱閺冨爼妫挎穱鈩冧紖
 * @param session - 娴兼俺鐦藉ú璇插З閻樿埖鈧? * @returns 閺堚偓閺傛媽鐤嗗▎鈩冩Ц閸氾箑鍑＄紒鎾存将
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
 * 閸掋倖鏌囬張鈧弬鎷岀枂濞嗏剝妲搁崥锔跨矝閸︺劍妞跨捄鍐跨礄娑?isLatestTurnSettled 娴滄帊璐熼崣宥呭毐閺佸府绱? *
 * @param latestTurn - 閺堚偓閺傛媽鐤嗗▎锛勬畱閺冨爼妫挎穱鈩冧紖
 * @param session - 娴兼俺鐦藉ú璇插З閻樿埖鈧? * @returns 閺堚偓閺傛媽鐤嗗▎鈩冩Ц閸氾缚绮涢崷銊︽た鐠? */
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
 * 閹恒劌顕卞ú鏄忕┈瀹搞儰缍旈惃鍕磻婵妞傞梻娣偓? * 娴兼ê鍘涙担璺ㄦ暏濮濓絽婀潻鎰攽閻ㄥ嫯鐤嗗▎鈥崇磻婵妞傞梻杈剧礉閸忚埖顐兼担璺ㄦ暏濞戝牊浼呴崣鎴︹偓浣规闂傛番鈧? *
 * @param latestTurn - 閺堚偓閺傛媽鐤嗗▎锛勬畱閺冨爼妫挎穱鈩冧紖
 * @param session - 娴兼俺鐦藉ú璇插З閻樿埖鈧? * @param sendStartedAt - 濞戝牊浼呴崣鎴︹偓浣烘畱瀵偓婵妞傞梻? * @returns 濞叉槒绌銉ょ稊閻ㄥ嫬绱戞慨瀣闂? */
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
 * 娴犲孩妞块崝銊︾ウ娑擃厽甯圭€电厧缍嬮崜宥呯窡鐎光剝澹掗惃鍕嚞濮瑰倸鍨悰銊ｂ偓? * 鐠虹喕閲滅€光剝澹掔拠閿嬬湴閻ㄥ嫬绱戦崥顖氭嫲鐟欙絽鍠呮禍瀣╂閿涘矁鍤滈崝銊︾閻炲棜绻冮張鐔烘畱瀵板懎顓搁幍褰掋€嶉妴? *
 * @param activities - 缂傛牗甯撳ú璇插З濞? * @returns 閹稿鍨卞鐑樻闂傚瓨甯撴惔蹇曟畱瀵板懎顓搁幍纭咁嚞濮瑰倸鍨悰? */
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
 * 娴犲孩妞块崝銊︾ウ娑擃厽甯圭€电厧缍嬮崜宥呯窡婢跺嫮鎮婇惃鍕暏閹寸柉绶崗銉嚞濮瑰倸鍨悰銊ｂ偓? * 鐠虹喕閲滈悽銊﹀煕鏉堟挸鍙嗙拠閿嬬湴閻ㄥ嫬绱戦崥顖氭嫲鐟欙絽鍠呮禍瀣╂閿涘矁鍤滈崝銊︾閻炲棜绻冮張鐔烘畱鐠囬攱鐪伴妴? *
 * @param activities - 缂傛牗甯撳ú璇插З濞? * @returns 閹稿鍨卞鐑樻闂傚瓨甯撴惔蹇曟畱瀵板懎顦╅悶鍡欐暏閹寸柉绶崗銉ュ灙鐞? */
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
 * 娴犲孩妞块崝銊︾ウ娑擃厽甯圭€电厧缍嬮崜宥嗘た鐠哄啰娈戞禒璇插閸掓銆冮悩鑸碘偓浣碘偓? * 娴兼ê鍘涢弰鍓с仛瑜版挸澧犳潪顔筋偧閻ㄥ嫪鎹㈤崝鈽呯礉閼汇儲妫ら崚娆忔礀闁偓閸掔増娓舵潻鎴炴弓鐎瑰本鍨氶惃鍕帥閸撳秷鐤嗗▎鈥叉崲閸斅扳偓? *
 * @param activities - 缂傛牗甯撳ú璇插З濞? * @param latestTurnId - 閺堚偓閺傛媽鐤嗗▎?ID
 * @returns 濞叉槒绌禒璇插閸掓銆冮悩鑸碘偓渚婄礉閺冪姵妞跨捄鍐ф崲閸斺剝妞傛潻鏂挎礀 null
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
 * 缂佺喕顓歌ぐ鎾冲濞叉槒绌惃鍕倵閸欓鎹㈤崝鈩冩殶闁插骏绱欓幒鎺楁珟 plan 缁鐎锋禒璇插閿涘鈧? * 閻劋绨槐褍鍣?UI 娑擃厼鐫嶇粈杞板敩閻炲棙妞块崝銊уЦ閹降鈧? *
 * @param activities - 缂傛牗甯撳ú璇插З濞? * @param latestTurnId - 閺堚偓閺傛媽鐤嗗▎?ID
 * @returns 濞叉槒绌崥搴″酱娴犺濮熼悩鑸碘偓渚婄礉閺冪姵妞跨捄鍐ф崲閸斺剝妞傛潻鏂挎礀 null
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
 * 閸掋倖鏌囬張鈧弬鎷岀枂濞嗏剝妲搁崥锔跨矝閺?鐏忛箖鍎村銉ょ稊"濮濓絽婀潻娑滎攽閵? * 瑜?Provider 娴犲秵婀侀崣顖濐潌閻ㄥ嫬濮幍瀣瀮閺堫剙婀ù浣哥础鏉堟挸鍤幋鏍ф倵閸欓鎹㈤崝鈩冩纯閺傜増妞傞敍瀛禝 鎼存柧绻氶幐?瀹搞儰缍旀稉?閻樿埖鈧降鈧? *
 * @param input.latestTurn - 閺堚偓閺傛媽鐤嗗▎鈥蹭繆閹? * @param input.messages - 濞戝牊浼呴崚妤勩€? * @param input.activities - 濞茶濮╁ù? * @param input.session - 娴兼俺鐦介悩鑸碘偓? * @returns 閺勵垰鎯佹禒宥嗘箒鐏忛箖鍎村銉ょ稊
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
 * 閺屻儲澹橀張鈧弬鎵畱閹绘劘顔呯拋鈥冲灊閻樿埖鈧降鈧? * 娴兼ê鍘涢弻銉﹀瑜版挸澧犳潪顔筋偧閻ㄥ嫯顓搁崚鎺炵礉閼汇儲妫ら崚娆忔礀闁偓閸掓澘鍙忕仦鈧張鈧弬鎷岊吀閸掓帇鈧? *
 * @param proposedPlans - 閹绘劘顔呯拋鈥冲灊閸掓銆? * @param latestTurnId - 閺堚偓閺傛媽鐤嗗▎?ID
 * @returns 閺堚偓閺傛壆娈戦幓鎰唴鐠佲€冲灊閻樿埖鈧緤绱濋弮鐘侯吀閸掓帗妞傛潻鏂挎礀 null
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
 * 閺屻儲澹樻笟褑绔熼弽蹇撶安閺勫墽銇氶惃鍕絹鐠侇喛顓搁崚鎺嬧偓? * 瑜版挻娓堕弬鎷岀枂濞嗏剝婀紒鎾存将閺冭绱濇导妯哄帥閺勫墽銇氶崗璺哄彠閼辨梻娈戝┃鎰吀閸掓帇鈧? *
 * @param input.threads - 缁捐法鈻奸崚妤勩€? * @param input.latestTurn - 閺堚偓閺傛媽鐤嗗▎鈥蹭繆閹? * @param input.latestTurnSettled - 閺堚偓閺傛媽鐤嗗▎鈩冩Ц閸氾箑鍑＄紒鎾存将
 * @param input.threadId - 瑜版挸澧犵痪璺ㄢ柤 ID
 * @returns 娓氀嗙珶閺嶅繐绨查弰鍓с仛閻ㄥ嫭褰佺拋顔款吀閸掓帞濮搁幀? */
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
 * 閸掋倖鏌囬幓鎰唴鐠佲€冲灊閺勵垰鎯侀崣顖涙惙娴ｆ粣绱欑亸姘弓鐎圭偞鏌﹂敍? *
 * @param proposedPlan - 閹绘劘顔呯拋鈥冲灊閻樿埖鈧? * @returns 閺勵垰鎯侀崣顖涙惙娴? */
export function hasActionableProposedPlan(
  proposedPlan: LatestProposedPlanState | Pick<ProposedPlan, "implementedAt"> | null,
): boolean {
  return proposedPlan !== null && proposedPlan.implementedAt === null;
}

/**
 * 娴犲孩妞块崝銊︾ウ娑擃厽甯圭€电厧浼愭担婊勬）韫囨娼惄顔煎灙鐞涖劊鈧? * 鏉╁洦鎶ら幒澶夌瑝闂団偓鐟曚礁鐫嶇粈铏规畱濞茶濮╃猾璇茬€烽敍鍫濐洤娴犺濮熼悽鐔锋嚒閸涖劍婀￠妴渚€鈧喓宸奸梽鎰煑閺囧瓨鏌婄粵澶涚礆閿? * 楠炶泛鐨㈤崥灞肩瀹搞儱鍙跨拫鍐暏閻ㄥ嫬顦挎稉顏嗘晸閸涜棄鎳嗛張鐔剁皑娴犺泛鎮庨獮鏈佃礋閸楁洘娼惄顔衡偓? *
 * @param activities - 缂傛牗甯撳ú璇插З濞? * @param latestTurnId - 閺堚偓閺傛媽鐤嗗▎?ID閿涘奔璐?undefined 閺冭埖妯夌粈鐑樺閺堝鐤嗗▎? * @returns 瀹搞儰缍旈弮銉ョ箶閺夛紕娲伴崚妤勩€? */
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
 * 閸掋倖鏌囬幐鍥х暰鏉烆喗顐奸弰顖氭儊閺堝浼愰崗閿嬫た閸? *
 * @param activities - 缂傛牗甯撳ú璇插З濞? * @param turnId - 鏉烆喗顐?ID
 * @returns 閺勵垰鎯侀張澶婁紣閸忛攱妞块崝? */
export function hasToolActivityForTurn(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  turnId: TurnId | null | undefined,
): boolean {
  if (!turnId) return false;
  return activities.some((activity) => activity.turnId === turnId && activity.tone === "tool");
}

/**
 * 鐏忓棙绉烽幁顖樷偓浣瑰絹鐠侇喛顓搁崚鎺戞嫲瀹搞儰缍旈弮銉ョ箶閸氬牆鑻熸稉铏圭埠娑撯偓閻ㄥ嫭妞傞梻瀵稿殠閺夛紕娲伴崚妤勩€冮敍灞惧瘻閸掓稑缂撻弮鍫曟？閹烘帒绨妴? * 婵″倹鐏夐崝鈺傚濞戝牊浼呴崗瀹犱粓娴滃棙褰佺拋顔款吀閸掓帪绱濇导姘矤濞戝牊浼呴弬鍥ㄦ拱娑擃厾些闂勩倛顓搁崚鎺戞健閵? *
 * @param messages - 閼卞﹤銇夊☉鍫熶紖閸掓銆? * @param proposedPlans - 閹绘劘顔呯拋鈥冲灊閸掓銆? * @param workEntries - 瀹搞儰缍旈弮銉ョ箶閺夛紕娲伴崚妤勩€? * @returns 閹稿妞傞梻瀛樺笓鎼村繒娈戦弮鍫曟？缁炬寧娼惄顔煎灙鐞? */
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
 * 閺嶈宓佹潪顔筋偧瀹割喖绱撻幗妯款洣閹恒劍鏌囧В蹇庨嚋鏉烆喗顐奸惃鍕梾閺屻儳鍋ｆ惔蹇撳娇
 *
 * @param summaries - 鏉烆喗顐煎顔肩磽閹芥顩﹂崚妤勩€? * @returns 鏉烆喗顐?ID 閸掔増顥呴弻銉у仯鎼村繐褰块惃鍕Ё鐏? */
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
 * 娴犲簼绱扮拠婵堝Ц閹焦甯圭€甸棿绱扮拠婵嬫▉濞? *
 * @param session - 缁捐法鈻兼导姘崇樈閻樿埖鈧? * @returns 娴兼俺鐦介梼鑸殿唽閿涙瓪"disconnected"` 瀹稿弶鏌囧鈧妴涔?connecting"` 鏉╃偞甯存稉顓溾偓涔?running"` 鏉╂劘顢戞稉顓溾偓涔?ready"` 鐏忚京鍗? */
export function derivePhase(session: ThreadSession | null): SessionPhase {
  if (!session || session.status === "closed") return "disconnected";
  if (session.status === "connecting") return "connecting";
  if (session.status === "running") return "running";
  return "ready";
}
