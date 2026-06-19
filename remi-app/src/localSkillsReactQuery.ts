// FILE: localSkillsReactQuery.ts
// Purpose: TanStack Query bindings for the `skills.listLocal` WebSocket RPC. Used by the
//          Skills view to show the user's home-directory skills independent of any
//          provider session.
// Layer: Web React Query binding
// Exports: localSkillsQueryKey, localSkillsQueryOptions

import type { ListLocalUserSkillsResult } from "@peakcode/contracts";
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
