/**
 * @file 本地图片路由工具模块
 *
 * 本模块是 `/api/local-image` 路由的单一数据源，被服务端（HTTP 路由 + 文件系统白名单）
 * 和 Web 客户端（URL 构建器 + Markdown 图片源检测）共同使用：
 *
 * - **路由路径**：`/api/local-image`
 * - **支持的扩展名**：avif, bmp, gif, heic, heif, ico, jpeg, jpg, png, svg, tiff, webp
 * - **路径检测**：判断文件路径是否为支持的本地图片
 * - **扩展名正则**：用于 Markdown 中的图片路径匹配
 *
 * ## 核心导出
 *
 * - `LOCAL_IMAGE_ROUTE_PATH`：本地图片路由路径常量
 * - `SUPPORTED_LOCAL_IMAGE_EXTENSIONS`：支持的文件扩展名数组
 * - `isSupportedLocalImagePath`：判断路径是否为支持的本地图片
 * - `SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX`：匹配扩展名的正则表达式
 *
 * ## 使用场景
 *
 * - 客户端构建本地图片的 URL
 * - 服务端验证本地图片请求的扩展名
 * - Markdown 解析时识别本地图片路径
 *
 * ## 注意事项
 *
 * - 扩展名列表必须与 MIME 类型白名单保持同步
 * - 正则表达式以字符串结尾锚定，仅匹配 `.png` 风格后缀
 */

/** 本地图片路由路径常量 */
export const LOCAL_IMAGE_ROUTE_PATH = "/api/local-image" as const;

/**
 * 支持的本地图片文件扩展名数组（带前导点，小写）。
 *
 * 服务器愿意提供且 Web 客户端愿意视为本地图片 Markdown 源的扩展名列表。
 * 此列表是权威答案，需与 MIME 白名单保持同步。
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

/**
 * 将扩展名数组转换为 Set 用于快速查找。
 */
const SUPPORTED_LOCAL_IMAGE_EXTENSIONS_SET: ReadonlySet<string> = new Set(
  SUPPORTED_LOCAL_IMAGE_EXTENSIONS,
);

/**
 * 判断给定文件路径是否为支持的本地图片。
 *
 * 通过检查文件扩展名（不区分大小写）来判断。
 *
 * @param filePath - 文件路径
 * @returns 若为支持的本地图片则返回 true
 * @example
 * ```ts
 * isSupportedLocalImagePath("/path/to/image.png") // true
 * isSupportedLocalImagePath("/path/to/document.pdf") // false
 * ```
 */
export function isSupportedLocalImagePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return SUPPORTED_LOCAL_IMAGE_EXTENSIONS_SET.has(filePath.slice(dot).toLowerCase());
}

/**
 * 匹配支持的本地图片扩展名的正则表达式。
 *
 * 基于权威扩展名列表构建，锚定于字符串结尾，仅匹配 `.png` 风格后缀。
 * Web 端的正则表达式永远不会偏离服务器白名单。
 */
export const SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX: RegExp = (() => {
  const escaped = SUPPORTED_LOCAL_IMAGE_EXTENSIONS.map((extension) =>
    extension.slice(1).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`\\.(?:${escaped.join("|")})$`, "i");
})();
