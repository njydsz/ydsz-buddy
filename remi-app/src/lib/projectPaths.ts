/**
 * @file projectPaths.ts
 * @description 妞ゅ湱娲扮捄顖氱窞婢跺嫮鎮婂銉ュ徔闂嗗棴绱濋幓鎰返鐠恒劌閽╅崣甯礄Unix/Windows閿涘娈戠捄顖氱窞鐟欏嫯瀵栭崠鏍モ偓? * 濞村繗顫嶇€佃壈鍩呴妴浣烘窗瑜版洘甯归弬顓犵搼閸旂喕鍏橀敍灞炬暜閹镐焦鏋冩禒鍓侀兇缂佺喐绁荤憴鍫濇珤閻ㄥ嫯鐭惧鍕惙娴ｆ粌婧€閺咁垬鈧? */

import {
  isExplicitRelativePath,
  isUncPath,
  isWindowsAbsolutePath,
  isWindowsDrivePath,
} from "~/shared/path";
import { isWindowsPlatform } from "./utils";

/** 閸掋倖鏌囩捄顖氱窞閺勵垰鎯佹稉鐑樻瀮娴犲墎閮寸紒鐔哥壌鐠侯垰绶為敍?/"閵?\"閹?Windows 閻╂顑侀弽鍦窗瑜版洩绱?*/
function isRootPath(value: string): boolean {
  return value === "/" || value === "\\" || /^[a-zA-Z]:[\\/]$/.test(value);
}

/** 閼惧嘲褰囩紒婵嗩嚠鐠侯垰绶為惃鍕挬閸欐壆琚崹?*/
function getAbsolutePathKind(value: string): "unix" | "windows" | null {
  if (isWindowsDrivePath(value) || isUncPath(value)) {
    return "windows";
  }

  if (value.startsWith("/")) {
    return "unix";
  }

  return null;
}

/** 閸樺娅庣捄顖氱窞閺堫偄鐔惃鍕瀻闂呮梻顑侀敍灞肩箽閻ｆ瑦鐗寸捄顖氱窞閻ㄥ嫭婀亸鎯у瀻闂呮梻顑?*/
function trimTrailingPathSeparators(value: string): string {
  if (value.length === 0 || isRootPath(value)) {
    return value;
  }

  const trimmed =
    getAbsolutePathKind(value) === "unix"
      ? value.replace(/\/+$/g, "")
      : value.replace(/[\\/]+$/g, "");
  if (trimmed.length === 0) {
    return value;
  }

  return /^[a-zA-Z]:$/.test(trimmed) ? `${trimmed}\\` : trimmed;
}

/** 閺嶈宓佺捄顖氱窞閺嶇厧绱￠幒銊︽焽妫ｆ牠鈧鐭惧鍕瀻闂呮梻顑?*/
function preferredPathSeparator(value: string): "/" | "\\" {
  const absolutePathKind = getAbsolutePathKind(value);
  if (absolutePathKind === "windows") {
    return "\\";
  }
  if (absolutePathKind === "unix") {
    return "/";
  }

  return value.includes("\\") ? "\\" : "/";
}

/**
 * 閸掋倖鏌囩捄顖氱窞閺勵垰鎯佹禒銉ㄧ熅瀵板嫬鍨庨梾鏃傤儊缂佹挸鐔? *
 * @param value - 瀵板懏顥呭ù瀣畱鐠侯垰绶炵€涙顑佹稉? * @returns 閺勵垰鎯佹禒銉ㄧ熅瀵板嫬鍨庨梾鏃傤儊缂佹挸鐔? */
export function hasTrailingPathSeparator(value: string): boolean {
  return (getAbsolutePathKind(value) === "unix" ? /\/$/ : /[\\/]$/).test(value);
}

/** 閸掋倖鏌囩捄顖氱窞閺勵垰鎯佹稉鐑樻▔瀵繒娴夌€电鐭惧鍕剁礄娴?"./" 閹?"../" 瀵偓婢惰揪绱?*/
export { isExplicitRelativePath as isExplicitRelativeProjectPath };

/** 閹稿鍨庨梾鏃傤儊閹峰棗鍨庣捄顖氱窞濞?*/
function splitPathSegments(value: string, separator: "/" | "\\"): string[] {
  return value.split(separator === "/" ? /\/+/ : /[\\/]+/).filter(Boolean);
}

/** 閼惧嘲褰囩捄顖氱窞娑擃厽娓堕崥搴濈娑擃亣鐭惧鍕瀻闂呮梻顑侀惃鍕偍瀵?*/
function getLastPathSeparatorIndex(value: string): number {
  if (getAbsolutePathKind(value) === "unix") {
    return value.lastIndexOf("/");
  }

  return Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
}

/** 鐏忓棛绮风€电鐭惧鍕閸掑棔璐熼弽纭呯熅瀵板嫨鈧礁鍨庨梾鏃傤儊閸滃矁鐭惧鍕唽 */
function splitAbsolutePath(value: string): {
  root: string;
  separator: "/" | "\\";
  segments: string[];
} | null {
  if (isWindowsDrivePath(value)) {
    const root = `${value.slice(0, 2)}\\`;
    const segments = splitPathSegments(value.slice(root.length), "\\");
    return { root, separator: "\\", segments };
  }
  if (isUncPath(value)) {
    const segments = splitPathSegments(value, "\\");
    const [server, share, ...rest] = segments;
    if (!server || !share) {
      return null;
    }
    return {
      root: `\\\\${server}\\${share}\\`,
      separator: "\\",
      segments: rest,
    };
  }
  if (value.startsWith("/")) {
    return {
      root: "/",
      separator: "/",
      segments: splitPathSegments(value.slice(1), "/"),
    };
  }
  return null;
}

/**
 * 閸掋倖鏌囨潏鎾冲弳閸婂吋妲搁崥锔胯礋閺傚洣娆㈢化鑽ょ埠濞村繗顫嶉弻銉嚄鐠侯垰绶? *
 * @param value - 瀵板懏顥呭ù瀣畱鐎涙顑佹稉? * @param platform - 鏉╂劘顢戦獮鍐插酱閺嶅洩鐦戦敍宀勭帛鐠併倕褰?navigator.platform
 * @returns 閺勵垰鎯佹稉鐑樻瀮娴犲墎閮寸紒鐔哥セ鐟欏牊鐓＄拠顫礄閻╃顕捄顖氱窞閵嗕胶绮风€电鐭惧鍕灗閻劍鍩涙稉鑽ゆ窗瑜版洝鐭惧鍕剁礆
 */
export function isFilesystemBrowseQuery(
  value: string,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
): boolean {
  const allowWindowsPaths = isWindowsPlatform(platform);
  return (
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith(".\\") ||
    value.startsWith("..\\") ||
    value.startsWith("/") ||
    value.startsWith("~/") ||
    (allowWindowsPaths && isWindowsAbsolutePath(value))
  );
}

/**
 * 閸掋倖鏌囬弰顖氭儊娑撳搫缍嬮崜宥呴挬閸欓绗夐弨顖涘瘮閻?Windows 妞ゅ湱娲扮捄顖氱窞
 *
 * @param value - 鐠侯垰绶炵€涙顑佹稉? * @param platform - 鏉╂劘顢戦獮鍐插酱閺嶅洩鐦? * @returns 閺勵垰鎯佹稉杞扮瑝閺€顖涘瘮閻?Windows 缂佹繂顕捄顖氱窞閿涘牆宓?Windows 鐠侯垰绶炴担鍡氱箥鐞涘苯婀棃?Windows 楠炲啿褰撮敍? */
export function isUnsupportedWindowsProjectPath(value: string, platform: string): boolean {
  return isWindowsAbsolutePath(value) && !isWindowsPlatform(platform);
}

/**
 * 鐟欏嫯瀵栭崠鏍€嶉惄顔跨熅瀵板嫮鏁ゆ禍搴″瀻閸欐埊绱欓崢濠氭珟妫ｆ牕鐔粚铏规閸欏﹥婀亸鎯у瀻闂呮梻顑侀敍? *
 * @param value - 閸樼喎顫愮捄顖氱窞鐎涙顑佹稉? * @returns 鐟欏嫯瀵栭崠鏍ф倵閻ㄥ嫯鐭惧? */
export function normalizeProjectPathForDispatch(value: string): string {
  return trimTrailingPathSeparators(value.trim());
}

/**
 * 娴犲酣銆嶉惄顔跨熅瀵板嫭甯归弬顓€嶉惄顔界垼妫版﹫绱欓崣鏍熅瀵板嫭娓堕崥搴濈濞堢數娲拌ぐ鏇炴倳閿? *
 * @param value - 妞ゅ湱娲扮捄顖氱窞
 * @returns 閹恒劍鏌囬崙铏规畱妞ゅ湱娲伴弽鍥暯
 */
export function inferProjectTitleFromPath(value: string): string {
  const normalized = normalizeProjectPathForDispatch(value);
  const absolutePath = splitAbsolutePath(normalized);
  if (absolutePath) {
    return absolutePath.segments.findLast(Boolean) ?? normalized;
  }

  const segments = normalized.split(/[/\\]/);
  return segments.findLast(Boolean) ?? normalized;
}

/**
 * 閸︺劌缍嬮崜宥嗙セ鐟欏牐鐭惧鍕倵鏉╄棄濮炴稉鈧稉顏囩熅瀵板嫭顔? *
 * @param currentPath - 瑜版挸澧犲ù蹇氼潔鐠侯垰绶? * @param segment - 鐟曚浇鎷烽崝鐘垫畱鐠侯垰绶炲▓? * @returns 鏉╄棄濮為崥搴ｆ畱鐎瑰本鏆ｇ捄顖氱窞閿涘牅浜掗崚鍡涙缁楋妇绮ㄧ亸鎾呯礆
 */
export function appendBrowsePathSegment(currentPath: string, segment: string): string {
  const separator = preferredPathSeparator(currentPath);
  return `${getBrowseDirectoryPath(currentPath)}${segment}${separator}`;
}

/**
 * 閼惧嘲褰囪ぐ鎾冲濞村繗顫嶇捄顖氱窞閻ㄥ嫭婀▓闈涙倳缁夊府绱欓崡铏付閸氬簼绔存稉顏囩熅瀵板嫬鍨庨梾鏃傤儊娑斿鎮楅惃鍕劥閸掑棴绱? *
 * @param currentPath - 瑜版挸澧犲ù蹇氼潔鐠侯垰绶? * @returns 閺堫偅顔岀捄顖氱窞閸氬秶袨
 */
export function getBrowseLeafPathSegment(currentPath: string): string {
  const lastSeparatorIndex = getLastPathSeparatorIndex(currentPath);
  return currentPath.slice(lastSeparatorIndex + 1);
}

/**
 * 閼惧嘲褰囪ぐ鎾冲濞村繗顫嶇捄顖氱窞閻ㄥ嫮娲拌ぐ鏇㈠劥閸掑棴绱欓懟銉ㄧ熅瀵板嫪浜掗崚鍡涙缁楋妇绮ㄧ亸鎯у灟閻╁瓨甯存潻鏂挎礀閿涘苯鎯侀崚娆愬焻閸欐牕鍩岄張鈧崥搴濈娑擃亜鍨庨梾鏃傤儊閿? *
 * @param currentPath - 瑜版挸澧犲ù蹇氼潔鐠侯垰绶? * @returns 閻╊喖缍嶇捄顖氱窞閿涘牅浜掗崚鍡涙缁楋妇绮ㄧ亸鎾呯礆
 */
export function getBrowseDirectoryPath(currentPath: string): string {
  if (hasTrailingPathSeparator(currentPath)) {
    return currentPath;
  }

  const lastSeparatorIndex = getLastPathSeparatorIndex(currentPath);
  if (lastSeparatorIndex < 0) {
    return currentPath;
  }

  return currentPath.slice(0, lastSeparatorIndex + 1);
}

/**
 * 閼惧嘲褰囪ぐ鎾冲濞村繗顫嶇捄顖氱窞閻ㄥ嫮鍩楃痪褑鐭惧? *
 * @param currentPath - 瑜版挸澧犲ù蹇氼潔鐠侯垰绶? * @returns 閻栧墎楠囩捄顖氱窞閿涘矁瀚㈠鎻掝槱娴滃孩鐗撮惄顔肩秿閸掓瑨绻戦崶?null
 */
export function getBrowseParentPath(currentPath: string): string | null {
  const trimmed = trimTrailingPathSeparators(currentPath);
  const absolutePath = splitAbsolutePath(trimmed);
  if (absolutePath) {
    if (absolutePath.segments.length === 0) {
      return null;
    }

    if (absolutePath.segments.length === 1) {
      return absolutePath.root;
    }

    const parentSegments = absolutePath.segments.slice(0, -1).join(absolutePath.separator);
    return `${absolutePath.root}${parentSegments}${absolutePath.separator}`;
  }

  const separator = preferredPathSeparator(currentPath);
  const lastSeparatorIndex = getLastPathSeparatorIndex(trimmed);

  if (lastSeparatorIndex < 0) {
    return null;
  }

  if (lastSeparatorIndex === 2 && /^[a-zA-Z]:/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}${separator}`;
  }

  return trimmed.slice(0, lastSeparatorIndex + 1);
}

/**
 * 閸掋倖鏌囪ぐ鎾冲鐠侯垰绶為弰顖氭儊閸欘垯浜掗崥鎴滅瑐鐎佃壈鍩? *
 * @param currentPath - 瑜版挸澧犲ù蹇氼潔鐠侯垰绶? * @returns 閺勵垰鎯佺€涙ê婀悥鍓侀獓鐠侯垰绶為崣顖氼嚤閼? */
export function canNavigateUp(currentPath: string): boolean {
  return hasTrailingPathSeparator(currentPath) && getBrowseParentPath(currentPath) !== null;
}

/**
 * 閼惧嘲褰囬崚婵嗩潗濞村繗顫嶉弻銉嚄鐠侯垰绶為敍鍫濈唨娴滃海鏁ら幋铚傚瘜閻╊喖缍嶉敍? *
 * @param homeDir - 閻劍鍩涙稉鑽ゆ窗瑜版洝鐭惧鍕剁礉閼汇儰璐?null 閸掓瑩绮拋銈勫▏閻?"~/"
 * @returns 閸掓繂顫愬ù蹇氼潔鐠侯垰绶為敍鍫滀簰閸掑棝娈х粭锔剧波鐏忔拝绱? */
export function getInitialBrowseQuery(homeDir: string | null): string {
  if (!homeDir) return "~/";
  const separator = homeDir.includes("\\") && !homeDir.startsWith("/") ? "\\" : "/";
  return homeDir.endsWith(separator) ? homeDir : `${homeDir}${separator}`;
}