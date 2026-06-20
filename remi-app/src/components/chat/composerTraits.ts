/**
 * @file composerTraits
 * @description 集中管理编辑器特征解析逻辑，确保各菜单界面读取相同的模型能力状态。
 *              包括推理力度、思考模式、快速模式和上下文窗口等特征的选择与解析。
 */

import {
  type ProviderOptionDescriptor,
  type ProviderKind,
  type ProviderModelDescriptor,
} from "~/contracts";
import {
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
  isClaudeUltrathinkPrompt,
  trimOrNull,
} from "~/shared/model";

import type { ProviderOptions } from "../../providerModelOptions";
import { getRuntimeAwareModelCapabilities } from "./runtimeModelCapabilities";

/**
 * 从 Cursor 模型 slug 中解析布尔型模型参数（如 fast、thinking）。
 * 支持 `[key=value]` 后缀格式和 `-fast`/`-thinking` 命名约定。
 *
 * @param model - 模型标识字符串
 * @param key - 要解析的参数键名
 * @returns 参数的布尔值，未找到则返回 null
 */
function getCursorBooleanModelParameter(
  model: string | null | undefined,
  key: "fast" | "thinking",
): boolean | null {
  const slug = typeof model === "string" ? model.trim().toLowerCase() : "";
  const match = typeof model === "string" ? model.match(/\[([^\]]*)\]$/u) : null;
  if (!match?.[1]) {
    if (key === "fast" && slug.endsWith("-fast")) {
      return true;
    }
    if (key === "thinking" && slug.includes("-thinking")) {
      return true;
    }
    return null;
  }
  for (const part of match[1].split(",")) {
    const [rawKey, rawValue] = part.split("=");
    if (rawKey?.trim() !== key) {
      continue;
    }
    const value = rawValue?.trim().toLowerCase();
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  return null;
}

/**
 * 将描述符转换为选择类型描述符，若类型不匹配则返回 null。
 *
 * @param descriptor - 提供者选项描述符
 * @returns 选择类型描述符或 null
 */
function asSelectDescriptor(
  descriptor: ProviderOptionDescriptor | undefined,
): Extract<ProviderOptionDescriptor, { type: "select" }> | null {
  return descriptor?.type === "select" ? descriptor : null;
}

/**
 * 将描述符转换为布尔类型描述符，若类型不匹配则返回 null。
 *
 * @param descriptor - 提供者选项描述符
 * @returns 布尔类型描述符或 null
 */
function asBooleanDescriptor(
  descriptor: ProviderOptionDescriptor | undefined,
): Extract<ProviderOptionDescriptor, { type: "boolean" }> | null {
  return descriptor?.type === "boolean" ? descriptor : null;
}

/**
 * 从描述符列表中查找主要特征选择描述符（排除 contextWindow）。
 *
 * @param descriptors - 提供者选项描述符列表
 * @returns 主要特征选择描述符或 null
 */
function primaryTraitSelectDescriptor(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
): Extract<ProviderOptionDescriptor, { type: "select" }> | null {
  return (
    descriptors.find(
      (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "select" }> =>
        descriptor.type === "select" && descriptor.id !== "contextWindow",
    ) ?? null
  );
}

/**
 * 从选择描述符中提取选项列表，转换为统一的选项格式。
 *
 * @param descriptor - 选择类型描述符
 * @returns 选项列表
 */
function selectOptions(descriptor: Extract<ProviderOptionDescriptor, { type: "select" }> | null) {
  return (
    descriptor?.options.map((option) => ({
      value: option.id,
      label: option.label,
      ...(option.description ? { description: option.description } : {}),
      ...(option.isDefault ? { isDefault: true as const } : {}),
    })) ?? []
  );
}

/**
 * 合并旧版能力标志与描述符特定的提示注入提示值。
 *
 * @param capsPromptInjectedValues - 来自能力配置的提示注入值
 * @param descriptor - 选择类型描述符
 * @returns 合并后的提示注入值数组
 */
function promptInjectedValuesForDescriptor(
  capsPromptInjectedValues: ReadonlyArray<string>,
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }> | null,
) {
  return Array.from(
    new Set([...capsPromptInjectedValues, ...(descriptor?.promptInjectedValues ?? [])]),
  );
}

/**
 * 从模型能力配置和草稿覆盖中解析当前编辑器的特征选择状态。
 * 包括推理力度、思考模式、快速模式、上下文窗口和 Ultrathink 提示控制等。
 *
 * @param provider - 服务提供者类型
 * @param model - 当前模型标识
 * @param prompt - 当前提示词文本
 * @param modelOptions - 当前模型选项
 * @param runtimeModel - 运行时模型描述符
 * @returns 编辑器特征选择的完整状态
 */
export function getComposerTraitSelection(
  provider: ProviderKind,
  model: string | null | undefined,
  prompt: string,
  modelOptions: ProviderOptions | null | undefined,
  runtimeModel?: ProviderModelDescriptor,
) {
  const caps = getRuntimeAwareModelCapabilities({ provider, model, runtimeModel });
  const descriptors = getProviderOptionDescriptors({
    provider,
    caps,
    selections: modelOptions as Record<string, unknown> | undefined,
  });
  const primarySelectDescriptor = primaryTraitSelectDescriptor(descriptors);
  const contextWindowDescriptor = asSelectDescriptor(
    descriptors.find((descriptor) => descriptor.id === "contextWindow"),
  );
  const fastModeDescriptor = asBooleanDescriptor(
    descriptors.find((descriptor) => descriptor.id === "fastMode"),
  );
  const thinkingDescriptor = asBooleanDescriptor(
    descriptors.find((descriptor) => descriptor.id === "thinking"),
  );
  const effortLevels = selectOptions(primarySelectDescriptor);
  const contextWindowOptions = selectOptions(contextWindowDescriptor);
  const defaultEffort =
    primarySelectDescriptor?.options.find((option) => option.isDefault)?.id ??
    primarySelectDescriptor?.options[0]?.id ??
    null;
  const defaultContextWindow =
    contextWindowDescriptor?.options.find((option) => option.isDefault)?.id ??
    contextWindowDescriptor?.options[0]?.id ??
    null;
  const resolvedEffort = trimOrNull(
    getProviderOptionCurrentValue(primarySelectDescriptor) as string | undefined,
  );
  const resolvedContextWindow = trimOrNull(
    getProviderOptionCurrentValue(contextWindowDescriptor) as string | undefined,
  );
  const promptInjectedValues = promptInjectedValuesForDescriptor(
    caps.promptInjectedEffortLevels,
    primarySelectDescriptor,
  );
  const isPromptInjected = resolvedEffort ? promptInjectedValues.includes(resolvedEffort) : false;
  const effort = resolvedEffort && !isPromptInjected ? resolvedEffort : defaultEffort;

  const thinkingEnabled = thinkingDescriptor
    ? provider === "cursor"
      ? (thinkingDescriptor.currentValue ??
        getCursorBooleanModelParameter(model, "thinking") ??
        true)
      : (thinkingDescriptor.currentValue ?? true)
    : null;

  const fastModeEnabled =
    Boolean(fastModeDescriptor) &&
    (fastModeDescriptor?.currentValue ??
      (provider === "cursor" ? getCursorBooleanModelParameter(model, "fast") : false)) === true;

  const contextWindow = resolvedContextWindow ?? defaultContextWindow;

  const ultrathinkPromptControlled =
    promptInjectedValues.length > 0 && isClaudeUltrathinkPrompt(prompt);

  return {
    caps,
    descriptors,
    primarySelectDescriptor,
    fastModeDescriptor,
    thinkingDescriptor,
    contextWindowDescriptor,
    promptInjectedValues,
    defaultEffort,
    effort,
    effortLevels,
    thinkingEnabled,
    fastModeEnabled,
    contextWindowOptions,
    contextWindow,
    defaultContextWindow,
    ultrathinkPromptControlled,
  };
}

/**
 * 判断编辑器是否有可见的特征控件。
 * 当存在推理力度选项、思考模式开关、多个上下文窗口选项或快速模式控件时返回 true。
 *
 * @param selection - 特征选择状态的子集
 * @param options - 可选配置，控制是否包含快速模式
 * @returns 是否有可见的特征控件
 */
export function hasVisibleComposerTraitControls(
  selection: Pick<
    ReturnType<typeof getComposerTraitSelection>,
    "caps" | "effortLevels" | "thinkingEnabled" | "contextWindowOptions" | "fastModeDescriptor"
  >,
  options?: {
    includeFastMode?: boolean;
  },
): boolean {
  return (
    selection.effortLevels.length > 0 ||
    selection.thinkingEnabled !== null ||
    selection.contextWindowOptions.length > 1 ||
    ((options?.includeFastMode ?? true) &&
      (selection.fastModeDescriptor !== null || selection.caps.supportsFastMode))
  );
}
