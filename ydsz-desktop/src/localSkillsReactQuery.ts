/**
 * @file 本地技能 React Query 模块
 * @description TanStack Query 绑定，用于 `skills.listLocal` WebSocket RPC。
 *              供技能视图展示用户主目录下的技能，独立于任何 provider 会话。
 */

import type { ListLocalUserSkillsResult } from "@ydsz-buddy/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

export const localSkillsQueryKey = ["skills", "listLocal"] as const;

export function localSkillsQueryOptions() {
  return queryOptions({
    queryKey: localSkillsQueryKey,
    queryFn: async (): Promise<ListLocalUserSkillsResult> => {
      return ensureNativeApi().skills.listLocal();
    },
    staleTime: 30 * 1000,
  });
}
