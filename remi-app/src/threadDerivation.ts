/**
 * @file threadDerivation.ts
 * @description 娴犲骸缍婃稉鈧崠鏍畱 shell/detail 閸掑洨澧栨稉顓㈠櫢瀵よ櫣菙鐎规氨娈?Thread 鐎电钖勯妴? * 閹绘劒绶?Web Store 閻戭叀鐭惧鍕厬娴ｈ法鏁ら惃鍕处鐎涙﹢娉﹂崥鍫ｇ窡閸斺晛鍤遍弫鏉挎嫲缁捐法鈻煎ú鍓ф晸闁槒绶妴? *
 * 閺嶇绺鹃幀婵婄熅閿涙艾绨查悽銊уЦ閹椒浜掕ぐ鎺嶇閸栨牭绱欓幍浣搁挬閿涘鑸板蹇撶摠閸岊煉绱濋張顒伳侀崸妤勭鐠愶絽婀拠璇插絿閺? * 鐏忓棗鍨庨弫锝囨畱 shell閵嗕够ession閵嗕沟essages 缁涘鍨忛悧鍥櫢閺傛壆绮嶇憗鍛礋鐎瑰本鏆ｉ惃?Thread 鐎电钖勯敍? * 楠炲爼鈧俺绻?WeakMap 缂傛挸鐡ㄩ柆鍨帳娑撳秴绻€鐟曚胶娈戠€电钖勯柌宥呯紦閵? */

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

/** 缁岀儤绉烽幁顖涙殶缂佸嫸绱濇担婊€璐熸妯款吇鏉╂柨娲栭崐濂镐缉閸忓秹鍣告径宥呭灡瀵?*/
const EMPTY_MESSAGES: ChatMessage[] = [];
/** 缁岀儤妞块崝銊ュ灙鐞涱煉绱濇担婊€璐熸妯款吇鏉╂柨娲栭崐濂镐缉閸忓秹鍣告径宥呭灡瀵?*/
const EMPTY_ACTIVITIES: Thread["activities"] = [];
/** 缁岀儤褰佺拋顔款吀閸掓帒鍨悰顭掔礉娴ｆ粈璐熸妯款吇鏉╂柨娲栭崐濂镐缉閸忓秹鍣告径宥呭灡瀵?*/
const EMPTY_PROPOSED_PLANS: ProposedPlan[] = [];
/** 缁屽搫褰夐弴鏉戞▕瀵倹鎲崇憰浣稿灙鐞涱煉绱濇担婊€璐熸妯款吇鏉╂柨娲栭崐濂镐缉閸忓秹鍣告径宥呭灡瀵?*/
const EMPTY_TURN_DIFF_SUMMARIES: TurnDiffSummary[] = [];
/** 缁岀儤绉烽幁顖涙Ё鐏忓嫯銆冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_MESSAGE_MAP: Record<MessageId, ChatMessage> = {};
/** 缁岀儤妞块崝銊︽Ё鐏忓嫯銆冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_ACTIVITY_MAP: Record<string, Thread["activities"][number]> = {};
/** 缁岀儤褰佺拋顔款吀閸掓帗妲х亸鍕€冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_PROPOSED_PLAN_MAP: Record<string, ProposedPlan> = {};
/** 缁屽搫褰夐弴鏉戞▕瀵倹妲х亸鍕€冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_TURN_DIFF_MAP: Record<TurnId, TurnDiffSummary> = {};
/** 缁岃櫣鍤庣粙?ID 閸掓銆冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_THREAD_IDS: ThreadId[] = [];
/** 缁岃櫣鍤庣粙?Shell 閺勭姴鐨犵悰顭掔礉娴ｆ粈璐熸妯款吇鏉╂柨娲栭崐濂镐缉閸忓秹鍣告径宥呭灡瀵?*/
const EMPTY_THREAD_SHELL_MAP: Record<ThreadId, ThreadShell> = {};
/** 缁岃櫣鍤庣粙瀣╃窗鐠囨繃妲х亸鍕€冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_THREAD_SESSION_MAP: Record<ThreadId, ThreadSession | null> = {};
/** 缁岃櫣鍤庣粙瀣枂濞嗭紕濮搁幀浣规Ё鐏忓嫯銆冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_THREAD_TURN_STATE_MAP: Record<ThreadId, ThreadTurnState> = {};
/** 缁岀儤绉烽幁?ID 閹稿鍤庣粙瀣瀻缂佸嫭妲х亸鍕€冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_MESSAGE_IDS_BY_THREAD: Record<ThreadId, MessageId[]> = {};
/** 缁岀儤妞块崝?ID 閹稿鍤庣粙瀣瀻缂佸嫭妲х亸鍕€冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_ACTIVITY_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
/** 缁岀儤褰佺拋顔款吀閸?ID 閹稿鍤庣粙瀣瀻缂佸嫭妲х亸鍕€冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_PROPOSED_PLAN_IDS_BY_THREAD: Record<ThreadId, string[]> = {};
/** 缁屽搫褰夐弴鏉戞▕瀵?ID 閹稿鍤庣粙瀣瀻缂佸嫭妲х亸鍕€冮敍灞肩稊娑撴椽绮拋銈堢箲閸ョ偛鈧ジ浼╅崗宥夊櫢婢跺秴鍨卞?*/
const EMPTY_TURN_DIFF_IDS_BY_THREAD: Record<ThreadId, TurnId[]> = {};

/**
 * collectByIds 閻ㄥ嫮绱︾€涙ǜ鈧倸顦荤仦?WeakMap 娴?ID 閺佹壆绮嶆稉?key閿? * 閸愬懎鐪?WeakMap 娴?byId 閺勭姴鐨犵悰銊よ礋 key閿涘瞼绱︾€涙ê鍑￠弨鍫曟肠閻ㄥ嫮绮ㄩ弸婊勬殶缂佸嫨鈧? * 娴ｈ法鏁?WeakMap 绾喕绻氳ぐ?key 鐞氼偄娲栭弨鑸垫缂傛挸鐡ㄩ弶锛勬窗娑旂喍绱扮悮顐ュ殰閸斻劍绔婚悶鍡愨偓? */
const collectedByIdsCache = new WeakMap<readonly string[], WeakMap<object, readonly unknown[]>>();

/**
 * Thread 鐎电钖勯惃鍕处鐎涙ǜ鈧倷浜?ThreadShell 娑?key閿涘苯鐡ㄩ崒銊ュ従濞插墽鏁撻崙铏规畱鐎瑰本鏆?Thread 閸欏﹣鑵戦梻瀛樻殶閹诡喓鈧? * 瑜版挻澧嶉張澶婄摍閸掑洨澧栭敍鍧癳ssion閵嗕沟essages 缁涘绱氶惃鍕穿閻劌娼庨張顏勫綁閸栨牗妞傞敍宀€娲块幒銉ㄧ箲閸ョ偟绱︾€涙娈?Thread 鐎电钖勯敍? * 闁灝鍘ら崷?React 濞撳弶鐓嬬捄顖氱窞娑撳﹣楠囬悽鐔告煀閻ㄥ嫬顕挒鈥崇穿閻劌顕遍懛缈犵瑝韫囧懓顩﹂惃鍕櫢濞撳弶鐓嬮妴? */
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
 * 閺嶈宓?ID 閸掓銆冩禒搴㈡Ё鐏忓嫯銆冩稉顓熸暪闂嗗棗顕惔鏃傛畱閸婄》绱濋獮璺哄焺閻?WeakMap 鏉╂稖顢戠紒鎾寸亯缂傛挸鐡ㄩ妴? * 瑜版捁绶崗銉ф畱 ids 閹?byId 瀵洜鏁ら張顏勫綁閸栨牗妞傞敍宀€娲块幒銉ㄧ箲閸ョ偟绱︾€涙绮ㄩ弸婊愮礉闁灝鍘ら柌宥咁槻鐠侊紕鐣婚妴? *
 * @template TKey - ID 閻ㄥ嫮琚崹瀣剁礉韫囧懘銆忔稉?string 鐎涙劗琚崹? * @template TValue - 閺勭姴鐨犵悰銊よ厬閸婅偐娈戠猾璇茬€? * @param ids - 闂団偓鐟曚焦鏁归梿鍡欐畱 ID 閸掓銆冮敍灞艰礋缁岀儤鍨?undefined 閺冩儼绻戦崶?emptyValue
 * @param byId - ID 閸掓澘鈧偐娈戦弰鐘茬殸鐞涱煉绱濇稉?undefined 閺冩儼绻戦崶?emptyValue
 * @param emptyValue - 瑜?ids 娑撹櫣鈹栭幋?byId 娑撹櫣鈹栭弮鍓佹畱姒涙顓绘潻鏂挎礀閸? * @returns 閹?ids 妞ゅ搫绨禒?byId 娑擃厽鏁归梿鍡楀煂閻ㄥ嫬鈧吋鏆熺紒鍕剁礄鐠哄疇绻冩稉宥呯摠閸︺劎娈戦弶锛勬窗閿? *
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

/** 娴犲骸绨查悽銊уЦ閹椒鑵戦柅澶婂絿閹稿洤鐣剧痪璺ㄢ柤閻ㄥ嫭绉烽幁顖氬灙鐞?*/
function selectThreadMessages(state: AppState, threadId: ThreadId): Thread["messages"] {
  return collectByIds(
    state.messageIdsByThreadId?.[threadId] ?? EMPTY_MESSAGE_IDS_BY_THREAD[threadId],
    state.messageByThreadId?.[threadId] ?? EMPTY_MESSAGE_MAP,
    EMPTY_MESSAGES,
  );
}

/** 娴犲骸绨查悽銊уЦ閹椒鑵戦柅澶婂絿閹稿洤鐣剧痪璺ㄢ柤閻ㄥ嫭妞块崝銊ュ灙鐞?*/
function selectThreadActivities(state: AppState, threadId: ThreadId): Thread["activities"] {
  return collectByIds(
    state.activityIdsByThreadId?.[threadId] ?? EMPTY_ACTIVITY_IDS_BY_THREAD[threadId],
    state.activityByThreadId?.[threadId] ?? EMPTY_ACTIVITY_MAP,
    EMPTY_ACTIVITIES,
  );
}

/** 娴犲骸绨查悽銊уЦ閹椒鑵戦柅澶婂絿閹稿洤鐣剧痪璺ㄢ柤閻ㄥ嫭褰佺拋顔款吀閸掓帒鍨悰?*/
function selectThreadProposedPlans(state: AppState, threadId: ThreadId): Thread["proposedPlans"] {
  return collectByIds(
    state.proposedPlanIdsByThreadId?.[threadId] ?? EMPTY_PROPOSED_PLAN_IDS_BY_THREAD[threadId],
    state.proposedPlanByThreadId?.[threadId] ?? EMPTY_PROPOSED_PLAN_MAP,
    EMPTY_PROPOSED_PLANS,
  );
}

/** 娴犲骸绨查悽銊уЦ閹椒鑵戦柅澶婂絿閹稿洤鐣剧痪璺ㄢ柤閻ㄥ嫬褰夐弴鏉戞▕瀵倹鎲崇憰浣稿灙鐞?*/
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
 * 娴犲骸绨查悽銊уЦ閹椒鑵戝ú鍓ф晸閹稿洤鐣剧痪璺ㄢ柤閻ㄥ嫬鐣弫?Thread 鐎电钖勯妴? * 闁俺绻?WeakMap 缂傛挸鐡ㄩ張鍝勫煑閿涘苯缍嬮幍鈧張澶婄摍閸掑洨澧栧鏇犳暏閸у洦婀崣妯哄閺冩儼绻戦崶鐐电处鐎涙ê顕挒鈽呯礉
 * 闁灝鍘ゆ禍褏鏁撻弬鎵畱瀵洜鏁ょ€佃壈鍤?React 缂佸嫪娆㈡稉宥呯箑鐟曚胶娈戦柌宥嗚閺屾挶鈧? *
 * @param state - 鎼存梻鏁ら崗銊ョ湰閻樿埖鈧? * @param threadId - 閻╊喗鐖ｇ痪璺ㄢ柤 ID
 * @returns 鐎瑰本鏆ｉ惃?Thread 鐎电钖勯敍宀冨缁捐法鈻兼稉宥呯摠閸︺劌鍨潻鏂挎礀 undefined
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
 * 娴犲骸绨查悽銊уЦ閹椒鑵戝ú鍓ф晸閹碘偓閺堝鍤庣粙瀣畱鐎瑰本鏆?Thread 鐎电钖勯崚妤勩€冮妴? * 閸愬懘鍎寸拫鍐暏 getThreadFromState 闁劒閲滃ú鍓ф晸閿涘矁鐑︽潻鍥︾瑝鐎涙ê婀惃鍕殠缁嬪鈧? *
 * @param state - 鎼存梻鏁ら崗銊ョ湰閻樿埖鈧? * @returns 閹碘偓閺堝婀侀弫鍫㈠殠缁嬪娈?Thread 鐎电钖勯弫鎵矋
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
