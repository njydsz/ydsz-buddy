/**
 * @file threadEnvironment.ts
 * @description 缁捐法鈻奸悳顖氼暔闁板秶鐤嗙憴锝嗙€藉銉ュ徔濡€虫健
 * @purpose 閹绘劒绶电痪璺ㄢ柤瀹搞儰缍旈崠铏瑰Ц閹降鈧胶骞嗘晶鍐┠佸蹇撴嫲瀹搞儰缍旈惄顔肩秿鐟欙絾鐎介惃鍕彙娴滎偄浼愰崗宄板毐閺? * @exports 閻滎垰顣ㄥΟ鈥崇础鐟欙絾鐎介妴浣镐紣娴ｆ粌灏悩鑸碘偓浣稿灲閺傤厹鈧礁浼愭担婊呮窗瑜版洝袙閺嬫劗鐡戝銉ュ徔閸戣姤鏆? */

import type { ThreadEnvironmentMode } from "~/contracts";

/**
 * @type ResolvedThreadWorkspaceState
 * @description 鐟欙絾鐎介崥搴ｆ畱缁捐法鈻煎銉ょ稊閸栬櫣濮搁幀浣鸿閸? * @property {"local"} local - 閺堫剙婀村Ο鈥崇础閿涘瞼娲块幒銉ゅ▏閻劑銆嶉惄顔界壌閻╊喖缍? * @property {"worktree-pending"} worktree-pending - Worktree 濡€崇础娴ｅ棗鐨婚張顏勬皑缂侇亷绱欑捄顖氱窞閺堫亝褰佹笟娑崇礆
 * @property {"worktree-ready"} worktree-ready - Worktree 濡€崇础娑撴柨鍑＄亸杈╁崕閿涘牐鐭惧鍕嚒閹绘劒绶甸敍? */
export type ResolvedThreadWorkspaceState = "local" | "worktree-pending" | "worktree-ready";

/**
 * @function resolveThreadEnvironmentMode
 * @description 鐟欙絾鐎界痪璺ㄢ柤閻滎垰顣ㄥΟ鈥崇础
 * @param {Object} input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 閻滎垰顣ㄥΟ鈥崇础闁板秶鐤? * @param {string | null | undefined} input.worktreePath - Worktree 鐠侯垰绶? * @returns {ThreadEnvironmentMode} 鐟欙絾鐎介崥搴ｆ畱閻滎垰顣ㄥΟ鈥崇础
 * @note 婵″倹鐏夐幓鎰返娴?worktreePath閿涘苯鍨鍝勫煑鏉╂柨娲?"worktree" 濡€崇础閿涙稑鎯侀崚娆庡▏閻劑鍘ょ純顔炬畱濡€崇础閹存牠绮拋?"local"
 */
export function resolveThreadEnvironmentMode(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): ThreadEnvironmentMode {
  // 婵″倹鐏夌€涙ê婀?worktree 鐠侯垰绶為敍宀冾嚛閺勫孩妲?worktree 濡€崇础
  if (input.worktreePath) {
    return "worktree";
  }
  // 閸氾箑鍨担璺ㄦ暏闁板秶鐤嗛惃鍕佸蹇ョ礉閺堫亪鍘ょ純顔煎灟姒涙顓绘稉?local
  return input.envMode ?? "local";
}

/**
 * @function resolveThreadWorkspaceState
 * @description 鐟欙絾鐎界痪璺ㄢ柤瀹搞儰缍旈崠铏瑰Ц閹? * @param {Object} input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 閻滎垰顣ㄥΟ鈥崇础闁板秶鐤? * @param {string | null | undefined} input.worktreePath - Worktree 鐠侯垰绶? * @returns {ResolvedThreadWorkspaceState} 鐟欙絾鐎介崥搴ｆ畱瀹搞儰缍旈崠铏瑰Ц閹? * @note 閺嶈宓侀悳顖氼暔濡€崇础閸?worktree 鐠侯垰绶為崚銈嗘焽瀹搞儰缍旈崠鐑樻Ц閸氾箑姘ㄧ紒? */
export function resolveThreadWorkspaceState(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): ResolvedThreadWorkspaceState {
  const mode = resolveThreadEnvironmentMode(input);
  // 閺堫剙婀村Ο鈥崇础閻╁瓨甯存潻鏂挎礀 local
  if (mode === "local") {
    return "local";
  }
  // worktree 濡€崇础娑撳绱濋弽瑙勫祦鐠侯垰绶為弰顖氭儊鐎涙ê婀崚銈嗘焽鐏忚京鍗庨悩鑸碘偓?  return input.worktreePath ? "worktree-ready" : "worktree-pending";
}

/**
 * @function isPendingThreadWorktree
 * @description 閸掋倖鏌囩痪璺ㄢ柤閻?worktree 閺勵垰鎯佹径鍕艾瀵板懎姘ㄧ紒顏嗗Ц閹? * @param {Object} input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 閻滎垰顣ㄥΟ鈥崇础闁板秶鐤? * @param {string | null | undefined} input.worktreePath - Worktree 鐠侯垰绶? * @returns {boolean} 婵″倹鐏?worktree 瀵板懎姘ㄧ紒顏囩箲閸?true閿涘苯鎯侀崚娆掔箲閸?false
 */
export function isPendingThreadWorktree(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): boolean {
  return resolveThreadWorkspaceState(input) === "worktree-pending";
}

/**
 * @function resolveThreadWorkspaceCwd
 * @description 鐟欙絾鐎界痪璺ㄢ柤瀹搞儰缍旈崠铏规畱瑜版挸澧犲銉ょ稊閻╊喖缍嶉敍鍦昗D閿? * @param {Object} input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param {string | null | undefined} input.projectCwd - 妞ゅ湱娲伴弽鍦窗瑜? * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 閻滎垰顣ㄥΟ鈥崇础闁板秶鐤? * @param {string | null | undefined} input.worktreePath - Worktree 鐠侯垰绶? * @returns {string | null} 鐟欙絾鐎介崥搴ｆ畱瀹搞儰缍旈惄顔肩秿閿涘本婀幍鎯у煂鏉╂柨娲?null
 * @note 鏉╂劘顢戦弮鑸垫惙娴ｆ粌绨叉禒鍛存嫛鐎电懓鍑￠悧鈺佸閻?worktree 鐠侯垰绶為敍宀€鈥樻穱婵囨瀮娴犺埖鎼锋担婊冩躬濮濓絿鈥橀惃鍕缁傝崵骞嗘晶鍐ц厬閹笛嗩攽
 */
export function resolveThreadWorkspaceCwd(input: {
  projectCwd?: string | null | undefined;
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): string | null {
  const mode = resolveThreadEnvironmentMode(input);
  // worktree 濡€崇础娑撳濞囬悽?worktree 鐠侯垰绶?  if (mode === "worktree") {
    return input.worktreePath ?? null;
  }
  // 閺堫剙婀村Ο鈥崇础娑撳濞囬悽銊┿€嶉惄顔界壌閻╊喖缍?  return input.projectCwd ?? null;
}

/**
 * @function resolveThreadBranchSourceCwd
 * @description 鐟欙絾鐎界痪璺ㄢ柤閸掑棙鏁崣鎴犲箛濠ф劗娈戣ぐ鎾冲瀹搞儰缍旈惄顔肩秿
 * @param {Object} input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param {string | null | undefined} input.projectCwd - 妞ゅ湱娲伴弽鍦窗瑜? * @param {string | null | undefined} input.worktreePath - Worktree 鐠侯垰绶? * @returns {string | null} 鐟欙絾鐎介崥搴ｆ畱瀹搞儰缍旈惄顔肩秿閿涘本婀幍鎯у煂鏉╂柨娲?null
 * @note 閸掑棙鏁崣鎴犲箛閹垮秳缍旈崷?worktree 鐎涙ê婀崜宥勭矝閸欘垯濞囬悽銊┿€嶉惄顔界壌閻╊喖缍嶉敍灞芥礈娑?Git 娴犳挸绨辨穱鈩冧紖閺勵垰鍙℃禍顐ゆ畱
 */
export function resolveThreadBranchSourceCwd(input: {
  projectCwd?: string | null | undefined;
  worktreePath?: string | null | undefined;
}): string | null {
  // 娴兼ê鍘涙担璺ㄦ暏 worktree 鐠侯垰绶為敍灞藉従濞嗏€插▏閻劑銆嶉惄顔界壌閻╊喖缍?  return input.worktreePath ?? input.projectCwd ?? null;
}
