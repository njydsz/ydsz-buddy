/**
 * @file Markdown 文件链接解析模块
 * @description 解析 Markdown 中的文件链接，识别各种路径格式（Windows/POSIX 绝对路径、
 *              相对路径、file:// URL 等），并将其转换为可点击的文件路径。
 *              支持行号/列号定位（如 `path:10:5` 或 `#L10C5` 格式）。
 */

import { resolvePathLinkTarget } from "./terminal-links";

/** Windows 盘符路径正则，如 C:\ 或 D:/ */
const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
/** Windows UNC 路径正则，如 \\server\share */
const WINDOWS_UNC_PATH_PATTERN = /^\\\\/;
/** 外部协议正则，如 http:、https:、mailto: */
const EXTERNAL_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/;
/** 相对路径前缀正则，如 ~/、./、../ */
const RELATIVE_PATH_PREFIX_PATTERN = /^(~\/|\.{1,2}\/)/;
/** 相对文件路径正则，如 src/index.ts:10:5 */
const RELATIVE_FILE_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?::\d+){0,2}$/;
/** 相对文件名正则，如 file.ts:10 */
const RELATIVE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+\.[A-Za-z0-9_-]+(?::\d+){0,2}$/;
/** 行号/列号后缀正则，如 :10 或 :10:5 */
const POSITION_SUFFIX_PATTERN = /:\d+(?::\d+)?$/;
/** 纯行号正则，如 10 或 10:5 */
const POSITION_ONLY_PATTERN = /^\d+(?::\d+)?$/;
/** 常见 POSIX 文件系统根路径前缀 */
const POSIX_FILE_ROOT_PREFIXES = [
  "/Users/",
  "/home/",
  "/tmp/",
  "/var/",
  "/etc/",
  "/opt/",
  "/mnt/",
  "/Volumes/",
  "/private/",
  "/root/",
] as const;

/**
 * 安全解码 URI 组件，解码失败时返回原始值
 * @param value - 待解码的字符串
 * @returns 解码后的字符串
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 分离 URL 中的路径和 hash 部分，去除查询参数
 * @param value - URL 字符串
 * @returns 路径和 hash
 */
function stripSearchAndHash(value: string): { path: string; hash: string } {
  const hashIndex = value.indexOf("#");
  const pathWithSearch = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const rawHash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const queryIndex = pathWithSearch.indexOf("?");
  const path = queryIndex >= 0 ? pathWithSearch.slice(0, queryIndex) : pathWithSearch;
  return { path, hash: rawHash };
}

/**
 * 解析 file:// URL，提取路径和 hash
 * 浏览器 URL 解析器会将 "C:/foo" 编码为 "/C:/foo"，此处做归一化处理
 * @param href - file:// URL 字符串
 * @param options - 解析选项，decodePath 为 false 时不解码路径
 * @returns 解析结果，非 file:// URL 返回 null
 */
function parseFileUrlHref(
  href: string,
  options?: { readonly decodePath?: boolean },
): { path: string; hash: string } | null {
  try {
    const parsed = new URL(href);
    if (parsed.protocol.toLowerCase() !== "file:") return null;

    const rawPath = parsed.pathname;
    if (rawPath.length === 0) return null;

    // Browser URL parser encodes "C:/foo" as "/C:/foo" for file URLs.
    const normalizedPath = /^\/[A-Za-z]:[\\/]/.test(rawPath) ? rawPath.slice(1) : rawPath;

    return {
      path: options?.decodePath === false ? normalizedPath : safeDecode(normalizedPath),
      hash: parsed.hash,
    };
  } catch {
    return null;
  }
}

/**
 * 重写 Markdown 中的 file:// URI 为本地文件路径
 * @param href - 原始 href 值
 * @returns 本地文件路径（含 hash），非 file:// URI 返回 null
 */
export function rewriteMarkdownFileUriHref(href: string | undefined): string | null {
  if (!href) return null;
  const target = parseFileUrlHref(href.trim(), { decodePath: false });
  if (!target) return null;
  return `${target.path}${target.hash}`;
}

/**
 * 判断路径是否看起来像 POSIX 文件系统路径
 * @param path - 待判断的路径
 * @returns 是否为 POSIX 文件路径
 */
function looksLikePosixFilesystemPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (POSIX_FILE_ROOT_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (POSITION_SUFFIX_PATTERN.test(path)) return true;
  const basename = path.slice(path.lastIndexOf("/") + 1);
  return /\.[A-Za-z0-9_-]+$/.test(basename);
}

/**
 * 从 URL hash 中提取行号/列号并追加到路径后
 * 支持 #L10、#L10C5 等 GitHub 风格的行号格式
 * @param path - 文件路径
 * @param hash - URL hash 部分
 * @returns 追加行号后的路径
 */
function appendLineColumnFromHash(path: string, hash: string): string {
  if (!hash || POSITION_SUFFIX_PATTERN.test(path)) return path;
  const match = hash.match(/^#L(\d+)(?:C(\d+))?$/i);
  if (!match?.[1]) return path;
  const line = match[1];
  const column = match[2];
  return `${path}:${line}${column ? `:${column}` : ""}`;
}

/**
 * 判断字符串是否像文件路径候选
 * @param path - 待判断的字符串
 * @returns 是否为文件路径候选
 */
function isLikelyPathCandidate(path: string): boolean {
  if (WINDOWS_DRIVE_PATH_PATTERN.test(path) || WINDOWS_UNC_PATH_PATTERN.test(path)) return true;
  if (RELATIVE_PATH_PREFIX_PATTERN.test(path)) return true;
  if (path.startsWith("/")) return looksLikePosixFilesystemPath(path);
  return RELATIVE_FILE_PATH_PATTERN.test(path) || RELATIVE_FILE_NAME_PATTERN.test(path);
}

/**
 * 判断路径是否为相对路径
 * @param path - 文件路径
 * @returns 是否为相对路径
 */
function isRelativePath(path: string): boolean {
  return (
    RELATIVE_PATH_PREFIX_PATTERN.test(path) ||
    (!path.startsWith("/") &&
      !WINDOWS_DRIVE_PATH_PATTERN.test(path) &&
      !WINDOWS_UNC_PATH_PATTERN.test(path))
  );
}

/**
 * 判断路径是否包含外部协议（如 http://、https://）
 * 纯行号（如 "10:5"）不算外部协议
 * @param path - 待判断的路径
 * @returns 是否包含外部协议
 */
function hasExternalScheme(path: string): boolean {
  const match = path.match(EXTERNAL_SCHEME_PATTERN);
  if (!match) return false;
  const rest = match[2] ?? "";
  if (rest.startsWith("//")) return true;
  return !POSITION_ONLY_PATTERN.test(rest);
}

/**
 * 解析 Markdown 中的文件链接目标路径
 * 支持 file:// URL、绝对路径、相对路径，自动处理行号/列号定位
 * @param href - 原始 href 值
 * @param cwd - 当前工作目录，用于解析相对路径
 * @returns 解析后的文件路径（含行号），无法解析时返回 null
 */
export function resolveMarkdownFileLinkTarget(
  href: string | undefined,
  cwd?: string,
): string | null {
  if (!href) return null;
  const rawHref = href.trim();
  if (rawHref.length === 0 || rawHref.startsWith("#")) return null;

  const fileUrlTarget = rawHref.toLowerCase().startsWith("file:")
    ? parseFileUrlHref(rawHref)
    : null;
  const source = fileUrlTarget ?? stripSearchAndHash(rawHref);
  const decodedPath = fileUrlTarget ? source.path.trim() : safeDecode(source.path.trim());
  const decodedHash = safeDecode(source.hash.trim());

  if (decodedPath.length === 0) return null;
  if (
    !WINDOWS_DRIVE_PATH_PATTERN.test(decodedPath) &&
    !WINDOWS_UNC_PATH_PATTERN.test(decodedPath) &&
    hasExternalScheme(decodedPath)
  ) {
    return null;
  }

  if (!isLikelyPathCandidate(decodedPath)) return null;

  const pathWithPosition = appendLineColumnFromHash(decodedPath, decodedHash);
  if (!isRelativePath(pathWithPosition)) {
    return pathWithPosition;
  }

  if (!cwd) return null;
  return resolvePathLinkTarget(pathWithPosition, cwd);
}
