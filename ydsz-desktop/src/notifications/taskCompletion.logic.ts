/**
 * @fileoverview 任务完成通知逻辑模块
 * @description 检测线程生命周期中的新通知事件并构建告警文案。
 *               提供线程完成检测、用户输入请求检测、终端任务状态检测,
 *               以及通知文案的构建逻辑。
 * @layer 通知逻辑层
 * @exports 生命周期检测辅助函数和通知文案构建函数
 */

import {
  defaultTerminalTitleForCliKind,
  type TerminalCliKind,
  type TerminalVisualState,
} from "@njydsz/shared/terminalThreads";
import type { Thread, ThreadSession } from "../types";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
  hasLiveLatestTurn,
} from "../session-logic";

/**
 * 已完成线程候选对象
 * @description 表示一个刚完成处理的线程,用于生成通知
 */
export interface CompletedThreadCandidate {
  /** 线程 ID */
  threadId: Thread["id"];
  /** 项目 ID */
  projectId: Thread["projectId"];
  /** 线程标题 */
  title: string;
  /** 完成时间戳 */
  completedAt: string;
  /** 助手消息摘要 */
  assistantSummary: string | null;
}

/**
 * 线程关注候选对象
 * @description 表示一个需要用户关注(审批或输入)的线程
 */
export interface ThreadAttentionCandidate {
  /** 需要关注的类型:'approval' 或 'user-input' */
  kind: "approval" | "user-input";
  /** 线程 ID */
  threadId: Thread["id"];
  /** 项目 ID */
  projectId: Thread["projectId"];
  /** 线程标题 */
  title: string;
  /** 请求 ID */
  requestId: string;
  /** 创建时间戳 */
  createdAt: string;
  /** 请求类型(仅 approval 类型有) */
  requestKind?: "command" | "file-read" | "file-change";
  /** 摘要说明 */
  summary?: string;
}

/**
 * 终端通知线程状态
 * @description 用于终端通知检测的线程状态快照
 */
interface TerminalNotificationThreadState {
  /** 运行中的终端 ID 列表 */
  runningTerminalIds: string[];
  /** 终端关注状态映射 */
  terminalAttentionStatesById: Record<string, "attention" | "review">;
  /** 终端 CLI 类型映射 */
  terminalCliKindsById: Record<string, TerminalCliKind>;
  /** 终端 ID 列表 */
  terminalIds: string[];
  /** 终端标签映射 */
  terminalLabelsById: Record<string, string>;
  /** 终端标题覆盖映射 */
  terminalTitleOverridesById: Record<string, string>;
}

/**
 * 已完成终端候选对象
 * @description 表示一个刚完成处理的终端任务
 */
export interface CompletedTerminalCandidate {
  /** CLI 类型 */
  cliKind: TerminalCliKind | null;
  /** 终端 ID */
  terminalId: string;
  /** 线程 ID */
  threadId: Thread["id"];
  /** 终端标题 */
  title: string;
}

/**
 * 终端关注候选对象
 * @description 表示一个需要用户关注的终端
 */
export interface TerminalAttentionCandidate {
  /** CLI 类型 */
  cliKind: TerminalCliKind | null;
  /** 终端 ID */
  terminalId: string;
  /** 线程 ID */
  threadId: Thread["id"];
  /** 终端标题 */
  title: string;
}

type ThreadSessionStatus = ThreadSession["status"];

/**
 * 判断是否应该显示线程通知 Toast
 * @description 线程完成 Toast 仅用于屏幕外的工作;
 *              可见的线程已在内联显示结果。
 * @param input - 输入参数
 * @param input.threadId - 线程 ID
 * @param input.visibleThreadIds - 当前可见的线程 ID 集合
 * @returns 如果应该显示 Toast 则返回 true
 */
export function shouldShowThreadNotificationToast(input: {
  threadId: Thread["id"];
  visibleThreadIds: ReadonlySet<Thread["id"]>;
}): boolean {
  return !input.visibleThreadIds.has(input.threadId);
}

/**
 * 检查会话状态是否为运行状态
 * @description 将侧边栏"工作中"状态视为唯一值得通知的起点。
 * @param status - 会话状态
 * @returns 如果是 'running' 或 'connecting' 则返回 true
 */
function isRunningStatus(status: ThreadSessionStatus | null | undefined): boolean {
  return status === "running" || status === "connecting";
}

/**
 * 从最新助手消息生成简短摘要
 * @description 不会将长输出倾倒到操作系统通知区域。
 * @param thread - 线程对象
 * @returns 最多 140 字符的摘要,或 null
 */
function summarizeLatestAssistantMessage(thread: Thread): string | null {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    const trimmed = message.text.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0) {
      continue;
    }
    return trimmed.length <= 140 ? trimmed : `${trimmed.slice(0, 137)}...`;
  }
  return null;
}

/**
 * 检查线程是否有未完成的轮次
 * @param thread - 线程对象
 * @returns 如果有未完成的轮次则返回 true
 */
function hadUnsettledTurn(thread: Thread | undefined): boolean {
  if (!thread) {
    return false;
  }
  if (hasLiveLatestTurn(thread.latestTurn, thread.session)) {
    return true;
  }
  return !thread.latestTurn?.completedAt && isRunningStatus(thread.session?.status);
}

/**
 * 检查线程完成通知是否已稳定
 * @description 如果会话编排状态不再运行,则认为通知已稳定
 * @param thread - 线程对象
 * @returns 如果通知已稳定则返回 true
 */
function isCompletionNotificationSettled(thread: Thread | undefined): boolean {
  if (!thread?.latestTurn?.startedAt || !thread.latestTurn.completedAt) {
    return false;
  }
  if (!thread.session) {
    return true;
  }
  return thread.session.orchestrationStatus !== "running";
}

/**
 * 收集已完成处理的线程候选
 * @description 比较连续的状态快照并发出新完成的线程,
 *              即便会话快照在 Toast 逻辑观察之前直接跳转到 ready 状态。
 * @param previousThreads - 之前的线程快照
 * @param nextThreads - 当前的线程快照
 * @returns 已完成线程候选列表
 */
export function collectCompletedThreadCandidates(
  previousThreads: readonly Thread[],
  nextThreads: readonly Thread[],
): CompletedThreadCandidate[] {
  const previousById = new Map(previousThreads.map((thread) => [thread.id, thread] as const));
  const candidates: CompletedThreadCandidate[] = [];

  for (const thread of nextThreads) {
    const previousThread = previousById.get(thread.id);
    if (!previousThread) {
      continue;
    }

    const completedAt = thread.latestTurn?.completedAt;
    if (!completedAt) {
      continue;
    }
    if (!isCompletionNotificationSettled(thread)) {
      continue;
    }
    if (!previousThread.session && !previousThread.latestTurn?.completedAt) {
      continue;
    }
    if (!hadUnsettledTurn(previousThread) && !previousThread.latestTurn?.completedAt) {
      continue;
    }
    if (
      previousThread.latestTurn?.turnId === thread.latestTurn?.turnId &&
      isCompletionNotificationSettled(previousThread)
    ) {
      continue;
    }

    candidates.push({
      threadId: thread.id,
      projectId: thread.projectId,
      title: thread.title,
      completedAt,
      assistantSummary: summarizeLatestAssistantMessage(thread),
    });
  }

  return candidates;
}

/**
 * 解析终端通知状态
 * @param threadState - 线程状态
 * @param terminalId - 终端 ID
 * @returns 终端视觉状态
 */
function resolveTerminalNotificationState(
  threadState: TerminalNotificationThreadState | undefined,
  terminalId: string,
): TerminalVisualState {
  if (!threadState) {
    return "idle";
  }
  if (threadState.terminalAttentionStatesById?.[terminalId] === "attention") {
    return "attention";
  }
  if ((threadState.runningTerminalIds ?? []).includes(terminalId)) {
    return "running";
  }
  if (threadState.terminalAttentionStatesById?.[terminalId] === "review") {
    return "review";
  }
  return "idle";
}

/**
 * 解析终端通知标题
 * @param threadState - 线程状态
 * @param terminalId - 终端 ID
 * @returns 终端 CLI 类型和标题
 */
function resolveTerminalNotificationTitle(
  threadState: TerminalNotificationThreadState | undefined,
  terminalId: string,
): { cliKind: TerminalCliKind | null; title: string } {
  const cliKind = threadState?.terminalCliKindsById?.[terminalId] ?? null;
  const title =
    threadState?.terminalTitleOverridesById?.[terminalId]?.trim() ||
    threadState?.terminalLabelsById?.[terminalId]?.trim() ||
    (cliKind ? defaultTerminalTitleForCliKind(cliKind) : "Terminal");
  return { cliKind, title };
}

/**
 * 收集已完成处理的终端候选
 * @description 比较连续的状态快照,检测从 'review' 状态转换出来的终端
 * @param previousByThreadId - 之前按线程 ID 索引的终端状态
 * @param nextByThreadId - 当前按线程 ID 索引的终端状态
 * @returns 已完成终端候选列表
 */
export function collectCompletedTerminalCandidates(
  previousByThreadId: Record<string, TerminalNotificationThreadState>,
  nextByThreadId: Record<string, TerminalNotificationThreadState>,
): CompletedTerminalCandidate[] {
  const threadIds = new Set([...Object.keys(previousByThreadId), ...Object.keys(nextByThreadId)]);
  const candidates: CompletedTerminalCandidate[] = [];

  for (const threadId of threadIds) {
    const previousThreadState = previousByThreadId[threadId];
    const nextThreadState = nextByThreadId[threadId];
    const terminalIds = new Set([
      ...(previousThreadState?.terminalIds ?? []),
      ...(nextThreadState?.terminalIds ?? []),
    ]);

    for (const terminalId of terminalIds) {
      const previousState = resolveTerminalNotificationState(previousThreadState, terminalId);
      const nextState = resolveTerminalNotificationState(nextThreadState, terminalId);
      if (nextState !== "review" || previousState === "review") {
        continue;
      }
      const { cliKind, title } = resolveTerminalNotificationTitle(nextThreadState, terminalId);
      candidates.push({
        threadId: threadId as Thread["id"],
        terminalId,
        cliKind,
        title,
      });
    }
  }

  return candidates;
}

/**
 * 生成审批请求摘要文本
 * @param requestKind - 请求类型
 * @returns 摘要文本
 */
function approvalSummary(requestKind: "command" | "file-read" | "file-change"): string {
  switch (requestKind) {
    case "command":
      return "Command approval requested.";
    case "file-read":
      return "File-read approval requested.";
    case "file-change":
      return "File-change approval requested.";
  }
}

/**
 * 收集需要关注的线程候选
 * @description 比较连续的活动快照,仅发出新的需要输入的转换。
 * @param previousThreads - 之前的线程快照
 * @param nextThreads - 当前的线程快照
 * @returns 需要关注的线程候选列表
 */
export function collectThreadAttentionCandidates(
  previousThreads: readonly Thread[],
  nextThreads: readonly Thread[],
): ThreadAttentionCandidate[] {
  const previousById = new Map(previousThreads.map((thread) => [thread.id, thread] as const));
  const candidates: ThreadAttentionCandidate[] = [];

  for (const thread of nextThreads) {
    const previousThread = previousById.get(thread.id);
    if (!previousThread) {
      continue;
    }

    const previousApprovalIds = new Set(
      derivePendingApprovals(previousThread.activities).map((approval) => approval.requestId),
    );
    const previousUserInputIds = new Set(
      derivePendingUserInputs(previousThread.activities).map((request) => request.requestId),
    );

    for (const approval of derivePendingApprovals(thread.activities)) {
      if (previousApprovalIds.has(approval.requestId)) {
        continue;
      }
      candidates.push({
        kind: "approval",
        threadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        requestId: approval.requestId,
        createdAt: approval.createdAt,
        requestKind: approval.requestKind,
      });
    }

    for (const request of derivePendingUserInputs(thread.activities)) {
      if (previousUserInputIds.has(request.requestId)) {
        continue;
      }
      candidates.push({
        kind: "user-input",
        threadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        requestId: request.requestId,
        createdAt: request.createdAt,
      });
    }
  }

  return candidates.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/**
 * 收集需要关注的终端候选
 * @description 比较连续的状态快照,检测新进入 'attention' 状态的终端
 * @param previousByThreadId - 之前按线程 ID 索引的终端状态
 * @param nextByThreadId - 当前按线程 ID 索引的终端状态
 * @returns 需要关注的终端候选列表
 */
export function collectTerminalAttentionCandidates(
  previousByThreadId: Record<string, TerminalNotificationThreadState>,
  nextByThreadId: Record<string, TerminalNotificationThreadState>,
): TerminalAttentionCandidate[] {
  const threadIds = new Set([...Object.keys(previousByThreadId), ...Object.keys(nextByThreadId)]);
  const candidates: TerminalAttentionCandidate[] = [];

  for (const threadId of threadIds) {
    const previousThreadState = previousByThreadId[threadId];
    const nextThreadState = nextByThreadId[threadId];
    const terminalIds = new Set([
      ...(previousThreadState?.terminalIds ?? []),
      ...(nextThreadState?.terminalIds ?? []),
    ]);

    for (const terminalId of terminalIds) {
      const previousState = resolveTerminalNotificationState(previousThreadState, terminalId);
      const nextState = resolveTerminalNotificationState(nextThreadState, terminalId);
      if (nextState !== "attention" || previousState === "attention") {
        continue;
      }
      const { cliKind, title } = resolveTerminalNotificationTitle(nextThreadState, terminalId);
      candidates.push({
        threadId: threadId as Thread["id"],
        terminalId,
        cliKind,
        title,
      });
    }
  }

  return candidates;
}

/**
 * 构建任务完成通知文案
 * @description 保持 Toast 和操作系统通知的文案在浏览器和桌面环境间一致。
 * @param candidate - 已完成线程候选
 * @returns 通知标题和正文
 */
export function buildTaskCompletionCopy(candidate: CompletedThreadCandidate): {
  title: string;
  body: string;
} {
  const normalizedTitle = candidate.title.trim();
  const threadLabel = normalizedTitle.length > 0 ? normalizedTitle : "Untitled thread";

  return {
    title: threadLabel,
    body: candidate.assistantSummary || "Finished working.",
  };
}

/**
 * 构建线程关注通知文案
 * @description 为需要审批或用户输入的线程生成通知文案
 * @param candidate - 线程关注候选
 * @returns 通知标题和正文
 */
export function buildThreadAttentionCopy(candidate: ThreadAttentionCandidate): {
  title: string;
  body: string;
} {
  const normalizedTitle = candidate.title.trim();
  const threadLabel = normalizedTitle.length > 0 ? normalizedTitle : "Untitled thread";
  const summary =
    candidate.summary ??
    (candidate.kind === "approval"
      ? approvalSummary(candidate.requestKind ?? "command")
      : "User input requested.");

  return {
    title: "Input needed",
    body: `${threadLabel}: ${summary}`,
  };
}

/**
 * 构建终端任务完成通知文案
 * @param candidate - 已完成终端候选
 * @returns 通知标题和正文
 */
export function buildTerminalCompletionCopy(candidate: CompletedTerminalCandidate): {
  title: string;
  body: string;
} {
  const terminalLabel = candidate.title.trim() || "Terminal";
  return {
    title: "Terminal task completed",
    body: `${terminalLabel} finished working.`,
  };
}

/**
 * 构建终端关注通知文案
 * @param candidate - 终端关注候选
 * @returns 通知标题和正文
 */
export function buildTerminalAttentionCopy(candidate: TerminalAttentionCandidate): {
  title: string;
  body: string;
} {
  const terminalLabel = candidate.title.trim() || "Terminal";
  return {
    title: "Terminal input needed",
    body: `${terminalLabel} needs your attention.`,
  };
}

/**
 * 判断是否应该抑制可见线程通知
 * @description 当窗口处于前台且线程可见时,不显示通知
 * @param input - 输入参数
 * @returns 如果应该抑制通知则返回 true
 */
export function shouldSuppressVisibleThreadNotification(input: {
  threadId: Thread["id"];
  visibleThreadIds: ReadonlySet<Thread["id"]>;
  windowForeground: boolean;
}): boolean {
  return input.windowForeground && input.visibleThreadIds.has(input.threadId);
}

/**
 * 收集需要输入的线程候选
 * @description `collectThreadAttentionCandidates` 的别名
 */
export const collectInputNeededThreadCandidates = collectThreadAttentionCandidates;

/**
 * 构建需要输入的通知文案
 * @description `buildThreadAttentionCopy` 的别名
 */
export const buildInputNeededCopy = buildThreadAttentionCopy;

/**
 * 检查通知运行时时间戳是否为新鲜的
 * @description 水合作用可以在刷新后重放旧的线程详情;
 *              只有在此通知运行时挂载后的时间戳才应被视为实时事件。
 * @param candidateTimestamp - 候选时间戳
 * @param runtimeStartedAtMs - 运行时启动时间(毫秒)
 * @returns 如果时间戳是新鲜的则返回 true
 */
export function isNotificationRuntimeFreshTimestamp(
  candidateTimestamp: string,
  runtimeStartedAtMs: number,
): boolean {
  const candidateMs = Date.parse(candidateTimestamp);
  if (!Number.isFinite(candidateMs) || !Number.isFinite(runtimeStartedAtMs)) {
    return true;
  }
  return candidateMs > runtimeStartedAtMs;
}
