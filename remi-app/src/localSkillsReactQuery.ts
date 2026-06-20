/**
 * @file 鏈湴鎶€鑳?React Query 缁戝畾妯″潡
 * @description 涓?`skills.listLocal` WebSocket RPC 鎻愪緵 TanStack Query 缁戝畾銆? *              鐢ㄤ簬鎶€鑳借鍥惧睍绀虹敤鎴蜂富鐩綍涓嬬殑鎶€鑳斤紝涓?Provider 浼氳瘽鏃犲叧銆? */

import type { ListLocalUserSkillsResult } from "~/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

/** 鏈湴鎶€鑳藉垪琛ㄦ煡璇㈢殑 Query Key */
export const localSkillsQueryKey = ["skills", "listLocal"] as const;

/**
 * 鍒涘缓鏈湴鎶€鑳藉垪琛ㄧ殑 Query Options
 * 閰嶇疆浜?30 绉掔殑 staleTime 浠ラ伩鍏嶉绻佽姹? * @returns TanStack Query 鐨?queryOptions 閰嶇疆
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
