/**
 * @file 文件系统浏览 Schema 定义
 * @description 定义文件系统目录浏览相关的输入输出数据结构，
 * 用于支持路径浏览、目录列表查询等功能。
 */
import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

/** 文件系统路径最大长度限制 */
const FILESYSTEM_PATH_MAX_LENGTH = 512;

/** 文件系统浏览请求输入，包含部分路径和可选的工作目录 */
export const FilesystemBrowseInput = Schema.Struct({
  partialPath: TrimmedNonEmptyString.check(Schema.isMaxLength(FILESYSTEM_PATH_MAX_LENGTH)),
  cwd: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(FILESYSTEM_PATH_MAX_LENGTH))),
});
export type FilesystemBrowseInput = typeof FilesystemBrowseInput.Type;

/** 文件系统浏览条目，表示单个文件或目录 */
export const FilesystemBrowseEntry = Schema.Struct({
  name: TrimmedNonEmptyString,
  fullPath: TrimmedNonEmptyString,
});
export type FilesystemBrowseEntry = typeof FilesystemBrowseEntry.Type;

/** 文件系统浏览结果，包含父路径和条目列表 */
export const FilesystemBrowseResult = Schema.Struct({
  parentPath: TrimmedNonEmptyString,
  entries: Schema.Array(FilesystemBrowseEntry),
});
export type FilesystemBrowseResult = typeof FilesystemBrowseResult.Type;
