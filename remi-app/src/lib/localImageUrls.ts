/**
 * @file 鏈湴鍥剧墖 URL 澶勭悊妯″潡
 * @description 涓?Markdown 鍥剧墖棰勮鍜屼笅杞芥瀯寤鸿璇佺殑鏈湴鍥剧墖 URL銆? *              渚濊禆 wsHttpUrl锛堜互渚挎闈㈣姹傛惡甯﹂檮浠朵娇鐢ㄧ殑鏃х増鍚姩浠ょ墝锛? *              鍜?@remi-code/shared/localImage锛堢敤浜庤鑼冭矾鐢卞拰鎵╁睍鍚嶇櫧鍚嶅崟锛夈€? */

import {
  LOCAL_IMAGE_ROUTE_PATH,
  SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX,
} from "~/shared/localImage";
import { isWindowsAbsolutePath } from "~/shared/path";

import { resolveWsHttpUrl } from "./wsHttpUrl";

/**
 * 瑙勮寖鍖?Markdown 鍥剧墖璺緞锛堝唴閮ㄥ嚱鏁帮級
 * @param src - 鍘熷鍥剧墖璺緞
 * @returns 瑙勮寖鍖栧悗鐨勮矾寰勶紙瑙ｇ爜 URL 缂栫爜锛? */
function normalizeMarkdownImagePath(src: string): string {
  const trimmed = src.trim();
  // 澶勭悊 file:// 鍗忚
  if (trimmed.startsWith("file://")) {
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
 * 鍒ゆ柇鏄惁涓烘湰鍦板浘鐗?Markdown 婧? * @param src - 鍥剧墖婧愯矾寰? * @returns 鏄惁涓烘湰鍦板浘鐗囪矾寰? */
export function isLocalImageMarkdownSrc(src: string | undefined): src is string {
  if (!src) {
    return false;
  }
  const normalized = normalizeMarkdownImagePath(src);
  if (!SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test(normalized)) {
    return false;
  }
  // 灏?Windows 缁濆璺緞锛堝 C:\foo\bar.png锛夎涓烘湰鍦板浘鐗囷紝
  // 灏界鍏剁洏绗﹀墠缂€鍙兘鐪嬭捣鏉ュ儚 URI 鏂规
  if (isWindowsAbsolutePath(normalized)) {
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
 * 鏋勫缓鏈湴鍥剧墖 URL
 * @param input - 杈撳叆鍙傛暟
 * @param input.src - 鍥剧墖婧愯矾寰? * @param input.cwd - 褰撳墠宸ヤ綔鐩綍
 * @param input.download - 鏄惁涓轰笅杞芥ā寮? * @returns 鏋勫缓鍚庣殑鏈湴鍥剧墖 URL
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
  // 濮嬬粓閫氳繃 WS 娲剧敓鐨?HTTP 婧愯矾鐢憋紝浠ヤ究妗岄潰鐗堟湰锛堣嚜瀹氫箟鍗忚锛?  // 鍖呭惈闄勪欢宸蹭娇鐢ㄧ殑鐩稿悓鏃х増鍚姩浠ょ墝锛涘湪 Web/寮€鍙戠幆澧冿紙椤甸潰鍜屾湇鍔″櫒鍏变韩婧愶級
  // 涓紝杩欎細鍥為€€鍒扮浉鍚岀殑鐩稿璺緞
  return resolveWsHttpUrl(`${LOCAL_IMAGE_ROUTE_PATH}?${params.toString()}`);
}

/**
 * 浠庡浘鐗囪矾寰勬彁鍙栨枃浠跺悕
 * @param src - 鍥剧墖璺緞
 * @returns 鏂囦欢鍚? */
export function localImageFileName(src: string): string {
  const normalized = normalizeMarkdownImagePath(src);
  const slash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}
