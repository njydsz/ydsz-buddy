// FILE: localImage.ts
// Purpose: 本地图片路由配置的单一事实来源（Single Source of Truth）。
//          同时服务于服务端（HTTP 路由 + 文件系统白名单）和 Web 客户端（URL 构建器 + Markdown 图片源检测）。
// Layer: 共享工具层（无运行时依赖）
// Exports: 路由路径、支持的图片扩展名白名单，以及基于白名单派生的辅助判断函数。

/**
 * 本地图片 API 路由路径常量
 * 服务端通过此路径注册 HTTP 路由，客户端通过此路径构建图片访问 URL。
 */
export const LOCAL_IMAGE_ROUTE_PATH = "/api/local-image" as const;

/**
 * 服务端允许提供且客户端允许作为 Markdown 图片源的图片扩展名白名单。
 *
 * 所有扩展名均为小写、带前导点号（`.`）的格式。
 * 此列表为权威来源，需与系统中其他 MIME 白名单保持同步。
 *
 * 支持的格式包括：
 * - 常见格式：.jpg, .jpeg, .png, .gif, .svg, .webp
 * - 现代格式：.avif, .heic, .heif
 * - 其他格式：.bmp, .ico, .tiff
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
 * 扩展名白名单的 Set 集合，用于 O(1) 时间复杂度的快速查找。
 * 由 `SUPPORTED_LOCAL_IMAGE_EXTENSIONS` 构建，确保与白名单保持一致。
 */
const SUPPORTED_LOCAL_IMAGE_EXTENSIONS_SET: ReadonlySet<string> = new Set(
  SUPPORTED_LOCAL_IMAGE_EXTENSIONS,
);

/**
 * 判断给定文件路径是否为支持的本地图片路径
 *
 * 通过提取文件路径中最后一个点号后的扩展名，
 * 并检查其是否存在于白名单集合中（不区分大小写）。
 *
 * @param filePath - 待检测的文件路径
 * @returns 是否为支持的本地图片路径
 *
 * @example
 * ```ts
 * isSupportedLocalImagePath("/path/to/image.png"); // true
 * isSupportedLocalImagePath("/path/to/document.pdf"); // false
 * isSupportedLocalImagePath("/path/to/no-extension"); // false
 * ```
 */
export function isSupportedLocalImagePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return SUPPORTED_LOCAL_IMAGE_EXTENSIONS_SET.has(filePath.slice(dot).toLowerCase());
}

/**
 * 匹配支持的本地图片扩展名的正则表达式
 *
 * 由 `SUPPORTED_LOCAL_IMAGE_EXTENSIONS` 白名单动态构建，
 * 确保 Web 端的正则匹配与服务端白名单始终保持一致，不会发生漂移。
 *
 * 特性：
 * - 锚定在字符串末尾（`$`），仅匹配 `.png` 样式的后缀
 * - 不区分大小写（`i` 标志）
 * - 扩展名中的特殊字符已正确转义
 *
 * @example
 * ```ts
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("image.png"); // true
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("image.PNG"); // true（不区分大小写）
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("image.pdf"); // false
 * ```
 */
export const SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX: RegExp = (() => {
  // 对每个扩展名进行转义处理，移除前导点号后对正则特殊字符进行转义
  const escaped = SUPPORTED_LOCAL_IMAGE_EXTENSIONS.map((extension) =>
    extension.slice(1).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  return new RegExp(`\\.(?:${escaped.join("|")})$`, "i");
})();
