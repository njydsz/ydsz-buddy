/**
 * @file 閸欘垰顦╃純顔惧殠缁嬪顓搁悶鍡樐侀崸? * @description 闂呮梻顬囨稉瀛樻缁捐法鈻奸惃鍕殰閸斻劌顦╃純顔煎枀缁涙牔绗岀捄顖滄暠閻㈢喎鎳￠崨銊︽埂閺佸牊鐏夐妴? *              閹绘劒绶甸崺杞扮艾閸掑洦宕查幇鐔虹叀閻ㄥ嫬褰叉径鍕枂缁捐法鈻煎〒鍛倞鐟欙絾鐎介崳銊ｂ偓? */

import type { ThreadId } from "~/contracts";
import type { DraftThreadState } from "../composerDraftStore";

/**
 * 鐟欙絾鐎介棁鈧憰浣割槱缂冾喚娈戞稉瀛樻缁捐法鈻?ID
 * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.previousThreadId - 娑撳﹣绔存稉顏嗗殠缁?ID
 * @param input.nextThreadId - 娑撳绔存稉顏嗗殠缁?ID
 * @param input.previousThreadWasTemporary - 娑撳﹣绔存稉顏嗗殠缁嬪妲搁崥锔胯礋娑撳瓨妞傜痪璺ㄢ柤
 * @param input.draftThreadsByThreadId - 閹稿鍤庣粙?ID 缁便垹绱╅惃鍕磸缁嬭法鍤庣粙瀣Ц閹? * @returns 闂団偓鐟曚礁顦╃純顔炬畱缁捐法鈻?ID閿涘苯顩ч弸婊勬￥闂団偓婢跺嫮鐤嗛崚娆掔箲閸?null
 */
export function resolveDisposableThreadIdToDispose(input: {
  previousThreadId: ThreadId | null;
  nextThreadId: ThreadId | null;
  previousThreadWasTemporary?: boolean;
  draftThreadsByThreadId: Record<string, DraftThreadState | undefined>;
}): ThreadId | null {
  const previousThreadId = input.previousThreadId;
  // 婵″倹鐏夊▽鈩冩箒娑撳﹣绔存稉顏嗗殠缁嬪鍨ㄧ痪璺ㄢ柤閺堫亝鏁奸崣姗堢礉閸掓瑦妫ら棁鈧径鍕枂
  if (!previousThreadId || previousThreadId === input.nextThreadId) {
    return null;
  }
  const previousDraftThread = input.draftThreadsByThreadId[previousThreadId];
  // 娴犲懎缍嬫稉濠佺娑擃亞鍤庣粙瀣Ц娑撳瓨妞傜痪璺ㄢ柤閺冭埖澧犳潻鏂挎礀婢跺嫮鐤?  if (input.previousThreadWasTemporary !== true && previousDraftThread?.isTemporary !== true) {
    return null;
  }
  return previousThreadId;
}
