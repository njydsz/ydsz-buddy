/**
 * @file 閺堫剙婀撮幎鈧懗?React Query 缂佹垵鐣惧Ο鈥虫健
 * @description 娑?`skills.listLocal` WebSocket RPC 閹绘劒绶?TanStack Query 缂佹垵鐣鹃妴? *              閻劋绨幎鈧懗鍊燁潒閸ユ儳鐫嶇粈铏规暏閹磋渹瀵岄惄顔肩秿娑撳娈戦幎鈧懗鏂ょ礉娑?Provider 娴兼俺鐦介弮鐘插彠閵? */

import type { ListLocalUserSkillsResult } from "~/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

/** 閺堫剙婀撮幎鈧懗钘夊灙鐞涖劍鐓＄拠銏㈡畱 Query Key */
export const localSkillsQueryKey = ["skills", "listLocal"] as const;

/**
 * 閸掓稑缂撻張顒€婀撮幎鈧懗钘夊灙鐞涖劎娈?Query Options
 * 闁板秶鐤嗘禍?30 缁夋帞娈?staleTime 娴犮儵浼╅崗宥夘暥缁讳浇顕Ч? * @returns TanStack Query 閻?queryOptions 闁板秶鐤? */
export function localSkillsQueryOptions() {
  return queryOptions({
    queryKey: localSkillsQueryKey,
    queryFn: async (): Promise<ListLocalUserSkillsResult> => {
      return ensureNativeApi().skills.listLocal();
    },
    staleTime: 30 * 1000,
  });
}
