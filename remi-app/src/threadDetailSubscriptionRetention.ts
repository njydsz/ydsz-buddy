/**
 * @file threadDetailSubscriptionRetention.ts
 * @description 閸︺劏鐭鹃悽?娓氀嗙珶閺嶅繐鍨忛幑銏℃埂闂傜繝绻氶幐浣规付鏉╂垳濞囬悽銊ф畱缁捐法鈻肩拠锔藉剰鐠併垽妲勬径鍕艾濞叉槒绌悩鑸碘偓浣碘偓? * 闁俺绻冨鏇犳暏鐠佲剝鏆熼崪灞芥鏉╃喐绐愬Ч鐗堟簚閸掕绱濋柆鍨帳妫版垹绠掗崚鍥ㄥ床鐟欏棗娴橀弮璺哄冀婢跺秴缂撶粩?閺傤厼绱戠拋銏ゆ閿? * 娴犲氦鈧苯鍣虹亸鎴犵秹缂佹粌绱戦柨鈧崪灞藉鏉炶棄娆㈡潻鐔粹偓? *
 * 閺嶇绺鹃張鍝勫煑閿? * - retain/release閿涙艾绱╅悽銊吀閺佹壆顓搁悶鍡礉閺€顖涘瘮婢舵矮閲滃☉鍫ｅ瀭閼板懎鎮撻弮鑸靛瘮閺堝鎮撴稉鈧拋銏ゆ
 * - 瀵ゆ儼绻滃ǎ妯诲崙閿涙艾绱╅悽銊吀閺佹澘缍婇梿璺烘倵娑撳秶鐝涢崡鎶藉櫞閺€鎾呯礉閼板本妲哥粵澶婄窡 15 閸掑棝鎸撶搾鍛閸氬骸鍟€濞ｆɑ鍗? * - 鐎瑰綊鍣洪梽鎰煑閿涙碍娓舵径姘辩处鐎?32 娑擃亣顓归梼鍜冪礉鐡掑懎鍤弮鑸靛瘻閺堚偓鏉╂垼顔栭梻顔芥闂傚瓨绐愬Ч鎵敄闂傚弶娼惄? * - 濞叉槒绌穱婵囧Б閿涙碍顒滈崷銊ㄧ箥鐞涘奔鑵戦惃鍕殠缁嬪绱欓棃?idle/stopped 閻樿埖鈧緤绱氭稉宥勭窗鐞氼偅绐愬Ч? */

import type { ThreadId } from "~/contracts";
import { useSyncExternalStore } from "react";
import { useStore } from "./store";

/** 缁屾椽妫界拋銏ゆ閻ㄥ嫭绐愬Ч鏉挎鏉╃喐妞傞梻杈剧礄15 閸掑棝鎸撻敍澶涚礉瀵洜鏁ょ拋鈩冩殶瑜版帡娴傞崥搴ｇ搼瀵板懏顒濋弮鍫曟？閸愬秵绐愬Ч?*/
const THREAD_DETAIL_RETENTION_EVICTION_MS = 15 * 60 * 1000;
/** 閺堚偓婢堆呯处鐎涙娈戠痪璺ㄢ柤鐠囷附鍎忕拋銏ゆ閺佷即鍣洪敍宀冪Т閸戠儤妞傞幐?LRU 缁涙牜鏆愬ǎ妯诲崙缁屾椽妫介弶锛勬窗 */
const MAX_CACHED_THREAD_DETAIL_SUBSCRIPTIONS = 32;

/**
 * 鐞氼偂绻氶悾娆戞畱缁捐法鈻肩拋銏ゆ閺夛紕娲伴敍灞藉瘶閸氼偄绱╅悽銊吀閺佹澘鎷板ǎ妯诲崙鐠嬪啫瀹虫穱鈩冧紖閵? */
type RetainedThreadEntry = {
  /** 瑜版挸澧犻幐浣规箒鐠囥儴顓归梼鍛畱濞戝牐鍨傞懓鍛殶闁插骏绱濊ぐ鎺楁祩閸氬氦绻橀崗銉︾獝濮规澘鈧帟顓搁弮?*/
  refCount: number;
  /** 閺堚偓閸氬簼绔村▎陇顫︾拋鍧楁６閻ㄥ嫭妞傞梻瀛樺煈閿涘牊顕犵粔鎺炵礆閿涘瞼鏁ゆ禍?LRU 閹烘帒绨?*/
  lastAccessedAt: number;
  /** 濞ｆɑ鍗戠€规碍妞傞崳顭掔礉瀵洜鏁ょ拋鈩冩殶瑜版帡娴傞崥搴ゎ啎缂冾喚娈戝鎯扮箿濞ｆɑ鍗戠拋鈩冩閸?*/
  evictionTimeout: ReturnType<typeof setTimeout> | null;
};

/** 缁捐法鈻?ID 閸掓澘鍙炬穱婵堟殌閺夛紕娲伴惃鍕Ё鐏忓嫯銆?*/
const retainedThreadEntries = new Map<ThreadId, RetainedThreadEntry>();
/** useSyncExternalStore 閻ㄥ嫯顓归梼鍛磧閸氼剙娅掗梿鍡楁値 */
const listeners = new Set<() => void>();
/** 娣囨繄鏆€缁捐法鈻?ID 閸欐ɑ娲块惃鍕磧閸氼剙娅掗梿鍡楁値閿涘本甯撮弨鑸垫付閺傛壆娈戠痪璺ㄢ柤 ID 閸掓銆?*/
const retainedThreadIdChangeListeners = new Set<(threadIds: readonly ThreadId[]) => void>();
/** 缂傛挸鐡ㄩ惃鍕箽閻ｆ瑧鍤庣粙?ID 韫囶偆鍙庨敍宀勪缉閸忓秵鐦″▎陇鐨熼悽?getSnapshot 閺冨爼鍣搁弬鎷岊吀缁?*/
let cachedSnapshot: readonly ThreadId[] = [];

/** 闁氨鐓￠幍鈧張澶屾磧閸氼剙娅掓穱婵堟殌閻ㄥ嫮鍤庣粙?ID 閸掓銆冨鎻掑絺閻㈢喎褰夐崠?*/
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
 * 閸掋倖鏌囬幐鍥х暰缁捐法鈻奸弰顖氭儊婢跺嫪绨棃鐐碘敄闂傝尙濮搁幀渚婄礄濮濓絽婀潻鎰攽閹存牗婀佸鍛槱閻炲棔绨ㄦい鐧哥礆閵? * 闂堢偟鈹栭梻鑼殠缁嬪绗夋惔鏃囶潶濞ｆɑ鍗戦敍灞间簰娣囨繆鐦夐悽銊﹀煕閸欘垵顫嗛惃鍕た鐠哄啰濮搁幀浣风瑝鐞氼偅鍓版径鏍﹁厬閺傤厹鈧? *
 * @param threadId - 瀵板懏顥呴弻銉ф畱缁捐法鈻?ID
 * @returns 閼汇儳鍤庣粙瀣槱娴滃酣娼粚娲＝閻樿埖鈧礁鍨潻鏂挎礀 true
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
 * 閸掋倖鏌囬幐鍥х暰閺夛紕娲伴弰顖氭儊鎼存棁顫﹀ǎ妯诲崙閵? * 娴犲懎缍嬪鏇犳暏鐠佲剝鏆熸稉?0 娑撴梻鍤庣粙瀣槱娴滃海鈹栭梻鑼Ц閹焦妞傞幍宥呭讲濞ｆɑ鍗戦妴? *
 * @param threadId - 缁捐法鈻?ID
 * @param entry - 娣囨繄鏆€閺夛紕娲? * @returns 閼汇儱绨茬悮顐ｇ獝濮规澘鍨潻鏂挎礀 true
 */
function shouldEvictEntry(threadId: ThreadId, entry: RetainedThreadEntry): boolean {
  return entry.refCount === 0 && !isNonIdleThread(threadId);
}

/** 濞撳懘娅庨弶锛勬窗娑撳﹦娈戝ǎ妯诲崙鐎规碍妞傞崳?*/
function clearEvictionTimeout(entry: RetainedThreadEntry): void {
  if (entry.evictionTimeout === null) {
    return;
  }
  clearTimeout(entry.evictionTimeout);
  entry.evictionTimeout = null;
}

/**
 * 娑撶儤瀵氱€规碍娼惄顔肩暔閹烘帒娆㈡潻鐔哥獝濮硅埇鈧倸鍘涘〒鍛存珟瀹稿弶婀佺€规碍妞傞崳顭掔礉閸愬秷顔曠純顔芥煀閻ㄥ嫬娆㈡潻鐔哥獝濮规媽顓搁弮韬测偓? * 閼汇儲娼惄顔荤瑝鎼存棁顫﹀ǎ妯诲崙閿涘牆绱╅悽銊吀閺?> 0 閹存牜鍤庣粙瀣た鐠哄喛绱氶敍灞藉灟娑撳秷顔曠純顔肩暰閺冭泛娅掗妴? *
 * @param threadId - 缁捐法鈻?ID
 * @param entry - 娣囨繄鏆€閺夛紕娲? */
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
 * 瑜版挾绱︾€涙ɑ鏆熼柌蹇氱Т鏉╁洦娓舵径褔妾洪崚鑸垫閿涘本瀵滈張鈧潻鎴ｎ問闂傤喗妞傞梻缈犵矤閺冣晛鍩岄弲姘獝濮规壆鈹栭梻鍙夋蒋閻╊噯绱? * 閻╂潙鍩岀紓鎾崇摠閺佷即鍣洪梽宥堝殾閺堚偓婢堆囨閸掓湹浜掗崘鍛偓? */
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
 * 闁插秵鏌婄€孤ゎ潒閹碘偓閺堝绻氶悾娆愭蒋閻╊喚娈戝ǎ妯诲崙閻樿埖鈧降鈧? * 閸?Store 閻樿埖鈧礁褰夐崠鏍ㄦ鐠嬪啰鏁ら敍宀€鈥樻穱婵呯閸撳秴娲滃ú鏄忕┈閼板本妫ゅ▔鏇熺獝濮规壆娈戦弶锛勬窗
 * 閸︺劌褰夋稉铏光敄闂傛彃鎮楅懗鑺ヮ劀绾喛绻橀崗銉︾獝濮规澘鈧帟顓搁弮韬测偓? */
function reconcileRetentionEntries(): void {
  for (const [threadId, entry] of retainedThreadEntries) {
    clearEvictionTimeout(entry);
    if (shouldEvictEntry(threadId, entry)) {
      scheduleEviction(threadId, entry);
    }
  }
  evictIdleEntriesToCapacity();
}

/** 閻╂垵鎯?Store 閸欐ê瀵查敍灞芥躬缁捐法鈻奸悩鑸碘偓浣规暭閸欐ɑ妞傞柌宥嗘煀鐎孤ゎ潒濞ｆɑ鍗戠粵鏍殣 */
useStore.subscribe(() => {
  reconcileRetentionEntries();
});

/**
 * 娣囨繄鏆€閹稿洤鐣剧痪璺ㄢ柤閻ㄥ嫯顕涢幆鍛邦吂闂冨拑绱欏鏇犳暏鐠佲剝鏆?+1閿涘鈧? * 閼汇儴顕氱痪璺ㄢ柤鐏忔碍婀悮顐＄箽閻ｆ瑱绱濋崚娆忓灡瀵ょ儤鏌婇惃鍕箽閻ｆ瑦娼惄顕嗙幢閼汇儱鍑＄€涙ê婀敍灞藉灟婢х偛濮炲鏇犳暏鐠佲剝鏆熼獮鑸电闂勩倖绐愬Ч鏉跨暰閺冭泛娅掗妴? *
 * @param threadId - 闂団偓鐟曚椒绻氶悾娆掝吂闂冨懐娈戠痪璺ㄢ柤 ID
 * @returns 闁插﹥鏂侀崙鑺ユ殶閿涘矁鐨熼悽銊︽鐏忓棗绱╅悽銊吀閺?-1閿涘澁eleaseThreadDetailSubscription 閻ㄥ嫬鎻╅幑閿嬫煙瀵骏绱? *
 * @example
 * ```ts
 * const release = retainThreadDetailSubscription("thread-123");
 * // ... 娴ｈ法鏁ょ痪璺ㄢ柤鐠囷附鍎忛弫鐗堝祦
 * release(); // 娑撳秴鍟€闂団偓鐟曚焦妞傞柌濠冩杹
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
 * 闁插﹥鏂侀幐鍥х暰缁捐法鈻奸惃鍕嚊閹懓顓归梼鍜冪礄瀵洜鏁ょ拋鈩冩殶 -1閿涘鈧? * 瀵洜鏁ょ拋鈩冩殶瑜版帡娴傞崥搴ょ箻閸忋儱娆㈡潻鐔哥獝濮规澘鈧帟顓搁弮璁圭礉娑撳秳绱扮粩瀣祮缁夊娅庨妴? *
 * @param threadId - 闂団偓鐟曚線鍣撮弨鎹愵吂闂冨懐娈戠痪璺ㄢ柤 ID
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
 * 鐠併垽妲勬穱婵堟殌缁捐法鈻?ID 閸掓銆冮崣妯哄閻ㄥ嫮娲冮崥顒€娅掗敍鍫㈡暏娴?useSyncExternalStore閿涘鈧? *
 * @param listener - 瑜版挷绻氶悾娆忓灙鐞涖劌褰夐崠鏍ㄦ鐠嬪啰鏁ら惃鍕礀鐠嬪啫鍤遍弫? * @returns 閸欐牗绉风拋銏ゆ閻ㄥ嫬鍤遍弫? */
export function subscribeRetainedThreadDetailIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 鐠併垽妲勬穱婵堟殌缁捐法鈻?ID 閸掓銆冮崣妯哄閻ㄥ嫮娲冮崥顒€娅掗敍鍫濈敨閸欏倹鏆熼悧鍫熸拱閿涘鈧? * 閸ョ偠鐨熼崙鑺ユ殶閹恒儲鏁归張鈧弬鎵畱娣囨繄鏆€缁捐法鈻?ID 閸掓銆冩担婊€璐熼崣鍌涙殶閵? *
 * @param listener - 瑜版挷绻氶悾娆忓灙鐞涖劌褰夐崠鏍ㄦ鐠嬪啰鏁ら惃鍕礀鐠嬪啫鍤遍弫甯礉閸欏倹鏆熸稉鐑樻付閺傛壆娈戠痪璺ㄢ柤 ID 閸掓銆? * @returns 閸欐牗绉风拋銏ゆ閻ㄥ嫬鍤遍弫? */
export function subscribeRetainedThreadDetailIdChanges(
  listener: (threadIds: readonly ThreadId[]) => void,
): () => void {
  retainedThreadIdChangeListeners.add(listener);
  return () => {
    retainedThreadIdChangeListeners.delete(listener);
  };
}

/**
 * 閼惧嘲褰囪ぐ鎾冲娣囨繄鏆€閻ㄥ嫮鍤庣粙?ID 閸掓銆冭箛顐ゅ弾閿涘牏鏁ゆ禍?useSyncExternalStore 閻?getSnapshot閿涘鈧? *
 * @returns 瑜版挸澧犳穱婵堟殌閻ㄥ嫮鍤庣粙?ID 閸欘亣顕伴弫鎵矋
 */
export function getRetainedThreadDetailIdsSnapshot(): readonly ThreadId[] {
  return cachedSnapshot;
}

/**
 * React Hook閿涙俺骞忛崣鏍х秼閸撳秳绻氶悾娆戞畱缁捐法鈻肩拠锔藉剰鐠併垽妲?ID 閸掓銆冮妴? * 閸╄桨绨?useSyncExternalStore 鐎圭偟骞囬敍灞界秼娣囨繄鏆€閸掓銆冮崣妯哄閺冩儼鍤滈崝銊ㄐ曢崣鎴﹀櫢濞撳弶鐓嬮妴? *
 * @returns 瑜版挸澧犳穱婵堟殌閻ㄥ嫮鍤庣粙?ID 閸欘亣顕伴弫鎵矋
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const retainedIds = useRetainedThreadDetailIds();
 *   return <div>娣囨繄鏆€閻ㄥ嫮鍤庣粙瀣殶: {retainedIds.length}</div>;
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
 * 闁插秶鐤嗛幍鈧張澶夌箽閻ｆ瑧娈戠痪璺ㄢ柤鐠囷附鍎忕拋銏ゆ閿涘牅绮庨悽銊ょ艾濞村鐦敍澶堚偓? * 濞撳懘娅庨幍鈧張澶嬬獝濮规澘鐣鹃弮璺烘珤楠炶埖绔荤粚杞扮箽閻ｆ瑦娼惄顕嗙礉鐟欙箑褰傞崣妯绘纯闁氨鐓￠妴? */
export function resetRetainedThreadDetailSubscriptionsForTests(): void {
  for (const entry of retainedThreadEntries.values()) {
    clearEvictionTimeout(entry);
  }
  retainedThreadEntries.clear();
  emitChange();
}
