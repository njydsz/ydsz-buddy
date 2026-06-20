/**
 * @file projectPaths.ts
 * @description 椤圭洰璺緞澶勭悊宸ュ叿闆嗭紝鎻愪緵璺ㄥ钩鍙帮紙Unix/Windows锛夌殑璺緞瑙勮寖鍖栥€? * 娴忚瀵艰埅銆佺洰褰曟帹鏂瓑鍔熻兘锛屾敮鎸佹枃浠剁郴缁熸祻瑙堝櫒鐨勮矾寰勬搷浣滃満鏅€? */

import {
  isExplicitRelativePath,
  isUncPath,
  isWindowsAbsolutePath,
  isWindowsDrivePath,
} from "~/shared/path";
import { isWindowsPlatform } from "./utils";

/** 鍒ゆ柇璺緞鏄惁涓烘枃浠剁郴缁熸牴璺緞锛?/"銆?\"鎴?Windows 鐩樼鏍圭洰褰曪級 */
function isRootPath(value: string): boolean {
  return value === "/" || value === "\\" || /^[a-zA-Z]:[/\\]?$/.test(value);
}

/** 鑾峰彇缁濆璺緞鐨勫钩鍙扮被鍨?*/
function getAbsolutePathKind(value: string): "unix" | "windows" | null {
  if (isWindowsDrivePath(value) || isUncPath(value)) {
    return "windows";
  }

  if (value.startsWith("/")) {
    return "unix";
  }

  return null;
}

/** 鍘婚櫎璺緞鏈熬鐨勫垎闅旂锛屼繚鐣欐牴璺緞鐨勬湯灏惧垎闅旂 */
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

/** 鏍规嵁璺緞鏍煎紡鎺ㄦ柇棣栭€夎矾寰勫垎闅旂 */
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
 * 鍒ゆ柇璺緞鏄惁浠ヨ矾寰勫垎闅旂缁撳熬
 *
 * @param value - 寰呮娴嬬殑璺緞瀛楃涓? * @returns 鏄惁浠ヨ矾寰勫垎闅旂缁撳熬
 */
export function hasTrailingPathSeparator(value: string): boolean {
  return (getAbsolutePathKind(value) === "unix" ? /\/$/ : /[\\/]$/).test(value);
}

/** 鍒ゆ柇璺緞鏄惁涓烘樉寮忕浉瀵硅矾寰勶紙浠?"./" 鎴?"../" 寮€澶达級 */
export { isExplicitRelativePath as isExplicitRelativeProjectPath };

/** 鎸夊垎闅旂鎷嗗垎璺緞娈?*/
function splitPathSegments(value: string, separator: "/" | "\\"): string[] {
  return value.split(separator === "/" ? /\/+/ : /[\\/]+/).filter(Boolean);
}

/** 鑾峰彇璺緞涓渶鍚庝竴涓矾寰勫垎闅旂鐨勭储寮?*/
function getLastPathSeparatorIndex(value: string): number {
  if (getAbsolutePathKind(value) === "unix") {
    return value.lastIndexOf("/");
  }

  return Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
}

/** 灏嗙粷瀵硅矾寰勬媶鍒嗕负鏍硅矾寰勩€佸垎闅旂鍜岃矾寰勬 */
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
 * 鍒ゆ柇杈撳叆鍊兼槸鍚︿负鏂囦欢绯荤粺娴忚鏌ヨ璺緞
 *
 * @param value - 寰呮娴嬬殑瀛楃涓? * @param platform - 杩愯骞冲彴鏍囪瘑锛岄粯璁ゅ彇 navigator.platform
 * @returns 鏄惁涓烘枃浠剁郴缁熸祻瑙堟煡璇紙鐩稿璺緞銆佺粷瀵硅矾寰勬垨鐢ㄦ埛涓荤洰褰曡矾寰勶級
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
 * 鍒ゆ柇鏄惁涓哄綋鍓嶅钩鍙颁笉鏀寔鐨?Windows 椤圭洰璺緞
 *
 * @param value - 璺緞瀛楃涓? * @param platform - 杩愯骞冲彴鏍囪瘑
 * @returns 鏄惁涓轰笉鏀寔鐨?Windows 缁濆璺緞锛堝嵆 Windows 璺緞浣嗚繍琛屽湪闈?Windows 骞冲彴锛? */
export function isUnsupportedWindowsProjectPath(value: string, platform: string): boolean {
  return isWindowsAbsolutePath(value) && !isWindowsPlatform(platform);
}

/**
 * 瑙勮寖鍖栭」鐩矾寰勭敤浜庡垎鍙戯紙鍘婚櫎棣栧熬绌虹櫧鍙婃湯灏惧垎闅旂锛? *
 * @param value - 鍘熷璺緞瀛楃涓? * @returns 瑙勮寖鍖栧悗鐨勮矾寰? */
export function normalizeProjectPathForDispatch(value: string): string {
  return trimTrailingPathSeparators(value.trim());
}

/**
 * 浠庨」鐩矾寰勬帹鏂」鐩爣棰橈紙鍙栬矾寰勬渶鍚庝竴娈电洰褰曞悕锛? *
 * @param value - 椤圭洰璺緞
 * @returns 鎺ㄦ柇鍑虹殑椤圭洰鏍囬
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
 * 鍦ㄥ綋鍓嶆祻瑙堣矾寰勫悗杩藉姞涓€涓矾寰勬
 *
 * @param currentPath - 褰撳墠娴忚璺緞
 * @param segment - 瑕佽拷鍔犵殑璺緞娈? * @returns 杩藉姞鍚庣殑瀹屾暣璺緞锛堜互鍒嗛殧绗︾粨灏撅級
 */
export function appendBrowsePathSegment(currentPath: string, segment: string): string {
  const separator = preferredPathSeparator(currentPath);
  return `${getBrowseDirectoryPath(currentPath)}${segment}${separator}`;
}

/**
 * 鑾峰彇褰撳墠娴忚璺緞鐨勬湯娈靛悕绉帮紙鍗虫渶鍚庝竴涓矾寰勫垎闅旂涔嬪悗鐨勯儴鍒嗭級
 *
 * @param currentPath - 褰撳墠娴忚璺緞
 * @returns 鏈璺緞鍚嶇О
 */
export function getBrowseLeafPathSegment(currentPath: string): string {
  const lastSeparatorIndex = getLastPathSeparatorIndex(currentPath);
  return currentPath.slice(lastSeparatorIndex + 1);
}

/**
 * 鑾峰彇褰撳墠娴忚璺緞鐨勭洰褰曢儴鍒嗭紙鑻ヨ矾寰勪互鍒嗛殧绗︾粨灏惧垯鐩存帴杩斿洖锛屽惁鍒欐埅鍙栧埌鏈€鍚庝竴涓垎闅旂锛? *
 * @param currentPath - 褰撳墠娴忚璺緞
 * @returns 鐩綍璺緞锛堜互鍒嗛殧绗︾粨灏撅級
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
 * 鑾峰彇褰撳墠娴忚璺緞鐨勭埗绾ц矾寰? *
 * @param currentPath - 褰撳墠娴忚璺緞
 * @returns 鐖剁骇璺緞锛岃嫢宸插浜庢牴鐩綍鍒欒繑鍥?null
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
 * 鍒ゆ柇褰撳墠璺緞鏄惁鍙互鍚戜笂瀵艰埅
 *
 * @param currentPath - 褰撳墠娴忚璺緞
 * @returns 鏄惁瀛樺湪鐖剁骇璺緞鍙鑸? */
export function canNavigateUp(currentPath: string): boolean {
  return hasTrailingPathSeparator(currentPath) && getBrowseParentPath(currentPath) !== null;
}

/**
 * 鑾峰彇鍒濆娴忚鏌ヨ璺緞锛堝熀浜庣敤鎴蜂富鐩綍锛? *
 * @param homeDir - 鐢ㄦ埛涓荤洰褰曡矾寰勶紝鑻ヤ负 null 鍒欓粯璁や娇鐢?"~/"
 * @returns 鍒濆娴忚璺緞锛堜互鍒嗛殧绗︾粨灏撅級
 */
export function getInitialBrowseQuery(homeDir: string | null): string {
  if (!homeDir) return "~/";
  const separator = homeDir.includes("\\") && !homeDir.startsWith("/") ? "\\" : "/";
  return homeDir.endsWith(separator) ? homeDir : `${homeDir}${separator}`;
}