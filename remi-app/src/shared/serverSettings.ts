/**
 * @file 閺堝秴濮熼崳銊啎缂冾喛藟娑撲礁绨查悽銊ヤ紣閸忛攱膩閸? *
 * @description
 * 閹绘劒绶甸張宥呭閸ｃ劏顔曠純顕嗙礄ServerSettings閿涘娈戠悰銉ょ閸氬牆鑻熼崝鐔诲厴閿涘本鐗宠箛鍐╂Ц `applyServerSettingsPatch` 閸戣姤鏆熼妴? * 鐠囥儲膩閸ф顦╅悶鍡樐侀崹瀣偓澶嬪閿涘湣odelSelection閿涘娈戦悧瑙勭暕閸氬牆鑻熼柅鏄忕帆閿涘瞼鈥樻穱婵嗘躬閸掑洦宕?AI 閹绘劒绶甸崯鍡樻
 * 閼奉亜濮╅崶鐐衡偓鈧崚鎷岊嚉閹绘劒绶甸崯鍡欐畱姒涙顓诲Ο鈥崇€烽敍宀冣偓宀勬姜娣囨繄鏆€閺冄勫絹娓氭稑鏅㈤惃鍕侀崹瀣倳缁夎埇鈧? *
 * 閺嶇绺鹃崝鐔诲厴閿? * - 濞ｅ崬瀹抽崥鍫濊嫙閺堝秴濮熼崳銊啎缂冾喛藟娑撲緤绱欓崺杞扮艾 `deepMerge`閿? * - 濡€崇€烽柅澶嬪閻ㄥ嫭娅ら懗钘夋値楠炶绱伴崚鍥ㄥ床閹绘劒绶甸崯鍡樻閼奉亜濮╂担璺ㄦ暏閺傜増褰佹笟娑樻櫌閻ㄥ嫰绮拋銈喣侀崹? * - 濡€崇€烽柅澶愩€嶉敍鍧tions閿涘娈戦弶鈥叉閺囨寧宕查柅鏄忕帆
 *
 * 閸氬牆鑻熺粵鏍殣閿? * - 閺咁噣鈧艾鐡у▓鍏稿▏閻劍绻佹惔锕€鎮庨獮璁圭礄`deepMerge`閿? * - 濡€崇€烽柅澶嬪鐎涙顔屾担璺ㄦ暏閻楄鐣╅崥鍫濊嫙闁槒绶敍? *   - 閼汇儴藟娑撲焦瀵氱€规矮绨￠弬鎵畱 provider 閹?model閿涘苯鍨憴鍡曡礋"閺囨寧宕?閹垮秳缍? *   - 閸掑洦宕?provider 娴ｅ棙婀幐鍥х暰 model 閺冭绱濋懛顏勫З娴ｈ法鏁ら弬?provider 閻ㄥ嫰绮拋銈喣侀崹? *   - options 閸︺劍娴涢幑銏∧佸蹇庣瑓娴犲懍濞囬悽銊ㄋ夋稉浣疯厬閻ㄥ嫬鈧》绱濋棃鐐存禌閹广垺膩瀵繋绗呭ǎ鍗炲閸氬牆鑻? *
 * @module serverSettings
 * @layer 閸忓彉闊╁銉ュ徔鐏? *
 * @example
 * ```ts
 * import { applyServerSettingsPatch } from './serverSettings';
 *
 * const current = {
 *   textGenerationModelSelection: {
 *     provider: 'codex',
 *     model: 'gpt-4',
 *     options: { reasoningEffort: 'high' }
 *   }
 * };
 *
 * // 閸掑洦宕查幓鎰返閸熷棴绱濋懛顏勫З娴ｈ法鏁ら弬鐗堝絹娓氭稑鏅㈤惃鍕帛鐠併倖膩閸? * const patched = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: { provider: 'claudeAgent' }
 * });
 * // patched.textGenerationModelSelection.model === 'claude-sonnet-4-20250514'閿涘牓绮拋銈喣侀崹瀣剁礆
 *
 * // 娴犲懍鎱ㄩ弨瑙勀侀崹瀣剁礉娣囨繄鏆€閹绘劒绶甸崯? * const patched2 = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: { model: 'gpt-4-turbo' }
 * });
 * // patched2.textGenerationModelSelection.provider === 'codex'
 * ```
 *
 * @see {@link ./Struct.ts} - 濞ｅ崬瀹抽崥鍫濊嫙瀹搞儱鍙块崙鑺ユ殶
 */
import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ServerSettings,
  type ServerSettingsPatch,
} from "~/contracts";
import { deepMerge, type DeepPartial } from "./Struct";

/**
 * 閸掋倖鏌囧Ο鈥崇€烽柅澶嬪鐞涖儰绔甸弰顖氭儊鎼存棁袝閸?閺囨寧宕?閹垮秳缍? *
 * 瑜版捁藟娑撲椒鑵戦弰搴ｂ€橀幐鍥х暰娴?`provider` 閹?`model` 鐎涙顔岄弮璁圭礉鐠併倓璐熸潻娆愭Ц娑撯偓濞嗏剝娴涢幑銏℃惙娴ｆ粣绱? * 闂団偓鐟曚線鍣哥純顔侥侀崹瀣偓澶愩€嶉敍鍧tions閿涘绱遍崥锕€鍨憴鍡曡礋闁劌鍨庨弴瀛樻煀閿涘奔绻氶悾娆戝箛閺堝娈?options閵? *
 * @param patch - 濡€崇€烽柅澶嬪鐞涖儰绔电€电钖? * @returns 婵″倹鐏夌悰銉ょ閸栧懎鎯?provider 閹?model 鐎涙顔岄崚娆掔箲閸?true閿涘矁銆冪粈鍝勭安閹笛嗩攽閺囨寧宕查幙宥勭稊
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
function shouldReplaceTextGenerationModelSelection(
  patch: ServerSettingsPatch["textGenerationModelSelection"] | undefined,
): boolean {
  return Boolean(patch && (patch.provider !== undefined || patch.model !== undefined));
}

/**
 * 鐏忓棜藟娑撲礁绨查悽銊ュ煂閺堝秴濮熼崳銊啎缂冾噯绱濇潻鏂挎礀閸氬牆鑻熼崥搴ｆ畱閺傛媽顔曠純顔碱嚠鐠? *
 * 鐠囥儱鍤遍弫鐗堟Ц閺堝秴濮熼崳銊啎缂冾喗娲块弬鎵畱閺嶇绺鹃崗銉ュ經閿涘苯顦╅悶鍡曚簰娑撳鎮庨獮鍫曗偓鏄忕帆閿? *
 * 1. **閺咁噣鈧艾鐡у▓?*閿涙矮濞囬悽?`deepMerge` 鏉╂稖顢戝ǎ鍗炲閸氬牆鑻熼敍瀹瞐tch 娑擃厾娈戦棃?undefined 閸婅壈顩惄?current 娑擃厾娈戦崐? * 2. **濡€崇€烽柅澶嬪鐎涙顔?*閿涘潉textGenerationModelSelection`閿涘濞囬悽銊у濞堝﹤鎮庨獮鍓佺摜閻ｃ儻绱? *    - 閼汇儴藟娑撲焦瀵氱€规矮绨￠弬鎵畱 `provider` 娴ｅ棙婀幐鍥х暰 `model`閿? *      - 婵″倹鐏夐弬?provider 娑撳骸缍嬮崜宥勭瑝閸氬奔绗栨稉宥嗘Ц "pi"閿涘矁鍤滈崝銊ゅ▏閻劍鏌?provider 閻ㄥ嫰绮拋銈喣侀崹? *      - 閸氾箑鍨穱婵堟殌瑜版挸澧?model
 *    - 閼汇儴藟娑撲焦瀵氱€规矮绨?`model`閿涙氨娲块幒銉ゅ▏閻劏藟娑撲椒鑵戦惃?model
 *    - `options` 鐎涙顔岄敍姘禌閹广垺膩瀵繋绗呮禒鍛▏閻劏藟娑撲椒鑵戦惃?options閿涙盯娼弴鎸庡床濡€崇础娑撳绻佹惔锕€鎮庨獮? *
 * @param current - 瑜版挸澧犻惃鍕箛閸斺€虫珤鐠佸墽鐤嗙€电钖? * @param patch - 鐟曚礁绨查悽銊ф畱鐠佸墽鐤嗙悰銉ょ閿涘牓鍎撮崚鍡樻纯閺傚府绱? * @returns 閸氬牆鑻熼崥搴ｆ畱閺傜増婀囬崝鈥虫珤鐠佸墽鐤嗙€电钖勯敍宀€琚崹瀣╃瑢 `ServerSettings` 娑撯偓閼? *
 * @throws 濮濄倕鍤遍弫棰佺瑝娴兼碍濮忛崙鍝勭磽鐢潻绱濇担鍡曠炊閸忋儲妫ら弫鍫濆棘閺佹澘褰查懗钘夘嚤閼风绻嶇悰灞炬闁挎瑨顕? *
 * @example 閸掑洦宕查幓鎰返閸熷棗鑻熼懛顏勫З娴ｈ法鏁ゆ妯款吇濡€崇€? * ```ts
 * const current: ServerSettings = {
 *   textGenerationModelSelection: {
 *     provider: 'codex',
 *     model: 'gpt-4',
 *   }
 * };
 *
 * const result = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: { provider: 'claudeAgent' }
 * });
 * // result.textGenerationModelSelection === {
 * //   provider: 'claudeAgent',
 * //   model: 'claude-sonnet-4-20250514'  // 閼奉亜濮╂担璺ㄦ暏 claudeAgent 閻ㄥ嫰绮拋銈喣侀崹? * // }
 * ```
 *
 * @example 娴犲懏娲块弬鐗埬侀崹瀣偓澶愩€? * ```ts
 * const result = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: {
 *     options: { reasoningEffort: 'low' }
 *   }
 * });
 * // options 娴兼矮绗岄悳鐗堟箒闁銆嶅ǎ鍗炲閸氬牆鑻? * ```
 */
export function applyServerSettingsPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings {
  const selectionPatch = patch.textGenerationModelSelection;
  // 閸忓牊澧界悰宀勨偓姘辨暏閻ㄥ嫭绻佹惔锕€鎮庨獮?  const next = deepMerge(current, patch as DeepPartial<ServerSettings>);
  if (!selectionPatch) {
    return next;
  }

  // 绾喖鐣鹃張鈧紒鍫㈡畱 provider閿涙矮绱崗鍫滃▏閻劏藟娑撲椒鑵戦惃鍕偓纭风礉閸氾箑鍨穱婵堟殌瑜版挸澧犻崐?  const provider = selectionPatch.provider ?? current.textGenerationModelSelection.provider;
  // 绾喖鐣鹃張鈧紒鍫㈡畱 model閿?  // - 娴兼ê鍘涙担璺ㄦ暏鐞涖儰绔垫稉顓熸绾喗瀵氱€规氨娈?model
  // - 閼汇儴藟娑撲礁鍨忛幑顫啊 provider 娑撴梹鏌?provider 娑撳秵妲?"pi"閿涘苯鍨担璺ㄦ暏閺?provider 閻ㄥ嫰绮拋銈喣侀崹?  // - 閸氾箑鍨穱婵堟殌瑜版挸澧?model
  const model =
    selectionPatch.model ??
    (selectionPatch.provider &&
    selectionPatch.provider !== "pi" &&
    selectionPatch.provider !== current.textGenerationModelSelection.provider
      ? DEFAULT_MODEL_BY_PROVIDER[selectionPatch.provider]
      : current.textGenerationModelSelection.model);
  // 绾喖鐣?options閿涙碍娴涢幑銏∧佸蹇庣瑓娴犲懍濞囬悽銊ㄋ夋稉浣疯厬閻?options閿涘矂娼弴鎸庡床濡€崇础娑撳绻佹惔锕€鎮庨獮?  const options = shouldReplaceTextGenerationModelSelection(selectionPatch)
    ? selectionPatch.options
    : (selectionPatch.options ?? current.textGenerationModelSelection.options);

  return {
    ...next,
    textGenerationModelSelection: {
      provider,
      model,
      ...(options !== undefined ? { options } : {}),
    } as ModelSelection,
  };
}
