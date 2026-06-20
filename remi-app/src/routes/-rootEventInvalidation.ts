/**
 * @file 閺嶇鐭鹃悽鍙樼皑娴犺泛銇戦弫鍫濆濡€虫健
 * @description 閸掑棛琚ù浣哥础缂傛牗甯撴禍瀣╂閿涘苯鍨介弬顓炴憿娴滄稐绨ㄦ禒璺虹安鐠囥儰濞囬崗鍙橀煩閺屻儴顕楃紓鎾崇摠婢惰鲸鏅? * @layer 閺嶇鐭鹃悽鍗炰紣閸忓嘲鍤遍弫? * @exports 閹绘劒绶甸懓鍛嫲 Git 閺屻儴顕楃紓鎾崇摠閻ㄥ嫪绨ㄦ禒璺恒亼閺佸牆瀵查崚銈嗘焽閸戣姤鏆? */

import type { OrchestrationEvent, ThreadId } from "~/contracts";
import { resolveThreadWorkspaceCwd } from "~/shared/threadEnvironment";

import type { AppState } from "../store";
import { getThreadFromState } from "../threadDerivation";

/**
 * 閺傚洣娆㈤崣妯绘纯娴滃娆㈢猾璇茬€烽梿鍡楁値
 * @description 鏉╂瑤绨烘禍瀣╂娴兼艾顕遍懛瀛樻瀮娴犲墎閮寸紒鐔峰絺閻㈢喎褰夐崠鏍电礉闂団偓鐟曚椒濞囬惄绋垮彠缂傛挸鐡ㄦ径杈ㄦ櫏
 */
const FILE_CHANGE_EVENT_TYPES = new Set<OrchestrationEvent["type"]>([
  "thread.turn-diff-completed", // 鏉烆喗顐煎顔肩磽鐎佃鐦€瑰本鍨?  "thread.reverted", // 缁捐法鈻煎鎻掓礀濠?  "thread.conversation-rolled-back", // 鐎电鐦藉鎻掓礀濠?]);

/**
 * 閸掋倖鏌囬弰顖氭儊鎼存棁顕氭担鎸庡絹娓氭稖鈧懏鐓＄拠銏㈢处鐎涙ê銇戦弫? * @param event - 缂傛牗甯撴禍瀣╂鐎电钖? * @returns 婵″倹鐏夋禍瀣╂缁鐎风仦鐐扮艾閺傚洣娆㈤崣妯绘纯娴滃娆㈤敍灞藉灟鏉╂柨娲?true閿涘矁銆冪粈娲付鐟曚礁鍩涢弬鐗堝絹娓氭稖鈧懐娴夐崗宕囩处鐎? */
export function shouldInvalidateProviderQueriesForEvent(event: OrchestrationEvent): boolean {
  return FILE_CHANGE_EVENT_TYPES.has(event.type);
}

/**
 * 閸掋倖鏌囬弰顖氭儊鎼存棁顕氭担?Git 閺屻儴顕楃紓鎾崇摠婢惰鲸鏅? * @param event - 缂傛牗甯撴禍瀣╂鐎电钖? * @returns 婵″倹鐏夋禍瀣╂閺勵垱鏋冩禒璺哄綁閺囩繝绨ㄦ禒璁圭礉閹存牞鈧懏妲搁崠鍛儓閸掑棙鏁?閻滎垰顣?worktree 缁涘鍘撻弫鐗堝祦閸欐ɑ娲块惃?meta-updated 娴滃娆㈤敍灞藉灟鏉╂柨娲?true
 * @description Git 缂傛挸鐡ㄦ径杈ㄦ櫏閼煎啫娲垮В鏃€褰佹笟娑溾偓鍛处鐎涙ɑ娲块獮鍖＄礉鏉╂ê瀵橀幏顒傚殠缁嬪鍘撻弫鐗堝祦娑擃厺绗?Git 閻╃鍙ч惃鍕摟濞堥潧褰夐弴? */
export function shouldInvalidateGitQueriesForEvent(event: OrchestrationEvent): boolean {
  // 閺傚洣娆㈤崣妯绘纯娴滃娆㈣箛鍛姧闂団偓鐟曚礁鍩涢弬?Git 缂傛挸鐡?  if (FILE_CHANGE_EVENT_TYPES.has(event.type)) {
    return true;
  }

  // 闂?meta-updated 娴滃娆㈡稉宥夋付鐟曚礁顦╅悶?  if (event.type !== "thread.meta-updated") {
    return false;
  }

  // 濡偓閺?meta-updated 娴滃娆㈡稉顓熸Ц閸氾箑瀵橀崥?Git 閻╃鍙ч惃鍕帗閺佺増宓侀崣妯绘纯
  return (
    event.payload.branch !== undefined ||
    event.payload.envMode !== undefined ||
    event.payload.worktreePath !== undefined ||
    event.payload.associatedWorktreePath !== undefined ||
    event.payload.associatedWorktreeBranch !== undefined ||
    event.payload.associatedWorktreeRef !== undefined
  );
}

/**
 * 閼惧嘲褰囬棁鈧憰浣稿煕閺?Git 缂傛挸鐡ㄩ惃鍕殠缁?ID
 * @param event - 缂傛牗甯撴禍瀣╂鐎电钖? * @returns 婵″倹鐏夋禍瀣╂闂団偓鐟曚礁鍩涢弬?Git 缂傛挸鐡ㄦ稉鏂垮瘶閸氼偆鍤庣粙?ID閿涘苯鍨潻鏂挎礀鐠囥儳鍤庣粙?ID閿涘苯鎯侀崚娆掔箲閸?null
 * @description 閻劋绨€规矮缍呴棁鈧憰浣稿煕閺傛壆绱︾€涙娈戦崗铚傜秼缁捐法鈻? */
export function getGitInvalidationThreadIdForEvent(event: OrchestrationEvent): ThreadId | null {
  if (!shouldInvalidateGitQueriesForEvent(event)) {
    return null;
  }
  return "threadId" in event.payload ? (event.payload.threadId as ThreadId) : null;
}

/**
 * 鐟欙絾鐎介棁鈧憰浣稿煕閺?Git 缂傛挸鐡ㄩ惃鍕殠缁嬪浼愭担婊呮窗瑜? * @param state - 鎼存梻鏁ら悩鑸碘偓浣割嚠鐠? * @param threadId - 缁捐法鈻?ID
 * @returns 缁捐法鈻肩€电懓绨查惃鍕紣娴ｆ粎娲拌ぐ鏇＄熅瀵板嫸绱濇俊鍌涚亯閺冪姵纭剁憴锝嗙€介崚娆掔箲閸?null
 * @description 閸︺劑顣崺鐔剁皑娴犺泛绨查悽銊ユ倵鐟欙絾鐎介敍宀€鈥樻穱?worktree 閸忓啯鏆熼幑顔煎綁閺囧瓨瀵氶崥鎴炴煀閻ㄥ嫬浼愭担婊呮窗瑜? */
export function resolveGitInvalidationCwdForThreadId(
  state: AppState,
  threadId: ThreadId,
): string | null {
  // 娴兼ê鍘涙禒搴ｅЦ閹椒鑵戦懢宄板絿缁捐法鈻奸敍灞筋洤閺嬫粈绗夌€涙ê婀崚娆庣矤缁捐法鈻奸崚妤勩€冩稉顓熺叀閹?  const thread =
    getThreadFromState(state, threadId) ??
    state.threads.find((candidate) => candidate.id === threadId);
  if (!thread) {
    return null;
  }
  // 閼惧嘲褰囩痪璺ㄢ柤閹碘偓鐏炵偤銆嶉惄顔炬畱閺嶇懓浼愭担婊呮窗瑜?  const projectCwd = state.projects.find((project) => project.id === thread.projectId)?.cwd ?? null;
  // 閺嶈宓佹い鍦窗閻╊喖缍嶉妴浣哄箚婢у啯膩瀵繐鎷?worktree 鐠侯垰绶炵憴锝嗙€介張鈧紒鍫㈡畱瀹搞儰缍旈惄顔肩秿
  return resolveThreadWorkspaceCwd({
    projectCwd,
    envMode: thread.envMode,
    worktreePath: thread.worktreePath,
  });
}
