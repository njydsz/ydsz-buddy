/**
 * @file threadActivation.logic.ts
 * 缁捐法鈻煎┑鈧ú鑽ゆ畱缁绢垵鐭鹃悽鍗炲枀缁涙牗膩閸фぜ鈧? *
 * 鐠愮喕鐭楅崘鍐茬暰娓氀嗙珶閺嶅繒鍋ｉ崙姹団偓渚€鏁惄妯烘彥閹圭兘鏁妴浣规偝缁便垻鐡戦幙宥勭稊閹垫挸绱戠痪璺ㄢ柤閺冭绱? * 鎼存柧浜掗崡鏇′喊濡€崇础鏉╂ɑ妲搁崚鍡楃潌闂堛垺婢樺Ο鈥崇础閸涘牏骞囬妴鍌氼嚤閸戝搫鍨庣仦蹇斿妳閻儳娈戝┑鈧ú鏄徯掗弸鎰珤閿? * 娓氭稐鏅舵潏瑙勭埉閻愮懓鍤妴渚€鏁惄妯侯嚤閼割亜鎷伴幖婊呭偍濞翠胶鈻奸崗鍙橀煩娴ｈ法鏁ら妴? */

import type { ThreadId } from "~/contracts";
import {
  resolveSplitViewPaneIdForThread,
  type PaneId,
  type SplitView,
  type SplitViewId,
} from "./splitViewStore";

/**
 * 缁捐法鈻奸崨鎴掓姢濠碘偓濞茶崵绮ㄩ弸婊呰閸ㄥ鈧? *
 * 閹诲繗鍫笟褑绔熼弽?閹兼粎鍌?闁款喚娲忓┑鈧ú鑽ゅ殠缁嬪妞傛惔鏃€澧界悰宀€娈戦幙宥勭稊閿? * - `ignore`閿涙艾鎷烽悾銉︾负濞蹭紮绱欑痪璺ㄢ柤娑撳秴鐡ㄩ崷銊﹀灗瀹稿弶妲歌ぐ鎾冲濞叉槒绌痪璺ㄢ柤閿? * - `single`閿涙矮浜掗崡鏇′喊濡€崇础閹垫挸绱戠痪璺ㄢ柤
 * - `split`閿涙艾婀崚鍡楃潌闂堛垺婢樻稉顓熷ⅵ瀵偓缁捐法鈻? */
export type ThreadCommandActivation =
  | { kind: "ignore" }
  | { kind: "single"; threadId: ThreadId }
  | { kind: "split"; threadId: ThreadId; splitViewId: SplitViewId; paneId: PaneId };

/**
 * 鐟欙絾鐎芥笟褑绔熼弽?閹兼粎鍌?闁款喚娲忓┑鈧ú鑽ゅ殠缁嬪妞傛惔鏃€澧界悰宀€娈戦幙宥勭稊閵? *
 * 鐠嬪啰鏁ら弬鐟板枀鐎规艾鎽㈡稉顏勫瀻鐏炲骏绱欐俊鍌涚亯閺堝绱氶弰?妫ｆ牠鈧?閻ㄥ嫨鈧倿顩婚柅澶愩€庢惔蹇庤礋閿? * 瑜版挸澧犲ú鏄忕┈閻ㄥ嫬鍨庣仦蹇庣喘閸忓牞绱濋崗鑸殿偧閹稿鈥樼€规碍鈧冪秺鐏炵偠顫夐崚娆愮叀閹电偓瀵旀稊鍛閻ㄥ嫬鍨庣仦蹇嬧偓? *
 * 閸愬磭鐡ラ柅鏄忕帆閿? * 1. 缁捐法鈻兼稉宥呯摠閸?閳?韫囩晫鏆? * 2. 缁捐法鈻奸張澶愵浕闁鍨庣仦蹇撴嫲闂堛垺婢?閳?閸掑棗鐫嗗Ο鈥崇础
 * 3. 缁捐法鈻煎鍙夋Ц瑜版挸澧犳笟褑绔熼弽蹇旀た鐠哄啰鍤庣粙?閳?韫囩晫鏆愰敍鍫ヤ缉閸忓秹鍣告径宥嗙负濞蹭紮绱? * 4. 閸忔湹绮幆鍛枌 閳?閸楁洝浜板Ο鈥崇础
 *
 * @param input - 濠碘偓濞茶寮弫? * @param input.threadId - 鐟曚焦绺哄ú鑽ゆ畱缁捐法鈻?ID
 * @param input.threadExists - 缁捐法鈻奸弰顖氭儊鐎涙ê婀? * @param input.activeSidebarThreadId - 瑜版挸澧犳笟褑绔熼弽蹇旀た鐠哄啰鍤庣粙?ID
 * @param input.preferredSplitViewId - 妫ｆ牠鈧鍨庣仦蹇氼潒閸?ID
 * @param input.splitPaneId - 妫ｆ牠鈧娼伴弶?ID
 * @returns 濠碘偓濞茶崵绮ㄩ弸婊愮礉閸栧懎鎯堥幙宥勭稊缁鐎烽崪宀€娴夐崗鍏呬繆閹? *
 * @example
 * // 缁捐法鈻兼稉宥呯摠閸︺劍妞傝箛鐣屾殣
 * resolveThreadCommandActivation({ threadId: "t1", threadExists: false, ... })
 * // 閳?{ kind: "ignore" }
 *
 * @example
 * // 缁捐法鈻奸崷銊ュ瀻鐏炲繋鑵戦弮鎯扮箲閸ョ偛鍨庣仦蹇旂负濞? * resolveThreadCommandActivation({
 *   threadId: "t1", threadExists: true,
 *   preferredSplitViewId: "sv1", splitPaneId: "p1", ...
 * })
 * // 閳?{ kind: "split", threadId: "t1", splitViewId: "sv1", paneId: "p1" }
 */
export function resolveThreadCommandActivation(input: {
  threadId: ThreadId;
  threadExists: boolean;
  activeSidebarThreadId: ThreadId | null | undefined;
  preferredSplitViewId: SplitViewId | null;
  splitPaneId: PaneId | null;
}): ThreadCommandActivation {
  // 缁捐法鈻兼稉宥呯摠閸︺劍妞傝箛鐣屾殣濠碘偓濞?  if (!input.threadExists) {
    return { kind: "ignore" };
  }

  // 閺堝顩婚柅澶婂瀻鐏炲繐鎷伴棃銏℃緲閺冭绱濇禒銉ュ瀻鐏炲繑膩瀵繑绺哄ú?  if (input.preferredSplitViewId && input.splitPaneId) {
    return {
      kind: "split",
      threadId: input.threadId,
      splitViewId: input.preferredSplitViewId,
      paneId: input.splitPaneId,
    };
  }

  // 缁捐法鈻煎鍙夋Ц瑜版挸澧犳笟褑绔熼弽蹇旀た鐠哄啰鍤庣粙瀣韫囩晫鏆愰敍宀勪缉閸忓秹鍣告径宥嗙负濞?  if (input.threadId === input.activeSidebarThreadId) {
    return { kind: "ignore" };
  }

  // 姒涙顓绘禒銉ュ礋閼卞﹥膩瀵繑绺哄ú?  return { kind: "single", threadId: input.threadId };
}

/**
 * 鐟欙絾鐎界痪璺ㄢ柤濠碘偓濞茬粯妞傛惔鏃囨儰閸忋儱鎽㈡稉顏勫瀻鐏炲繘娼伴弶瑁も偓? *
 * 瑜版挸鐡ㄩ崷銊︽た鐠哄啫鍨庣仦蹇旀閿涘奔绱崗鍫濇躬鐠囥儱鍨庣仦蹇庤厬閺屻儲澹樼痪璺ㄢ柤鐎电懓绨查惃鍕桨閺夊尅绱? * 閸氾箑鍨柆宥呭坊閹碘偓閺堝瀵旀稊鍛閻ㄥ嫬鍨庣仦蹇氼潒閸ユ拝绱濋幐澶屸€樼€规碍鈧冪秺鐏炵偠顫夐崚娆愮叀閹垫拝绱? * 娴兼ê鍘涢崠褰掑帳濠ф劗鍤庣粙瀣剁礉閼汇儵娼┃鎰殠缁嬪绗栫€涙ê婀径姘嚋閸栧綊鍘ら崚娆忔礀闁偓閸掓澘宕熼懕濠兡佸蹇ョ礉
 * 闁灝鍘ら幐澶嬫付鏉╂垳濞囬悽銊у濞村顕遍懛缈犵瑝绾喖鐣鹃幀褋鈧? *
 * @param input - 閺屻儲澹橀崣鍌涙殶
 * @param input.activeSplitView - 瑜版挸澧犲ú鏄忕┈閻ㄥ嫬鍨庣仦蹇氼潒閸ユ拝绱濋弮鐘虫た鐠哄啫鍨庣仦蹇旀娑?null
 * @param input.splitViewsById - 閹碘偓閺堝鍨庣仦蹇氼潒閸ュ墽娈戦弰鐘茬殸鐞? * @param input.threadId - 鐟曚焦鐓￠幍鍓ф畱缁捐法鈻?ID
 * @returns 閸栧綊鍘ら惃鍕瀻鐏炲繗顫嬮崶?ID 閸滃矂娼伴弶?ID閿涘本婀幍鎯у煂閺冩儼绻戦崶?null
 */
export function resolvePreferredSplitForCommand(input: {
  activeSplitView: SplitView | null;
  splitViewsById: Record<SplitViewId, SplitView | undefined>;
  threadId: ThreadId;
}): { splitViewId: SplitViewId; paneId: PaneId } | null {
  if (input.activeSplitView) {
    // 濞叉槒绌崚鍡楃潌娴兼ê鍘涢敍姘洤閺嬫粎鍤庣粙瀣躬瑜版挸澧犲ú鏄忕┈閻ㄥ嫬鍨庣仦蹇庤厬閿涘瞼娲块幒銉ㄧ箲閸ョ偛顕惔鏃堟桨閺?    const paneId = resolveSplitViewPaneIdForThread(input.activeSplitView, input.threadId);
    if (paneId) {
      return { splitViewId: input.activeSplitView.id, paneId };
    }
  }

  // 闁秴宸婚幍鈧張澶嬪瘮娑斿懎瀵查崚鍡楃潌閿涘本鏁归梿鍡楀瘶閸氼偉顕氱痪璺ㄢ柤閻ㄥ嫬鍨庣仦蹇撳挤闂堛垺婢樻穱鈩冧紖
  const matchingSplits = Object.values(input.splitViewsById)
    .filter((splitView): splitView is SplitView => splitView !== undefined)
    .map((splitView) => ({
      splitView,
      paneId: resolveSplitViewPaneIdForThread(splitView, input.threadId),
    }))
    .filter((match): match is { splitView: SplitView; paneId: PaneId } => match.paneId !== null);

  // 娴兼ê鍘涢崠褰掑帳濠ф劗鍤庣粙瀣秺鐏炵儑绱遍懟銉╂姜濠ф劗鍤庣粙瀣╃瑬鐎涙ê婀径姘嚋閸栧綊鍘ら崚娆愭杹瀵喛绱濋柆鍨帳娑撳秶鈥樼€规碍鈧?  const sourceMatch = matchingSplits.find(
    ({ splitView }) => splitView.sourceThreadId === input.threadId,
  );
  const match = sourceMatch ?? (matchingSplits.length === 1 ? matchingSplits[0] : null);
  return match ? { splitViewId: match.splitView.id, paneId: match.paneId } : null;
}
