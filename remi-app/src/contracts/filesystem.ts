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
  /** 用户输入的部分路径（用于自动补全/浏览） */
  partialPath: string;
  /** 可选的工作目录（绝对路径），作为相对路径的基准目录 */
  cwd?: string;
}

/** 文件系统浏览条目，表示单个文件或目录 */
export interface FilesystemBrowseEntry {
  /** 文件/目录名称 */
  name: string;
  /** 完整的绝对路径 */
  fullPath: string;
}

/** 文件系统浏览结果，包含父路径和条目列表 */
export interface FilesystemBrowseResult {
  /** 当前浏览的父目录路径 */
  parentPath: string;
  /** 目录下的条目列表 */
  entries: Array<FilesystemBrowseEntry>;
}
