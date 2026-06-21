/**
 * @file 服务端设置合并工具模块
 *
 * 本模块提供对服务端设置（ServerSettings）进行增量更新的工具：
 *
 * - **深度合并**：通过 `applyServerSettingsPatch` 将部分 patch 合并到当前设置
 * - **特殊字段处理**：针对 `textGenerationModelSelection` 等字段特殊处理
 * - **类型安全**：保留所有字段的 TypeScript 类型
 *
 * ## 核心导出
 *
 * - `applyServerSettingsPatch`：将 patch 合并到当前 settings
 * - `shouldReplaceTextGenerationModelSelection`：判断是否需要替换文本生成模型选择
 *
 * ## 使用场景
 *
 * - 设置面板保存部分更新
 * - 增量更新设置而不重置其他字段
 * - 默认值兜底
 *
 * ## 注意事项
 *
 * - 合并采用"深合并"策略，嵌套对象会递归合并
 * - 数组字段采用"替换"策略，不进行数组合并
 * - 模型选择需要同时提供 provider 和 model 才视为有效
 */

import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@remi-claw/contracts";
import { deepMerge, type DeepPartial } from "./Struct";

function shouldReplaceTextGenerationModelSelection(
  patch: ServerSettingsPatch["textGenerationModelSelection"] | undefined,
): boolean {
  return Boolean(patch && (patch.provider !== undefined || patch.model !== undefined));
}

export function applyServerSettingsPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings {
  const selectionPatch = patch.textGenerationModelSelection;
  const next = deepMerge(current, patch as DeepPartial<ServerSettings>);
  if (!selectionPatch) {
    return next;
  }

  const provider = selectionPatch.provider ?? current.textGenerationModelSelection.provider;
  const model =
    selectionPatch.model ??
    (selectionPatch.provider &&
    selectionPatch.provider !== "pi" &&
    selectionPatch.provider !== current.textGenerationModelSelection.provider
      ? DEFAULT_MODEL_BY_PROVIDER[selectionPatch.provider]
      : current.textGenerationModelSelection.model);
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
