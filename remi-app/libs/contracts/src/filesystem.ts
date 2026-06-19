/**
 * @file 文件系统浏览类型定义
 * @description 定义文件系统目录浏览相关的输入输出数据结构，
 * 用于支持路径浏览、目录列表查询等功能。
 */
import type { TrimmedNonEmptyString } from "./baseSchemas";

/** 文件系统路径最大长度限制 */
const FILESYSTEM_PATH_MAX_LENGTH = 512;

/** 文件系统浏览请求输入，包含部分路径和可选的工作目录 */
export interface FilesystemBrowseInput {
  partialPath: typeof TrimmedNonEmptyString.Type;
  cwd?: typeof TrimmedNonEmptyString.Type;
}

/** 文件系统浏览条目，表示单个文件或目录 */
export interface FilesystemBrowseEntry {
  name: typeof TrimmedNonEmptyString.Type;
  fullPath: typeof TrimmedNonEmptyString.Type;
}

/** 文件系统浏览结果，包含父路径和条目列表 */
export interface FilesystemBrowseResult {
  parentPath: typeof TrimmedNonEmptyString.Type;
  entries: Array<FilesystemBrowseEntry>;
}
