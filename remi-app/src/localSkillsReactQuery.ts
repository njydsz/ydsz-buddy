/**
 * @file 本地技�?React Query 绑定模块
 * @description �?`skills.listLocal` WebSocket RPC 提供 TanStack Query 绑定�? *              用于技能视图展示用户主目录下的技能，�?Provider 会话无关�? */

import type { ListLocalUserSkillsResult } from "~/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

/** 本地技能列表查询的 Query Key */
export const localSkillsQueryKey = ["skills", "listLocal"] as const;

/**
 * 创建本地技能列表的 Query Options
 * 配置�?30 秒的 staleTime 以避免频繁请�? * @returns TanStack Query �?queryOptions 配置
 */
export function localSkillsQueryOptions() {
  return queryOptions({
    queryKey: localSkillsQueryKey,
    queryFn: async (): Promise<ListLocalUserSkillsResult> => {
      return ensureNativeApi().skills.listLocal();
    },
    staleTime: 30 * 1000,
  });
}
