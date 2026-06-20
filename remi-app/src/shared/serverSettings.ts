/**
 * @file 服务器设置补丁应用工具模 *
 * @description
 * 提供服务器设置（ServerSettings）的补丁合并功能，核心是 `applyServerSettingsPatch` 函数 * 该模块处理模型选择（ModelSelection）的特殊合并逻辑，确保在切换 AI 提供商时
 * 自动回退到该提供商的默认模型，而非保留旧提供商的模型名称 *
 * 核心功能 * - 深度合并服务器设置补丁（基于 `deepMerge` * - 模型选择的智能合并：切换提供商时自动使用新提供商的默认模 * - 模型选项（options）的条件替换逻辑
 *
 * 合并策略 * - 普通字段使用深度合并（`deepMerge` * - 模型选择字段使用特殊合并逻辑 *   - 若补丁指定了新的 provider model，则视为"替换"操作
 *   - 切换 provider 但未指定 model 时，自动使用provider 的默认模 *   - options 在替换模式下仅使用补丁中的值，非替换模式下深度合并
 *
 * @module serverSettings
 * @layer 共享工具 *
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
 * // 切换提供商，自动使用新提供商的默认模 * const patched = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: { provider: 'claudeAgent' }
 * });
 * // patched.textGenerationModelSelection.model === 'claude-sonnet-4-20250514'（默认模型）
 *
 * // 仅修改模型，保留提供 * const patched2 = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: { model: 'gpt-4-turbo' }
 * });
 * // patched2.textGenerationModelSelection.provider === 'codex'
 * ```
 *
 * @see {@link ./Struct.ts} - 深度合并工具函数
 */
import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ServerSettings,
  type ServerSettingsPatch,
} from "~/contracts";
import { deepMerge, type DeepPartial } from "./Struct";

/**
 * 判断模型选择补丁是否应触替换"操作
 *
 * 当补丁中明确指定`provider` `model` 字段时，认为这是一次替换操作，
 * 需要重置模型选项（options）；否则视为部分更新，保留现有的 options *
 * @param patch - 模型选择补丁对象
 * @returns 如果补丁包含 provider model 字段则返true，表示应执行替换操作
 *
 * @private 此函数为内部实现细节，不应直接调 */
function shouldReplaceTextGenerationModelSelection(
  patch: ServerSettingsPatch["textGenerationModelSelection"] | undefined,
): boolean {
  return Boolean(patch && (patch.provider !== undefined || patch.model !== undefined));
}

/**
 * 将补丁应用到服务器设置，返回合并后的新设置对 *
 * 该函数是服务器设置更新的核心入口，处理以下合并逻辑 *
 * 1. **普通字*：使`deepMerge` 进行深度合并，patch 中的undefined 值覆current 中的 * 2. **模型选择字段**（`textGenerationModelSelection`）使用特殊合并策略：
 *    - 若补丁指定了新的 `provider` 但未指定 `model` *      - 如果provider 与当前不同且不是 "pi"，自动使用新 provider 的默认模 *      - 否则保留当前 model
 *    - 若补丁指定了 `model`：直接使用补丁中model
 *    - `options` 字段：替换模式下仅使用补丁中options；非替换模式下深度合 *
 * @param current - 当前的服务器设置对象
 * @param patch - 要应用的设置补丁（部分更新）
 * @returns 合并后的新服务器设置对象，类型与 `ServerSettings` 一 *
 * @throws 此函数不会抛出异常，但传入无效参数可能导致运行时错误
 *
 * @example 切换提供商并自动使用默认模型
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
 * //   model: 'claude-sonnet-4-20250514'  // 自动使用 claudeAgent 的默认模 * // }
 * ```
 *
 * @example 仅更新模型选项
 * ```ts
 * const result = applyServerSettingsPatch(current, {
 *   textGenerationModelSelection: {
 *     options: { reasoningEffort: 'low' }
 *   }
 * });
 * // options 会与现有选项深度合并
 * ```
 */
export function applyServerSettingsPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings {
  const selectionPatch = patch.textGenerationModelSelection;
  // 先执行通用的深度合  const next = deepMerge(current, patch as DeepPartial<ServerSettings>);
  if (!selectionPatch) {
    return next;
  }

  // 确定最终的 provider：优先使用补丁中的值，否则保留当前  const provider = selectionPatch.provider ?? current.textGenerationModelSelection.provider;
  // 确定最终的 model  // - 优先使用补丁中明确指定的 model
  // - 若补丁切换了 provider 且新 provider 不是 "pi"，则使用provider 的默认模  // - 否则保留当前 model
  const model =
    selectionPatch.model ??
    (selectionPatch.provider &&
    selectionPatch.provider !== "pi" &&
    selectionPatch.provider !== current.textGenerationModelSelection.provider
      ? DEFAULT_MODEL_BY_PROVIDER[selectionPatch.provider]
      : current.textGenerationModelSelection.model);
  // 确定 options：替换模式下仅使用补丁中 options，非替换模式下深度合并
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
