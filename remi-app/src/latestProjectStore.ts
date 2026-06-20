/**
 * @file 閺堚偓鏉╂垿銆嶉惄顔惧Ц閹胶顓搁悶? *
 * 缁狅紕鎮婇悽銊﹀煕閺堚偓鏉╂垳濞囬悽銊ф畱妞ゅ湱娲?ID閵? * 娴ｈ法鏁?Zustand + persist 娑擃參妫挎禒璺虹殺閻樿埖鈧焦瀵旀稊鍛閸?localStorage閿? * 閺€顖涘瘮鐠佸墽鐤嗛崪灞剧闂勩倖娓舵潻鎴︺€嶉惄?ID閵嗗倹绔婚梽銈嗘閸欘垱瀵氱€规岸銆嶉惄?ID 娴犮儵浼╅崗宥堫嚖閸掔姴鍙炬禒鏍€嶉惄顔炬畱鐠佹澘缍嶉妴? */

import type { ProjectId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** localStorage 娑擃厾娈戠€涙ê鍋嶉柨?*/
const LATEST_PROJECT_STORAGE_KEY = "remicode:latest-project:v1";

/** 閺堚偓鏉╂垿銆嶉惄?Store 閻ㄥ嫮濮搁幀浣瑰复閸?*/
interface LatestProjectStore {
  /** 閺堚偓鏉╂垳濞囬悽銊ф畱妞ゅ湱娲?ID閿涘本妫ゆい鍦窗閺冩湹璐?null */
  latestProjectId: ProjectId | null;
  /** 鐠佸墽鐤嗛張鈧潻鎴︺€嶉惄?ID */
  setLatestProjectId: (projectId: ProjectId) => void;
  /**
   * 濞撳懘娅庨張鈧潻鎴︺€嶉惄?ID閵?   * 娴肩姴鍙?projectId 閺冭绱濇禒鍛秼瑜版挸澧犵拋鏉跨秿閸栧綊鍘ら弮鑸靛濞撳懘娅庨敍宀勪缉閸忓秷顕ら崚鐘偓?   * 娑撳秳绱?projectId 閺冭埖妫ら弶鈥叉濞撳懘娅庨妴?   */
  clearLatestProjectId: (projectId?: ProjectId) => void;
}

/**
 * 閺堚偓鏉╂垿銆嶉惄?Zustand Store閵? * 閹镐椒绠欓崠鏍у煂 localStorage閿涘矁顔囪ぐ鏇犳暏閹撮攱娓堕崥搴濆▏閻劎娈戞い鍦窗閵? */
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
