/**
 * @file 文件处理工具函数模块
 *
 * 本模块提供拖拽和文件处理相关的工具函数：
 *
 * - **文件大小格式化**：将字节转换为人类可读格式（B/KB/MB/GB）
 * - **MIME 类型检测**：根据文件扩展名推断 MIME 类型
 * - **文件类型分类**：将文件分类为图片、文档、视频、音频等
 * - **URL 提取**：从文本中提取 URL
 * - **文件类型图标映射**：根据文件类型返回对应的图标名称
 *
 * ## 核心导出
 *
 * - `formatFileSize(bytes)`: 格式化文件大小
 * - `getMimeType(fileName)`: 获取 MIME 类型
 * - `getFileCategory(mimeType)`: 获取文件分类
 * - `extractUrls(text)`: 从文本提取 URL
 * - `getFileIconName(fileName, mimeType)`: 获取文件图标名称
 *
 * ## 使用场景
 *
 * - 拖拽文件时显示文件信息
 * - 多文件拖拽时计算总大小
 * - 检测不支持的文件类型
 * - URL 预览卡片
 *
 * ## 注意事项
 *
 * - MIME 类型检测基于扩展名，不完全可靠
 * - 文件大小使用二进制单位（1KB = 1024B）
 * - URL 提取支持 http/https/ftp 协议
 */

/**
 * 文件大小单位配置
 */
const FILE_SIZE_UNITS = {
  B: "B",
  KB: "KB",
  MB: "MB",
  GB: "GB",
  TB: "TB",
} as const;

/**
 * 文件大小格式化阈值
 */
const FILE_SIZE_THRESHOLDS = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
} as const;

/**
 * 格式化文件大小为人类可读格式
 *
 * @param bytes - 文件大小（字节）
 * @param decimals - 小数位数，默认 2
 * @returns 格式化后的文件大小字符串
 *
 * @example
 * ```ts
 * formatFileSize(1024); // "1.00 KB"
 * formatFileSize(1048576); // "1.00 MB"
 * formatFileSize(500); // "500 B"
 * ```
 */
export function formatFileSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 B";
  if (bytes < 0 || !Number.isFinite(bytes)) return "0 B";

  const dm = decimals < 0 ? 0 : decimals;

  if (bytes < FILE_SIZE_THRESHOLDS.KB) {
    return `${bytes} ${FILE_SIZE_UNITS.B}`;
  }

  if (bytes < FILE_SIZE_THRESHOLDS.MB) {
    return `${(bytes / FILE_SIZE_THRESHOLDS.KB).toFixed(dm)} ${FILE_SIZE_UNITS.KB}`;
  }

  if (bytes < FILE_SIZE_THRESHOLDS.GB) {
    return `${(bytes / FILE_SIZE_THRESHOLDS.MB).toFixed(dm)} ${FILE_SIZE_UNITS.MB}`;
  }

  if (bytes < FILE_SIZE_THRESHOLDS.TB) {
    return `${(bytes / FILE_SIZE_THRESHOLDS.GB).toFixed(dm)} ${FILE_SIZE_UNITS.GB}`;
  }

  return `${(bytes / FILE_SIZE_THRESHOLDS.TB).toFixed(dm)} ${FILE_SIZE_UNITS.TB}`;
}

/**
 * 文件分类类型
 */
export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "code"
  | "data"
  | "unknown";

/**
 * 文件分类配置
 */
const FILE_CATEGORY_CONFIG: Record<FileCategory, { label: string; extensions: string[] }> = {
  image: {
    label: "图片",
    extensions: [
      "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico",
      "tiff", "tif", "avif", "heic", "heif",
    ],
  },
  video: {
    label: "视频",
    extensions: [
      "mp4", "webm", "ogg", "mov", "avi", "mkv", "flv", "wmv",
      "m4v", "3gp",
    ],
  },
  audio: {
    label: "音频",
    extensions: [
      "mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus",
    ],
  },
  document: {
    label: "文档",
    extensions: [
      "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt",
      "rtf", "md", "markdown", "odt", "ods", "odp",
    ],
  },
  archive: {
    label: "压缩包",
    extensions: [
      "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz",
    ],
  },
  code: {
    label: "代码",
    extensions: [
      "js", "ts", "jsx", "tsx", "py", "java", "cpp", "c", "h",
      "cs", "go", "rs", "rb", "php", "swift", "kt", "scala",
      "html", "css", "scss", "less", "json", "xml", "yaml", "yml",
    ],
  },
  data: {
    label: "数据",
    extensions: [
      "csv", "tsv", "sql", "db", "sqlite", "parquet",
    ],
  },
  unknown: {
    label: "未知",
    extensions: [],
  },
};

/**
 * 扩展名到文件分类的映射（运行时构建）
 */
const EXTENSION_TO_CATEGORY: Map<string, FileCategory> = new Map();

// 初始化映射
for (const [category, config] of Object.entries(FILE_CATEGORY_CONFIG)) {
  for (const ext of config.extensions) {
    EXTENSION_TO_CATEGORY.set(ext.toLowerCase(), category as FileCategory);
  }
}

/**
 * 从文件名提取扩展名
 *
 * @param fileName - 文件名
 * @returns 扩展名（不含点号，小写）
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return "";
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * 根据文件扩展名获取文件分类
 *
 * @param fileName - 文件名
 * @returns 文件分类
 *
 * @example
 * ```ts
 * getFileCategory("photo.jpg"); // "image"
 * getFileCategory("video.mp4"); // "video"
 * getFileCategory("unknown.xyz"); // "unknown"
 * ```
 */
export function getFileCategory(fileName: string): FileCategory {
  const ext = getFileExtension(fileName);
  if (!ext) return "unknown";
  return EXTENSION_TO_CATEGORY.get(ext) ?? "unknown";
}

/**
 * 根据文件分类获取分类标签
 *
 * @param category - 文件分类
 * @returns 分类标签（中文）
 */
export function getCategoryLabel(category: FileCategory): string {
  return FILE_CATEGORY_CONFIG[category]?.label ?? "未知";
}

/**
 * MIME 类型映射（基于扩展名）
 */
const MIME_TYPE_MAP: Record<string, string> = {
  // 图片
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",

  // 视频
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
  m4v: "video/mp4",
  "3gp": "video/3gpp",

  // 音频
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  wma: "audio/x-ms-wma",
  opus: "audio/opus",

  // 文档
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  rtf: "application/rtf",
  md: "text/markdown",
  markdown: "text/markdown",

  // 代码
  js: "text/javascript",
  ts: "text/typescript",
  jsx: "text/javascript",
  tsx: "text/typescript",
  py: "text/x-python",
  java: "text/x-java-source",
  cpp: "text/x-c++src",
  c: "text/x-csrc",
  h: "text/x-chdr",
  cs: "text/x-csharp",
  go: "text/x-go",
  rs: "text/x-rust",
  rb: "text/x-ruby",
  php: "text/x-php",
  swift: "text/x-swift",
  kt: "text/x-kotlin",
  scala: "text/x-scala",
  html: "text/html",
  css: "text/css",
  scss: "text/x-scss",
  less: "text/x-less",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/x-yaml",
  yml: "application/x-yaml",

  // 数据
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  sql: "application/sql",

  // 压缩包
  zip: "application/zip",
  rar: "application/x-rar-compressed",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  bz2: "application/x-bzip2",
  xz: "application/x-xz",
  tgz: "application/gzip",
};

/**
 * 根据文件名获取 MIME 类型
 *
 * @param fileName - 文件名
 * @returns MIME 类型字符串，未知类型返回 "application/octet-stream"
 *
 * @example
 * ```ts
 * getMimeType("photo.jpg"); // "image/jpeg"
 * getMimeType("document.pdf"); // "application/pdf"
 * getMimeType("unknown.xyz"); // "application/octet-stream"
 * ```
 */
export function getMimeType(fileName: string): string {
  const ext = getFileExtension(fileName);
  if (!ext) return "application/octet-stream";
  return MIME_TYPE_MAP[ext] ?? "application/octet-stream";
}

/**
 * 文件类型图标映射
 */
const FILE_ICON_MAP: Record<FileCategory, string> = {
  image: "image",
  video: "video",
  audio: "music",
  document: "file-text",
  archive: "archive",
  code: "code",
  data: "database",
  unknown: "file",
};

/**
 * 根据文件名获取文件图标名称
 *
 * @param fileName - 文件名
 * @returns 图标名称（lucide-react 图标名）
 *
 * @example
 * ```ts
 * getFileIconName("photo.jpg"); // "image"
 * getFileIconName("video.mp4"); // "video"
 * getFileIconName("unknown.xyz"); // "file"
 * ```
 */
export function getFileIconName(fileName: string): string {
  const category = getFileCategory(fileName);
  return FILE_ICON_MAP[category] ?? "file";
}

/**
 * 检查文件类型是否受支持
 *
 * @param fileName - 文件名
 * @returns 是否受支持
 *
 * @description
 * 当前不支持的文件类型：
 * - 可执行文件（.exe, .msi, .app, .dmg）
 * - 系统文件（.dll, .sys, .so, .dylib）
 * - 其他潜在危险文件
 */
export function isFileTypeSupported(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  if (!ext) return true; // 无扩展名允许

  const unsupportedExtensions = [
    "exe", "msi", "app", "dmg", "deb", "rpm", "pkg",
    "dll", "sys", "so", "dylib",
    "bat", "cmd", "sh", "ps1", "bash",
    "vbs", "wsf", "scr",
  ];

  return !unsupportedExtensions.includes(ext.toLowerCase());
}

/**
 * URL 正则表达式
 */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

/**
 * 从文本中提取 URL
 *
 * @param text - 输入文本
 * @returns URL 数组
 *
 * @example
 * ```ts
 * extractUrls("Check out https://example.com and http://test.com");
 * // ["https://example.com", "http://test.com"]
 * ```
 */
export function extractUrls(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const matches = text.match(URL_REGEX);
  return matches ?? [];
}

/**
 * 检查文本是否包含 URL
 *
 * @param text - 输入文本
 * @returns 是否包含 URL
 */
export function containsUrl(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return URL_REGEX.test(text);
}

/**
 * 从 DataTransfer 对象提取文件信息
 *
 * @param dataTransfer - DataTransfer 对象
 * @returns 文件信息数组
 */
export function extractFilesFromDataTransfer(dataTransfer: DataTransfer): FileInfo[] {
  const files: FileInfo[] = [];

  if (!dataTransfer.files || dataTransfer.files.length === 0) {
    return files;
  }

  for (let i = 0; i < dataTransfer.files.length; i++) {
    const file = dataTransfer.files[i];
    if (!file) continue;

    // C-6: 目录占位条目的标志是 size===0 && type==="",
    // 这种情况下要保留空 type,不能被 getMimeType 默认值覆盖。
    const isLikelyDir = file.size === 0 && file.type === "";
    const resolvedType = isLikelyDir
      ? ""
      : file.type || getMimeType(file.name);

    files.push({
      name: file.name,
      size: file.size,
      type: resolvedType,
      category: isLikelyDir ? "unknown" : getFileCategory(file.name),
      icon: isLikelyDir ? "file" : getFileIconName(file.name),
      supported: isLikelyDir ? false : isFileTypeSupported(file.name),
    });
  }

  return files;
}

/**
 * 文件信息接口
 */
export interface FileInfo {
  /** 文件名 */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** MIME 类型 */
  type: string;
  /** 文件分类 */
  category: FileCategory;
  /** 图标名称 */
  icon: string;
  /** 是否受支持 */
  supported: boolean;
}

/**
 * 计算文件总大小
 *
 * @param files - 文件信息数组
 * @returns 总大小（字节）
 */
export function calculateTotalFileSize(files: FileInfo[]): number {
  return files.reduce((total, file) => total + file.size, 0);
}

/**
 * 检查是否有任何不支持的文件
 *
 * @param files - 文件信息数组
 * @returns 是否包含不支持的文件
 */
export function hasUnsupportedFiles(files: FileInfo[]): boolean {
  return files.some((file) => !file.supported);
}

/**
 * 获取不支持的文件列表
 *
 * @param files - 文件信息数组
 * @returns 不支持的文件数组
 */
export function getUnsupportedFiles(files: FileInfo[]): FileInfo[] {
  return files.filter((file) => !file.supported);
}

// =============================================================================
// C-6 拖拽体验增强：类型分布 + 大文件警告
// =============================================================================

/** 大文件确认阈值（字节）— 50 MB */
export const LARGE_FILE_CONFIRMATION_THRESHOLD_BYTES = 50 * 1024 * 1024;

/** 文件类型分布条目 */
export interface FileCategoryDistributionEntry {
  category: FileCategory;
  count: number;
  totalSize: number;
}

/**
 * 汇总文件类型分布：按 category 分组，统计数量 + 总大小，按数量降序。
 *
 * 用法：拖入 N 个文件时，UI 摘要区可显示 "图片 3 · 文档 2 · 视频 1"。
 *
 * @param files - 文件信息数组
 * @returns 按 count 降序排序的分布列表
 */
export function summarizeFileCategoryDistribution(
  files: ReadonlyArray<FileInfo>,
): FileCategoryDistributionEntry[] {
  const map = new Map<FileCategory, FileCategoryDistributionEntry>();
  for (const file of files) {
    const entry = map.get(file.category) ?? {
      category: file.category,
      count: 0,
      totalSize: 0,
    };
    entry.count += 1;
    entry.totalSize += file.size;
    map.set(file.category, entry);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.totalSize - a.totalSize;
  });
}

/**
 * 单文件大小超过 50MB 时需要弹确认条（"作为附件 / 跳过"）。
 *
 * 仅在多文件拖入（>= 2）或单文件拖入（= 1）时判断；
 * 0 文件返回 false。
 *
 * @param files - 文件信息数组
 * @param threshold - 自定义阈值（字节），默认 50MB
 * @returns 是否存在需要确认的大文件
 */
export function isLargeFileForConfirmation(
  files: ReadonlyArray<FileInfo>,
  threshold: number = LARGE_FILE_CONFIRMATION_THRESHOLD_BYTES,
): boolean {
  if (files.length === 0) return false;
  return files.some((file) => file.size > threshold);
}

/**
 * 获取所有超过阈值的大文件列表（按 size 降序）。
 *
 * @param files - 文件信息数组
 * @param threshold - 自定义阈值（字节），默认 50MB
 * @returns 大文件列表
 */
export function listLargeFilesForConfirmation(
  files: ReadonlyArray<FileInfo>,
  threshold: number = LARGE_FILE_CONFIRMATION_THRESHOLD_BYTES,
): FileInfo[] {
  return files.filter((file) => file.size > threshold).sort((a, b) => b.size - a.size);
}

// =============================================================================
// C-6 文件夹拖入支持:目录检测 / 展开 / 合并
// =============================================================================

/**
 * 拖拽条目的最小可读字段(允许传入 File / FileInfo / 任意模拟对象)。
 */
export interface FileLike {
  name: string;
  size: number;
  type: string;
}

/**
 * 目录读取器签名 — 由调用方注入(通常包装 tauriBridge.fs.readDir)。
 *
 * @param path - 目录绝对路径
 * @returns 子条目列表(name + isDirectory)
 */
export type DirectoryReader = (
  path: string,
) => Promise<Array<{ name: string; isDirectory: boolean }>>;

/**
 * 目录汇总信息:用于 UI 提示"包含 Y 个文件,是否全部提及?"。
 */
export interface DirectorySummary {
  /** 拖入条目中识别出的目录条目数量 */
  count: number;
  /** 目录名列表(按出现顺序) */
  names: string[];
}

/**
 * 启发式判断一个文件条目是否为目录。
 *
 * ## 浏览器行为差异
 *
 * - Chromium 系(Tauri 默认 webview):拖入文件夹时,dataTransfer.files 会有一个
 *   name 为文件夹名、size === 0、type === '' 的条目
 * - Firefox / Webkit 系:可能根本没有目录条目,需要依赖 Tauri 原生 drag-drop
 *   事件才能拿到 path
 *
 * 因此该函数仅作"提示"用,真正可靠的方案是结合 Tauri 的 onDragDropEvent。
 *
 * @param file - 来自拖拽的 File 条目
 * @returns 是否疑似目录
 */
export function isLikelyDirectoryEntry(file: FileLike | null | undefined): boolean {
  if (!file || !file.name) return false;
  // size === 0 + type === '' 是 Chromium 系 webview 拖入目录时的标志
  if (file.size === 0 && file.type === "") return true;
  return false;
}

/**
 * 汇总拖入条目中的目录信息:数量 + 名称列表(按出现顺序)。
 *
 * @param files - 拖拽条目列表(File / FileInfo / FileLike)
 * @returns 目录汇总
 */
export function summarizeDirectoryEntries(
  files: ReadonlyArray<FileLike>,
): DirectorySummary {
  const names: string[] = [];
  for (const file of files) {
    if (isLikelyDirectoryEntry(file)) {
      names.push(file.name);
    }
  }
  return { count: names.length, names };
}

/**
 * 异步展开一组目录路径为 FileInfo 列表。
 *
 * 该函数仅调用注入的 readDirectory 读直接子项;默认 maxDepth=1,只展开顶层。
 * 用户可在 UI 上选择"递归"或"仅顶层"。
 *
 * @param directoryPaths - 目录路径列表
 * @param readDirectory - 读目录实现(由调用方注入)
 * @param options - 选项
 * @returns 展开后的 FileInfo 列表(失败时返回空数组并把错误写到 errors 字段)
 */
export interface ExpandDirectoriesResult {
  files: FileInfo[];
  errors: Array<{ path: string; message: string }>;
}

/**
 * 路径分隔符检测:Windows 反斜杠 vs POSIX 斜杠。
 */
function detectPathSeparator(path: string): string {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

/**
 * 拼接父子目录路径,处理 Windows / POSIX 分隔符。
 */
function joinPath(parent: string, child: string): string {
  const sep = detectPathSeparator(parent);
  if (parent.endsWith(sep) || parent.endsWith("/") || parent.endsWith("\\")) {
    return parent + child;
  }
  return parent + sep + child;
}

export async function expandDirectoryEntries(
  directoryPaths: ReadonlyArray<string>,
  readDirectory: DirectoryReader,
  options: { maxDepth?: number } = {},
): Promise<ExpandDirectoriesResult> {
  const result: ExpandDirectoriesResult = { files: [], errors: [] };
  const maxDepth = options.maxDepth ?? 1;

  async function walk(currentPath: string, depth: number, prefix: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory: boolean }>;
    try {
      entries = await readDirectory(currentPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ path: currentPath, message });
      return;
    }

    for (const entry of entries) {
      const displayName = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        if (depth < maxDepth) {
          await walk(joinPath(currentPath, entry.name), depth + 1, displayName);
        } else {
          // 超过深度限制:保留目录条目作为 "unknown" 类别记录
          result.files.push({
            name: displayName,
            size: 0,
            type: "",
            category: "unknown",
            icon: "file",
            supported: false,
          });
        }
      } else {
        result.files.push({
          name: displayName,
          size: 0,
          type: getMimeType(entry.name),
          category: getFileCategory(entry.name),
          icon: getFileIconName(entry.name),
          supported: isFileTypeSupported(entry.name),
        });
      }
    }
  }

  for (const path of directoryPaths) {
    await walk(path, 1, "");
  }
  return result;
}

/**
 * 把展开后的目录子文件合并回原始拖拽条目列表:
 *
 * - 原始列表中的"目录条目"被替换为展开后的子文件
 * - 其他普通文件保持原位
 * - 展开后无内容的目录会被移除
 *
 * @param original - 拖拽时的原始 FileInfo 列表(可能包含目录占位)
 * @param expanded - 展开后的子文件列表(已按目录分组)
 * @returns 合并后的 FileInfo 列表
 */
export function mergeExpandedDirectoryEntries(
  original: ReadonlyArray<FileInfo>,
  expanded: ReadonlyArray<FileInfo>,
): FileInfo[] {
  if (original.length === 0) return [];
  // 检查是否存在目录条目(启发式:size=0 + type='')
  const hasDirectories = original.some(
    (f) => f.size === 0 && f.type === "",
  );
  if (!hasDirectories) return [...original];

  // 按目录名分桶展开结果
  const buckets = new Map<string, FileInfo[]>();
  for (const file of expanded) {
    const slash = file.name.indexOf("/");
    if (slash === -1) {
      // 没有目录前缀,放进"无目录"桶
      const arr = buckets.get("") ?? [];
      arr.push(file);
      buckets.set("", arr);
      continue;
    }
    const dir = file.name.slice(0, slash);
    const arr = buckets.get(dir) ?? [];
    arr.push(file);
    buckets.set(dir, arr);
  }

  const result: FileInfo[] = [];
  for (const item of original) {
    if (item.size === 0 && item.type === "") {
      // 目录条目:替换为展开后的子文件
      const children = buckets.get(item.name) ?? [];
      for (const child of children) {
        result.push(child);
      }
    } else {
      // 普通文件:保持原位
      result.push(item);
    }
  }
  return result;
}
