/**
 * @file projectReactQuery.ts
 * @description 项目搜索相关的 React Query 查询配置，提供工作区条目搜索和
 * 本地文件系统条目搜索的 queryOptions，供项目选择器等组件消费。
 */

import type {
  ProjectSearchEntriesResult,
  ProjectSearchLocalEntriesResult,
} from "~/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

/** 项目查询键集合，用于 React Query 缓存管理 */
export const projectQueryKeys = {
  /** 全局查询键前缀 */
  all: ["projects"] as const,
  /**
   * 工作区条目搜索查询键
   *
   * @param cwd - 工作目录
   * @param query - 搜索关键词
   * @param limit - 结果数量限制
   */
  searchEntries: (cwd: string | null, query: string, limit: number) =>
    ["projects", "search-entries", cwd, query, limit] as const,
  /**
   * 本地文件系统条目搜索查询键
   *
   * @param rootPath - 根路径
   * @param query - 搜索关键词
   * @param limit - 结果数量限制
   */
  searchLocalEntries: (rootPath: string | null, query: string, limit: number) =>
    ["projects", "search-local-entries", rootPath, query, limit] as const,
};

/** 默认工作区条目搜索结果数量限制 */
const DEFAULT_SEARCH_ENTRIES_LIMIT = 80;
/** 默认工作区条目搜索过期时间（毫秒） */
const DEFAULT_SEARCH_ENTRIES_STALE_TIME = 15_000;
/** 默认本地条目搜索结果数量限制 */
const DEFAULT_SEARCH_LOCAL_ENTRIES_LIMIT = 50;
/** 默认本地条目搜索过期时间（毫秒） */
const DEFAULT_SEARCH_LOCAL_ENTRIES_STALE_TIME = 10_000;
/** 空的工作区条目搜索结果占位 */
const EMPTY_SEARCH_ENTRIES_RESULT: ProjectSearchEntriesResult = {
  entries: [],
  truncated: false,
};
/** 空的本地条目搜索结果占位 */
const EMPTY_SEARCH_LOCAL_ENTRIES_RESULT: ProjectSearchLocalEntriesResult = {
  entries: [],
  truncated: false,
};

/**
 * 创建工作区条目搜索查询配置
 *
 * @param input - 搜索输入参数
 * @param input.cwd - 工作目录
 * @param input.query - 搜索关键词
 * @param input.enabled - 是否启用查询
 * @param input.limit - 结果数量限制
 * @param input.staleTime - 过期时间
 * @returns React Query queryOptions 配置对象
 */
export function projectSearchEntriesQueryOptions(input: {
  cwd: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_ENTRIES_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.searchEntries(input.cwd, input.query, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace entry search is unavailable.");
      }
      return api.projects.searchEntries({
        cwd: input.cwd,
        query: input.query,
        limit,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null && input.query.length > 0,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_ENTRIES_RESULT,
  });
}

/**
 * 创建本地文件系统条目搜索查询配置
 *
 * @param input - 搜索输入参数
 * @param input.rootPath - 根路径
 * @param input.query - 搜索关键词
 * @param input.enabled - 是否启用查询
 * @param input.limit - 结果数量限制
 * @param input.includeFiles - 是否包含文件
 * @param input.staleTime - 过期时间
 * @returns React Query queryOptions 配置对象
 */
export function projectSearchLocalEntriesQueryOptions(input: {
  rootPath: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  includeFiles?: boolean;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_LOCAL_ENTRIES_LIMIT;
  const trimmedQuery = input.query.trim();
  return queryOptions({
    queryKey: projectQueryKeys.searchLocalEntries(input.rootPath, trimmedQuery, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.rootPath) {
        throw new Error("Local entry search is unavailable.");
      }
      return api.projects.searchLocalEntries({
        rootPath: input.rootPath,
        query: trimmedQuery,
        limit,
        ...(input.includeFiles !== undefined ? { includeFiles: input.includeFiles } : {}),
      });
    },
    enabled: (input.enabled ?? true) && input.rootPath !== null && trimmedQuery.length >= 2,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_LOCAL_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_LOCAL_ENTRIES_RESULT,
  });
}