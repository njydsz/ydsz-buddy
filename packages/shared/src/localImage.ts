/**
 * 文件: localImage.ts
 * 用途: `/api/local-image` 路由形态的唯一数据源，同时供服务端（HTTP 路由 + 文件系统白名单）
 *       和 Web 客户端（URL 构建器 + Markdown 图片源检测）使用。
 * 层级: 共享工具（无运行时依赖）
 * 主要导出: 路由路径、图片扩展名白名单，以及基于白名单派生的辅助谓词和正则。
 */

/** 本地图片 API 路由路径 */
export const LOCAL_IMAGE_ROUTE_PATH = "/api/local-image" as const;

/**
 * 服务端允许提供、Web 客户端允许作为本地图片 Markdown 源的扩展名列表（小写，含前导点）。
 * 此列表为权威来源，需与其它地方的 MIME 白名单保持同步。
 */
export const SUPPORTED_LOCAL_IMAGE_EXTENSIONS = [
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".tiff",
  ".webp",
] as const;

/** 基于扩展名列表构建的 Set，用于 O(1) 查找 */
const SUPPORTED_LOCAL_IMAGE_EXTENSIONS_SET: ReadonlySet<string> = new Set(
  SUPPORTED_LOCAL_IMAGE_EXTENSIONS,
);

/**
 * 判断给定文件路径是否属于受支持的本地图片格式。
 * @param filePath - 待检测的文件路径。
 * @returns 若扩展名在支持列表中则返回 true。
 */
export function isSupportedLocalImagePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return SUPPORTED_LOCAL_IMAGE_EXTENSIONS_SET.has(filePath.slice(dot).toLowerCase());
}

/**
 * 基于权威扩展名列表动态构建的正则表达式，确保 Web 端正则与
 * 服务端白名单永不漂移。锚定在字符串末尾，仅匹配 `.png` 样式的后缀。
 */
export const SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX: RegExp = (() => {
  const escaped = SUPPORTED_LOCAL_IMAGE_EXTENSIONS.map((extension) =>
    extension.slice(1).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`\\.(?:${escaped.join("|")})$`, "i");
})();
