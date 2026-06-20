/**
 * @file 閺堫剙婀撮崶鍓у URL 婢跺嫮鎮婂Ο鈥虫健
 * @description 娑?Markdown 閸ュ墽澧栨０鍕潔閸滃奔绗呮潪鑺ョ€楦款吇鐠囦胶娈戦張顒€婀撮崶鍓у URL閵? *              娓氭繆绂?wsHttpUrl閿涘牅浜掓笟鎸庮攽闂堛垼顕Ч鍌涙儭鐢箓妾禒鏈靛▏閻劎娈戦弮褏澧楅崥顖氬З娴犮倗澧濋敍? *              閸?@remi-code/shared/localImage閿涘牏鏁ゆ禍搴ゎ潐閼煎啳鐭鹃悽鍗炴嫲閹碘晛鐫嶉崥宥囨閸氬秴宕熼敍澶堚偓? */

import {
  LOCAL_IMAGE_ROUTE_PATH,
  SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX,
} from "~/shared/localImage";
import { isWindowsAbsolutePath } from "~/shared/path";

import { resolveWsHttpUrl } from "./wsHttpUrl";

/**
 * 鐟欏嫯瀵栭崠?Markdown 閸ュ墽澧栫捄顖氱窞閿涘牆鍞撮柈銊ュ毐閺佸府绱? * @param src - 閸樼喎顫愰崶鍓у鐠侯垰绶? * @returns 鐟欏嫯瀵栭崠鏍ф倵閻ㄥ嫯鐭惧鍕剁礄鐟欙絿鐖?URL 缂傛牜鐖滈敍? */
function normalizeMarkdownImagePath(src: string): string {
  const trimmed = src.trim();
  // 婢跺嫮鎮?file:// 閸楀繗顔?  if (trimmed.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(trimmed).pathname);
    } catch {
      return trimmed;
    }
  }
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * 閸掋倖鏌囬弰顖氭儊娑撶儤婀伴崷鏉挎禈閻?Markdown 濠? * @param src - 閸ュ墽澧栧┃鎰熅瀵? * @returns 閺勵垰鎯佹稉鐑樻拱閸︽澘娴橀悧鍥熅瀵? */
export function isLocalImageMarkdownSrc(src: string | undefined): src is string {
  if (!src) {
    return false;
  }
  const normalized = normalizeMarkdownImagePath(src);
  if (!SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test(normalized)) {
    return false;
  }
  // 鐏?Windows 缂佹繂顕捄顖氱窞閿涘牆顩?C:\foo\bar.png閿涘顫嬫稉鐑樻拱閸︽澘娴橀悧鍥风礉
  // 鐏忕晫顓搁崗鍓佹磸缁楋箑澧犵紓鈧崣顖濆厴閻鎹ｉ弶銉ュ剼 URI 閺傝顢?  if (isWindowsAbsolutePath(normalized)) {
    return true;
  }
  return (
    normalized.startsWith("/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    !/^[a-z][a-z0-9+.-]*:/i.test(normalized)
  );
}

/**
 * 閺嬪嫬缂撻張顒€婀撮崶鍓у URL
 * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.src - 閸ュ墽澧栧┃鎰熅瀵? * @param input.cwd - 瑜版挸澧犲銉ょ稊閻╊喖缍? * @param input.download - 閺勵垰鎯佹稉杞扮瑓鏉炶姤膩瀵? * @returns 閺嬪嫬缂撻崥搴ｆ畱閺堫剙婀撮崶鍓у URL
 */
export function buildLocalImageUrl(input: {
  readonly src: string;
  readonly cwd: string | undefined;
  readonly download?: boolean;
}): string {
  const params = new URLSearchParams({ path: normalizeMarkdownImagePath(input.src) });
  if (input.cwd) {
    params.set("cwd", input.cwd);
  }
  if (input.download) {
    params.set("download", "1");
  }
  // 婵绮撻柅姘崇箖 WS 濞插墽鏁撻惃?HTTP 濠ф劘鐭鹃悽鎲嬬礉娴犮儰绌跺宀勬桨閻楀牊婀伴敍鍫ｅ殰鐎规矮绠熼崡蹇氼唴閿?  // 閸栧懎鎯堥梽鍕瀹歌弓濞囬悽銊ф畱閻╃鎮撻弮褏澧楅崥顖氬З娴犮倗澧濋敍娑樻躬 Web/瀵偓閸欐垹骞嗘晶鍐跨礄妞ょ敻娼伴崪灞炬箛閸斺€虫珤閸忓彉闊╁┃鎰剁礆
  // 娑擃叏绱濇潻娆庣窗閸ョ偤鈧偓閸掓壆娴夐崥宀€娈戦惄绋款嚠鐠侯垰绶?  return resolveWsHttpUrl(`${LOCAL_IMAGE_ROUTE_PATH}?${params.toString()}`);
}

/**
 * 娴犲骸娴橀悧鍥熅瀵板嫭褰侀崣鏍ㄦ瀮娴犺泛鎮? * @param src - 閸ュ墽澧栫捄顖氱窞
 * @returns 閺傚洣娆㈤崥? */
export function localImageFileName(src: string): string {
  const normalized = normalizeMarkdownImagePath(src);
  const slash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}
