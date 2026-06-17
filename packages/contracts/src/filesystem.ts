/**
 * 文件系统浏览合约定义
 *
 * 用途：定义文件系统目录浏览的请求/响应结构，供客户端与服务端共享使用。
 * 所属模块：共享契约层（Shared Contracts）
 * 主要导出：
 *   - FilesystemBrowseInput —— 浏览目录的输入参数
 *   - FilesystemBrowseEntry —— 目录条目
 *   - FilesystemBrowseResult —— 浏览结果
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

/** 文件系统路径最大长度 */
const FILESYSTEM_PATH_MAX_LENGTH = 512;

/** 浏览目录的输入参数 */
export const FilesystemBrowseInput = Schema.Struct({
  partialPath: TrimmedNonEmptyString.check(Schema.isMaxLength(FILESYSTEM_PATH_MAX_LENGTH)),
  cwd: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(FILESYSTEM_PATH_MAX_LENGTH))),
});
export type FilesystemBrowseInput = typeof FilesystemBrowseInput.Type;

/** 目录条目 */
export const FilesystemBrowseEntry = Schema.Struct({
  name: TrimmedNonEmptyString,
  fullPath: TrimmedNonEmptyString,
});
export type FilesystemBrowseEntry = typeof FilesystemBrowseEntry.Type;

/** 浏览结果 */
export const FilesystemBrowseResult = Schema.Struct({
  parentPath: TrimmedNonEmptyString,
  entries: Schema.Array(FilesystemBrowseEntry),
});
export type FilesystemBrowseResult = typeof FilesystemBrowseResult.Type;