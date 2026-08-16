/**
 * @module runtimeModelCapabilities
 * @description 将运行时发现的模型元数据桥接到编辑器能力配置中，在静态默认值的基础上提供运行时覆盖。
 * 当服务端返回模型能力信息时，优先使用运行时数据，静态配置仅作为启动时的兜底方案。
 */

import type {
  EffortOption,
  ModelCapabilities,
  ProviderKind,
  ProviderModelDescriptor,
} from "~/contracts";
import {
  getDefaultEffort,
  getModelCapabilities,
  normalizeModelSlug,
  trimOrNull,
} from "~/shared/model";
import { normalizeCursorModelVariantBaseId } from "../../cursorModelVariants";

/** 将运行时的推理力度原始值转换为可读的标签文本 */
function runtimeEffortLabel(value: string): string {
  switch (value) {
    case "none":
      return "None";
    case "minimal":
      return "Minimal";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Extra High";
    default:
      return value
        .split(/[-_\s]+/u)
        .filter((segment) => segment.length > 0)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
  }
}

/**
 * 在运行时模型描述符列表中查找与当前选中模型匹配的描述符。
 * 经过服务提供者特定的标准化后进行匹配，对 Cursor 提供者还会进行变体基础 ID 的匹配。
 *
 * @param input.provider - 服务提供者类型
 * @param input.model - 当前选中的模型标识
 * @param input.runtimeModels - 运行时发现的模型描述符列表
 * @returns 匹配到的模型描述符，未找到则返回 undefined
 */
export function resolveRuntimeModelDescriptor(input: {
  provider: ProviderKind;
  model: string | null | undefined;
  runtimeModels: ReadonlyArray<ProviderModelDescriptor> | null | undefined;
}): ProviderModelDescriptor | undefined {
  const { provider, model, runtimeModels } = input;
  if (!runtimeModels?.length) {
    return undefined;
  }

  const normalizedModel = normalizeModelSlug(model, provider) ?? trimOrNull(model);
  if (!normalizedModel) {
    return undefined;
  }

  return runtimeModels.find((candidate) => {
    const normalizedCandidate = normalizeModelSlug(candidate.slug, provider) ?? candidate.slug;
    if (normalizedCandidate === normalizedModel) {
      return true;
    }
    return (
      provider === "cursor" &&
      normalizeCursorModelVariantBaseId(normalizedCandidate) ===
        normalizeCursorModelVariantBaseId(normalizedModel)
    );
  });
}

/**
 * 获取运行时感知的模型能力配置。
 * 复用静态能力标志，但允许运行时发现的模型覆盖暴露的推理力度菜单、
 * 快速模式、思考开关和上下文窗口选项等配置。
 *
 * @param input.provider - 服务提供者类型
 * @param input.model - 当前选中的模型标识
 * @param input.runtimeModel - 运行时发现的模型描述符（可选）
 * @returns 合并后的模型能力配置
 */
export function getRuntimeAwareModelCapabilities(input: {
  provider: ProviderKind;
  model: string | null | undefined;
  runtimeModel?: ProviderModelDescriptor | undefined;
}): ModelCapabilities {
  const staticCapabilities = getModelCapabilities(input.provider, input.model);
  // Runtime discovery is authoritative when available; the static table is only a startup fallback.
  const supportsFastMode =
    (input.provider === "codex" || input.provider === "cursor") && input.runtimeModel
      ? input.runtimeModel.supportsFastMode === true
      : staticCapabilities.supportsFastMode;
  const supportsThinkingToggle =
    input.runtimeModel?.supportsThinkingToggle ?? staticCapabilities.supportsThinkingToggle;
  const contextWindowOptions =
    input.runtimeModel?.contextWindowOptions?.map((option) => ({
      value: option.value,
      label: option.label,
      ...(option.isDefault === true ? { isDefault: true as const } : {}),
    })) ?? staticCapabilities.contextWindowOptions;
  const optionDescriptors =
    input.runtimeModel?.optionDescriptors ?? staticCapabilities.optionDescriptors;
  const runtimeEfforts = input.runtimeModel?.supportedReasoningEfforts;
  if (
    (input.provider !== "codex" &&
      input.provider !== "cursor" &&
      input.provider !== "grok" &&
      input.provider !== "kilo" &&
      input.provider !== "opencode" &&
      input.provider !== "pi") ||
    !runtimeEfforts ||
    runtimeEfforts.length === 0
  ) {
    return {
      ...staticCapabilities,
      ...(optionDescriptors ? { optionDescriptors } : {}),
      supportsFastMode,
      supportsThinkingToggle,
      contextWindowOptions,
    };
  }

  const staticDefaultEffort = getDefaultEffort(staticCapabilities);
  const runtimeDefaultEffort =
    trimOrNull(input.runtimeModel?.defaultReasoningEffort) ??
    (staticDefaultEffort && runtimeEfforts.some((effort) => effort.value === staticDefaultEffort)
      ? staticDefaultEffort
      : null);

  const runtimeOptions: EffortOption[] = runtimeEfforts.map((effort) => {
    const description = trimOrNull(effort.description);
    return {
      value: effort.value,
      label: trimOrNull(effort.label) ?? runtimeEffortLabel(effort.value),
      ...(description ? { description } : {}),
      ...(effort.value === runtimeDefaultEffort ? { isDefault: true as const } : {}),
    };
  });

  if (input.provider === "kilo" || input.provider === "opencode") {
    return {
      ...staticCapabilities,
      ...(optionDescriptors ? { optionDescriptors } : {}),
      variantOptions: runtimeOptions,
      supportsThinkingToggle,
      contextWindowOptions,
    };
  }

  return {
    ...staticCapabilities,
    ...(optionDescriptors ? { optionDescriptors } : {}),
    supportsFastMode,
    supportsThinkingToggle,
    contextWindowOptions,
    reasoningEffortLevels: runtimeOptions,
  };
}
