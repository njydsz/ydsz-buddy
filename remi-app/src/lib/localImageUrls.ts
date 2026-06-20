/**
 * @file 本地图片 URL 处理模块
 * @description �?Markdown 图片预览和下载构建认证的本地图片 URL�? *              依赖 wsHttpUrl（以便桌面请求携带附件使用的旧版启动令牌�? *              �?@remi-code/shared/localImage（用于规范路由和扩展名白名单）�? */

import {
  LOCAL_IMAGE_ROUTE_PATH,
  SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX,
} from "~/shared/localImage";
import { isWindowsAbsolutePath } from "~/shared/path";

import { resolveWsHttpUrl } from "./wsHttpUrl";

/**
 * 规范�?Markdown 图片路径（内部函数）
 * @param src - 原始图片路径
 * @returns 规范化后的路径（解码 URL 编码�? */
function normalizeMarkdownImagePath(src: string): string {
  const trimmed = src.trim();
  // 处理 file:// 协议
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
 * 判断是否为本地图�?Markdown �? * @param src - 图片源路�? * @returns 是否为本地图片路�? */
export function isLocalImageMarkdownSrc(src: string | undefined): src is string {
  if (!src) {
    return false;
  }
  const normalized = normalizeMarkdownImagePath(src);
  if (!SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test(normalized)) {
    return false;
  }
  // �?Windows 绝对路径（如 C:\foo\bar.png）视为本地图片，
  // 尽管其盘符前缀可能看起来像 URI 方案
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
 * 构建本地图片 URL
 * @param input - 输入参数
 * @param input.src - 图片源路�? * @param input.cwd - 当前工作目录
 * @param input.download - 是否为下载模�? * @returns 构建后的本地图片 URL
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
  // 始终通过 WS 派生�?HTTP 源路由，以便桌面版本（自定义协议�?  // 包含附件已使用的相同旧版启动令牌；在 Web/开发环境（页面和服务器共享源）
  // 中，这会回退到相同的相对路径
  return resolveWsHttpUrl(`${LOCAL_IMAGE_ROUTE_PATH}?${params.toString()}`);
}

/**
 * 从图片路径提取文件名
 * @param src - 图片路径
 * @returns 文件�? */
export function localImageFileName(src: string): string {
  const normalized = normalizeMarkdownImagePath(src);
  const slash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}
