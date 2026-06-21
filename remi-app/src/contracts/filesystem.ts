/**
 * @file 文件系统契约模块
 *
 * 本模块定义了 Remi 系统与文件系统交互的所有 Schema，涵盖目录浏览、文件读取、
 * 文件搜索、目录树构造等场景的请求与响应体。
 *
 * ## 核心契约
 *
 * - `FilesystemBrowseInput/Result`：目录浏览（列出子目录）
 * - `FilesystemListInput/Result`：文件/目录列表（包含元数据）
 * - `FilesystemReadInput/Result`：文件内容读取
 * - `FilesystemSearchInput/Result`：Glob 模式搜索
 * - `FilesystemEntry`：文件系统条目（文件/目录）的统一表示
 * - `FilesystemEntryKind`：条目类型枚举（file/directory/symlink）
 *
 * ## 安全注意
 *
 * - 路径长度上限 512 字符（`FILESYSTEM_PATH_MAX_LENGTH`），防止异常输入
 * - 所有路径在前端会先经过跨平台处理（`shared/path.ts`）
 * - 后端需要校验路径是否在白名单项目根目录内
 *
 * ## 使用场景
 *
 * - Composer 中 @ 文件/目录提及选择
 * - 项目设置中选择工作目录
 * - 工具调用前定位文件路径
 *
 * ## 性能注意
 *
 * - `browse/list` 操作仅返回直接子项，避免一次性返回大型目录树
 * - 大目录应使用 `search` 配合 glob 模式分页查询
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

const FILESYSTEM_PATH_MAX_LENGTH = 512;

export const FilesystemBrowseInput = Schema.Struct({
  partialPath: TrimmedNonEmptyString.check(Schema.isMaxLength(FILESYSTEM_PATH_MAX_LENGTH)),
  cwd: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(FILESYSTEM_PATH_MAX_LENGTH))),
});
export type FilesystemBrowseInput = typeof FilesystemBrowseInput.Type;

export const FilesystemBrowseEntry = Schema.Struct({
  name: TrimmedNonEmptyString,
  fullPath: TrimmedNonEmptyString,
});
export type FilesystemBrowseEntry = typeof FilesystemBrowseEntry.Type;

export const FilesystemBrowseResult = Schema.Struct({
  parentPath: TrimmedNonEmptyString,
  entries: Schema.Array(FilesystemBrowseEntry),
});
export type FilesystemBrowseResult = typeof FilesystemBrowseResult.Type;
