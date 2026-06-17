/**
 * 文件: serverSettings.ts
 * 用途: 服务端设置补丁应用逻辑，将增量配置补丁合并到完整配置中。
 * 层级: 共享工具模块
 * 主要导出: applyServerSettingsPatch
 */

import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@remi-code/contracts";
import { deepMerge, type DeepPartial } from "./Struct";

/**
 * 判断是否需要替换文本生成模型选择（provider 或 model 任一变更即视为替换）。
 * @param patch - 文本生成模型选择补丁。
 * @returns 需要替换时返回 true。
 */
function shouldReplaceTextGenerationModelSelection(
  patch: ServerSettingsPatch["textGenerationModelSelection"] | undefined,
): boolean {
  return Boolean(patch && (patch.provider !== undefined || patch.model !== undefined));
}

/**
 * 将服务端设置补丁应用到当前配置上，返回合并后的完整配置。
 *
 * 特殊处理 `textGenerationModelSelection` 字段：
 * - 若补丁中切换了 provider，则自动选择该 provider 的默认模型；
 * - 若补丁中未指定 model 且 provider 未变更，则保留当前 model；
 * - 若指定了 `pi` 作为 provider，则不做默认模型替换。
 *
 * @param current - 当前完整的服务端配置。
 * @param patch - 待应用的增量补丁。
 * @returns 合并后的完整服务端配置。
 */
export function applyServerSettingsPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings {
  const selectionPatch = patch.textGenerationModelSelection;
  // 先执行深度合并，再对 textGenerationModelSelection 做特殊修正
  const next = deepMerge(current, patch as DeepPartial<ServerSettings>);
  if (!selectionPatch) {
    return next;
  }

  // 确定 provider：优先使用补丁中的值，否则保留当前值
  const provider = selectionPatch.provider ?? current.textGenerationModelSelection.provider;
  // 确定 model：补丁指定 → 切换 provider 时用默认模型 → 保留当前模型
  const model =
    selectionPatch.model ??
    (selectionPatch.provider &&
    selectionPatch.provider !== "pi" &&
    selectionPatch.provider !== current.textGenerationModelSelection.provider
      ? DEFAULT_MODEL_BY_PROVIDER[selectionPatch.provider]
      : current.textGenerationModelSelection.model);
  // 确定 options：替换模式用补丁值，否则用补丁或当前值
  const options = shouldReplaceTextGenerationModelSelection(selectionPatch)
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
