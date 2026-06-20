/**
 * @file Diff 璺敱鎼滅储鍙傛暟澶勭悊
 *
 * 瑙ｆ瀽鍜岀鐞嗚亰澶╃晫闈腑涓?Diff 瑙嗗浘鐩稿叧鐨?URL 鎼滅储鍙傛暟銆? * 鏀寔闈㈡澘绫诲瀷锛堟祻瑙堝櫒/Diff锛夈€丏iff 寮€鍏炽€丏iff 杞 ID 鍜屾枃浠惰矾寰勭瓑鍙傛暟鐨勮В鏋愪笌娓呯悊銆? */

import { TurnId } from "~/contracts";

/** 鑱婂ぉ鍙充晶闈㈡澘绫诲瀷 */
export type ChatRightPanel = "browser" | "diff";

/**
 * Diff 璺敱鐨勬悳绱㈠弬鏁扮粨鏋勩€? * 瀵瑰簲 URL 涓?diff 鐩稿叧鐨勬煡璇㈠弬鏁般€? */
export interface DiffRouteSearch {
  /** 鍒嗗睆瑙嗗浘 ID */
  splitViewId?: string | undefined;
  /** 闈㈡澘绫诲瀷锛氭祻瑙堝櫒鎴?Diff */
  panel?: ChatRightPanel | undefined;
  /** Diff 鏄惁鎵撳紑锛?1" 琛ㄧず鎵撳紑 */
  diff?: "1" | undefined;
  /** Diff 杞 ID */
  diffTurnId?: TurnId | undefined;
  /** Diff 鏂囦欢璺緞 */
  diffFilePath?: string | undefined;
}

/**
 * 鍒ゆ柇鍊兼槸鍚﹁〃绀?Diff 鎵撳紑鐘舵€併€? * 鎺ュ彈 "1"銆佹暟瀛?1 鎴栧竷灏斿€?true銆? *
 * @param value - 寰呭垽鏂殑鍊? * @returns 鏄惁琛ㄧず Diff 鎵撳紑
 */
function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

/**
 * 鏍囧噯鍖栨悳绱㈠弬鏁颁腑鐨勫瓧绗︿覆鍊硷紝鍘婚櫎棣栧熬绌烘牸锛岀┖瀛楃涓茶繑鍥?undefined銆? *
 * @param value - 鍘熷鍊? * @returns 鏍囧噯鍖栧悗鐨勫瓧绗︿覆锛屾棤鏁堟椂杩斿洖 undefined
 */
function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * 浠庢悳绱㈠弬鏁颁腑绉婚櫎 Diff 鐩稿叧鐨勫弬鏁帮紝淇濈暀鍏朵粬鍙傛暟涓嶅彉銆? *
 * @param params - 鍘熷鎼滅储鍙傛暟瀵硅薄
 * @returns 鍘婚櫎 Diff 鐩稿叧鍙傛暟鍚庣殑瀵硅薄
 */
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
 * 瑙ｆ瀽 URL 鎼滅储鍙傛暟涓?Diff 璺敱鎼滅储瀵硅薄銆? * 澶勭悊闈㈡澘绫诲瀷銆丏iff 寮€鍏炽€佽疆娆?ID 鍜屾枃浠惰矾寰勭瓑鍙傛暟鐨勬爣鍑嗗寲鍜屽叧鑱旈€昏緫銆? *
 * @param search - URL 鎼滅储鍙傛暟瀵硅薄
 * @returns 瑙ｆ瀽鍚庣殑 DiffRouteSearch 瀵硅薄
 */
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
