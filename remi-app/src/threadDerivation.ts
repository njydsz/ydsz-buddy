/**
 * @file threadDerivation.ts
 * @description 从归一化的 shell/detail 切片中重建稳定的 Thread 对象�? * 提供 Web Store 热路径中使用的缓存集合辅助函数和线程派生逻辑�? *
 * 核心思路：应用状态以归一化（扁平）形式存储，本模块负责在读取�? * 将分散的 shell、session、messages 等切片重新组装为完整�?Thread 对象�? * 并通过 WeakMap 缓存避免不必要的对象重建�? */

import type { MessageId, ThreadId, TurnId } from "~/contracts";
import type { AppState } from "./store";
import type {
  ChatMessage,
  ProposedPlan,
  Thread,
  ThreadSession,
  ThreadShell,
  ThreadTurnState,
  TurnDiffSummary,
} from "./types";

/** 空消息数组，作为默认返回值避免重复创�?*/
const EMPTY_MESSAGES: ChatMessage[] = [];
/** 空活动列表，作为默认返回值避免重复创�?*/
const EMPTY_ACTIVITIES: Thread["activities"] = [];
/** 空提议计划列表，作为默认返回值避免重复创�?*/
const EMPTY_PROPOSED_PLANS: ProposedPlan[] = [];
/** 空变更差异摘要列表，作为默认返回值避免重复创�?*/
const EMPTY_TURN_DIFF_SUMMARIES: TurnDiffSummary[] = [];
/** 空消息映射表，作为默认返回值避免重复创�?*/
const EMPTY_MESSAGE_MAP: Record<MessageId, ChatMessage> = {};
/** 空活动映射表，作为默认返回值避免重复创�?*/
const EMPTY_ACTIVITY_MAP: Record<string, Thread["activities"][number]> = {};
/** 空提议计划映射表，作为默认返回值避免重复创�?*/
const EMPTY_PROPOSED_PLAN_MAP: Record<string, ProposedPlan> = {};
/** 空变更差异映射表，作为默认返回值避免重复创�?*/
const EMPTY_TURN_DIFF_MAP: Record<TurnId, TurnDiffSummary> = {};
/** 空线�?ID 列表，作为默认返回值避免重复创�?*/
const EMPTY_THREAD_IDS: ThreadId[] = [];
/** 空线�?Shell 映射表，作为默认返回值避免重复创�?*/
const EMPTY_THREAD_SHELL_MAP: Record<ThreadId, ThreadShell> = {};
/** 空线程会话映射表，作为默认返回值避免重复创�?*/
const EMPTY_THREAD_SESSION_MAP: Record<ThreadId, ThreadSession | null> = {};
/** 空线程轮次状态映射表，作为默认返回值避免重复创�?*/
const EMPTY_THREAD_TURN_STATE_MAP: Record<ThreadId, ThreadTurnState> = {};
/** 空消�?ID 按线程分组映射表，作为默认返回值避免重复创�?*/
const EMPTY_MESSAGE_IDS_BY_THREAD: Record<ThreadId, MessageId[]> = {};
/** 空活�?ID 按线程分组映射表，作为默认返回值避免重复创�?*/
const EMPTY_ACTIVITY_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
/** 空提议计�?ID 按线程分组映射表，作为默认返回值避免重复创�?*/
const EMPTY_PROPOSED_PLAN_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
/** 空变更差�?ID 按线程分组映射表，作为默认返回值避免重复创�?*/
const EMPTY_TURN_DIFF_IDS_BY_THREAD: Record<ThreadId, TurnId[]> = {};

/**
 * collectByIds 的缓存。外�?WeakMap �?ID 数组�?key�? * 内层 WeakMap �?byId 映射表为 key，缓存已收集的结果数组�? * 使用 WeakMap 确保�?key 被回收时缓存条目也会被自动清理�? */
const collectedByIdsCache = new WeakMap<readonly string[], WeakMap<object, readonly unknown[]>>();

/**
 * Thread 对象的缓存。以 ThreadShell �?key，存储其派生出的完整 Thread 及中间数据�? * 当所有子切片（session、messages 等）的引用均未变化时，直接返回缓存的 Thread 对象�? * 避免�?React 渲染路径上产生新的对象引用导致不必要的重渲染�? */
const threadCache = new WeakMap<
  ThreadShell,
  {
    session: ThreadSession | null;
    turnState: ThreadTurnState | undefined;
    messages: Thread["messages"];
    activities: Thread["activities"];
    proposedPlans: Thread["proposedPlans"];
    turnDiffSummaries: Thread["turnDiffSummaries"];
    thread: Thread;
  }
>();

/**
 * 根据 ID 列表从映射表中收集对应的值，并利�?WeakMap 进行结果缓存�? * 当输入的 ids �?byId 引用未变化时，直接返回缓存结果，避免重复计算�? *
 * @template TKey - ID 的类型，必须�?string 子类�? * @template TValue - 映射表中值的类型
 * @param ids - 需要收集的 ID 列表，为空或 undefined 时返�?emptyValue
 * @param byId - ID 到值的映射表，�?undefined 时返�?emptyValue
 * @param emptyValue - �?ids 为空�?byId 为空时的默认返回�? * @returns �?ids 顺序�?byId 中收集到的值数组（跳过不存在的条目�? *
 * @example
 * ```ts
 * const ids = ["a", "b", "c"];
 * const byId = { a: 1, c: 3 };
 * collectByIds(ids, byId, []); // => [1, 3]
 * ```
 */
export function collectByIds<TKey extends string, TValue>(
  ids: readonly TKey[] | undefined,
  byId: Record<TKey, TValue> | undefined,
  emptyValue: TValue[],
): TValue[] {
  if (!ids || ids.length === 0 || !byId) {
    return emptyValue;
  }

  const cachedByRecord = collectedByIdsCache.get(ids);
  const cached = cachedByRecord?.get(byId);
  if (cached) {
    return cached as TValue[];
  }

  const nextValues = ids.flatMap((id) => {
    const value = byId[id];
    return value ? [value] : [];
  });
  const nextCachedByRecord = cachedByRecord ?? new WeakMap<object, readonly unknown[]>();
  nextCachedByRecord.set(byId, nextValues);
  if (!cachedByRecord) {
    collectedByIdsCache.set(ids, nextCachedByRecord);
  }
  return nextValues;
}

/** 从应用状态中选取指定线程的消息列�?*/
function selectThreadMessages(state: AppState, threadId: ThreadId): Thread["messages"] {
  return collectByIds(
    state.messageIdsByThreadId?.[threadId] ?? EMPTY_MESSAGE_IDS_BY_THREAD[threadId],
    state.messageByThreadId?.[threadId] ?? EMPTY_MESSAGE_MAP,
    EMPTY_MESSAGES,
  );
}

/** 从应用状态中选取指定线程的活动列�?*/
function selectThreadActivities(state: AppState, threadId: ThreadId): Thread["activities"] {
  return collectByIds(
    state.activityIdsByThreadId?.[threadId] ?? EMPTY_ACTIVITY_IDS_BY_THREAD[threadId],
    state.activityByThreadId?.[threadId] ?? EMPTY_ACTIVITY_MAP,
    EMPTY_ACTIVITIES,
  );
}

/** 从应用状态中选取指定线程的提议计划列�?*/
function selectThreadProposedPlans(state: AppState, threadId: ThreadId): Thread["proposedPlans"] {
  return collectByIds(
    state.proposedPlanIdsByThreadId?.[threadId] ?? EMPTY_PROPOSED_PLAN_IDS_BY_THREAD[threadId],
    state.proposedPlanByThreadId?.[threadId] ?? EMPTY_PROPOSED_PLAN_MAP,
    EMPTY_PROPOSED_PLANS,
  );
}

/** 从应用状态中选取指定线程的变更差异摘要列�?*/
function selectThreadTurnDiffSummaries(
  state: AppState,
  threadId: ThreadId,
): Thread["turnDiffSummaries"] {
  return collectByIds(
    state.turnDiffIdsByThreadId?.[threadId] ?? EMPTY_TURN_DIFF_IDS_BY_THREAD[threadId],
    state.turnDiffSummaryByThreadId?.[threadId] ?? EMPTY_TURN_DIFF_MAP,
    EMPTY_TURN_DIFF_SUMMARIES,
  );
}

/**
 * 从应用状态中派生指定线程的完�?Thread 对象�? * 通过 WeakMap 缓存机制，当所有子切片引用均未变化时返回缓存对象，
 * 避免产生新的引用导致 React 组件不必要的重渲染�? *
 * @param state - 应用全局状�? * @param threadId - 目标线程 ID
 * @returns 完整�?Thread 对象，若线程不存在则返回 undefined
 *
 * @example
 * ```ts
 * const thread = getThreadFromState(appState, "thread-123");
 * if (thread) {
 *   console.log(thread.messages);
 * }
 * ```
 */
export function getThreadFromState(state: AppState, threadId: ThreadId): Thread | undefined {
  const shell = state.threadShellById?.[threadId] ?? EMPTY_THREAD_SHELL_MAP[threadId];
  if (!shell) {
    return undefined;
  }

  const session = state.threadSessionById?.[threadId] ?? EMPTY_THREAD_SESSION_MAP[threadId] ?? null;
  const turnState = state.threadTurnStateById?.[threadId] ?? EMPTY_THREAD_TURN_STATE_MAP[threadId];
  const messages = selectThreadMessages(state, threadId);
  const activities = selectThreadActivities(state, threadId);
  const proposedPlans = selectThreadProposedPlans(state, threadId);
  const turnDiffSummaries = selectThreadTurnDiffSummaries(state, threadId);
  const cached = threadCache.get(shell);

  if (
    cached &&
    cached.session === session &&
    cached.turnState === turnState &&
    cached.messages === messages &&
    cached.activities === activities &&
    cached.proposedPlans === proposedPlans &&
    cached.turnDiffSummaries === turnDiffSummaries
  ) {
    return cached.thread;
  }

  const thread: Thread = {
    ...shell,
    session,
    latestTurn: turnState?.latestTurn ?? null,
    pendingSourceProposedPlan: turnState?.pendingSourceProposedPlan,
    messages,
    activities,
    proposedPlans,
    turnDiffSummaries,
  };

  threadCache.set(shell, {
    session,
    turnState,
    messages,
    activities,
    proposedPlans,
    turnDiffSummaries,
    thread,
  });

  return thread;
}

/**
 * 从应用状态中派生所有线程的完整 Thread 对象列表�? * 内部调用 getThreadFromState 逐个派生，跳过不存在的线程�? *
 * @param state - 应用全局状�? * @returns 所有有效线程的 Thread 对象数组
 *
 * @example
 * ```ts
 * const allThreads = getThreadsFromState(appState);
 * allThreads.forEach(thread => console.log(thread.id));
 * ```
 */
export function getThreadsFromState(state: AppState): Thread[] {
  const threadIds = state.threadIds ?? EMPTY_THREAD_IDS;
  return threadIds.flatMap((threadId) => {
    const thread = getThreadFromState(state, threadId);
    return thread ? [thread] : [];
  });
}
