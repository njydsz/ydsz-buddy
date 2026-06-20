/**
 * @file threadDerivation.ts
 * @description 浠庡綊涓€鍖栫殑 shell/detail 鍒囩墖涓噸寤虹ǔ瀹氱殑 Thread 瀵硅薄銆? * 鎻愪緵 Web Store 鐑矾寰勪腑浣跨敤鐨勭紦瀛橀泦鍚堣緟鍔╁嚱鏁板拰绾跨▼娲剧敓閫昏緫銆? *
 * 鏍稿績鎬濊矾锛氬簲鐢ㄧ姸鎬佷互褰掍竴鍖栵紙鎵佸钩锛夊舰寮忓瓨鍌紝鏈ā鍧楄礋璐ｅ湪璇诲彇鏃? * 灏嗗垎鏁ｇ殑 shell銆乻ession銆乵essages 绛夊垏鐗囬噸鏂扮粍瑁呬负瀹屾暣鐨?Thread 瀵硅薄锛? * 骞堕€氳繃 WeakMap 缂撳瓨閬垮厤涓嶅繀瑕佺殑瀵硅薄閲嶅缓銆? */

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

/** 绌烘秷鎭暟缁勶紝浣滀负榛樿杩斿洖鍊奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_MESSAGES: ChatMessage[] = [];
/** 绌烘椿鍔ㄥ垪琛紝浣滀负榛樿杩斿洖鍊奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_ACTIVITIES: Thread["activities"] = [];
/** 绌烘彁璁鍒掑垪琛紝浣滀负榛樿杩斿洖鍊奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_PROPOSED_PLANS: ProposedPlan[] = [];
/** 绌哄彉鏇村樊寮傛憳瑕佸垪琛紝浣滀负榛樿杩斿洖鍊奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_TURN_DIFF_SUMMARIES: TurnDiffSummary[] = [];
/** 绌烘秷鎭槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_MESSAGE_MAP: Record<MessageId, ChatMessage> = {};
/** 绌烘椿鍔ㄦ槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_ACTIVITY_MAP: Record<string, Thread["activities"][number]> = {};
/** 绌烘彁璁鍒掓槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_PROPOSED_PLAN_MAP: Record<string, ProposedPlan> = {};
/** 绌哄彉鏇村樊寮傛槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_TURN_DIFF_MAP: Record<TurnId, TurnDiffSummary> = {};
/** 绌虹嚎绋?ID 鍒楄〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_THREAD_IDS: ThreadId[] = [];
/** 绌虹嚎绋?Shell 鏄犲皠琛紝浣滀负榛樿杩斿洖鍊奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_THREAD_SHELL_MAP: Record<ThreadId, ThreadShell> = {};
/** 绌虹嚎绋嬩細璇濇槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_THREAD_SESSION_MAP: Record<ThreadId, ThreadSession | null> = {};
/** 绌虹嚎绋嬭疆娆＄姸鎬佹槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_THREAD_TURN_STATE_MAP: Record<ThreadId, ThreadTurnState> = {};
/** 绌烘秷鎭?ID 鎸夌嚎绋嬪垎缁勬槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_MESSAGE_IDS_BY_THREAD: Record<ThreadId, MessageId[]> = {};
/** 绌烘椿鍔?ID 鎸夌嚎绋嬪垎缁勬槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_ACTIVITY_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
/** 绌烘彁璁鍒?ID 鎸夌嚎绋嬪垎缁勬槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_PROPOSED_PLAN_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
/** 绌哄彉鏇村樊寮?ID 鎸夌嚎绋嬪垎缁勬槧灏勮〃锛屼綔涓洪粯璁よ繑鍥炲€奸伩鍏嶉噸澶嶅垱寤?*/
const EMPTY_TURN_DIFF_IDS_BY_THREAD: Record<ThreadId, TurnId[]> = {};

/**
 * collectByIds 鐨勭紦瀛樸€傚灞?WeakMap 浠?ID 鏁扮粍涓?key锛? * 鍐呭眰 WeakMap 浠?byId 鏄犲皠琛ㄤ负 key锛岀紦瀛樺凡鏀堕泦鐨勭粨鏋滄暟缁勩€? * 浣跨敤 WeakMap 纭繚褰?key 琚洖鏀舵椂缂撳瓨鏉＄洰涔熶細琚嚜鍔ㄦ竻鐞嗐€? */
const collectedByIdsCache = new WeakMap<readonly string[], WeakMap<object, readonly unknown[]>>();

/**
 * Thread 瀵硅薄鐨勭紦瀛樸€備互 ThreadShell 涓?key锛屽瓨鍌ㄥ叾娲剧敓鍑虹殑瀹屾暣 Thread 鍙婁腑闂存暟鎹€? * 褰撴墍鏈夊瓙鍒囩墖锛坰ession銆乵essages 绛夛級鐨勫紩鐢ㄥ潎鏈彉鍖栨椂锛岀洿鎺ヨ繑鍥炵紦瀛樼殑 Thread 瀵硅薄锛? * 閬垮厤鍦?React 娓叉煋璺緞涓婁骇鐢熸柊鐨勫璞″紩鐢ㄥ鑷翠笉蹇呰鐨勯噸娓叉煋銆? */
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
 * 鏍规嵁 ID 鍒楄〃浠庢槧灏勮〃涓敹闆嗗搴旂殑鍊硷紝骞跺埄鐢?WeakMap 杩涜缁撴灉缂撳瓨銆? * 褰撹緭鍏ョ殑 ids 鎴?byId 寮曠敤鏈彉鍖栨椂锛岀洿鎺ヨ繑鍥炵紦瀛樼粨鏋滐紝閬垮厤閲嶅璁＄畻銆? *
 * @template TKey - ID 鐨勭被鍨嬶紝蹇呴』涓?string 瀛愮被鍨? * @template TValue - 鏄犲皠琛ㄤ腑鍊肩殑绫诲瀷
 * @param ids - 闇€瑕佹敹闆嗙殑 ID 鍒楄〃锛屼负绌烘垨 undefined 鏃惰繑鍥?emptyValue
 * @param byId - ID 鍒板€肩殑鏄犲皠琛紝涓?undefined 鏃惰繑鍥?emptyValue
 * @param emptyValue - 褰?ids 涓虹┖鎴?byId 涓虹┖鏃剁殑榛樿杩斿洖鍊? * @returns 鎸?ids 椤哄簭浠?byId 涓敹闆嗗埌鐨勫€兼暟缁勶紙璺宠繃涓嶅瓨鍦ㄧ殑鏉＄洰锛? *
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

/** 浠庡簲鐢ㄧ姸鎬佷腑閫夊彇鎸囧畾绾跨▼鐨勬秷鎭垪琛?*/
function selectThreadMessages(state: AppState, threadId: ThreadId): Thread["messages"] {
  return collectByIds(
    state.messageIdsByThreadId?.[threadId] ?? EMPTY_MESSAGE_IDS_BY_THREAD[threadId],
    state.messageByThreadId?.[threadId] ?? EMPTY_MESSAGE_MAP,
    EMPTY_MESSAGES,
  );
}

/** 浠庡簲鐢ㄧ姸鎬佷腑閫夊彇鎸囧畾绾跨▼鐨勬椿鍔ㄥ垪琛?*/
function selectThreadActivities(state: AppState, threadId: ThreadId): Thread["activities"] {
  return collectByIds(
    state.activityIdsByThreadId?.[threadId] ?? EMPTY_ACTIVITY_IDS_BY_THREAD[threadId],
    state.activityByThreadId?.[threadId] ?? EMPTY_ACTIVITY_MAP,
    EMPTY_ACTIVITIES,
  );
}

/** 浠庡簲鐢ㄧ姸鎬佷腑閫夊彇鎸囧畾绾跨▼鐨勬彁璁鍒掑垪琛?*/
function selectThreadProposedPlans(state: AppState, threadId: ThreadId): Thread["proposedPlans"] {
  return collectByIds(
    state.proposedPlanIdsByThreadId?.[threadId] ?? EMPTY_PROPOSED_PLAN_IDS_BY_THREAD[threadId],
    state.proposedPlanByThreadId?.[threadId] ?? EMPTY_PROPOSED_PLAN_MAP,
    EMPTY_PROPOSED_PLANS,
  );
}

/** 浠庡簲鐢ㄧ姸鎬佷腑閫夊彇鎸囧畾绾跨▼鐨勫彉鏇村樊寮傛憳瑕佸垪琛?*/
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
 * 浠庡簲鐢ㄧ姸鎬佷腑娲剧敓鎸囧畾绾跨▼鐨勫畬鏁?Thread 瀵硅薄銆? * 閫氳繃 WeakMap 缂撳瓨鏈哄埗锛屽綋鎵€鏈夊瓙鍒囩墖寮曠敤鍧囨湭鍙樺寲鏃惰繑鍥炵紦瀛樺璞★紝
 * 閬垮厤浜х敓鏂扮殑寮曠敤瀵艰嚧 React 缁勪欢涓嶅繀瑕佺殑閲嶆覆鏌撱€? *
 * @param state - 搴旂敤鍏ㄥ眬鐘舵€? * @param threadId - 鐩爣绾跨▼ ID
 * @returns 瀹屾暣鐨?Thread 瀵硅薄锛岃嫢绾跨▼涓嶅瓨鍦ㄥ垯杩斿洖 undefined
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
 * 浠庡簲鐢ㄧ姸鎬佷腑娲剧敓鎵€鏈夌嚎绋嬬殑瀹屾暣 Thread 瀵硅薄鍒楄〃銆? * 鍐呴儴璋冪敤 getThreadFromState 閫愪釜娲剧敓锛岃烦杩囦笉瀛樺湪鐨勭嚎绋嬨€? *
 * @param state - 搴旂敤鍏ㄥ眬鐘舵€? * @returns 鎵€鏈夋湁鏁堢嚎绋嬬殑 Thread 瀵硅薄鏁扮粍
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
