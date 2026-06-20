/**
 * @file splitViewRoute.ts
 * @description 閸掑棗鐫嗙憴鍡楁禈鐠侯垳鏁卞銉﹀复濡€虫健閵? * 鏉╃偞甯寸捄顖滄暠閹兼粎鍌ㄩ崣鍌涙殶娑撳骸鍨庣仦蹇氼潒閸ュ墽濮搁幀渚婄礉娴ｈ儻鐭鹃悽杈ㄧХ鐠愮鈧懎褰叉禒銉ょ瑩濞夈劋绨?UI 闁槒绶妴? * 娑撻缚浜版径鈺冩櫕闂堚偓鈧椒鏅舵潏瑙勭埉閸滃瞼鍤庣粙瀣獓 UI 閹绘劒绶甸崗鍙橀煩閻ㄥ嫯鐭鹃悽杈窡閸斺晛鍤遍弫鑸偓? */

import { type ThreadId } from "~/contracts";
import { type DiffRouteSearch } from "./diffRouteSearch";
import {
  resolveSplitViewFocusedThreadId,
  resolveSplitViewPaneIdForThread,
  type PaneId,
  type SplitView,
} from "./splitViewStore";

/**
 * 鐟欙絾鐎借ぐ鎾冲濞叉槒绌惃鍕瀻鐏炲繗顫嬮崶鎯у挤閸忔儼浠涢悞锔惧殠缁嬪鎷扮捄顖滄暠闂堛垺婢?ID閵? * 婵″倹鐏夊▽鈩冩箒閸掑棗鐫嗙憴鍡楁禈閿涘矁浠涢悞锔惧殠缁嬪娲栭柅鈧崚鎷岀熅閻㈣京鍤庣粙?ID閵? *
 * @param input.splitView - 瑜版挸澧犻崚鍡楃潌鐟欏棗娴橀敍灞炬￥閸掑棗鐫嗛弮鏈佃礋 null
 * @param input.routeThreadId - 鐠侯垳鏁辨稉顓犳畱缁捐法鈻?ID
 * @returns 閸栧懎鎯堥崚鍡楃潌鐟欏棗娴橀妴浣戒粵閻掞妇鍤庣粙?ID 閸滃矁鐭鹃悽閬嶆桨閺?ID 閻ㄥ嫬顕挒? */
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
 * 閸掋倖鏌囩捄顖滄暠閹兼粎鍌ㄩ崣鍌涙殶閺勵垰鎯佺悰銊с仛閸掑棗鐫嗙捄顖滄暠
 *
 * @param search - 鐠侯垳鏁遍幖婊呭偍閸欏倹鏆? * @returns 閺勵垰鎯佹稉鍝勫瀻鐏炲繗鐭鹃悽? */
export function isSplitRoute(search: DiffRouteSearch): boolean {
  return typeof search.splitViewId === "string" && search.splitViewId.length > 0;
}
