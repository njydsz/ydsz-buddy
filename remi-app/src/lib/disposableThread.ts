/**
 * @file 鍙缃嚎绋嬬鐞嗘ā鍧? * @description 闅旂涓存椂绾跨▼鐨勮嚜鍔ㄥ缃喅绛栦笌璺敱鐢熷懡鍛ㄦ湡鏁堟灉銆? *              鎻愪緵鍩轰簬鍒囨崲鎰熺煡鐨勫彲澶勭疆绾跨▼娓呯悊瑙ｆ瀽鍣ㄣ€? */

import type { ThreadId } from "~/contracts";
import type { DraftThreadState } from "../composerDraftStore";

/**
 * 瑙ｆ瀽闇€瑕佸缃殑涓存椂绾跨▼ ID
 * @param input - 杈撳叆鍙傛暟
 * @param input.previousThreadId - 涓婁竴涓嚎绋?ID
 * @param input.nextThreadId - 涓嬩竴涓嚎绋?ID
 * @param input.previousThreadWasTemporary - 涓婁竴涓嚎绋嬫槸鍚︿负涓存椂绾跨▼
 * @param input.draftThreadsByThreadId - 鎸夌嚎绋?ID 绱㈠紩鐨勮崏绋跨嚎绋嬬姸鎬? * @returns 闇€瑕佸缃殑绾跨▼ ID锛屽鏋滄棤闇€澶勭疆鍒欒繑鍥?null
 */
export function resolveDisposableThreadIdToDispose(input: {
  previousThreadId: ThreadId | null;
  nextThreadId: ThreadId | null;
  previousThreadWasTemporary?: boolean;
  draftThreadsByThreadId: Record<string, DraftThreadState | undefined>;
}): ThreadId | null {
  const previousThreadId = input.previousThreadId;
  // 濡傛灉娌℃湁涓婁竴涓嚎绋嬫垨绾跨▼鏈敼鍙橈紝鍒欐棤闇€澶勭疆
  if (!previousThreadId || previousThreadId === input.nextThreadId) {
    return null;
  }
  const previousDraftThread = input.draftThreadsByThreadId[previousThreadId];
  // 浠呭綋涓婁竴涓嚎绋嬫槸涓存椂绾跨▼鏃舵墠杩斿洖澶勭疆
  if (input.previousThreadWasTemporary !== true && previousDraftThread?.isTemporary !== true) {
    return null;
  }
  return previousThreadId;
}
