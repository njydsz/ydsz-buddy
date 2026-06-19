/**
 * @file project.ts
 * @description 项目管理相关的共享契约。定义了项目类型、文件搜索、目录列表、文件写入等操作的输入输出类型。
 * 支持项目级和本地级的文件/目录搜索，以及文件写入功能。
 * 客户端和服务端共享使用，用于统一项目操作相关的类型定义。
 */

import type { TrimmedNonEmptyString } from "./baseSchemas";

/** 项目级文件搜索的最大返回条目数 */
const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
/** 本地文件搜索的最大返回条目数 */
const PROJECT_SEARCH_LOCAL_ENTRIES_MAX_LIMIT = 100;
/** 文件写入时相对路径的最大字符长度 */
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;
/** 目录列表的最大递归深度 */
const PROJECT_DIRECTORY_LIST_MAX_DEPTH = 32;

/** 项目类型枚举：project（项目）或 chat（聊天） */
export type ProjectKind = "project" | "chat";

/** 项目级文件搜索的输入参数，包含工作目录、搜索关键词和返回数量限制 */
export interface ProjectSearchEntriesInput {
  /** 工作目录（绝对路径） */
  cwd: typeof TrimmedNonEmptyString.Type;
  /** 搜索关键词，最大长度 256 */
  query: typeof TrimmedNonEmptyString.Type;
  /** 最大返回条目数，不超过 PROJECT_SEARCH_ENTRIES_MAX_LIMIT */
  limit: number;
}

/** 项目条目类型：file（文件）或 directory（目录） */
type ProjectEntryKind = "file" | "directory";

/** 项目条目，表示搜索到的文件或目录 */
export interface ProjectEntry {
  /** 条目路径 */
  path: typeof TrimmedNonEmptyString.Type;
  /** 条目类型（文件或目录） */
  kind: ProjectEntryKind;
  /** 父目录路径（可选） */
  parentPath?: typeof TrimmedNonEmptyString.Type;
}

/** 项目目录条目，用于目录列表展示，包含是否含有子节点的信息 */
export interface ProjectDirectoryEntry {
  /** 目录路径 */
  path: typeof TrimmedNonEmptyString.Type;
  /** 目录名称 */
  name: typeof TrimmedNonEmptyString.Type;
  /** 父目录路径（可选） */
  parentPath?: typeof TrimmedNonEmptyString.Type;
  /** 是否含有子节点（文件或子目录） */
  hasChildren: boolean;
}

/** 项目文件系统条目，用于目录列表结果，同时支持文件和目录 */
export interface ProjectFileSystemEntry {
  /** 条目路径 */
  path: typeof TrimmedNonEmptyString.Type;
  /** 条目名称 */
  name: typeof TrimmedNonEmptyString.Type;
  /** 父目录路径（可选） */
  parentPath?: typeof TrimmedNonEmptyString.Type;
  /** 条目类型（文件或目录） */
  kind: ProjectEntryKind;
  /** 是否含有子节点（可选，仅目录有效） */
  hasChildren?: boolean;
}

/** 列出项目目录的输入参数，支持指定相对路径、递归深度和是否包含文件 */
export interface ProjectListDirectoriesInput {
  /** 工作目录（绝对路径） */
  cwd: typeof TrimmedNonEmptyString.Type;
  /** 相对路径（可选），相对于 cwd 的目录路径，最大长度 1024 */
  relativePath?: typeof TrimmedNonEmptyString.Type;
  /** 递归深度（可选），不超过 PROJECT_DIRECTORY_LIST_MAX_DEPTH */
  depth?: number;
  /** 是否包含文件（可选），默认只返回目录 */
  includeFiles?: boolean;
}

/** 列出项目目录的结果，包含文件系统条目数组 */
export interface ProjectListDirectoriesResult {
  /** 文件系统条目列表 */
  entries: Array<ProjectFileSystemEntry>;
}

/** 项目级文件搜索的结果，包含匹配的条目数组和是否截断的标记 */
export interface ProjectSearchEntriesResult {
  /** 匹配的条目列表 */
  entries: Array<ProjectEntry>;
  /** 结果是否因达到上限而被截断 */
  truncated: boolean;
}

/** 本地文件搜索的输入参数，在指定根路径下搜索文件或目录 */
export interface ProjectSearchLocalEntriesInput {
  /** 搜索的根路径 */
  rootPath: typeof TrimmedNonEmptyString.Type;
  /** 搜索关键词，最大长度 256 */
  query: typeof TrimmedNonEmptyString.Type;
  /** 最大返回条目数（可选），不超过 PROJECT_SEARCH_LOCAL_ENTRIES_MAX_LIMIT */
  limit?: number;
  /** 是否包含文件（可选），默认只返回目录 */
  includeFiles?: boolean;
}

/** 本地搜索条目，表示本地搜索到的文件或目录 */
export interface ProjectLocalSearchEntry {
  /** 条目路径 */
  path: typeof TrimmedNonEmptyString.Type;
  /** 条目名称 */
  name: typeof TrimmedNonEmptyString.Type;
  /** 父目录路径（可选） */
  parentPath?: typeof TrimmedNonEmptyString.Type;
  /** 条目类型（文件或目录） */
  kind: ProjectEntryKind;
}

/** 本地文件搜索的结果，包含匹配的条目数组和是否截断的标记 */
export interface ProjectSearchLocalEntriesResult {
  /** 匹配的条目列表 */
  entries: Array<ProjectLocalSearchEntry>;
  /** 结果是否因达到上限而被截断 */
  truncated: boolean;
}

/** 写入项目文件的输入参数，包含工作目录、相对路径和文件内容 */
export interface ProjectWriteFileInput {
  /** 工作目录（绝对路径） */
  cwd: typeof TrimmedNonEmptyString.Type;
  /** 文件相对路径，最大长度 PROJECT_WRITE_FILE_PATH_MAX_LENGTH */
  relativePath: typeof TrimmedNonEmptyString.Type;
  /** 文件内容 */
  contents: string;
}

/** 写入项目文件的结果，返回写入文件的相对路径 */
export interface ProjectWriteFileResult {
  /** 写入文件的相对路径 */
  relativePath: typeof TrimmedNonEmptyString.Type;
}
