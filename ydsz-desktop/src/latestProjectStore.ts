/**
 * @file 最近项目跟踪模块
 * @description 持久化跟踪用户最近使用的项目 ID，用于快速访问和项目切换。
 */

import type { ProjectId } from "@ydsz-buddy/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 最近项目存储键名 */
const LATEST_PROJECT_STORAGE_KEY = "ydsz-buddy:latest-project:v1";

/** 最近项目 Store 接口 */
interface LatestProjectStore {
  /** 最近使用的项目 ID */
  latestProjectId: ProjectId | null;
  /** 设置最近项目 ID */
  setLatestProjectId: (projectId: ProjectId) => void;
  /** 清除最近项目 ID */
  clearLatestProjectId: (projectId?: ProjectId) => void;
}

/** 最近项目状态管理 Store */
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
