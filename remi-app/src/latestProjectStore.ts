/**
 * @file 最近项目状态管理
 *
 * 管理用户最近使用的项目 ID。
 * 使用 Zustand + persist 中间件将状态持久化到 localStorage，
 * 支持设置和清除最近项目 ID。清除时可指定项目 ID 以避免误删其他项目的记录。
 */

import type { ProjectId } from "@remi-code/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** localStorage 中的存储键 */
const LATEST_PROJECT_STORAGE_KEY = "remicode:latest-project:v1";

/** 最近项目 Store 的状态接口 */
interface LatestProjectStore {
  /** 最近使用的项目 ID，无项目时为 null */
  latestProjectId: ProjectId | null;
  /** 设置最近项目 ID */
  setLatestProjectId: (projectId: ProjectId) => void;
  /**
   * 清除最近项目 ID。
   * 传入 projectId 时，仅当当前记录匹配时才清除，避免误删。
   * 不传 projectId 时无条件清除。
   */
  clearLatestProjectId: (projectId?: ProjectId) => void;
}

/**
 * 最近项目 Zustand Store。
 * 持久化到 localStorage，记录用户最后使用的项目。
 */
export const useLatestProjectStore = create<LatestProjectStore>()(
  persist(
    (set) => ({
      latestProjectId: null,
      setLatestProjectId: (projectId) => set({ latestProjectId: projectId }),
      clearLatestProjectId: (projectId) =>
        set((state) => {
          if (projectId && state.latestProjectId !== projectId) {
            return state;
          }
          if (state.latestProjectId === null) {
            return state;
          }
          return { latestProjectId: null };
        }),
    }),
    {
      name: LATEST_PROJECT_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
