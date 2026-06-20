/**
 * @file splitViewRoute.ts
 * @description 鍒嗗睆瑙嗗浘璺敱妗ユ帴妯″潡銆? * 杩炴帴璺敱鎼滅储鍙傛暟涓庡垎灞忚鍥剧姸鎬侊紝浣胯矾鐢辨秷璐硅€呭彲浠ヤ笓娉ㄤ簬 UI 閫昏緫銆? * 涓鸿亰澶╃晫闈€€佷晶杈规爮鍜岀嚎绋嬬骇 UI 鎻愪緵鍏变韩鐨勮矾鐢辫緟鍔╁嚱鏁般€? */

import { type ThreadId } from "~/contracts";
import { type DiffRouteSearch } from "./diffRouteSearch";
import {
  resolveSplitViewFocusedThreadId,
  resolveSplitViewPaneIdForThread,
  type PaneId,
  type SplitView,
} from "./splitViewStore";

/**
 * 瑙ｆ瀽褰撳墠娲昏穬鐨勫垎灞忚鍥惧強鍏惰仛鐒︾嚎绋嬪拰璺敱闈㈡澘 ID銆? * 濡傛灉娌℃湁鍒嗗睆瑙嗗浘锛岃仛鐒︾嚎绋嬪洖閫€鍒拌矾鐢辩嚎绋?ID銆? *
 * @param input.splitView - 褰撳墠鍒嗗睆瑙嗗浘锛屾棤鍒嗗睆鏃朵负 null
 * @param input.routeThreadId - 璺敱涓殑绾跨▼ ID
 * @returns 鍖呭惈鍒嗗睆瑙嗗浘銆佽仛鐒︾嚎绋?ID 鍜岃矾鐢遍潰鏉?ID 鐨勫璞? */
export function resolveActiveSplitView(input: {
  splitView: SplitView | null;
  routeThreadId: ThreadId | null;
}): {
  splitView: SplitView | null;
  focusedThreadId: ThreadId | null;
  routePaneId: PaneId | null;
} {
  const { routeThreadId, splitView } = input;
  if (!splitView) {
    return {
      splitView: null,
      focusedThreadId: routeThreadId,
      routePaneId: null,
    };
  }

  return {
    splitView,
    focusedThreadId: resolveSplitViewFocusedThreadId(splitView),
    routePaneId: resolveSplitViewPaneIdForThread(splitView, routeThreadId),
  };
}

/**
 * 鍒ゆ柇璺敱鎼滅储鍙傛暟鏄惁琛ㄧず鍒嗗睆璺敱
 *
 * @param search - 璺敱鎼滅储鍙傛暟
 * @returns 鏄惁涓哄垎灞忚矾鐢? */
export function isSplitRoute(search: DiffRouteSearch): boolean {
  return typeof search.splitViewId === "string" && search.splitViewId.length > 0;
}
