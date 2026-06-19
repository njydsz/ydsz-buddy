/**
 * @file project.ts
 * @description 项目管理相关的共享契约。定义了项目类型、文件搜索、目录列表、文件写入等操作的输入输出 Schema。
 * 支持项目级和本地级的文件/目录搜索，以及文件写入功能。
 * 客户端和服务端共享使用，用于统一项目操作相关的类型定义和校验规则。
 */

import { Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

/** 项目级文件搜索的最大返回条目数 */
const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
/** 本地文件搜索的最大返回条目数 */
const PROJECT_SEARCH_LOCAL_ENTRIES_MAX_LIMIT = 100;
/** 文件写入时相对路径的最大字符长度 */
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;
/** 目录列表的最大递归深度 */
const PROJECT_DIRECTORY_LIST_MAX_DEPTH = 32;

/** 项目类型枚举 Schema：project（项目）或 chat（聊天） */
export const ProjectKind = Schema.Literals(["project", "chat"]);
export type ProjectKind = typeof ProjectKind.Type;

/** 项目级文件搜索的输入参数 Schema，包含工作目录、搜索关键词和返回数量限制 */
export const ProjectSearchEntriesInput = Schema.Struct({
  /** 工作目录（绝对路径） */
  cwd: TrimmedNonEmptyString,
  /** 搜索关键词，最大长度 256 */
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  /** 最大返回条目数，不超过 PROJECT_SEARCH_ENTRIES_MAX_LIMIT */
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_ENTRIES_MAX_LIMIT)),
});
export type ProjectSearchEntriesInput = typeof ProjectSearchEntriesInput.Type;

/** 项目条目类型 Schema：file（文件）或 directory（目录） */
const ProjectEntryKind = Schema.Literals(["file", "directory"]);

/** 项目条目 Schema，表示搜索到的文件或目录 */
export const ProjectEntry = Schema.Struct({
  /** 条目路径 */
  path: TrimmedNonEmptyString,
  /** 条目类型（文件或目录） */
  kind: ProjectEntryKind,
  /** 父目录路径（可选） */
  parentPath: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectEntry = typeof ProjectEntry.Type;

/** 项目目录条目 Schema，用于目录列表展示，包含是否含有子节点的信息 */
export const ProjectDirectoryEntry = Schema.Struct({
  /** 目录路径 */
  path: TrimmedNonEmptyString,
  /** 目录名称 */
  name: TrimmedNonEmptyString,
  /** 父目录路径（可选） */
  parentPath: Schema.optional(TrimmedNonEmptyString),
  /** 是否含有子节点（文件或子目录） */
  hasChildren: Schema.Boolean,
});
export type ProjectDirectoryEntry = typeof ProjectDirectoryEntry.Type;

/** 项目文件系统条目 Schema，用于目录列表结果，同时支持文件和目录 */
export const ProjectFileSystemEntry = Schema.Struct({
  /** 条目路径 */
  path: TrimmedNonEmptyString,
  /** 条目名称 */
  name: TrimmedNonEmptyString,
  /** 父目录路径（可选） */
  parentPath: Schema.optional(TrimmedNonEmptyString),
  /** 条目类型（文件或目录） */
  kind: ProjectEntryKind,
  /** 是否含有子节点（可选，仅目录有效） */
  hasChildren: Schema.optional(Schema.Boolean),
});
export type ProjectFileSystemEntry = typeof ProjectFileSystemEntry.Type;

/** 列出项目目录的输入参数 Schema，支持指定相对路径、递归深度和是否包含文件 */
export const ProjectListDirectoriesInput = Schema.Struct({
  /** 工作目录（绝对路径） */
  cwd: TrimmedNonEmptyString,
  /** 相对路径（可选），相对于 cwd 的目录路径，最大长度 1024 */
  relativePath: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(1024))),
  /** 递归深度（可选），不超过 PROJECT_DIRECTORY_LIST_MAX_DEPTH */
  depth: Schema.optional(
    PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_DIRECTORY_LIST_MAX_DEPTH)),
  ),
  /** 是否包含文件（可选），默认只返回目录 */
  includeFiles: Schema.optional(Schema.Boolean),
});
export type ProjectListDirectoriesInput = typeof ProjectListDirectoriesInput.Type;

/** 列出项目目录的结果 Schema，包含文件系统条目数组 */
export const ProjectListDirectoriesResult = Schema.Struct({
  /** 文件系统条目列表 */
  entries: Schema.Array(ProjectFileSystemEntry),
});
export type ProjectListDirectoriesResult = typeof ProjectListDirectoriesResult.Type;

/** 项目级文件搜索的结果 Schema，包含匹配的条目数组和是否截断的标记 */
export const ProjectSearchEntriesResult = Schema.Struct({
  /** 匹配的条目列表 */
  entries: Schema.Array(ProjectEntry),
  /** 结果是否因达到上限而被截断 */
  truncated: Schema.Boolean,
});
export type ProjectSearchEntriesResult = typeof ProjectSearchEntriesResult.Type;

/** 本地文件搜索的输入参数 Schema，在指定根路径下搜索文件或目录 */
export const ProjectSearchLocalEntriesInput = Schema.Struct({
  /** 搜索的根路径 */
  rootPath: TrimmedNonEmptyString,
  /** 搜索关键词，最大长度 256 */
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  /** 最大返回条目数（可选），不超过 PROJECT_SEARCH_LOCAL_ENTRIES_MAX_LIMIT */
  limit: Schema.optional(
    PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_LOCAL_ENTRIES_MAX_LIMIT)),
  ),
  /** 是否包含文件（可选），默认只返回目录 */
  includeFiles: Schema.optional(Schema.Boolean),
});
export type ProjectSearchLocalEntriesInput = typeof ProjectSearchLocalEntriesInput.Type;

/** 本地搜索条目 Schema，表示本地搜索到的文件或目录 */
export const ProjectLocalSearchEntry = Schema.Struct({
  /** 条目路径 */
  path: TrimmedNonEmptyString,
  /** 条目名称 */
  name: TrimmedNonEmptyString,
  /** 父目录路径（可选） */
  parentPath: Schema.optional(TrimmedNonEmptyString),
  /** 条目类型（文件或目录） */
  kind: ProjectEntryKind,
});
export type ProjectLocalSearchEntry = typeof ProjectLocalSearchEntry.Type;

/** 本地文件搜索的结果 Schema，包含匹配的条目数组和是否截断的标记 */
export const ProjectSearchLocalEntriesResult = Schema.Struct({
  /** 匹配的条目列表 */
  entries: Schema.Array(ProjectLocalSearchEntry),
  /** 结果是否因达到上限而被截断 */
  truncated: Schema.Boolean,
});
export type ProjectSearchLocalEntriesResult = typeof ProjectSearchLocalEntriesResult.Type;

/** 写入项目文件的输入参数 Schema，包含工作目录、相对路径和文件内容 */
export const ProjectWriteFileInput = Schema.Struct({
  /** 工作目录（绝对路径） */
  cwd: TrimmedNonEmptyString,
  /** 文件相对路径，最大长度 PROJECT_WRITE_FILE_PATH_MAX_LENGTH */
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  /** 文件内容 */
  contents: Schema.String,
});
export type ProjectWriteFileInput = typeof ProjectWriteFileInput.Type;

/** 写入项目文件的结果 Schema，返回写入文件的相对路径 */
export const ProjectWriteFileResult = Schema.Struct({
  /** 写入文件的相对路径 */
  relativePath: TrimmedNonEmptyString,
});
export type ProjectWriteFileResult = typeof ProjectWriteFileResult.Type;
