/**
 * @file 鏈€杩戦」鐩姸鎬佺鐞? *
 * 绠＄悊鐢ㄦ埛鏈€杩戜娇鐢ㄧ殑椤圭洰 ID銆? * 浣跨敤 Zustand + persist 涓棿浠跺皢鐘舵€佹寔涔呭寲鍒?localStorage锛? * 鏀寔璁剧疆鍜屾竻闄ゆ渶杩戦」鐩?ID銆傛竻闄ゆ椂鍙寚瀹氶」鐩?ID 浠ラ伩鍏嶈鍒犲叾浠栭」鐩殑璁板綍銆? */

import type { ProjectId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** localStorage 涓殑瀛樺偍閿?*/
const LATEST_PROJECT_STORAGE_KEY = "remicode:latest-project:v1";

/** 鏈€杩戦」鐩?Store 鐨勭姸鎬佹帴鍙?*/
interface LatestProjectStore {
  /** 鏈€杩戜娇鐢ㄧ殑椤圭洰 ID锛屾棤椤圭洰鏃朵负 null */
  latestProjectId: ProjectId | null;
  /** 璁剧疆鏈€杩戦」鐩?ID */
  setLatestProjectId: (projectId: ProjectId) => void;
  /**
   * 娓呴櫎鏈€杩戦」鐩?ID銆?   * 浼犲叆 projectId 鏃讹紝浠呭綋褰撳墠璁板綍鍖归厤鏃舵墠娓呴櫎锛岄伩鍏嶈鍒犮€?   * 涓嶄紶 projectId 鏃舵棤鏉′欢娓呴櫎銆?   */
  clearLatestProjectId: (projectId?: ProjectId) => void;
}

/**
 * 鏈€杩戦」鐩?Zustand Store銆? * 鎸佷箙鍖栧埌 localStorage锛岃褰曠敤鎴锋渶鍚庝娇鐢ㄧ殑椤圭洰銆? */
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
