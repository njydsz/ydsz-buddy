/**
 * @file 项目契约模块
 *
 * 本模块定义了 ydsz 工作区中"项目"（Project）实体的所有契约，涵盖项目元数据、
 * 列表查询、创建、删除、最近使用、搜索等操作。
 *
 * ## 核心契约
 *
 * - `Project`：项目完整信息（ID、路径、名称、创建时间、最近访问等）
 * - `ProjectListInput/Result`：项目列表查询
 * - `ProjectCreateInput/Result`：创建项目（指定目录）
 * - `ProjectDeleteInput/Result`：删除项目
 * - `ProjectRecentsInput/Result`：最近使用的项目
 * - `ProjectSearchInput/Result`：项目搜索（按名称/路径）
 * - `ProjectListDirectoriesInput/Result`：浏览目录以选择项目
 * - `PROJECT_SEARCH_ENTRIES_MAX_LIMIT`：搜索结果数量上限
 *
 * ## 协议设计
 *
 * - **软删除**：项目被删除时仅标记 `isDeleted`，保留可恢复窗口
 * - **最近使用**：通过 `lastOpenedAt` 排序，最近 10 个
 * - **路径白名单**：项目根目录必须位于用户主目录下
 *
 * ## 使用场景
 *
 * - 侧边栏项目列表
 * - 启动页选择/创建项目
 * - 跨项目切换
 * - 全局项目搜索（Cmd+P）
 *
 * ## 性能注意
 *
 * - 项目列表应使用分页或限制返回数量（`PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200`）
 * - 路径浏览（`listDirectories`）仅返回直接子项
 */

import { Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
const PROJECT_SEARCH_LOCAL_ENTRIES_MAX_LIMIT = 100;
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;
const PROJECT_DIRECTORY_LIST_MAX_DEPTH = 32;

export const ProjectKind = Schema.Literal("project", "chat");
export type ProjectKind = typeof ProjectKind.Type;

export const ProjectSearchEntriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.pipe(Schema.maxLength(256)),
  limit: PositiveInt.pipe(Schema.lessThanOrEqualTo(PROJECT_SEARCH_ENTRIES_MAX_LIMIT)),
});
export type ProjectSearchEntriesInput = typeof ProjectSearchEntriesInput.Type;

const ProjectEntryKind = Schema.Literal("file", "directory");

export const ProjectEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
  parentPath: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectEntry = typeof ProjectEntry.Type;

export const ProjectDirectoryEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  parentPath: Schema.optional(TrimmedNonEmptyString),
  hasChildren: Schema.Boolean,
});
export type ProjectDirectoryEntry = typeof ProjectDirectoryEntry.Type;

export const ProjectFileSystemEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  parentPath: Schema.optional(TrimmedNonEmptyString),
  kind: ProjectEntryKind,
  hasChildren: Schema.optional(Schema.Boolean),
});
export type ProjectFileSystemEntry = typeof ProjectFileSystemEntry.Type;

export const ProjectListDirectoriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: Schema.optional(TrimmedNonEmptyString.pipe(Schema.maxLength(1024))),
  depth: Schema.optional(
    PositiveInt.pipe(Schema.lessThanOrEqualTo(PROJECT_DIRECTORY_LIST_MAX_DEPTH)),
  ),
  includeFiles: Schema.optional(Schema.Boolean),
});
export type ProjectListDirectoriesInput = typeof ProjectListDirectoriesInput.Type;

export const ProjectListDirectoriesResult = Schema.Struct({
  entries: Schema.Array(ProjectFileSystemEntry),
});
export type ProjectListDirectoriesResult = typeof ProjectListDirectoriesResult.Type;

export const ProjectSearchEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectEntry),
  truncated: Schema.Boolean,
});
export type ProjectSearchEntriesResult = typeof ProjectSearchEntriesResult.Type;

export const ProjectSearchLocalEntriesInput = Schema.Struct({
  rootPath: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.pipe(Schema.maxLength(256)),
  limit: Schema.optional(
    PositiveInt.pipe(Schema.lessThanOrEqualTo(PROJECT_SEARCH_LOCAL_ENTRIES_MAX_LIMIT)),
  ),
  includeFiles: Schema.optional(Schema.Boolean),
});
export type ProjectSearchLocalEntriesInput = typeof ProjectSearchLocalEntriesInput.Type;

export const ProjectLocalSearchEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  parentPath: Schema.optional(TrimmedNonEmptyString),
  kind: ProjectEntryKind,
});
export type ProjectLocalSearchEntry = typeof ProjectLocalSearchEntry.Type;

export const ProjectSearchLocalEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectLocalSearchEntry),
  truncated: Schema.Boolean,
});
export type ProjectSearchLocalEntriesResult = typeof ProjectSearchLocalEntriesResult.Type;

export const ProjectWriteFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.pipe(Schema.maxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  contents: Schema.String,
});
export type ProjectWriteFileInput = typeof ProjectWriteFileInput.Type;

export const ProjectWriteFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
});
export type ProjectWriteFileResult = typeof ProjectWriteFileResult.Type;
