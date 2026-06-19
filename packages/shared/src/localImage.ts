/**
 * @fileoverview 本地图片路由配置的单一事实来源（Single Source of Truth）
 * 
 * @description
 * 本模块同时服务于服务端（HTTP 路由 + 文件系统白名单）和 Web 客户端（URL 构建器 + Markdown 图片源检测），
 * 提供统一的本地图片处理配置和工具函数。
 * 
 * @module localImage
 * @layer 共享工具层（无运行时依赖）
 * 
 * @exports LOCAL_IMAGE_ROUTE_PATH - API 路由路径常量
 * @exports SUPPORTED_LOCAL_IMAGE_EXTENSIONS - 支持的图片扩展名列表
 * @exports isSupportedLocalImagePath - 判断文件路径是否为支持的本地图片
 * @exports SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX - 匹配支持扩展名的正则表达式
 * 
 * @example
 * // 服务端使用示例
 * import { LOCAL_IMAGE_ROUTE_PATH, isSupportedLocalImagePath } from './localImage';
 * 
 * app.get(`${LOCAL_IMAGE_ROUTE_PATH}/:path(*)`, (req, res) => {
 *   if (!isSupportedLocalImagePath(req.params.path)) {
 *     return res.status(400).json({ error: 'Unsupported image format' });
 *   }
 *   // 处理图片...
 * });
 * 
 * @example
 * // 客户端使用示例
 * import { SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX } from './localImage';
 * 
 * const markdownImageUrl = '/path/to/image.png';
 * if (SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test(markdownImageUrl)) {
 *   // 转换为本地图片 URL
 * }
 */

/**
 * 本地图片 API 路由路径常量
 * 
 * @description
 * 服务端通过此路径注册 HTTP 路由，客户端通过此路径构建图片访问 URL。
 * 该路径作为前后端交互的约定，确保双方对路由地址的一致性。
 * 
 * @constant {string}
 * @default "/api/local-image"
 * 
 * @example
 * // 服务端路由注册
 * app.use(LOCAL_IMAGE_ROUTE_PATH, imageRouter);
 * 
 * @example
 * // 客户端 URL 构建
 * const imageUrl = `${LOCAL_IMAGE_ROUTE_PATH}/${relativePath}`;
 */
export const LOCAL_IMAGE_ROUTE_PATH = "/api/local-image" as const;

/**
 * 服务端允许提供且客户端允许作为 Markdown 图片源的图片扩展名白名单
 * 
 * @description
 * 该数组定义了系统支持的所有本地图片格式。服务端基于此白名单进行文件访问控制，
 * 客户端基于此白名单识别和转换 Markdown 中的图片引用。
 * 
 * 所有扩展名均为小写、带前导点号（`.`）的格式。
 * 此列表为权威来源（Single Source of Truth），需与系统中其他 MIME 白名单保持同步。
 * 
 * 支持的格式包括：
 * - 常见格式：.jpg, .jpeg, .png, .gif, .svg, .webp
 * - 现代格式：.avif, .heic, .heif
 * - 其他格式：.bmp, .ico, .tiff
 * 
 * @constant {readonly string[]}
 * 
 * @example
 * // 检查特定格式是否被支持
 * if (SUPPORTED_LOCAL_IMAGE_EXTENSIONS.includes('.png')) {
 *   console.log('PNG format is supported');
 * }
 * 
 * @see {@link isSupportedLocalImagePath} - 判断文件路径是否为支持的本地图片
 * @see {@link SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX} - 匹配支持扩展名的正则表达式
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
 * 扩展名白名单的 Set 集合，用于 O(1) 时间复杂度的快速查找
 * 
 * @description
 * 由 `SUPPORTED_LOCAL_IMAGE_EXTENSIONS` 构建，确保与白名单保持一致。
 * 使用 Set 而非数组进行查找，将时间复杂度从 O(n) 降低到 O(1)。
 * 
 * @constant {ReadonlySet<string>}
 * @private 此常量为内部实现细节，不应直接使用
 * 
 * @see {@link SUPPORTED_LOCAL_IMAGE_EXTENSIONS} - 原始扩展名数组
 */
const SUPPORTED_LOCAL_IMAGE_EXTENSIONS_SET: ReadonlySet<string> = new Set(
  SUPPORTED_LOCAL_IMAGE_EXTENSIONS,
);

/**
 * 判断给定文件路径是否为支持的本地图片路径
 * 
 * @description
 * 通过提取文件路径中最后一个点号后的扩展名，并检查其是否存在于白名单集合中。
 * 该函数不区分大小写，会将扩展名转换为小写后进行匹配。
 * 
 * 算法步骤：
 * 1. 查找文件路径中最后一个点号（`.`）的位置
 * 2. 如果未找到点号，返回 false（无扩展名）
 * 3. 提取从点号开始到字符串末尾的子串（即扩展名）
 * 4. 将扩展名转换为小写
 * 5. 检查该扩展名是否存在于白名单集合中
 * 
 * 时间复杂度：O(1) - 使用 Set 进行查找
 * 空间复杂度：O(1) - 仅需存储提取的扩展名
 * 
 * @param filePath - 待检测的文件路径（可以是相对路径或绝对路径）
 * @returns 是否为支持的本地图片路径
 * @throws 此函数不会抛出异常
 * 
 * @example
 * ```ts
 * // 支持的图片格式
 * isSupportedLocalImagePath("/path/to/image.png"); // true
 * isSupportedLocalImagePath("/path/to/photo.JPG"); // true（不区分大小写）
 * isSupportedLocalImagePath("/path/to/icon.svg"); // true
 * isSupportedLocalImagePath("/path/to/modern.avif"); // true
 * 
 * // 不支持的格式
 * isSupportedLocalImagePath("/path/to/document.pdf"); // false
 * isSupportedLocalImagePath("/path/to/archive.zip"); // false
 * isSupportedLocalImagePath("/path/to/script.js"); // false
 * 
 * // 边界情况
 * isSupportedLocalImagePath("/path/to/no-extension"); // false（无扩展名）
 * isSupportedLocalImagePath("/path/to/.hidden"); // false（隐藏文件）
 * isSupportedLocalImagePath("image.PNG"); // true（相对路径）
 * ```
 * 
 * @see {@link SUPPORTED_LOCAL_IMAGE_EXTENSIONS} - 支持的扩展名列表
 * @see {@link SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX} - 匹配扩展名的正则表达式
 */
export function isSupportedLocalImagePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return SUPPORTED_LOCAL_IMAGE_EXTENSIONS_SET.has(filePath.slice(dot).toLowerCase());
}

/**
 * 匹配支持的本地图片扩展名的正则表达式
 * 
 * @description
 * 由 `SUPPORTED_LOCAL_IMAGE_EXTENSIONS` 白名单动态构建，确保 Web 端的正则匹配
 * 与服务端白名单始终保持一致，不会发生漂移。
 * 
 * 正则表达式特性：
 * - 锚定在字符串末尾（`$`），仅匹配 `.png` 样式的后缀
 * - 不区分大小写（`i` 标志）
 * - 扩展名中的特殊字符已正确转义（如 `.` 转义为 `\.`）
 * - 使用非捕获组 `(?:...)` 提高匹配性能
 * 
 * 生成的正则表达式格式：`\.(?:avif|bmp|gif|heic|heif|ico|jpeg|jpg|png|svg|tiff|webp)$`
 * 
 * @constant {RegExp}
 * 
 * @example
 * ```ts
 * // 匹配支持的格式
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("image.png"); // true
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("photo.PNG"); // true（不区分大小写）
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("icon.svg"); // true
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("modern.avif"); // true
 * 
 * // 不匹配不支持的格式
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("document.pdf"); // false
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("archive.zip"); // false
 * 
 * // 边界情况
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("image.png.bak"); // false（不是以扩展名结尾）
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test(".png"); // true（仅扩展名）
 * SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX.test("path/to/image.jpg"); // true（完整路径）
 * ```
 * 
 * @see {@link SUPPORTED_LOCAL_IMAGE_EXTENSIONS} - 支持的扩展名列表
 * @see {@link isSupportedLocalImagePath} - 判断文件路径是否为支持的本地图片
 */
export const SUPPORTED_LOCAL_IMAGE_EXTENSION_REGEX: RegExp = (() => {
  // 对每个扩展名进行转义处理，移除前导点号后对正则特殊字符进行转义
  const escaped = SUPPORTED_LOCAL_IMAGE_EXTENSIONS.map((extension) =>
    extension.slice(1).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  // 构建正则表达式：\.(?:ext1|ext2|...)$，使用 i 标志实现不区分大小写
  return new RegExp(`\\.(?:${escaped.join("|")})$`, "i");
})();
