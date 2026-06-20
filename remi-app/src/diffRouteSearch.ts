/**
 * @file Diff 鐠侯垳鏁遍幖婊呭偍閸欏倹鏆熸径鍕倞
 *
 * 鐟欙絾鐎介崪宀€顓搁悶鍡氫喊婢垛晝鏅棃顫厬娑?Diff 鐟欏棗娴橀惄绋垮彠閻?URL 閹兼粎鍌ㄩ崣鍌涙殶閵? * 閺€顖涘瘮闂堛垺婢樼猾璇茬€烽敍鍫熺セ鐟欏牆娅?Diff閿涘鈧笍iff 瀵偓閸忕偨鈧笍iff 鏉烆喗顐?ID 閸滃本鏋冩禒鎯扮熅瀵板嫮鐡戦崣鍌涙殶閻ㄥ嫯袙閺嬫劒绗屽〒鍛倞閵? */

import { TurnId } from "~/contracts";

/** 閼卞﹤銇夐崣鍏呮櫠闂堛垺婢樼猾璇茬€?*/
export type ChatRightPanel = "browser" | "diff";

/**
 * Diff 鐠侯垳鏁遍惃鍕偝缁便垹寮弫鎵波閺嬪嫨鈧? * 鐎电懓绨?URL 娑?diff 閻╃鍙ч惃鍕叀鐠囥垹寮弫鑸偓? */
export interface DiffRouteSearch {
  /** 閸掑棗鐫嗙憴鍡楁禈 ID */
  splitViewId?: string | undefined;
  /** 闂堛垺婢樼猾璇茬€烽敍姘セ鐟欏牆娅掗幋?Diff */
  panel?: ChatRightPanel | undefined;
  /** Diff 閺勵垰鎯侀幍鎾崇磻閿?1" 鐞涖劎銇氶幍鎾崇磻 */
  diff?: "1" | undefined;
  /** Diff 鏉烆喗顐?ID */
  diffTurnId?: TurnId | undefined;
  /** Diff 閺傚洣娆㈢捄顖氱窞 */
  diffFilePath?: string | undefined;
}

/**
 * 閸掋倖鏌囬崐鍏兼Ц閸氾箒銆冪粈?Diff 閹垫挸绱戦悩鑸碘偓浣碘偓? * 閹恒儱褰?"1"閵嗕焦鏆熺€?1 閹存牕绔风亸鏂库偓?true閵? *
 * @param value - 瀵板懎鍨介弬顓犳畱閸? * @returns 閺勵垰鎯佺悰銊с仛 Diff 閹垫挸绱? */
function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

/**
 * 閺嶅洤鍣崠鏍ㄦ偝缁便垹寮弫棰佽厬閻ㄥ嫬鐡х粭锔胯閸婄》绱濋崢濠氭珟妫ｆ牕鐔粚鐑樼壐閿涘瞼鈹栫€涙顑佹稉鑼剁箲閸?undefined閵? *
 * @param value - 閸樼喎顫愰崐? * @returns 閺嶅洤鍣崠鏍ф倵閻ㄥ嫬鐡х粭锔胯閿涘本妫ら弫鍫熸鏉╂柨娲?undefined
 */
function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * 娴犲孩鎮崇槐銏犲棘閺侀鑵戠粔濠氭珟 Diff 閻╃鍙ч惃鍕棘閺佸府绱濇穱婵堟殌閸忔湹绮崣鍌涙殶娑撳秴褰夐妴? *
 * @param params - 閸樼喎顫愰幖婊呭偍閸欏倹鏆熺€电钖? * @returns 閸樺娅?Diff 閻╃鍙ч崣鍌涙殶閸氬海娈戠€电钖? */
export function stripDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "panel" | "diff" | "diffTurnId" | "diffFilePath"> {
  const {
    panel: _panel,
    diff: _diff,
    diffTurnId: _diffTurnId,
    diffFilePath: _diffFilePath,
    ...rest
  } = params;
  return rest as Omit<T, "panel" | "diff" | "diffTurnId" | "diffFilePath">;
}

/**
 * 鐟欙絾鐎?URL 閹兼粎鍌ㄩ崣鍌涙殶娑?Diff 鐠侯垳鏁遍幖婊呭偍鐎电钖勯妴? * 婢跺嫮鎮婇棃銏℃緲缁鐎烽妴涓廼ff 瀵偓閸忕偨鈧浇鐤嗗▎?ID 閸滃本鏋冩禒鎯扮熅瀵板嫮鐡戦崣鍌涙殶閻ㄥ嫭鐖ｉ崙鍡楀閸滃苯鍙ч懕鏃堚偓鏄忕帆閵? *
 * @param search - URL 閹兼粎鍌ㄩ崣鍌涙殶鐎电钖? * @returns 鐟欙絾鐎介崥搴ｆ畱 DiffRouteSearch 鐎电钖? */
export function parseDiffRouteSearch(search: Record<string, unknown>): DiffRouteSearch {
  const splitViewId = normalizeSearchString(search.splitViewId);
  const panelRaw = normalizeSearchString(search.panel);
  const panel: ChatRightPanel | undefined =
    panelRaw === "browser" ? "browser" : panelRaw === "diff" ? "diff" : undefined;
  const diff = panel === "diff" || isDiffOpenValue(search.diff) ? "1" : undefined;
  const resolvedPanel = panel ?? (diff ? "diff" : undefined);
  const diffTurnIdRaw = diff ? normalizeSearchString(search.diffTurnId) : undefined;
  const diffTurnId = diffTurnIdRaw ? TurnId.makeUnsafe(diffTurnIdRaw) : undefined;
  const diffFilePath = diff && diffTurnId ? normalizeSearchString(search.diffFilePath) : undefined;

  return {
    ...(splitViewId ? { splitViewId } : {}),
    ...(resolvedPanel ? { panel: resolvedPanel } : {}),
    ...(diff ? { diff } : {}),
    ...(diffTurnId ? { diffTurnId } : {}),
    ...(diffFilePath ? { diffFilePath } : {}),
  };
}
