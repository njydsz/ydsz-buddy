/**
 * @file 本地图片 URL 处理模块
 *
 * 本模块提供本地图片 URL 的检测和构建功能，
 * 用于 Markdown 图片预览和下载时生成认证过的本地图片 URL。
 *
 * ## 核心导出
 *
 * - `isLocalImageMarkdownSrc`：判断 Markdown 图片源是否为本地图片
 * - `buildLocalImageUrl`：构建本地图片 URL
 * - `localImageFileName`：从路径提取文件名
 *
 * ## 使用场景
 *
 * - Markdown 渲染器加载本地图片
 * - 附件下载生成认证 URL
 * - 图片预览功能
 *
 * ## 注意事项
 *
 * - 支持 Windows 绝对路径（C:\foo\bar.png）
 * - 自动携带 cwd 参数用于相对路径解析
 * - 依赖 wsHttpUrl 携带 legacy startup token
 */
import {
  LOCAL_IMAGE_ROUTE_PATH,
  SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX,
} from "@njydsz/shared/localImage";
import { isWindowsAbsolutePath } from "@njydsz/shared/path";

import { resolveWsHttpUrl } from "./wsHttpUrl";

/**
 * 归一化 Markdown 图片路径
 *
 * 处理 file:// 协议和 URL 编码的路径。
 *
 * @param src - 原始图片源
 * @returns 归一化后的路径
 */
function normalizeMarkdownImagePath(src: string): string {
  const trimmed = src.trim();
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

export function isLocalImageMarkdownSrc(src: string | undefined): src is string {
  if (!src) {
    return false;
  }
  const normalized = normalizeMarkdownImagePath(src);
  if (!SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test(normalized)) {
    return false;
  }
  // Treat Windows-style absolute paths (e.g. `C:\foo\bar.png`) as local images even though
  // their drive prefix would otherwise look like a URI scheme.
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
  // Always route through the WS-derived HTTP origin so desktop builds (custom protocol)
  // include the same legacy startup token attachments already use; in web/dev (where
  // the page and server share an origin) this falls back to the same relative path.
  return resolveWsHttpUrl(`${LOCAL_IMAGE_ROUTE_PATH}?${params.toString()}`);
}

export function localImageFileName(src: string): string {
  const normalized = normalizeMarkdownImagePath(src);
  const slash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}
