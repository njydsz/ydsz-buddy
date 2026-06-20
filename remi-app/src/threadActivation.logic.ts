/**
 * @file threadActivation.logic.ts
 * 绾跨▼婵€娲荤殑绾矾鐢卞喅绛栨ā鍧椼€? *
 * 璐熻矗鍐冲畾渚ц竟鏍忕偣鍑汇€侀敭鐩樺揩鎹烽敭銆佹悳绱㈢瓑鎿嶄綔鎵撳紑绾跨▼鏃讹紝
 * 搴斾互鍗曡亰妯″紡杩樻槸鍒嗗睆闈㈡澘妯″紡鍛堢幇銆傚鍑哄垎灞忔劅鐭ョ殑婵€娲昏В鏋愬櫒锛? * 渚涗晶杈规爮鐐瑰嚮銆侀敭鐩樺鑸拰鎼滅储娴佺▼鍏变韩浣跨敤銆? */

import type { ThreadId } from "~/contracts";
import {
  resolveSplitViewPaneIdForThread,
  type PaneId,
  type SplitView,
  type SplitViewId,
} from "./splitViewStore";

/**
 * 绾跨▼鍛戒护婵€娲荤粨鏋滅被鍨嬨€? *
 * 鎻忚堪渚ц竟鏍?鎼滅储/閿洏婵€娲荤嚎绋嬫椂搴旀墽琛岀殑鎿嶄綔锛? * - `ignore`锛氬拷鐣ユ縺娲伙紙绾跨▼涓嶅瓨鍦ㄦ垨宸叉槸褰撳墠娲昏穬绾跨▼锛? * - `single`锛氫互鍗曡亰妯″紡鎵撳紑绾跨▼
 * - `split`锛氬湪鍒嗗睆闈㈡澘涓墦寮€绾跨▼
 */
export type ThreadCommandActivation =
  | { kind: "ignore" }
  | { kind: "single"; threadId: ThreadId }
  | { kind: "split"; threadId: ThreadId; splitViewId: SplitViewId; paneId: PaneId };

/**
 * 瑙ｆ瀽渚ц竟鏍?鎼滅储/閿洏婵€娲荤嚎绋嬫椂搴旀墽琛岀殑鎿嶄綔銆? *
 * 璋冪敤鏂瑰喅瀹氬摢涓垎灞忥紙濡傛灉鏈夛級鏄?棣栭€?鐨勩€傞閫夐『搴忎负锛? * 褰撳墠娲昏穬鐨勫垎灞忎紭鍏堬紝鍏舵鎸夌‘瀹氭€у綊灞炶鍒欐煡鎵炬寔涔呭寲鐨勫垎灞忋€? *
 * 鍐崇瓥閫昏緫锛? * 1. 绾跨▼涓嶅瓨鍦?鈫?蹇界暐
 * 2. 绾跨▼鏈夐閫夊垎灞忓拰闈㈡澘 鈫?鍒嗗睆妯″紡
 * 3. 绾跨▼宸叉槸褰撳墠渚ц竟鏍忔椿璺冪嚎绋?鈫?蹇界暐锛堥伩鍏嶉噸澶嶆縺娲伙級
 * 4. 鍏朵粬鎯呭喌 鈫?鍗曡亰妯″紡
 *
 * @param input - 婵€娲诲弬鏁? * @param input.threadId - 瑕佹縺娲荤殑绾跨▼ ID
 * @param input.threadExists - 绾跨▼鏄惁瀛樺湪
 * @param input.activeSidebarThreadId - 褰撳墠渚ц竟鏍忔椿璺冪嚎绋?ID
 * @param input.preferredSplitViewId - 棣栭€夊垎灞忚鍥?ID
 * @param input.splitPaneId - 棣栭€夐潰鏉?ID
 * @returns 婵€娲荤粨鏋滐紝鍖呭惈鎿嶄綔绫诲瀷鍜岀浉鍏充俊鎭? *
 * @example
 * // 绾跨▼涓嶅瓨鍦ㄦ椂蹇界暐
 * resolveThreadCommandActivation({ threadId: "t1", threadExists: false, ... })
 * // 鈫?{ kind: "ignore" }
 *
 * @example
 * // 绾跨▼鍦ㄥ垎灞忎腑鏃惰繑鍥炲垎灞忔縺娲? * resolveThreadCommandActivation({
 *   threadId: "t1", threadExists: true,
 *   preferredSplitViewId: "sv1", splitPaneId: "p1", ...
 * })
 * // 鈫?{ kind: "split", threadId: "t1", splitViewId: "sv1", paneId: "p1" }
 */
export function resolveThreadCommandActivation(input: {
  threadId: ThreadId;
  threadExists: boolean;
  activeSidebarThreadId: ThreadId | null | undefined;
  preferredSplitViewId: SplitViewId | null;
  splitPaneId: PaneId | null;
}): ThreadCommandActivation {
  // 绾跨▼涓嶅瓨鍦ㄦ椂蹇界暐婵€娲?  if (!input.threadExists) {
    return { kind: "ignore" };
  }

  // 鏈夐閫夊垎灞忓拰闈㈡澘鏃讹紝浠ュ垎灞忔ā寮忔縺娲?  if (input.preferredSplitViewId && input.splitPaneId) {
    return {
      kind: "split",
      threadId: input.threadId,
      splitViewId: input.preferredSplitViewId,
      paneId: input.splitPaneId,
    };
  }

  // 绾跨▼宸叉槸褰撳墠渚ц竟鏍忔椿璺冪嚎绋嬫椂蹇界暐锛岄伩鍏嶉噸澶嶆縺娲?  if (input.threadId === input.activeSidebarThreadId) {
    return { kind: "ignore" };
  }

  // 榛樿浠ュ崟鑱婃ā寮忔縺娲?  return { kind: "single", threadId: input.threadId };
}

/**
 * 瑙ｆ瀽绾跨▼婵€娲绘椂搴旇惤鍏ュ摢涓垎灞忛潰鏉裤€? *
 * 褰撳瓨鍦ㄦ椿璺冨垎灞忔椂锛屼紭鍏堝湪璇ュ垎灞忎腑鏌ユ壘绾跨▼瀵瑰簲鐨勯潰鏉匡紱
 * 鍚﹀垯閬嶅巻鎵€鏈夋寔涔呭寲鐨勫垎灞忚鍥撅紝鎸夌‘瀹氭€у綊灞炶鍒欐煡鎵撅細
 * 浼樺厛鍖归厤婧愮嚎绋嬶紝鑻ラ潪婧愮嚎绋嬩笖瀛樺湪澶氫釜鍖归厤鍒欏洖閫€鍒板崟鑱婃ā寮忥紝
 * 閬垮厤鎸夋渶杩戜娇鐢ㄧ寽娴嬪鑷翠笉纭畾鎬с€? *
 * @param input - 鏌ユ壘鍙傛暟
 * @param input.activeSplitView - 褰撳墠娲昏穬鐨勫垎灞忚鍥撅紝鏃犳椿璺冨垎灞忔椂涓?null
 * @param input.splitViewsById - 鎵€鏈夊垎灞忚鍥剧殑鏄犲皠琛? * @param input.threadId - 瑕佹煡鎵剧殑绾跨▼ ID
 * @returns 鍖归厤鐨勫垎灞忚鍥?ID 鍜岄潰鏉?ID锛屾湭鎵惧埌鏃惰繑鍥?null
 */
export function resolvePreferredSplitForCommand(input: {
  activeSplitView: SplitView | null;
  splitViewsById: Record<SplitViewId, SplitView | undefined>;
  threadId: ThreadId;
}): { splitViewId: SplitViewId; paneId: PaneId } | null {
  if (input.activeSplitView) {
    // 娲昏穬鍒嗗睆浼樺厛锛氬鏋滅嚎绋嬪湪褰撳墠娲昏穬鐨勫垎灞忎腑锛岀洿鎺ヨ繑鍥炲搴旈潰鏉?    const paneId = resolveSplitViewPaneIdForThread(input.activeSplitView, input.threadId);
    if (paneId) {
      return { splitViewId: input.activeSplitView.id, paneId };
    }
  }

  // 閬嶅巻鎵€鏈夋寔涔呭寲鍒嗗睆锛屾敹闆嗗寘鍚绾跨▼鐨勫垎灞忓強闈㈡澘淇℃伅
  const matchingSplits = Object.values(input.splitViewsById)
    .filter((splitView): splitView is SplitView => splitView !== undefined)
    .map((splitView) => ({
      splitView,
      paneId: resolveSplitViewPaneIdForThread(splitView, input.threadId),
    }))
    .filter((match): match is { splitView: SplitView; paneId: PaneId } => match.paneId !== null);

  // 浼樺厛鍖归厤婧愮嚎绋嬪綊灞烇紱鑻ラ潪婧愮嚎绋嬩笖瀛樺湪澶氫釜鍖归厤鍒欐斁寮冿紝閬垮厤涓嶇‘瀹氭€?  const sourceMatch = matchingSplits.find(
    ({ splitView }) => splitView.sourceThreadId === input.threadId,
  );
  const match = sourceMatch ?? (matchingSplits.length === 1 ? matchingSplits[0] : null);
  return match ? { splitViewId: match.splitView.id, paneId: match.paneId } : null;
}
