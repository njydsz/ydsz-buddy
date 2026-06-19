/**
 * @file taskCompletion.logic.ts
 * @description 线程生命周期通知检测与通知文案构建逻辑层。
 * 负责识别线程/终端的完成态与需关注态变更，并生成对应的通知文案。
 * 本模块为纯逻辑层，不包含 UI 相关代码。
 */

import {
  defaultTerminalTitleForCliKind,
  type TerminalCliKind,
  type TerminalVisualState,
} from "@remi-code/shared/terminalThreads";
import type { Thread, ThreadSession } from "../types";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
  hasLiveLatestTurn,
} from "../session-logic";

/**
 * 已完成的线程候选项，用于生成任务完成通知。
 */
export interface CompletedThreadCandidate {
  /** 线程唯一标识 */
  threadId: Thread["id"];
  /** 所属项目唯一标识 */
  projectId: Thread["projectId"];
  /** 线程标题 */
  title: string;
  /** 任务完成时间戳（ISO 8601 格式） */
  completedAt: string;
  /** 助手最新消息的摘要文本，若无则为 null */
  assistantSummary: string | null;
}

/**
 * 线程需要用户关注的候选项，用于生成"需要输入"类通知。
 */
export interface ThreadAttentionCandidate {
  /** 关注类型：approval（审批请求）或 user-input（用户输入请求） */
  kind: "approval" | "user-input";
  /** 线程唯一标识 */
  threadId: Thread["id"];
  /** 所属项目唯一标识 */
  projectId: Thread["projectId"];
  /** 线程标题 */
  title: string;
  /** 请求唯一标识（审批请求或用户输入请求的 ID） */
  requestId: string;
  /** 请求创建时间戳（ISO 8601 格式） */
  createdAt: string;
  /** 审批请求的子类型：命令执行、文件读取或文件变更 */
  requestKind?: "command" | "file-read" | "file-change";
  /** 可选的请求摘要信息 */
  summary?: string;
}

/**
 * 终端通知所需的线程状态快照，包含线程下所有终端的运行状态与元信息。
 */
interface TerminalNotificationThreadState {
  /** 当前正在运行的终端 ID 列表 */
  runningTerminalIds: string[];
  /** 各终端的关注状态映射（attention=需立即关注, review=待审查） */
  terminalAttentionStatesById: Record<string, "attention" | "review">;
  /** 各终端的 CLI 类型映射（如 bash、powershell 等） */
  terminalCliKindsById: Record<string, TerminalCliKind>;
  /** 线程下所有终端 ID 列表 */
  terminalIds: string[];
  /** 各终端的用户自定义标签映射 */
  terminalLabelsById: Record<string, string>;
  /** 各终端的标题覆盖值映射（优先级高于默认标题和标签） */
  terminalTitleOverridesById: Record<string, string>;
}

/**
 * 已完成的终端任务候选项，用于生成终端任务完成通知。
 */
export interface CompletedTerminalCandidate {
  /** 终端 CLI 类型，无法确定时为 null */
  cliKind: TerminalCliKind | null;
  /** 终端唯一标识 */
  terminalId: string;
  /** 所属线程唯一标识 */
  threadId: Thread["id"];
  /** 终端显示标题 */
  title: string;
}

/**
 * 终端需要用户关注的候选项，用于生成终端"需要关注"类通知。
 */
export interface TerminalAttentionCandidate {
  /** 终端 CLI 类型，无法确定时为 null */
  cliKind: TerminalCliKind | null;
  /** 终端唯一标识 */
  terminalId: string;
  /** 所属线程唯一标识 */
  threadId: Thread["id"];
  /** 终端显示标题 */
  title: string;
}

/** 线程会话状态类型，复用 ThreadSession 的 status 字段类型 */
type ThreadSessionStatus = ThreadSession["status"];

/**
 * 判断是否应显示线程完成通知的 Toast 提示。
 * 仅在目标线程当前不可见时才显示通知，避免对已展示在屏幕上的线程重复提醒。
 *
 * @param input.threadId - 待判断的线程 ID
 * @param input.visibleThreadIds - 当前屏幕上可见的线程 ID 集合
 * @returns 若线程不可见则返回 true，表示应显示 Toast
 */
export function shouldShowThreadNotificationToast(input: {
  threadId: Thread["id"];
  visibleThreadIds: ReadonlySet<Thread["id"]>;
}): boolean {
  return !input.visibleThreadIds.has(input.threadId);
}

/**
 * 判断线程会话状态是否属于"运行中"。
 * 将 "running"（运行中）和 "connecting"（连接中）均视为运行态。
 *
 * @param status - 线程会话状态值
 * @returns 若为运行中或连接中状态则返回 true
 */
function isRunningStatus(status: ThreadSessionStatus | null | undefined): boolean {
  return status === "running" || status === "connecting";
}

/**
 * 从线程消息列表中提取最后一条助手消息的摘要。
 * 摘要会去除多余空白字符并截断至 140 字符以内，避免在系统通知中展示过长内容。
 *
 * @param thread - 线程对象，包含完整的消息列表
 * @returns 助手消息摘要文本（最长 140 字符），若无助手消息则返回 null
 */
function summarizeLatestAssistantMessage(thread: Thread): string | null {
  // 从消息列表末尾向前遍历，找到最后一条助手角色的消息
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }
    // 去除首尾空白并将连续空白字符压缩为单个空格
    const trimmed = message.text.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0) {
      continue;
    }
    // 超过 140 字符时截断并添加省略号
    return trimmed.length <= 140 ? trimmed : `${trimmed.slice(0, 137)}...`;
  }
  return null;
}

/**
 * 判断线程是否存在未完成的轮次（turn）。
 * 满足以下任一条件即视为存在未完成轮次：
 * 1. 最新轮次仍处于活跃状态（有实时交互）
 * 2. 最新轮次没有完成时间戳，且会话处于运行中状态
 *
 * @param thread - 线程对象
 * @returns 若存在未完成轮次则返回 true
 */
function hadUnsettledTurn(thread: Thread | undefined): boolean {
  if (!thread) {
    return false;
  }
  // 检查最新轮次是否仍有实时交互
  if (hasLiveLatestTurn(thread.latestTurn, thread.session)) {
    return true;
  }
  // 轮次未完成且会话仍在运行
  return !thread.latestTurn?.completedAt && isRunningStatus(thread.session?.status);
}

/**
 * 判断线程的完成通知是否已稳定（settled）。
 * 稳定的条件：最新轮次有开始和完成时间戳，且会话的编排状态不是 "running"。
 *
 * @param thread - 线程对象
 * @returns 若通知状态已稳定（可以安全发出完成通知）则返回 true
 */
function isCompletionNotificationSettled(thread: Thread | undefined): boolean {
  // 必须有轮次的开始和完成时间戳
  if (!thread?.latestTurn?.startedAt || !thread.latestTurn.completedAt) {
    return false;
  }
  // 没有会话信息时视为已稳定
  if (!thread.session) {
    return true;
  }
  // 编排状态不再是运行中，说明已完全结束
  return thread.session.orchestrationStatus !== "running";
}

/**
 * 对比前后两次线程快照，收集新产生的已完成线程候选项。
 * 通过比较连续快照中的状态变化，仅在检测到从"未完成"到"已完成"的转换时才生成候选项，
 * 即使会话状态直接从运行态跳至就绪态也能正确捕获。
 *
 * @param previousThreads - 上一次快照中的线程列表
 * @param nextThreads - 当前快照中的线程列表
 * @returns 新产生的已完成线程候选项数组
 */
export function collectCompletedThreadCandidates(
  previousThreads: readonly Thread[],
  nextThreads: readonly Thread[],
): CompletedThreadCandidate[] {
  // 将上一次快照按线程 ID 建立索引，便于快速查找
  const previousById = new Map(previousThreads.map((thread) => [thread.id, thread] as const));
  const candidates: CompletedThreadCandidate[] = [];

  for (const thread of nextThreads) {
    const previousThread = previousById.get(thread.id);
    // 新增的线程（上一次快照中不存在）跳过，不产生通知
    if (!previousThread) {
      continue;
    }

    const completedAt = thread.latestTurn?.completedAt;
    // 当前轮次尚未完成，跳过
    if (!completedAt) {
      continue;
    }
    // 通知状态尚未稳定（如编排仍在运行），跳过
    if (!isCompletionNotificationSettled(thread)) {
      continue;
    }
    // 上一次快照中既没有会话信息，轮次也未完成——说明这是首次出现，跳过
    if (!previousThread.session && !previousThread.latestTurn?.completedAt) {
      continue;
    }
    // 上一次快照中该线程已处于稳定完成态且没有未完成轮次，说明通知已发过，跳过
    if (!hadUnsettledTurn(previousThread) && !previousThread.latestTurn?.completedAt) {
      continue;
    }
    // 同一个轮次 ID 且上一次已稳定，说明是重复通知，跳过
    if (
      previousThread.latestTurn?.turnId === thread.latestTurn?.turnId &&
      isCompletionNotificationSettled(previousThread)
    ) {
      continue;
    }

    // 通过以上所有过滤条件，确认为新产生的完成事件
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
 * 解析指定终端在当前线程状态下的可视化状态。
 * 优先级：attention（需立即关注）> running（运行中）> review（待审查）> idle（空闲）。
 *
 * @param threadState - 线程的终端通知状态快照，可能为 undefined
 * @param terminalId - 目标终端 ID
 * @returns 终端的可视化状态
 */
function resolveTerminalNotificationState(
  threadState: TerminalNotificationThreadState | undefined,
  terminalId: string,
): TerminalVisualState {
  if (!threadState) {
    return "idle";
  }
  // "attention" 优先级最高，表示终端需要用户立即关注
  if (threadState.terminalAttentionStatesById?.[terminalId] === "attention") {
    return "attention";
  }
  // 终端正在运行命令
  if ((threadState.runningTerminalIds ?? []).includes(terminalId)) {
    return "running";
  }
  // 终端命令已完成，等待用户审查输出结果
  if (threadState.terminalAttentionStatesById?.[terminalId] === "review") {
    return "review";
  }
  return "idle";
}

/**
 * 解析指定终端的通知显示标题和 CLI 类型。
 * 标题优先级：标题覆盖值 > 用户标签 > CLI 类型默认标题 > "Terminal"。
 *
 * @param threadState - 线程的终端通知状态快照，可能为 undefined
 * @param terminalId - 目标终端 ID
 * @returns 包含 CLI 类型和显示标题的对象
 */
function resolveTerminalNotificationTitle(
  threadState: TerminalNotificationThreadState | undefined,
  terminalId: string,
): { cliKind: TerminalCliKind | null; title: string } {
  const cliKind = threadState?.terminalCliKindsById?.[terminalId] ?? null;
  // 按优先级依次尝试获取标题：覆盖标题 → 用户标签 → CLI 默认标题 → 兜底值
  const title =
    threadState?.terminalTitleOverridesById?.[terminalId]?.trim() ||
    threadState?.terminalLabelsById?.[terminalId]?.trim() ||
    (cliKind ? defaultTerminalTitleForCliKind(cliKind) : "Terminal");
  return { cliKind, title };
}

/**
 * 对比前后两次终端状态快照，收集新产生的已完成终端任务候选项。
 * 仅当终端状态从非 "review" 变为 "review" 时，才认为任务完成并生成候选项。
 *
 * @param previousByThreadId - 上一次快照中按线程 ID 索引的终端状态
 * @param nextByThreadId - 当前快照中按线程 ID 索引的终端状态
 * @returns 新产生的已完成终端任务候选项数组
 */
export function collectCompletedTerminalCandidates(
  previousByThreadId: Record<string, TerminalNotificationThreadState>,
  nextByThreadId: Record<string, TerminalNotificationThreadState>,
): CompletedTerminalCandidate[] {
  // 合并前后两次快照的所有线程 ID，确保不遗漏
  const threadIds = new Set([...Object.keys(previousByThreadId), ...Object.keys(nextByThreadId)]);
  const candidates: CompletedTerminalCandidate[] = [];

  for (const threadId of threadIds) {
    const previousThreadState = previousByThreadId[threadId];
    const nextThreadState = nextByThreadId[threadId];
    // 合并该线程下前后两次快照的所有终端 ID
    const terminalIds = new Set([
      ...(previousThreadState?.terminalIds ?? []),
      ...(nextThreadState?.terminalIds ?? []),
    ]);

    for (const terminalId of terminalIds) {
      const previousState = resolveTerminalNotificationState(previousThreadState, terminalId);
      const nextState = resolveTerminalNotificationState(nextThreadState, terminalId);
      // 仅当状态变为 "review" 且之前不是 "review" 时，才视为新完成的任务
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
 * 根据审批请求类型生成对应的摘要描述文本。
 *
 * @param requestKind - 审批请求类型
 * @returns 人类可读的审批摘要文本
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
 * 对比前后两次线程快照，收集新产生的需要用户关注的线程候选项。
 * 包括新出现的审批请求和用户输入请求，通过比对请求 ID 去重，仅保留新增项。
 * 结果按创建时间升序排列。
 *
 * @param previousThreads - 上一次快照中的线程列表
 * @param nextThreads - 当前快照中的线程列表
 * @returns 新产生的需关注线程候选项数组，按创建时间升序排列
 */
export function collectThreadAttentionCandidates(
  previousThreads: readonly Thread[],
  nextThreads: readonly Thread[],
): ThreadAttentionCandidate[] {
  // 将上一次快照按线程 ID 建立索引
  const previousById = new Map(previousThreads.map((thread) => [thread.id, thread] as const));
  const candidates: ThreadAttentionCandidate[] = [];

  for (const thread of nextThreads) {
    const previousThread = previousById.get(thread.id);
    // 新增线程跳过，不产生关注通知
    if (!previousThread) {
      continue;
    }

    // 收集上一次快照中已存在的审批请求 ID，用于去重
    const previousApprovalIds = new Set(
      derivePendingApprovals(previousThread.activities).map((approval) => approval.requestId),
    );
    // 收集上一次快照中已存在的用户输入请求 ID，用于去重
    const previousUserInputIds = new Set(
      derivePendingUserInputs(previousThread.activities).map((request) => request.requestId),
    );

    // 检查当前快照中的审批请求，筛选出新增项
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

    // 检查当前快照中的用户输入请求，筛选出新增项
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

  // 按创建时间升序排列，确保通知按时间顺序处理
  return candidates.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/**
 * 对比前后两次终端状态快照，收集新产生的需要用户关注的终端候选项。
 * 仅当终端状态从非 "attention" 变为 "attention" 时，才认为需要关注并生成候选项。
 *
 * @param previousByThreadId - 上一次快照中按线程 ID 索引的终端状态
 * @param nextByThreadId - 当前快照中按线程 ID 索引的终端状态
 * @returns 新产生的需关注终端候选项数组
 */
export function collectTerminalAttentionCandidates(
  previousByThreadId: Record<string, TerminalNotificationThreadState>,
  nextByThreadId: Record<string, TerminalNotificationThreadState>,
): TerminalAttentionCandidate[] {
  // 合并前后两次快照的所有线程 ID
  const threadIds = new Set([...Object.keys(previousByThreadId), ...Object.keys(nextByThreadId)]);
  const candidates: TerminalAttentionCandidate[] = [];

  for (const threadId of threadIds) {
    const previousThreadState = previousByThreadId[threadId];
    const nextThreadState = nextByThreadId[threadId];
    // 合并该线程下前后两次快照的所有终端 ID
    const terminalIds = new Set([
      ...(previousThreadState?.terminalIds ?? []),
      ...(nextThreadState?.terminalIds ?? []),
    ]);

    for (const terminalId of terminalIds) {
      const previousState = resolveTerminalNotificationState(previousThreadState, terminalId);
      const nextState = resolveTerminalNotificationState(nextThreadState, terminalId);
      // 仅当状态变为 "attention" 且之前不是 "attention" 时，才视为新的关注事件
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
 * 构建线程任务完成通知的显示文案。
 * 确保浏览器 Toast 和操作系统通知使用一致的文案内容。
 *
 * @param candidate - 已完成的线程候选项
 * @returns 包含通知标题和正文的对象
 */
export function buildTaskCompletionCopy(candidate: CompletedThreadCandidate): {
  title: string;
  body: string;
} {
  const normalizedTitle = candidate.title.trim();
  // 标题为空时使用默认文案
  const threadLabel = normalizedTitle.length > 0 ? normalizedTitle : "Untitled thread";

  return {
    title: threadLabel,
    // 优先使用助手消息摘要，无摘要时使用默认完成文案
    body: candidate.assistantSummary || "Finished working.",
  };
}

/**
 * 构建线程需要用户关注时的通知显示文案。
 * 包括审批请求和用户输入请求两种场景。
 *
 * @param candidate - 需关注的线程候选项
 * @returns 包含通知标题和正文的对象
 */
export function buildThreadAttentionCopy(candidate: ThreadAttentionCandidate): {
  title: string;
  body: string;
} {
  const normalizedTitle = candidate.title.trim();
  // 标题为空时使用默认文案
  const threadLabel = normalizedTitle.length > 0 ? normalizedTitle : "Untitled thread";
  // 优先使用候选项自带的摘要，否则根据类型生成默认摘要
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
 * 构建终端任务完成通知的显示文案。
 *
 * @param candidate - 已完成的终端任务候选项
 * @returns 包含通知标题和正文的对象
 */
export function buildTerminalCompletionCopy(candidate: CompletedTerminalCandidate): {
  title: string;
  body: string;
} {
  // 终端标题为空时使用默认值
  const terminalLabel = candidate.title.trim() || "Terminal";
  return {
    title: "Terminal task completed",
    body: `${terminalLabel} finished working.`,
  };
}

/**
 * 构建终端需要用户关注时的通知显示文案。
 *
 * @param candidate - 需关注的终端候选项
 * @returns 包含通知标题和正文的对象
 */
export function buildTerminalAttentionCopy(candidate: TerminalAttentionCandidate): {
  title: string;
  body: string;
} {
  // 终端标题为空时使用默认值
  const terminalLabel = candidate.title.trim() || "Terminal";
  return {
    title: "Terminal input needed",
    body: `${terminalLabel} needs your attention.`,
  };
}

/**
 * 判断是否应抑制当前可见线程的通知。
 * 当应用窗口处于前台且目标线程正在可见区域时，抑制通知以避免打扰用户。
 *
 * @param input.threadId - 待判断的线程 ID
 * @param input.visibleThreadIds - 当前可见的线程 ID 集合
 * @param input.windowForeground - 应用窗口是否处于前台
 * @returns 若应抑制通知则返回 true
 */
export function shouldSuppressVisibleThreadNotification(input: {
  threadId: Thread["id"];
  visibleThreadIds: ReadonlySet<Thread["id"]>;
  windowForeground: boolean;
}): boolean {
  return input.windowForeground && input.visibleThreadIds.has(input.threadId);
}

/**
 * 收集"需要用户输入"的线程候选项（collectThreadAttentionCandidates 的别名）。
 * 使用语义化命名以提高调用方的代码可读性。
 */
export const collectInputNeededThreadCandidates = collectThreadAttentionCandidates;

/**
 * 构建"需要用户输入"通知文案（buildThreadAttentionCopy 的别名）。
 * 使用语义化命名以提高调用方的代码可读性。
 */
export const buildInputNeededCopy = buildThreadAttentionCopy;

/**
 * 判断候选时间戳是否属于本次通知运行时的"新鲜"事件。
 * 水合（hydration）过程可能会重放旧线程数据，只有在本通知运行时启动之后产生的时间戳
 * 才应被视为实时事件，避免对历史数据重复触发通知。
 *
 * @param candidateTimestamp - 候选事件的时间戳（ISO 8601 格式字符串）
 * @param runtimeStartedAtMs - 通知运行时的启动时间（毫秒级时间戳）
 * @returns 若时间戳晚于运行时启动时间则返回 true，表示是新鲜事件；
 *          若任一参数无法解析为有效数字也返回 true（保守策略）
 */
export function isNotificationRuntimeFreshTimestamp(
  candidateTimestamp: string,
  runtimeStartedAtMs: number,
): boolean {
  const candidateMs = Date.parse(candidateTimestamp);
  // 若时间戳无法解析，采用保守策略视为新鲜事件
  if (!Number.isFinite(candidateMs) || !Number.isFinite(runtimeStartedAtMs)) {
    return true;
  }
  return candidateMs > runtimeStartedAtMs;
}
