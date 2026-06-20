/**
 * @file taskCompletion.tsx
 * @description 缁捐法鈻肩€瑰本鍨氭稉搴ㄦ付閸忚櫕鏁炴禍瀣╂閻ㄥ嫭藟閹恒儱鐪伴敍宀冪鐠愶絽鐨㈢痪璺ㄢ柤/缂佸牏顏惃鍕暚閹存劕鎷伴棁鈧崗铏暈閻樿埖鈧? * 鏉烆剙瀵叉稉鍝勭安閻劌鍞?Toast 閹绘劗銇氶崪灞炬惙娴ｆ粎閮寸紒鐔尖偓姘辩叀閵? * 閺堫剚膩閸фぞ璐熼柅姘辩叀鏉╂劘顢戦弮璺虹湴閿涘奔绶风挧?taskCompletion.logic.ts 娑擃厾娈戠痪顖炩偓鏄忕帆閸戣姤鏆熼妴? */

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
 * 濞村繗顫嶉崳銊┾偓姘辩叀閺夊啴妾洪悩鑸碘偓浣鸿閸ㄥ鈧? * 閹碘晛鐫嶆禍鍡樼垼閸戝棛娈?NotificationPermission閿涘苯顤冮崝鐘辩啊 "unsupported"閿涘牅绗夐弨顖涘瘮閿涘鎷?"insecure"閿涘牓娼€瑰鍙忔稉濠佺瑓閺傚浄绱氭稉銈囶潚閻樿埖鈧降鈧? */
export type BrowserNotificationPermissionState =
  | NotificationPermission
  | "unsupported"
  | "insecure";

/**
 * 濡偓濞村缍嬮崜宥囧箚婢у啯妲搁崥锔芥暜閹镐焦绁荤憴鍫濇珤闁氨鐓?API閵? *
 * @returns 閼汇儲绁荤憴鍫濇珤閺€顖涘瘮 Notification API 閸掓瑨绻戦崶?true
 */
function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * 鐠囪褰囪ぐ鎾冲濞村繗顫嶉崳銊┾偓姘辩叀閺夊啴妾洪悩鑸碘偓浣碘偓? * 濞村繗顫嶉崳銊洣濮瑰倸鐣ㄩ崗銊ょ瑐娑撳鏋冮敍鍦歍TPS 閹?localhost閿涘澧犻懗鎴掑▏閻劑鈧氨鐓￠崝鐔诲厴閵? *
 * @returns 瑜版挸澧犻柅姘辩叀閺夊啴妾洪悩鑸碘偓渚婄窗
 *          - "granted"閿涙艾鍑￠幒鍫熸綀
 *          - "denied"閿涙艾鍑￠幏鎺旂卜
 *          - "default"閿涙碍婀崘鍐茬暰閿涘牆褰茬拠閿嬬湴閹哄牊娼堥敍? *          - "unsupported"閿涙碍绁荤憴鍫濇珤娑撳秵鏁幐? *          - "insecure"閿涙岸娼€瑰鍙忔稉濠佺瑓閺傚浄绱欐俊?HTTP 閻滎垰顣ㄩ敍? */
export function readBrowserNotificationPermissionState(): BrowserNotificationPermissionState {
  if (typeof window === "undefined") {
    return "unsupported";
  }
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }
  // 闂堢偛鐣ㄩ崗銊ょ瑐娑撳鏋冮敍鍫濐洤缁?HTTP 閻滎垰顣ㄩ敍澶夌瑝閺€顖涘瘮闁氨鐓?  if (!window.isSecureContext) {
    return "insecure";
  }
  return Notification.permission;
}

/**
 * 鐠囬攱鐪板ù蹇氼潔閸ｃ劑鈧氨鐓￠弶鍐閵? * 閼汇儱缍嬮崜宥囧Ц閹礁鍑＄涵顔肩暰閿涘牅绗夐弨顖涘瘮閵嗕線娼€瑰鍙忛妴浣稿嚒閹锋帞绮烽妴浣稿嚒閹哄牊娼堥敍澶涚礉閸掓瑧娲块幒銉ㄧ箲閸ョ偛缍嬮崜宥囧Ц閹緤绱? * 閸氾箑鍨拫鍐暏濞村繗顫嶉崳銊ュ斧閻㈢喐娼堥梽鎰嚞濮瑰倸鑴婄粣妞尖偓? *
 * @returns 鐠囬攱鐪伴崥搴ｆ畱闁氨鐓￠弶鍐閻樿埖鈧? */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  const current = readBrowserNotificationPermissionState();
  // 瀹歌尙鈥樼€规氨濮搁幀浣规￥闂団偓閸愬秵顐肩拠閿嬬湴
  if (current === "unsupported" || current === "insecure" || current === "denied") {
    return current;
  }
  if (current === "granted") {
    return current;
  }
  // 鐠嬪啰鏁ゅù蹇氼潔閸ｃ劌甯悽鐔告綀闂勬劘顕Ч鍌氳剨缁?  return Notification.requestPermission();
}

/**
 * 閸掋倖鏌囪ぐ鎾冲鎼存梻鏁ょ粣妤€褰涢弰顖氭儊婢跺嫪绨崜宥呭酱閿涘牆褰茬憴浣风瑬閺堝鍔嶉悙鐧哥礆閵? * 閻劋绨崘鍐茬暰閺勵垰鎯佹惔鏃€妯夌粈铏归兇缂佺喖鈧氨鐓￠敍鍫濇倵閸欑増妞傞幍宥嗘▔缁€鐚寸礆閵? *
 * @returns 閼汇儳鐛ラ崣锝咁槱娴滃骸澧犻崣鏉垮讲鐟欎胶濮搁幀浣稿灟鏉╂柨娲?true
 */
function isWindowForeground(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * 缁捐法鈻奸柅姘辩叀閺傚洦顢嶉幒銉ュ經閿涘苯瀵橀崥顐ｇ垼妫版ê鎷板锝嗘瀮閵? */
interface ThreadNotificationCopy {
  /** 闁氨鐓￠弽鍥暯 */
  title: string;
  /** 闁氨鐓″锝嗘瀮閸愬懎顔?*/
  body: string;
}

/**
 * 閼辨氨鍔嶉崚鐗堝瘹鐎规氨鍤庣粙瀣剁礉鐠哄疇娴嗛崚鎵殠缁嬪顕涢幆鍛淬€夐妴? * 闁氨鐓￠悙鐟板毊閺冨墎娈戠€佃壈鍩呯悰灞艰礋閺勵垶鈧氨鏁ら惃鍕殠缁嬪绺哄ú浼欑礉閸ョ姵顒濇导姘闂?splitViewId閿? * 闁灝鍘ら幁銏狀槻娑斿澧犻梾鎰閻ㄥ嫭濯堕崚鍡氼潒閸ラ箖鍘ょ€靛箍鈧? *
 * @param threadId - 閻╊喗鐖ｇ痪璺ㄢ柤 ID
 * @param navigate - TanStack Router 閻ㄥ嫬顕遍懜顏勫毐閺? */
function focusThread(threadId: Thread["id"], navigate: ReturnType<typeof useNavigate>): void {
  void navigate({
    to: "/$threadId",
    params: { threadId },
    // 濞撳懘娅?splitViewId閿涘矂浼╅崗宥嗕划婢跺秹娈ｉ挊蹇曟畱閹峰棗鍨庣憴鍡楁禈
    search: (previous) => ({ ...previous, splitViewId: undefined }),
  });
}

/**
 * 閺勫墽銇氶幙宥勭稊缁崵绮虹痪褍鍩嗛惃鍕殠缁嬪鈧氨鐓￠妴? * 娴兼ê鍘涙担璺ㄦ暏 Tauri 濡楀矂娼扮粩顖炩偓姘辩叀閿涘矁瀚㈡稉宥呭讲閻劌鍨梽宥囬獓娑撶儤绁荤憴鍫濇珤閸樼喓鏁?Notification閵? *
 * @param copy - 闁氨鐓￠弬鍥攳閿涘牊鐖ｆ０妯烘嫲濮濓絾鏋冮敍? * @param threadId - 閸忓疇浠堥惃鍕殠缁?ID閿涘瞼鏁ゆ禍搴ㄢ偓姘辩叀閸樺鍣搁崪宀€鍋ｉ崙鏄忕儲鏉? * @param navigate - TanStack Router 閻ㄥ嫬顕遍懜顏勫毐閺佸府绱濋悽銊ょ艾闁氨鐓￠悙鐟板毊閸氬氦鐑︽潪? * @returns 閼汇儲鍨氶崝鐔告▔缁€娲偓姘辩叀閸掓瑨绻戦崶?true閿涘苯鎯侀崚娆掔箲閸?false
 */
async function showSystemThreadNotification(
  copy: ThreadNotificationCopy,
  threadId: Thread["id"],
  navigate: ReturnType<typeof useNavigate>,
): Promise<boolean> {
  const { body, title } = copy;

  // 娴兼ê鍘涙担璺ㄦ暏 Tauri 濡楀矂娼扮粩顖炩偓姘辩叀閼宠棄濮?  if (tauriBridge) {
    const supported = await tauriBridge.notifications.isSupported();
    if (!supported) {
      return false;
    }
    return tauriBridge.notifications.show({ title, body, silent: false, threadId });
  }

  // 闂勫秶楠囨稉鐑樼セ鐟欏牆娅掗崢鐔烘晸闁氨鐓￠敍宀勬付閸忓牏鈥樼拋銈嗘綀闂勬劕鍑￠幒鍫滅埃
  if (readBrowserNotificationPermissionState() !== "granted") {
    return false;
  }

  const notification = new Notification(title, {
    body,
    // 娴ｈ法鏁?tag 鐎圭偟骞囬柅姘辩叀閸樺鍣搁敍灞芥倱娑撯偓缁捐法鈻奸崣顏呮▔缁€鐑樻付閺傛壆娈戞稉鈧弶锟犫偓姘辩叀
    tag: `thread-notification:${threadId}`,
  });
  // 閻愮懓鍤柅姘辩叀閺冩儼浠涢悞锔剧崶閸欙絽鑻熺捄瀹犳祮閸掓澘顕惔鏃傚殠缁?  notification.addEventListener("click", () => {
    window.focus();
    focusThread(threadId, navigate);
  });
  return true;
}

/**
 * 閺勫墽銇氭惔鏃傛暏閸?Toast 閹绘劗銇氶妴? * 閻劋绨崷銊ョ安閻劎鏅棃銏犲敶鐏炴洜銇氭潪濠氬櫤缁狙団偓姘辩叀濞戝牊浼呴妴? *
 * @param copy - 闁氨鐓￠弬鍥攳閿涘牊鐖ｆ０妯烘嫲濮濓絾鏋冮敍? * @param threadId - 閸忓疇浠堥惃鍕殠缁?ID閿涘瞼鏁ゆ禍?Toast 閸欘垵顫嗛幀褎甯堕崚璺烘嫲閻愮懓鍤捄瀹犳祮
 * @param tone - Toast 妞嬪孩鐗搁敍?success"閿涘牊鍨氶崝?鐎瑰本鍨氶敍澶嬪灗 "warning"閿涘牐顒熼崨?闂団偓閸忚櫕鏁為敍? * @param navigate - TanStack Router 閻ㄥ嫬顕遍懜顏勫毐閺佸府绱濋悽銊ょ艾 Toast 閹垮秳缍旈幐澶愭尦閻愮懓鍤崥搴ょ儲鏉? */
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
      // 閸忎浇顔忕捄銊у殠缁嬪妯夌粈鐚寸礉閸楀厖濞囪ぐ鎾冲閸︺劌鍙炬禒鏍殠缁嬪銆夐棃顫瘍閼崇晫婀呴崚鐗堫劃 Toast
      allowCrossThreadVisibility: true,
      threadId,
      // 瑜版挾鍤庣粙瀣綁娑撳搫褰茬憴浣告倵 8 缁夋帟鍤滈崝銊︾Х婢?      dismissAfterVisibleMs: 8000,
    },
    actionProps: {
      children: "Open",
      onClick: () => focusThread(threadId, navigate),
    },
  });
}

/**
 * 娴犺濮熺€瑰本鍨氶柅姘辩叀缂佸嫪娆㈤妴? * 閻╂垵鎯夌痪璺ㄢ柤閸滃瞼绮撶粩顖滃Ц閹礁褰夐崠鏍电礉閸︺劋鎹㈤崝鈥崇暚閹存劖鍨ㄩ棁鈧憰浣烘暏閹村嘲鍙у▔銊︽鐟欙箑褰?Toast 閸滃瞼閮寸紒鐔尖偓姘辩叀閵? * 鐠囥儳绮嶆禒鏈电瑝濞撳弶鐓嬫禒璁崇秿 UI 閸忓啰绀岄敍鍫ｇ箲閸?null閿涘绱濇禒鍛稊娑撳搫澹囨担婊呮暏缂佸嫪娆㈡潻鎰攽閵? *
 * 閸旂喕鍏橀崠鍛閿? * 1. 濡偓濞村鍤庣粙瀣╂崲閸斺€崇暚閹存劒绨ㄦ禒璁圭礉閺勫墽銇氱€瑰本鍨氶柅姘辩叀
 * 2. 濡偓濞村绮撶粩顖欐崲閸斺€崇暚閹存劒绨ㄦ禒璁圭礉閺勫墽銇氱€瑰本鍨氶柅姘辩叀
 * 3. 濡偓濞村鍤庣粙瀣付鐟曚胶鏁ら幋鐤翻閸?鐎光剝澹掗惃鍕皑娴犺绱濋弰鍓с仛鐠€锕€鎲￠柅姘辩叀
 * 4. 濡偓濞村绮撶粩顖炴付鐟曚胶鏁ら幋宄板彠濞夈劎娈戞禍瀣╂閿涘本妯夌粈楦款劅閸涘﹪鈧氨鐓? * 5. 閻╂垵鎯?Tauri 閼挎粌宕熼幙宥勭稊閿涘本鏁幐浣风矤缁崵绮洪柅姘辩叀閻愮懓鍤捄瀹犳祮閸掓澘顕惔鏃傚殠缁? *
 * @returns null閿涘牅绗夊〒鍙夌厠娴犺缍?UI閿? */
export function TaskCompletionNotifications() {
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  // 閼惧嘲褰囪ぐ鎾冲鐠侯垳鏁辨稉顓犳畱濞茶濮╃痪璺ㄢ柤 ID
  const activeThreadId = useParams({
    strict: false,
    select: (params) =>
      typeof params.threadId === "string" ? ThreadId.makeUnsafe(params.threadId) : null,
  });
  // 閼惧嘲褰囩捄顖滄暠閺屻儴顕楅崣鍌涙殶閿涘牏鏁ゆ禍搴ば掗弸鎰閸掑棜顫嬮崶?ID閿?  const routeSearch = useSearch({
    strict: false,
    select: (search) => parseDiffRouteSearch(search),
  });
  // 閼惧嘲褰囪ぐ鎾冲閹峰棗鍨庣憴鍡楁禈閻樿埖鈧?  const splitView = useSplitViewStore(selectSplitView(routeSearch.splitViewId ?? null));
  // 閼惧嘲褰囬幍鈧張澶屽殠缁嬪鏆熼幑顕嗙礉娴ｈ法鏁?ref 缂傛挸鐡ㄩ柅澶嬪閸ｃ劋浜掗柆鍨帳娑撳秴绻€鐟曚胶娈戦柌宥嗚閺?  const threads = useStore(useRef(createAllThreadsSelector()).current);
  // 缁捐法鈻奸弫鐗堝祦閺勵垰鎯佸鎻掔暚閹存劖鎸夐崥鍫礄hydration閿?  const threadsHydrated = useStore((store) => store.threadsHydrated);
  // 閼惧嘲褰囬崥鍕殠缁嬪绗呴惃鍕矒缁旑垳濮搁幀浣规Ё鐏?  const terminalStateByThreadId = useTerminalStateStore((store) => store.terminalStateByThreadId);
  // 鐠侊紕鐣昏ぐ鎾冲閸欘垵顫嗛惃鍕殠缁?ID 闂嗗棗鎮庨敍宀€鏁ゆ禍搴″灲閺傤厽妲搁崥锕€绨查弰鍓с仛闁氨鐓?  const visibleThreadIds = useMemo(() => {
    return resolveVisibleToastThreadIds({ activeThreadId, splitView });
  }, [activeThreadId, splitView]);
  // 鐎涙ê鍋嶆稉濠佺濞嗏€虫彥閻撗呮畱缁捐法鈻奸弫鐗堝祦閿涘瞼鏁ゆ禍搴☆嚠濮ｆ梹顥呭ù瀣Ц閹礁褰夐崠?  const previousThreadsRef = useRef<readonly Thread[]>([]);
  // 鐎涙ê鍋嶆稉濠佺濞嗏€虫彥閻撗呮畱缂佸牏顏悩鑸碘偓渚婄礉閻劋绨€佃鐦Λ鈧ù瀣Ц閹礁褰夐崠?  const previousTerminalStateRef = useRef(terminalStateByThreadId);
  // 鐠佹澘缍嶉柅姘辩叀鏉╂劘顢戦弮鍓佹畱閸氼垰濮╅弮鍫曟？閿涘瞼鏁ゆ禍搴ょ箖濠娿倖鎸夐崥鍫ユ▉濞堢數娈戦崢鍡楀蕉娴滃娆?  const runtimeStartedAtMsRef = useRef(Date.now());
  // 閺嶅洩顔囩紒鍕閺勵垰鎯佸鎻掓皑缂侇亷绱欑捄瀹犵箖妫ｆ牗顐煎〒鍙夌厠閻ㄥ嫮濮搁幀浣诡梾濞村绱?  const readyRef = useRef(false);

  // 閻╂垵鎯?Tauri 閼挎粌宕熼幙宥勭稊娴滃娆㈤敍灞筋槱閻炲棔绮犵化鑽ょ埠闁氨鐓￠悙鐟板毊鐠哄疇娴嗛崚鎵殠缁嬪娈戠悰灞艰礋
  useEffect(() => {
    const onMenuAction = tauriBridge.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      const prefix = "notification-open-thread:";
      // 娴犲懎顦╅悶鍡涒偓姘辩叀閹垫挸绱戠痪璺ㄢ柤閻ㄥ嫭鎼锋担?      if (!action.startsWith(prefix)) {
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

  // 閺嶇绺鹃柅姘辩叀闁槒绶敍姘辨磧閸氼剛鍤庣粙瀣嫲缂佸牏顏悩鑸碘偓浣稿綁閸栨牭绱濈憴锕€褰傞惄绋跨安闁氨鐓?  useEffect(() => {
    // 缁捐法鈻奸弫鐗堝祦閺堫亜鐣幋鎰寜閸氬牆澧犳稉宥咁槱閻?    if (!threadsHydrated) {
      return;
    }

    // 妫ｆ牗顐肩亸杈╁崕閺冩湹绮庣拋鏉跨秿韫囶偆鍙庨敍灞肩瑝鐟欙箑褰傞柅姘辩叀閿涘牓浼╅崗宥嗘寜閸氬牊鏆熼幑顔婚獓閻㈢喕顕ら幎銉礆
    if (!readyRef.current) {
      previousThreadsRef.current = threads;
      previousTerminalStateRef.current = terminalStateByThreadId;
      readyRef.current = true;
      return;
    }

    // 閺€鍫曟肠閺傞楠囬悽鐔烘畱瀹告彃鐣幋鎰殠缁嬪鈧瑩鈧銆嶉敍灞借嫙鏉╁洦鎶ら幒澶嬫寜閸氬牓妯佸▓鐢垫畱閸樺棗褰舵禍瀣╂
    const completions = collectCompletedThreadCandidates(
      previousThreadsRef.current,
      threads,
    ).filter((candidate) =>
      isNotificationRuntimeFreshTimestamp(candidate.completedAt, runtimeStartedAtMsRef.current),
    );
    // 閺€鍫曟肠閺傞楠囬悽鐔烘畱瀹告彃鐣幋鎰矒缁旑垯鎹㈤崝鈥斥偓娆撯偓澶愩€?    const terminalCompletions = collectCompletedTerminalCandidates(
      previousTerminalStateRef.current,
      terminalStateByThreadId,
    );
    // 閺€鍫曟肠閺傞楠囬悽鐔烘畱闂団偓鐟曚胶鏁ら幋鐤翻閸忋儳娈戠痪璺ㄢ柤閸婃瑩鈧銆嶉敍灞借嫙鏉╁洦鎶ら幒澶嬫寜閸氬牓妯佸▓鐢垫畱閸樺棗褰舵禍瀣╂
    const inputNeededCandidates = collectInputNeededThreadCandidates(
      previousThreadsRef.current,
      threads,
    ).filter((candidate) =>
      isNotificationRuntimeFreshTimestamp(candidate.createdAt, runtimeStartedAtMsRef.current),
    );
    // 閺€鍫曟肠閺傞楠囬悽鐔烘畱闂団偓鐟曚胶鏁ら幋宄板彠濞夈劎娈戠紒鍫㈩伂閸婃瑩鈧銆?    const terminalAttentionCandidates = collectTerminalAttentionCandidates(
      previousTerminalStateRef.current,
      terminalStateByThreadId,
    );
    // 閺囧瓨鏌婅箛顐ゅ弾娑撳搫缍嬮崜宥囧Ц閹緤绱濇笟娑楃瑓濞嗏€愁嚠濮ｆ柧濞囬悽?    previousThreadsRef.current = threads;
    previousTerminalStateRef.current = terminalStateByThreadId;

    // 閼汇儲妫ゆ禒璁崇秿闁氨鐓￠崐娆撯偓澶愩€嶉敍宀€娲块幒銉ㄧ箲閸?    if (
      completions.length === 0 &&
      inputNeededCandidates.length === 0 &&
      terminalCompletions.length === 0 &&
      terminalAttentionCandidates.length === 0
    ) {
      return;
    }

    // 閸掋倖鏌囬弰顖氭儊鎼存柨鐨剧拠鏇熸▔缁€铏归兇缂佺喖鈧氨鐓￠敍?    // 1. 閻劍鍩涘鎻掔磻閸氼垳閮寸紒鐔尖偓姘辩叀鐠佸墽鐤?    // 2. 濡楀矂娼扮粩顖氼潗缂佸牆鐨剧拠鏇礉Web 缁旑垯绮庨崷銊х崶閸欙絽顦╂禍搴℃倵閸欑増妞傜亸婵婄槸
    const shouldAttemptSystemNotification =
      settings.enableSystemTaskCompletionNotifications &&
      (tauriBridge ? true : !isWindowForeground());

    // 婢跺嫮鎮婄痪璺ㄢ柤娴犺濮熺€瑰本鍨氶柅姘辩叀
    for (const completion of completions) {
      const copy = buildTaskCompletionCopy(completion);
      // 閼汇儳鏁ら幋宄扮磻閸?Toast 鐠佸墽鐤嗘稉鏃傚殠缁嬪缍嬮崜宥勭瑝閸欘垵顫嗛敍灞藉灟閺勫墽銇?Toast
      if (
        settings.enableTaskCompletionToasts &&
        shouldShowThreadNotificationToast({
          threadId: completion.threadId,
          visibleThreadIds,
        })
      ) {
        showThreadToast(copy, completion.threadId, "success", navigate);
      }

      // 鐏忔繆鐦弰鍓с仛缁崵绮虹痪褔鈧氨鐓?      if (shouldAttemptSystemNotification) {
        void showSystemThreadNotification(copy, completion.threadId, navigate);
      }
    }

    // 婢跺嫮鎮婄痪璺ㄢ柤闂団偓鐟曚胶鏁ら幋鐤翻閸忋儳娈戦柅姘辩叀
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

    // 婢跺嫮鎮婄紒鍫㈩伂娴犺濮熺€瑰本鍨氶柅姘辩叀
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

    // 婢跺嫮鎮婄紒鍫㈩伂闂団偓鐟曚胶鏁ら幋宄板彠濞夈劎娈戦柅姘辩叀
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

  // 鐠囥儳绮嶆禒鏈电瑝濞撳弶鐓嬫禒璁崇秿 UI閿涘奔绮庢担婊€璐熼崜顖欑稊閻劎绮嶆禒鎯扮箥鐞?  return null;
}

/**
 * 閺嬪嫬缂撻柅姘辩叀鐠佸墽鐤嗛惃鍕暜閹镐浇顕╅弰搴㈡瀮閺堫兙鈧? * 閺嶈宓佹潻鎰攽閻滎垰顣ㄩ崪灞剧セ鐟欏牆娅掗弶鍐閻樿埖鈧浇绻戦崶鐐差嚠鎼存梻娈戦幓鎰仛閺傚洦顢嶉敍宀€鏁ゆ禍搴ゎ啎缂冾喚鏅棃銏犵潔缁€鎭掆偓? *
 * @param permissionState - 瑜版挸澧犲ù蹇氼潔閸ｃ劑鈧氨鐓￠弶鍐閻樿埖鈧? * @returns 娴滆櫣琚崣顖濐嚢閻ㄥ嫰鈧氨鐓＄拋鍓х枂鐠囧瓨妲戦弬鍥ㄦ拱
 */
export function buildNotificationSettingsSupportText(
  permissionState: BrowserNotificationPermissionState,
): string {
  // 濡楀矂娼扮粩顖欏▏閻劎閮寸紒鐔尖偓姘辩叀娑擃厼绺?  if (isDesktop) {
    return "Desktop app notifications use your operating system notification center.";
  }
  // Web 缁旑垱鐗撮幑顔芥綀闂勬劗濮搁幀浣界箲閸ョ偛顕惔鏃€褰佺粈?  switch (permissionState) {
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
