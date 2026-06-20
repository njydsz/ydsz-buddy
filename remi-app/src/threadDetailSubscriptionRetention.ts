/**
 * @file threadDetailSubscriptionRetention.ts
 * @description 鍦ㄨ矾鐢?渚ц竟鏍忓垏鎹㈡湡闂翠繚鎸佹渶杩戜娇鐢ㄧ殑绾跨▼璇︽儏璁㈤槄澶勪簬娲昏穬鐘舵€併€? * 閫氳繃寮曠敤璁℃暟鍜屽欢杩熸窐姹版満鍒讹紝閬垮厤棰戠箒鍒囨崲瑙嗗浘鏃跺弽澶嶅缓绔?鏂紑璁㈤槄锛? * 浠庤€屽噺灏戠綉缁滃紑閿€鍜屽姞杞藉欢杩熴€? *
 * 鏍稿績鏈哄埗锛? * - retain/release锛氬紩鐢ㄨ鏁扮鐞嗭紝鏀寔澶氫釜娑堣垂鑰呭悓鏃舵寔鏈夊悓涓€璁㈤槄
 * - 寤惰繜娣樻卑锛氬紩鐢ㄨ鏁板綊闆跺悗涓嶇珛鍗抽噴鏀撅紝鑰屾槸绛夊緟 15 鍒嗛挓瓒呮椂鍚庡啀娣樻卑
 * - 瀹归噺闄愬埗锛氭渶澶氱紦瀛?32 涓闃咃紝瓒呭嚭鏃舵寜鏈€杩戣闂椂闂存窐姹扮┖闂叉潯鐩? * - 娲昏穬淇濇姢锛氭鍦ㄨ繍琛屼腑鐨勭嚎绋嬶紙闈?idle/stopped 鐘舵€侊級涓嶄細琚窐姹? */

import type { ThreadId } from "~/contracts";
import { useSyncExternalStore } from "react";
import { useStore } from "./store";

/** 绌洪棽璁㈤槄鐨勬窐姹板欢杩熸椂闂达紙15 鍒嗛挓锛夛紝寮曠敤璁℃暟褰掗浂鍚庣瓑寰呮鏃堕棿鍐嶆窐姹?*/
const THREAD_DETAIL_RETENTION_EVICTION_MS = 15 * 60 * 1000;
/** 鏈€澶х紦瀛樼殑绾跨▼璇︽儏璁㈤槄鏁伴噺锛岃秴鍑烘椂鎸?LRU 绛栫暐娣樻卑绌洪棽鏉＄洰 */
const MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS = 32;

/**
 * 琚繚鐣欑殑绾跨▼璁㈤槄鏉＄洰锛屽寘鍚紩鐢ㄨ鏁板拰娣樻卑璋冨害淇℃伅銆? */
type RetainedThreadEntry = {
  /** 褰撳墠鎸佹湁璇ヨ闃呯殑娑堣垂鑰呮暟閲忥紝褰掗浂鍚庤繘鍏ユ窐姹板€掕鏃?*/
  refCount: number;
  /** 鏈€鍚庝竴娆¤璁块棶鐨勬椂闂存埑锛堟绉掞級锛岀敤浜?LRU 鎺掑簭 */
  lastAccessedAt: number;
  /** 娣樻卑瀹氭椂鍣紝寮曠敤璁℃暟褰掗浂鍚庤缃殑寤惰繜娣樻卑璁℃椂鍣?*/
  evictionTimeout: ReturnType<typeof setTimeout> | null;
};

/** 绾跨▼ ID 鍒板叾淇濈暀鏉＄洰鐨勬槧灏勮〃 */
const retainedThreadEntries = new Map<ThreadId, RetainedThreadEntry>();
/** useSyncExternalStore 鐨勮闃呯洃鍚櫒闆嗗悎 */
const listeners = new Set<() => void>();
/** 淇濈暀绾跨▼ ID 鍙樻洿鐨勭洃鍚櫒闆嗗悎锛屾帴鏀舵渶鏂扮殑绾跨▼ ID 鍒楄〃 */
const retainedThreadIdChangeListeners = new Set<(threadIds: readonly ThreadId[]) => void>();
/** 缂撳瓨鐨勪繚鐣欑嚎绋?ID 蹇収锛岄伩鍏嶆瘡娆¤皟鐢?getSnapshot 鏃堕噸鏂拌绠?*/
let cachedSnapshot: readonly ThreadId[] = [];

/** 閫氱煡鎵€鏈夌洃鍚櫒淇濈暀鐨勭嚎绋?ID 鍒楄〃宸插彂鐢熷彉鍖?*/
function emitChange(): void {
  cachedSnapshot = [...retainedThreadEntries.keys()];
  for (const listener of listeners) {
    listener();
  }
  for (const listener of retainedThreadIdChangeListeners) {
    listener(cachedSnapshot);
  }
}

/**
 * 鍒ゆ柇鎸囧畾绾跨▼鏄惁澶勪簬闈炵┖闂茬姸鎬侊紙姝ｅ湪杩愯鎴栨湁寰呭鐞嗕簨椤癸級銆? * 闈炵┖闂茬嚎绋嬩笉搴旇娣樻卑锛屼互淇濊瘉鐢ㄦ埛鍙鐨勬椿璺冪姸鎬佷笉琚剰澶栦腑鏂€? *
 * @param threadId - 寰呮鏌ョ殑绾跨▼ ID
 * @returns 鑻ョ嚎绋嬪浜庨潪绌洪棽鐘舵€佸垯杩斿洖 true
 */
function isNonIdleThread(threadId: ThreadId): boolean {
  const state = useStore.getState();
  const sidebarThread = state.sidebarThreadSummaryById[threadId];

  if (sidebarThread) {
    if (
      sidebarThread.hasPendingApprovals ||
      sidebarThread.hasPendingUserInput ||
      sidebarThread.hasActionableProposedPlan ||
      sidebarThread.hasLiveTailWork
    ) {
      return true;
    }

    const orchestrationStatus = sidebarThread.session?.orchestrationStatus;
    if (
      orchestrationStatus &&
      orchestrationStatus !== "idle" &&
      orchestrationStatus !== "stopped"
    ) {
      return true;
    }

    if (sidebarThread.latestTurn?.state === "running") {
      return true;
    }
  }

  const thread = state.threads.find((candidate) => candidate.id === threadId);
  if (!thread) {
    return false;
  }

  const orchestrationStatus = thread.session?.orchestrationStatus;
  return (
    Boolean(
      orchestrationStatus && orchestrationStatus !== "idle" && orchestrationStatus !== "stopped",
    ) ||
    thread.latestTurn?.state === "running" ||
    thread.pendingSourceProposedPlan !== undefined
  );
}

/**
 * 鍒ゆ柇鎸囧畾鏉＄洰鏄惁搴旇娣樻卑銆? * 浠呭綋寮曠敤璁℃暟涓?0 涓旂嚎绋嬪浜庣┖闂茬姸鎬佹椂鎵嶅彲娣樻卑銆? *
 * @param threadId - 绾跨▼ ID
 * @param entry - 淇濈暀鏉＄洰
 * @returns 鑻ュ簲琚窐姹板垯杩斿洖 true
 */
function shouldEvictEntry(threadId: ThreadId, entry: RetainedThreadEntry): boolean {
  return entry.refCount === 0 && !isNonIdleThread(threadId);
}

/** 娓呴櫎鏉＄洰涓婄殑娣樻卑瀹氭椂鍣?*/
function clearEvictionTimeout(entry: RetainedThreadEntry): void {
  if (entry.evictionTimeout === null) {
    return;
  }
  clearTimeout(entry.evictionTimeout);
  entry.evictionTimeout = null;
}

/**
 * 涓烘寚瀹氭潯鐩畨鎺掑欢杩熸窐姹般€傚厛娓呴櫎宸叉湁瀹氭椂鍣紝鍐嶈缃柊鐨勫欢杩熸窐姹拌鏃躲€? * 鑻ユ潯鐩笉搴旇娣樻卑锛堝紩鐢ㄨ鏁?> 0 鎴栫嚎绋嬫椿璺冿級锛屽垯涓嶈缃畾鏃跺櫒銆? *
 * @param threadId - 绾跨▼ ID
 * @param entry - 淇濈暀鏉＄洰
 */
function scheduleEviction(threadId: ThreadId, entry: RetainedThreadEntry): void {
  clearEvictionTimeout(entry);
  if (!shouldEvictEntry(threadId, entry)) {
    return;
  }
  entry.evictionTimeout = setTimeout(() => {
    const currentEntry = retainedThreadEntries.get(threadId);
    if (!currentEntry || !shouldEvictEntry(threadId, currentEntry)) {
      return;
    }
    retainedThreadEntries.delete(threadId);
    emitChange();
  }, THREAD_DETAIL_RETENTION_EVICTION_MS);
}

/**
 * 褰撶紦瀛樻暟閲忚秴杩囨渶澶ч檺鍒舵椂锛屾寜鏈€杩戣闂椂闂翠粠鏃╁埌鏅氭窐姹扮┖闂叉潯鐩紝
 * 鐩村埌缂撳瓨鏁伴噺闄嶈嚦鏈€澶ч檺鍒朵互鍐呫€? */
function evictIdleEntriesToCapacity(): void {
  if (retainedThreadEntries.size <= MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS) {
    return;
  }

  const idleEntries = [...retainedThreadEntries.entries()]
    .filter((entry): entry is [ThreadId, RetainedThreadEntry] =>
      shouldEvictEntry(entry[0], entry[1]),
    )
    .toSorted((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt);

  for (const [threadId] of idleEntries) {
    if (retainedThreadEntries.size <= MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS) {
      return;
    }
    const entry = retainedThreadEntries.get(threadId);
    if (!entry || !shouldEvictEntry(threadId, entry)) {
      continue;
    }
    clearEvictionTimeout(entry);
    retainedThreadEntries.delete(threadId);
    emitChange();
  }
}

/**
 * 閲嶆柊瀹¤鎵€鏈変繚鐣欐潯鐩殑娣樻卑鐘舵€併€? * 鍦?Store 鐘舵€佸彉鍖栨椂璋冪敤锛岀‘淇濅箣鍓嶅洜娲昏穬鑰屾棤娉曟窐姹扮殑鏉＄洰
 * 鍦ㄥ彉涓虹┖闂插悗鑳芥纭繘鍏ユ窐姹板€掕鏃躲€? */
function reconcileRetentionEntries(): void {
  for (const [threadId, entry] of retainedThreadEntries) {
    clearEvictionTimeout(entry);
    if (shouldEvictEntry(threadId, entry)) {
      scheduleEviction(threadId, entry);
    }
  }
  evictIdleEntriesToCapacity();
}

/** 鐩戝惉 Store 鍙樺寲锛屽湪绾跨▼鐘舵€佹敼鍙樻椂閲嶆柊瀹¤娣樻卑绛栫暐 */
useStore.subscribe(() => {
  reconcileRetentionEntries();
});

/**
 * 淇濈暀鎸囧畾绾跨▼鐨勮鎯呰闃咃紙寮曠敤璁℃暟 +1锛夈€? * 鑻ヨ绾跨▼灏氭湭琚繚鐣欙紝鍒欏垱寤烘柊鐨勪繚鐣欐潯鐩紱鑻ュ凡瀛樺湪锛屽垯澧炲姞寮曠敤璁℃暟骞舵竻闄ゆ窐姹板畾鏃跺櫒銆? *
 * @param threadId - 闇€瑕佷繚鐣欒闃呯殑绾跨▼ ID
 * @returns 閲婃斁鍑芥暟锛岃皟鐢ㄦ椂灏嗗紩鐢ㄨ鏁?-1锛坮eleaseThreadDetailSubscription 鐨勫揩鎹锋柟寮忥級
 *
 * @example
 * ```ts
 * const release = retainThreadDetailSubscription("thread-123");
 * // ... 浣跨敤绾跨▼璇︽儏鏁版嵁
 * release(); // 涓嶅啀闇€瑕佹椂閲婃斁
 * ```
 */
export function retainThreadDetailSubscription(threadId: ThreadId): () => void {
  const existing = retainedThreadEntries.get(threadId);
  if (existing) {
    clearEvictionTimeout(existing);
    existing.refCount += 1;
    existing.lastAccessedAt = Date.now();
    return () => releaseThreadDetailSubscription(threadId);
  }

  retainedThreadEntries.set(threadId, {
    refCount: 1,
    lastAccessedAt: Date.now(),
    evictionTimeout: null,
  });
  emitChange();
  evictIdleEntriesToCapacity();

  return () => releaseThreadDetailSubscription(threadId);
}

/**
 * 閲婃斁鎸囧畾绾跨▼鐨勮鎯呰闃咃紙寮曠敤璁℃暟 -1锛夈€? * 寮曠敤璁℃暟褰掗浂鍚庤繘鍏ュ欢杩熸窐姹板€掕鏃讹紝涓嶄細绔嬪嵆绉婚櫎銆? *
 * @param threadId - 闇€瑕侀噴鏀捐闃呯殑绾跨▼ ID
 */
export function releaseThreadDetailSubscription(threadId: ThreadId): void {
  const entry = retainedThreadEntries.get(threadId);
  if (!entry) {
    return;
  }

  entry.refCount = Math.max(0, entry.refCount - 1);
  entry.lastAccessedAt = Date.now();
  if (entry.refCount > 0) {
    return;
  }

  scheduleEviction(threadId, entry);
  evictIdleEntriesToCapacity();
}

/**
 * 璁㈤槄淇濈暀绾跨▼ ID 鍒楄〃鍙樺寲鐨勭洃鍚櫒锛堢敤浜?useSyncExternalStore锛夈€? *
 * @param listener - 褰撲繚鐣欏垪琛ㄥ彉鍖栨椂璋冪敤鐨勫洖璋冨嚱鏁? * @returns 鍙栨秷璁㈤槄鐨勫嚱鏁? */
export function subscribeRetainedThreadDetailIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 璁㈤槄淇濈暀绾跨▼ ID 鍒楄〃鍙樺寲鐨勭洃鍚櫒锛堝甫鍙傛暟鐗堟湰锛夈€? * 鍥炶皟鍑芥暟鎺ユ敹鏈€鏂扮殑淇濈暀绾跨▼ ID 鍒楄〃浣滀负鍙傛暟銆? *
 * @param listener - 褰撲繚鐣欏垪琛ㄥ彉鍖栨椂璋冪敤鐨勫洖璋冨嚱鏁帮紝鍙傛暟涓烘渶鏂扮殑绾跨▼ ID 鍒楄〃
 * @returns 鍙栨秷璁㈤槄鐨勫嚱鏁? */
export function subscribeRetainedThreadDetailIdChanges(
  listener: (threadIds: readonly ThreadId[]) => void,
): () => void {
  retainedThreadIdChangeListeners.add(listener);
  return () => {
    retainedThreadIdChangeListeners.delete(listener);
  };
}

/**
 * 鑾峰彇褰撳墠淇濈暀鐨勭嚎绋?ID 鍒楄〃蹇収锛堢敤浜?useSyncExternalStore 鐨?getSnapshot锛夈€? *
 * @returns 褰撳墠淇濈暀鐨勭嚎绋?ID 鍙鏁扮粍
 */
export function getRetainedThreadDetailIdsSnapshot(): readonly ThreadId[] {
  return cachedSnapshot;
}

/**
 * React Hook锛氳幏鍙栧綋鍓嶄繚鐣欑殑绾跨▼璇︽儏璁㈤槄 ID 鍒楄〃銆? * 鍩轰簬 useSyncExternalStore 瀹炵幇锛屽綋淇濈暀鍒楄〃鍙樺寲鏃惰嚜鍔ㄨЕ鍙戦噸娓叉煋銆? *
 * @returns 褰撳墠淇濈暀鐨勭嚎绋?ID 鍙鏁扮粍
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const retainedIds = useRetainedThreadDetailIds();
 *   return <div>淇濈暀鐨勭嚎绋嬫暟: {retainedIds.length}</div>;
 * }
 * ```
 */
export function useRetainedThreadDetailIds(): readonly ThreadId[] {
  return useSyncExternalStore(
    subscribeRetainedThreadDetailIds,
    getRetainedThreadDetailIdsSnapshot,
    getRetainedThreadDetailIdsSnapshot,
  );
}

/**
 * 閲嶇疆鎵€鏈変繚鐣欑殑绾跨▼璇︽儏璁㈤槄锛堜粎鐢ㄤ簬娴嬭瘯锛夈€? * 娓呴櫎鎵€鏈夋窐姹板畾鏃跺櫒骞舵竻绌轰繚鐣欐潯鐩紝瑙﹀彂鍙樻洿閫氱煡銆? */
export function resetRetainedThreadDetailSubscriptionsForTests(): void {
  for (const entry of retainedThreadEntries.values()) {
    clearEvictionTimeout(entry);
  }
  retainedThreadEntries.clear();
  emitChange();
}
