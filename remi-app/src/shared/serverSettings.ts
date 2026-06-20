/**
 * @file 鏈嶅姟鍣ㄨ缃ˉ涓佸簲鐢ㄥ伐鍏锋ā鍧? *
 * @description
 * 鎻愪緵鏈嶅姟鍣ㄨ缃紙ServerSettings锛夌殑琛ヤ竵鍚堝苟鍔熻兘锛屾牳蹇冩槸 `applyServerSettingsPatch` 鍑芥暟銆? * 璇ユā鍧楀鐞嗘ā鍨嬮€夋嫨锛圡odelSelection锛夌殑鐗规畩鍚堝苟閫昏緫锛岀‘淇濆湪鍒囨崲 AI 鎻愪緵鍟嗘椂
 * 鑷姩鍥為€€鍒拌鎻愪緵鍟嗙殑榛樿妯″瀷锛岃€岄潪淇濈暀鏃ф彁渚涘晢鐨勬ā鍨嬪悕绉般€? *
 * 鏍稿績鍔熻兘锛? * - 娣卞害鍚堝苟鏈嶅姟鍣ㄨ缃ˉ涓侊紙鍩轰簬 `deepMerge`锛? * - 妯″瀷閫夋嫨鐨勬櫤鑳藉悎骞讹細鍒囨崲鎻愪緵鍟嗘椂鑷姩浣跨敤鏂版彁渚涘晢鐨勯粯璁ゆā鍨? * - 妯″瀷閫夐」锛坥ptions锛夌殑鏉′欢鏇挎崲閫昏緫
 *
 * 鍚堝苟绛栫暐锛? * - 鏅€氬瓧娈典娇鐢ㄦ繁搴﹀悎骞讹紙`deepMerge`锛? * - 妯″瀷閫夋嫨瀛楁浣跨敤鐗规畩鍚堝苟閫昏緫锛? *   - 鑻ヨˉ涓佹寚瀹氫簡鏂扮殑 provider 鎴?model锛屽垯瑙嗕负"鏇挎崲"鎿嶄綔
 *   - 鍒囨崲 provider 浣嗘湭鎸囧畾 model 鏃讹紝鑷姩浣跨敤鏂?provider 鐨勯粯璁ゆā鍨? *   - options 鍦ㄦ浛鎹㈡ā寮忎笅浠呬娇鐢ㄨˉ涓佷腑鐨勫€硷紝闈炴浛鎹㈡ā寮忎笅娣卞害鍚堝苟
 *
 * @module serverSettings
 * @layer 鍏变韩宸ュ叿灞? *
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
 * // 鍒囨崲鎻愪緵鍟嗭紝鑷姩浣跨敤鏂版彁渚涘晢鐨勯粯璁ゆā鍨? * const patched = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: { provider: 'claudeAgent' }
 * });
 * // patched.textGenerationModelSelection.model === 'claude-sonnet-4-20250514'锛堥粯璁ゆā鍨嬶級
 *
 * // 浠呬慨鏀规ā鍨嬶紝淇濈暀鎻愪緵鍟? * const patched2 = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: { model: 'gpt-4-turbo' }
 * });
 * // patched2.textGenerationModelSelection.provider === 'codex'
 * ```
 *
 * @see {@link ./Struct.ts} - 娣卞害鍚堝苟宸ュ叿鍑芥暟
 */
import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ServerSettings,
  type ServerSettingsPatch,
} from "~/contracts";
import { deepMerge, type DeepPartial } from "./Struct";

/**
 * 鍒ゆ柇妯″瀷閫夋嫨琛ヤ竵鏄惁搴旇Е鍙?鏇挎崲"鎿嶄綔
 *
 * 褰撹ˉ涓佷腑鏄庣‘鎸囧畾浜?`provider` 鎴?`model` 瀛楁鏃讹紝璁や负杩欐槸涓€娆℃浛鎹㈡搷浣滐紝
 * 闇€瑕侀噸缃ā鍨嬮€夐」锛坥ptions锛夛紱鍚﹀垯瑙嗕负閮ㄥ垎鏇存柊锛屼繚鐣欑幇鏈夌殑 options銆? *
 * @param patch - 妯″瀷閫夋嫨琛ヤ竵瀵硅薄
 * @returns 濡傛灉琛ヤ竵鍖呭惈 provider 鎴?model 瀛楁鍒欒繑鍥?true锛岃〃绀哄簲鎵ц鏇挎崲鎿嶄綔
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function shouldReplaceTextGenerationModelSelection(
  patch: ServerSettingsPatch["textGenerationModelSelection"] | undefined,
): boolean {
  return Boolean(patch && (patch.provider !== undefined || patch.model !== undefined));
}

/**
 * 灏嗚ˉ涓佸簲鐢ㄥ埌鏈嶅姟鍣ㄨ缃紝杩斿洖鍚堝苟鍚庣殑鏂拌缃璞? *
 * 璇ュ嚱鏁版槸鏈嶅姟鍣ㄨ缃洿鏂扮殑鏍稿績鍏ュ彛锛屽鐞嗕互涓嬪悎骞堕€昏緫锛? *
 * 1. **鏅€氬瓧娈?*锛氫娇鐢?`deepMerge` 杩涜娣卞害鍚堝苟锛宲atch 涓殑闈?undefined 鍊艰鐩?current 涓殑鍊? * 2. **妯″瀷閫夋嫨瀛楁**锛坄textGenerationModelSelection`锛変娇鐢ㄧ壒娈婂悎骞剁瓥鐣ワ細
 *    - 鑻ヨˉ涓佹寚瀹氫簡鏂扮殑 `provider` 浣嗘湭鎸囧畾 `model`锛? *      - 濡傛灉鏂?provider 涓庡綋鍓嶄笉鍚屼笖涓嶆槸 "pi"锛岃嚜鍔ㄤ娇鐢ㄦ柊 provider 鐨勯粯璁ゆā鍨? *      - 鍚﹀垯淇濈暀褰撳墠 model
 *    - 鑻ヨˉ涓佹寚瀹氫簡 `model`锛氱洿鎺ヤ娇鐢ㄨˉ涓佷腑鐨?model
 *    - `options` 瀛楁锛氭浛鎹㈡ā寮忎笅浠呬娇鐢ㄨˉ涓佷腑鐨?options锛涢潪鏇挎崲妯″紡涓嬫繁搴﹀悎骞? *
 * @param current - 褰撳墠鐨勬湇鍔″櫒璁剧疆瀵硅薄
 * @param patch - 瑕佸簲鐢ㄧ殑璁剧疆琛ヤ竵锛堥儴鍒嗘洿鏂帮級
 * @returns 鍚堝苟鍚庣殑鏂版湇鍔″櫒璁剧疆瀵硅薄锛岀被鍨嬩笌 `ServerSettings` 涓€鑷? *
 * @throws 姝ゅ嚱鏁颁笉浼氭姏鍑哄紓甯革紝浣嗕紶鍏ユ棤鏁堝弬鏁板彲鑳藉鑷磋繍琛屾椂閿欒
 *
 * @example 鍒囨崲鎻愪緵鍟嗗苟鑷姩浣跨敤榛樿妯″瀷
 * ```ts
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
 * //   model: 'claude-sonnet-4-20250514'  // 鑷姩浣跨敤 claudeAgent 鐨勯粯璁ゆā鍨? * // }
 * ```
 *
 * @example 浠呮洿鏂版ā鍨嬮€夐」
 * ```ts
 * const result = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: {
 *     options: { reasoningEffort: 'low' }
 *   }
 * });
 * // options 浼氫笌鐜版湁閫夐」娣卞害鍚堝苟
 * ```
 */
export function applyServerSettingsPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings {
  const selectionPatch = patch.textGenerationModelSelection;
  // 鍏堟墽琛岄€氱敤鐨勬繁搴﹀悎骞?  const next = deepMerge(current, patch as DeepPartial<ServerSettings>);
  if (!selectionPatch) {
    return next;
  }

  // 纭畾鏈€缁堢殑 provider锛氫紭鍏堜娇鐢ㄨˉ涓佷腑鐨勫€硷紝鍚﹀垯淇濈暀褰撳墠鍊?  const provider = selectionPatch.provider ?? current.textGenerationModelSelection.provider;
  // 纭畾鏈€缁堢殑 model锛?  // - 浼樺厛浣跨敤琛ヤ竵涓槑纭寚瀹氱殑 model
  // - 鑻ヨˉ涓佸垏鎹簡 provider 涓旀柊 provider 涓嶆槸 "pi"锛屽垯浣跨敤鏂?provider 鐨勯粯璁ゆā鍨?  // - 鍚﹀垯淇濈暀褰撳墠 model
  const model =
    selectionPatch.model ??
    (selectionPatch.provider &&
    selectionPatch.provider !== "pi" &&
    selectionPatch.provider !== current.textGenerationModelSelection.provider
      ? DEFAULT_MODEL_BY_PROVIDER[selectionPatch.provider]
      : current.textGenerationModelSelection.model);
  // 纭畾 options锛氭浛鎹㈡ā寮忎笅浠呬娇鐢ㄨˉ涓佷腑鐨?options锛岄潪鏇挎崲妯″紡涓嬫繁搴﹀悎骞?  const options = shouldReplaceTextGenerationModelSelection(selectionPatch)
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
