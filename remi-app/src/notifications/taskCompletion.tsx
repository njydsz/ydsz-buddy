/**
 * @file taskCompletion.tsx
 * @description 绾跨▼瀹屾垚涓庨渶鍏虫敞浜嬩欢鐨勬ˉ鎺ュ眰锛岃礋璐ｅ皢绾跨▼/缁堢鐨勫畬鎴愬拰闇€鍏虫敞鐘舵€? * 杞寲涓哄簲鐢ㄥ唴 Toast 鎻愮ず鍜屾搷浣滅郴缁熼€氱煡銆? * 鏈ā鍧椾负閫氱煡杩愯鏃跺眰锛屼緷璧?taskCompletion.logic.ts 涓殑绾€昏緫鍑芥暟銆? */

import { ThreadId } from "~/contracts";
import { tauriBridge } from "../lib/tauri-bridge";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { toastManager } from "../components/ui/toast";
import { resolveVisibleToastThreadIds } from "../components/ui/toastRouteVisibility";
import { useAppSettings } from "../appSettings";
import { parseDiffRouteSearch } from "../diffRouteSearch";
import { isDesktop } from "../env";
import { selectSplitView, useSplitViewStore } from "../splitViewStore";
import { useStore } from "../store";
import { createAllThreadsSelector } from "../storeSelectors";
import { useTerminalStateStore } from "../terminalStateStore";
import type { Thread } from "../types";
import {
  buildTerminalAttentionCopy,
  buildTerminalCompletionCopy,
  buildInputNeededCopy,
  buildTaskCompletionCopy,
  collectCompletedThreadCandidates,
  collectCompletedTerminalCandidates,
  collectInputNeededThreadCandidates,
  collectTerminalAttentionCandidates,
  isNotificationRuntimeFreshTimestamp,
  shouldShowThreadNotificationToast,
} from "./taskCompletion.logic";

/**
 * 娴忚鍣ㄩ€氱煡鏉冮檺鐘舵€佺被鍨嬨€? * 鎵╁睍浜嗘爣鍑嗙殑 NotificationPermission锛屽鍔犱簡 "unsupported"锛堜笉鏀寔锛夊拰 "insecure"锛堥潪瀹夊叏涓婁笅鏂囷級涓ょ鐘舵€併€? */
export type BrowserNotificationPermissionState =
  | NotificationPermission
  | "unsupported"
  | "insecure";

/**
 * 妫€娴嬪綋鍓嶇幆澧冩槸鍚︽敮鎸佹祻瑙堝櫒閫氱煡 API銆? *
 * @returns 鑻ユ祻瑙堝櫒鏀寔 Notification API 鍒欒繑鍥?true
 */
function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * 璇诲彇褰撳墠娴忚鍣ㄩ€氱煡鏉冮檺鐘舵€併€? * 娴忚鍣ㄨ姹傚畨鍏ㄤ笂涓嬫枃锛圚TTPS 鎴?localhost锛夋墠鑳戒娇鐢ㄩ€氱煡鍔熻兘銆? *
 * @returns 褰撳墠閫氱煡鏉冮檺鐘舵€侊細
 *          - "granted"锛氬凡鎺堟潈
 *          - "denied"锛氬凡鎷掔粷
 *          - "default"锛氭湭鍐冲畾锛堝彲璇锋眰鎺堟潈锛? *          - "unsupported"锛氭祻瑙堝櫒涓嶆敮鎸? *          - "insecure"锛氶潪瀹夊叏涓婁笅鏂囷紙濡?HTTP 鐜锛? */
export function readBrowserNotificationPermissionState(): BrowserNotificationPermissionState {
  if (typeof window === "undefined") {
    return "unsupported";
  }
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }
  // 闈炲畨鍏ㄤ笂涓嬫枃锛堝绾?HTTP 鐜锛変笉鏀寔閫氱煡
  if (!window.isSecureContext) {
    return "insecure";
  }
  return Notification.permission;
}

/**
 * 璇锋眰娴忚鍣ㄩ€氱煡鏉冮檺銆? * 鑻ュ綋鍓嶇姸鎬佸凡纭畾锛堜笉鏀寔銆侀潪瀹夊叏銆佸凡鎷掔粷銆佸凡鎺堟潈锛夛紝鍒欑洿鎺ヨ繑鍥炲綋鍓嶇姸鎬侊紱
 * 鍚﹀垯璋冪敤娴忚鍣ㄥ師鐢熸潈闄愯姹傚脊绐椼€? *
 * @returns 璇锋眰鍚庣殑閫氱煡鏉冮檺鐘舵€? */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  const current = readBrowserNotificationPermissionState();
  // 宸茬‘瀹氱姸鎬佹棤闇€鍐嶆璇锋眰
  if (current === "unsupported" || current === "insecure" || current === "denied") {
    return current;
  }
  if (current === "granted") {
    return current;
  }
  // 璋冪敤娴忚鍣ㄥ師鐢熸潈闄愯姹傚脊绐?  return Notification.requestPermission();
}

/**
 * 鍒ゆ柇褰撳墠搴旂敤绐楀彛鏄惁澶勪簬鍓嶅彴锛堝彲瑙佷笖鏈夌劍鐐癸級銆? * 鐢ㄤ簬鍐冲畾鏄惁搴旀樉绀虹郴缁熼€氱煡锛堝悗鍙版椂鎵嶆樉绀猴級銆? *
 * @returns 鑻ョ獥鍙ｅ浜庡墠鍙板彲瑙佺姸鎬佸垯杩斿洖 true
 */
function isWindowForeground(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * 绾跨▼閫氱煡鏂囨鎺ュ彛锛屽寘鍚爣棰樺拰姝ｆ枃銆? */
interface ThreadNotificationCopy {
  /** 閫氱煡鏍囬 */
  title: string;
  /** 閫氱煡姝ｆ枃鍐呭 */
  body: string;
}

/**
 * 鑱氱劍鍒版寚瀹氱嚎绋嬶紝璺宠浆鍒扮嚎绋嬭鎯呴〉銆? * 閫氱煡鐐瑰嚮鏃剁殑瀵艰埅琛屼负鏄€氱敤鐨勭嚎绋嬫縺娲伙紝鍥犳浼氭竻闄?splitViewId锛? * 閬垮厤鎭㈠涔嬪墠闅愯棌鐨勬媶鍒嗚鍥鹃厤瀵广€? *
 * @param threadId - 鐩爣绾跨▼ ID
 * @param navigate - TanStack Router 鐨勫鑸嚱鏁? */
function focusThread(threadId: Thread["id"], navigate: ReturnType<typeof useNavigate>): void {
  void navigate({
    to: "/$threadId",
    params: { threadId },
    // 娓呴櫎 splitViewId锛岄伩鍏嶆仮澶嶉殣钘忕殑鎷嗗垎瑙嗗浘
    search: (previous) => ({ ...previous, splitViewId: undefined }),
  });
}

/**
 * 鏄剧ず鎿嶄綔绯荤粺绾у埆鐨勭嚎绋嬮€氱煡銆? * 浼樺厛浣跨敤 Tauri 妗岄潰绔€氱煡锛岃嫢涓嶅彲鐢ㄥ垯闄嶇骇涓烘祻瑙堝櫒鍘熺敓 Notification銆? *
 * @param copy - 閫氱煡鏂囨锛堟爣棰樺拰姝ｆ枃锛? * @param threadId - 鍏宠仈鐨勭嚎绋?ID锛岀敤浜庨€氱煡鍘婚噸鍜岀偣鍑昏烦杞? * @param navigate - TanStack Router 鐨勫鑸嚱鏁帮紝鐢ㄤ簬閫氱煡鐐瑰嚮鍚庤烦杞? * @returns 鑻ユ垚鍔熸樉绀洪€氱煡鍒欒繑鍥?true锛屽惁鍒欒繑鍥?false
 */
async function showSystemThreadNotification(
  copy: ThreadNotificationCopy,
  threadId: Thread["id"],
  navigate: ReturnType<typeof useNavigate>,
): Promise<boolean> {
  const { body, title } = copy;

  // 浼樺厛浣跨敤 Tauri 妗岄潰绔€氱煡鑳藉姏
  if (tauriBridge) {
    const supported = await tauriBridge.notifications.isSupported();
    if (!supported) {
      return false;
    }
    return tauriBridge.notifications.show({ title, body, silent: false, threadId });
  }

  // 闄嶇骇涓烘祻瑙堝櫒鍘熺敓閫氱煡锛岄渶鍏堢‘璁ゆ潈闄愬凡鎺堜簣
  if (readBrowserNotificationPermissionState() !== "granted") {
    return false;
  }

  const notification = new Notification(title, {
    body,
    // 浣跨敤 tag 瀹炵幇閫氱煡鍘婚噸锛屽悓涓€绾跨▼鍙樉绀烘渶鏂扮殑涓€鏉￠€氱煡
    tag: `thread-notification:${threadId}`,
  });
  // 鐐瑰嚮閫氱煡鏃惰仛鐒︾獥鍙ｅ苟璺宠浆鍒板搴旂嚎绋?  notification.addEventListener("click", () => {
    window.focus();
    focusThread(threadId, navigate);
  });
  return true;
}

/**
 * 鏄剧ず搴旂敤鍐?Toast 鎻愮ず銆? * 鐢ㄤ簬鍦ㄥ簲鐢ㄧ晫闈㈠唴灞曠ず杞婚噺绾ч€氱煡娑堟伅銆? *
 * @param copy - 閫氱煡鏂囨锛堟爣棰樺拰姝ｆ枃锛? * @param threadId - 鍏宠仈鐨勭嚎绋?ID锛岀敤浜?Toast 鍙鎬ф帶鍒跺拰鐐瑰嚮璺宠浆
 * @param tone - Toast 椋庢牸锛?success"锛堟垚鍔?瀹屾垚锛夋垨 "warning"锛堣鍛?闇€鍏虫敞锛? * @param navigate - TanStack Router 鐨勫鑸嚱鏁帮紝鐢ㄤ簬 Toast 鎿嶄綔鎸夐挳鐐瑰嚮鍚庤烦杞? */
function showThreadToast(
  copy: ThreadNotificationCopy,
  threadId: Thread["id"],
  tone: "success" | "warning",
  navigate: ReturnType<typeof useNavigate>,
): void {
  const { body, title } = copy;
  toastManager.add({
    type: tone,
    title,
    description: body,
    data: {
      // 鍏佽璺ㄧ嚎绋嬫樉绀猴紝鍗充娇褰撳墠鍦ㄥ叾浠栫嚎绋嬮〉闈篃鑳界湅鍒版 Toast
      allowCrossThreadVisibility: true,
      threadId,
      // 褰撶嚎绋嬪彉涓哄彲瑙佸悗 8 绉掕嚜鍔ㄦ秷澶?      dismissAfterVisibleMs: 8000,
    },
    actionProps: {
      children: "Open",
      onClick: () => focusThread(threadId, navigate),
    },
  });
}

/**
 * 浠诲姟瀹屾垚閫氱煡缁勪欢銆? * 鐩戝惉绾跨▼鍜岀粓绔姸鎬佸彉鍖栵紝鍦ㄤ换鍔″畬鎴愭垨闇€瑕佺敤鎴峰叧娉ㄦ椂瑙﹀彂 Toast 鍜岀郴缁熼€氱煡銆? * 璇ョ粍浠朵笉娓叉煋浠讳綍 UI 鍏冪礌锛堣繑鍥?null锛夛紝浠呬綔涓哄壇浣滅敤缁勪欢杩愯銆? *
 * 鍔熻兘鍖呮嫭锛? * 1. 妫€娴嬬嚎绋嬩换鍔″畬鎴愪簨浠讹紝鏄剧ず瀹屾垚閫氱煡
 * 2. 妫€娴嬬粓绔换鍔″畬鎴愪簨浠讹紝鏄剧ず瀹屾垚閫氱煡
 * 3. 妫€娴嬬嚎绋嬮渶瑕佺敤鎴疯緭鍏?瀹℃壒鐨勪簨浠讹紝鏄剧ず璀﹀憡閫氱煡
 * 4. 妫€娴嬬粓绔渶瑕佺敤鎴峰叧娉ㄧ殑浜嬩欢锛屾樉绀鸿鍛婇€氱煡
 * 5. 鐩戝惉 Tauri 鑿滃崟鎿嶄綔锛屾敮鎸佷粠绯荤粺閫氱煡鐐瑰嚮璺宠浆鍒板搴旂嚎绋? *
 * @returns null锛堜笉娓叉煋浠讳綍 UI锛? */
export function TaskCompletionNotifications() {
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  // 鑾峰彇褰撳墠璺敱涓殑娲诲姩绾跨▼ ID
  const activeThreadId = useParams({
    strict: false,
    select: (params) =>
      typeof params.threadId === "string" ? ThreadId.makeUnsafe(params.threadId) : null,
  });
  // 鑾峰彇璺敱鏌ヨ鍙傛暟锛堢敤浜庤В鏋愭媶鍒嗚鍥?ID锛?  const routeSearch = useSearch({
    strict: false,
    select: (search) => parseDiffRouteSearch(search),
  });
  // 鑾峰彇褰撳墠鎷嗗垎瑙嗗浘鐘舵€?  const splitView = useSplitViewStore(selectSplitView(routeSearch.splitViewId ?? null));
  // 鑾峰彇鎵€鏈夌嚎绋嬫暟鎹紝浣跨敤 ref 缂撳瓨閫夋嫨鍣ㄤ互閬垮厤涓嶅繀瑕佺殑閲嶆覆鏌?  const threads = useStore(useRef(createAllThreadsSelector()).current);
  // 绾跨▼鏁版嵁鏄惁宸插畬鎴愭按鍚堬紙hydration锛?  const threadsHydrated = useStore((store) => store.threadsHydrated);
  // 鑾峰彇鍚勭嚎绋嬩笅鐨勭粓绔姸鎬佹槧灏?  const terminalStateByThreadId = useTerminalStateStore((store) => store.terminalStateByThreadId);
  // 璁＄畻褰撳墠鍙鐨勭嚎绋?ID 闆嗗悎锛岀敤浜庡垽鏂槸鍚﹀簲鏄剧ず閫氱煡
  const visibleThreadIds = useMemo(() => {
    return resolveVisibleToastThreadIds({ activeThreadId, splitView });
  }, [activeThreadId, splitView]);
  // 瀛樺偍涓婁竴娆″揩鐓х殑绾跨▼鏁版嵁锛岀敤浜庡姣旀娴嬬姸鎬佸彉鍖?  const previousThreadsRef = useRef<readonly Thread[]>([]);
  // 瀛樺偍涓婁竴娆″揩鐓х殑缁堢鐘舵€侊紝鐢ㄤ簬瀵规瘮妫€娴嬬姸鎬佸彉鍖?  const previousTerminalStateRef = useRef(terminalStateByThreadId);
  // 璁板綍閫氱煡杩愯鏃剁殑鍚姩鏃堕棿锛岀敤浜庤繃婊ゆ按鍚堥樁娈电殑鍘嗗彶浜嬩欢
  const runtimeStartedAtMsRef = useRef(Date.now());
  // 鏍囪缁勪欢鏄惁宸插氨缁紙璺宠繃棣栨娓叉煋鐨勭姸鎬佹娴嬶級
  const readyRef = useRef(false);

  // 鐩戝惉 Tauri 鑿滃崟鎿嶄綔浜嬩欢锛屽鐞嗕粠绯荤粺閫氱煡鐐瑰嚮璺宠浆鍒扮嚎绋嬬殑琛屼负
  useEffect(() => {
    const onMenuAction = tauriBridge.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      const prefix = "notification-open-thread:";
      // 浠呭鐞嗛€氱煡鎵撳紑绾跨▼鐨勬搷浣?      if (!action.startsWith(prefix)) {
        return;
      }
      const threadId = action.slice(prefix.length).trim();
      if (threadId.length === 0) {
        return;
      }
      focusThread(threadId as Thread["id"], navigate);
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  // 鏍稿績閫氱煡閫昏緫锛氱洃鍚嚎绋嬪拰缁堢鐘舵€佸彉鍖栵紝瑙﹀彂鐩稿簲閫氱煡
  useEffect(() => {
    // 绾跨▼鏁版嵁鏈畬鎴愭按鍚堝墠涓嶅鐞?    if (!threadsHydrated) {
      return;
    }

    // 棣栨灏辩华鏃朵粎璁板綍蹇収锛屼笉瑙﹀彂閫氱煡锛堥伩鍏嶆按鍚堟暟鎹骇鐢熻鎶ワ級
    if (!readyRef.current) {
      previousThreadsRef.current = threads;
      previousTerminalStateRef.current = terminalStateByThreadId;
      readyRef.current = true;
      return;
    }

    // 鏀堕泦鏂颁骇鐢熺殑宸插畬鎴愮嚎绋嬪€欓€夐」锛屽苟杩囨护鎺夋按鍚堥樁娈电殑鍘嗗彶浜嬩欢
    const completions = collectCompletedThreadCandidates(
      previousThreadsRef.current,
      threads,
    ).filter((candidate) =>
      isNotificationRuntimeFreshTimestamp(candidate.completedAt, runtimeStartedAtMsRef.current),
    );
    // 鏀堕泦鏂颁骇鐢熺殑宸插畬鎴愮粓绔换鍔″€欓€夐」
    const terminalCompletions = collectCompletedTerminalCandidates(
      previousTerminalStateRef.current,
      terminalStateByThreadId,
    );
    // 鏀堕泦鏂颁骇鐢熺殑闇€瑕佺敤鎴疯緭鍏ョ殑绾跨▼鍊欓€夐」锛屽苟杩囨护鎺夋按鍚堥樁娈电殑鍘嗗彶浜嬩欢
    const inputNeededCandidates = collectInputNeededThreadCandidates(
      previousThreadsRef.current,
      threads,
    ).filter((candidate) =>
      isNotificationRuntimeFreshTimestamp(candidate.createdAt, runtimeStartedAtMsRef.current),
    );
    // 鏀堕泦鏂颁骇鐢熺殑闇€瑕佺敤鎴峰叧娉ㄧ殑缁堢鍊欓€夐」
    const terminalAttentionCandidates = collectTerminalAttentionCandidates(
      previousTerminalStateRef.current,
      terminalStateByThreadId,
    );
    // 鏇存柊蹇収涓哄綋鍓嶇姸鎬侊紝渚涗笅娆″姣斾娇鐢?    previousThreadsRef.current = threads;
    previousTerminalStateRef.current = terminalStateByThreadId;

    // 鑻ユ棤浠讳綍閫氱煡鍊欓€夐」锛岀洿鎺ヨ繑鍥?    if (
      completions.length === 0 &&
      inputNeededCandidates.length === 0 &&
      terminalCompletions.length === 0 &&
      terminalAttentionCandidates.length === 0
    ) {
      return;
    }

    // 鍒ゆ柇鏄惁搴斿皾璇曟樉绀虹郴缁熼€氱煡锛?    // 1. 鐢ㄦ埛宸插紑鍚郴缁熼€氱煡璁剧疆
    // 2. 妗岄潰绔缁堝皾璇曪紝Web 绔粎鍦ㄧ獥鍙ｅ浜庡悗鍙版椂灏濊瘯
    const shouldAttemptSystemNotification =
      settings.enableSystemTaskCompletionNotifications &&
      (tauriBridge ? true : !isWindowForeground());

    // 澶勭悊绾跨▼浠诲姟瀹屾垚閫氱煡
    for (const completion of completions) {
      const copy = buildTaskCompletionCopy(completion);
      // 鑻ョ敤鎴峰紑鍚?Toast 璁剧疆涓旂嚎绋嬪綋鍓嶄笉鍙锛屽垯鏄剧ず Toast
      if (
        settings.enableTaskCompletionToasts &&
        shouldShowThreadNotificationToast({
          threadId: completion.threadId,
          visibleThreadIds,
        })
      ) {
        showThreadToast(copy, completion.threadId, "success", navigate);
      }

      // 灏濊瘯鏄剧ず绯荤粺绾ч€氱煡
      if (shouldAttemptSystemNotification) {
        void showSystemThreadNotification(copy, completion.threadId, navigate);
      }
    }

    // 澶勭悊绾跨▼闇€瑕佺敤鎴疯緭鍏ョ殑閫氱煡
    for (const candidate of inputNeededCandidates) {
      const copy = buildInputNeededCopy(candidate);
      if (
        settings.enableTaskCompletionToasts &&
        shouldShowThreadNotificationToast({
          threadId: candidate.threadId,
          visibleThreadIds,
        })
      ) {
        showThreadToast(copy, candidate.threadId, "warning", navigate);
      }

      if (shouldAttemptSystemNotification) {
        void showSystemThreadNotification(copy, candidate.threadId, navigate);
      }
    }

    // 澶勭悊缁堢浠诲姟瀹屾垚閫氱煡
    for (const completion of terminalCompletions) {
      const copy = buildTerminalCompletionCopy(completion);
      if (
        settings.enableTaskCompletionToasts &&
        shouldShowThreadNotificationToast({
          threadId: completion.threadId,
          visibleThreadIds,
        })
      ) {
        showThreadToast(copy, completion.threadId, "success", navigate);
      }

      if (shouldAttemptSystemNotification) {
        void showSystemThreadNotification(copy, completion.threadId, navigate);
      }
    }

    // 澶勭悊缁堢闇€瑕佺敤鎴峰叧娉ㄧ殑閫氱煡
    for (const candidate of terminalAttentionCandidates) {
      const copy = buildTerminalAttentionCopy(candidate);
      if (
        settings.enableTaskCompletionToasts &&
        shouldShowThreadNotificationToast({
          threadId: candidate.threadId,
          visibleThreadIds,
        })
      ) {
        showThreadToast(copy, candidate.threadId, "warning", navigate);
      }

      if (shouldAttemptSystemNotification) {
        void showSystemThreadNotification(copy, candidate.threadId, navigate);
      }
    }
  }, [
    navigate,
    settings.enableSystemTaskCompletionNotifications,
    settings.enableTaskCompletionToasts,
    terminalStateByThreadId,
    threads,
    threadsHydrated,
    visibleThreadIds,
  ]);

  // 璇ョ粍浠朵笉娓叉煋浠讳綍 UI锛屼粎浣滀负鍓綔鐢ㄧ粍浠惰繍琛?  return null;
}

/**
 * 鏋勫缓閫氱煡璁剧疆鐨勬敮鎸佽鏄庢枃鏈€? * 鏍规嵁杩愯鐜鍜屾祻瑙堝櫒鏉冮檺鐘舵€佽繑鍥炲搴旂殑鎻愮ず鏂囨锛岀敤浜庤缃晫闈㈠睍绀恒€? *
 * @param permissionState - 褰撳墠娴忚鍣ㄩ€氱煡鏉冮檺鐘舵€? * @returns 浜虹被鍙鐨勯€氱煡璁剧疆璇存槑鏂囨湰
 */
export function buildNotificationSettingsSupportText(
  permissionState: BrowserNotificationPermissionState,
): string {
  // 妗岄潰绔娇鐢ㄧ郴缁熼€氱煡涓績
  if (isDesktop) {
    return "Desktop app notifications use your operating system notification center.";
  }
  // Web 绔牴鎹潈闄愮姸鎬佽繑鍥炲搴旀彁绀?  switch (permissionState) {
    case "granted":
      return "Browser notifications are enabled for this app.";
    case "denied":
      return "Browser notifications are blocked. Re-enable them in your browser site settings.";
    case "insecure":
      return "Browser notifications need a secure context. Localhost works; plain HTTP does not.";
    case "unsupported":
      return "This browser does not support desktop notifications.";
    case "default":
      return "Allow browser notifications to get alerts when chats or terminal agents finish or need input in the background.";
  }
}
