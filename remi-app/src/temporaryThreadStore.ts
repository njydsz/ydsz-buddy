/**
 * @file 娑撳瓨妞傜痪璺ㄢ柤閻樿埖鈧胶顓搁悶? *
 * 缁狅紕鎮婃稉瀛樻缁捐法鈻奸惃鍕垼鐠佹壆濮搁幀浣碘偓鍌欏閺冨墎鍤庣粙瀣Ц閹稿洣绗夐棁鈧憰浣瑰瘮娑斿懎瀵查崚棰佹櫠鏉堣鐖惃鍕殠缁嬪绱? * 娓氬顩ч柅姘崇箖韫囶偅宓庨柨顔兼彥闁喎鍨卞铏规畱缁捐法鈻奸妴鍌欏▏閻?Zustand 缁绢垰鍞寸€?Store閿涘牅绗夐幐浣风畽閸栨牭绱氶敍? * 妞ょ敻娼伴崚閿嬫煀閸氬簼澶嶉弮鑸电垼鐠佹媽鍤滈崝銊︾闂勩們鈧? */

import { type ThreadId } from "~/contracts";
import { create } from "zustand";

/** 娑撳瓨妞傜痪璺ㄢ柤 Store 閻ㄥ嫮濮搁幀浣瑰复閸?*/
interface TemporaryThreadStoreState {
  /** 娑撳瓨妞傜痪璺ㄢ柤 ID 闂嗗棗鎮庨敍灞解偓闂磋礋 true 鐞涖劎銇氱拠銉у殠缁嬪璐熸稉瀛樻缁捐法鈻?*/
  temporaryThreadIds: Record<ThreadId, true | undefined>;
  /** 鐏忓棙瀵氱€规氨鍤庣粙瀣垼鐠侀璐熸稉瀛樻缁捐法鈻?*/
  markTemporaryThread: (threadId: ThreadId) => void;
  /** 濞撳懘娅庨幐鍥х暰缁捐法鈻奸惃鍕閺冭埖鐖ｇ拋?*/
  clearTemporaryThread: (threadId: ThreadId) => void;
}

/**
 * 娑撳瓨妞傜痪璺ㄢ柤 Zustand Store閵? * 缁绢垰鍞寸€涙濮搁幀渚婄礉娑撳秵瀵旀稊鍛閸?localStorage閵? * 妞ょ敻娼伴崚閿嬫煀閸氬孩澧嶉張澶夊閺冨墎鍤庣粙瀣垼鐠佹媽鍤滈崝銊︾闂勩們鈧? */
export const useTemporaryThreadStore = create<TemporaryThreadStoreState>((set) => ({
  temporaryThreadIds: {},
  markTemporaryThread: (threadId) => {
    if (threadId.length === 0) return;
    set((state) => {
      if (state.temporaryThreadIds[threadId]) {
        return state;
      }
      return {
        temporaryThreadIds: {
          ...state.temporaryThreadIds,
          [threadId]: true,
        },
      };
    });
  },
  clearTemporaryThread: (threadId) => {
    if (threadId.length === 0) return;
    set((state) => {
      if (!state.temporaryThreadIds[threadId]) {
        return state;
      }
      const nextTemporaryThreadIds = { ...state.temporaryThreadIds };
      delete nextTemporaryThreadIds[threadId];
      return { temporaryThreadIds: nextTemporaryThreadIds };
    });
  },
}));
