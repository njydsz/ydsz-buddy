/**
 * @file Provider 模型选项管理
 *
 * 提供�?Provider 模型选项的格式化、合并、分组和构建工具函数�? * 支持多种 Provider（Codex、Claude、Cursor、Gemini、Grok、OpenCode、Pi、Kilo�? * 的模型选项处理，包括模型名称格式化、选项合并去重、按上游 Provider 分组�? * 收藏模型分组以及模型选项补丁构建�? */

import { formatModelDisplayName, geminiModelOptionsFromEffortValue } from "~/shared/model";
import type {
  ClaudeModelOptions,
  ClaudeModelSelection,
  CodexModelOptions,
  CodexModelSelection,
  CursorModelOptions,
  CursorModelSelection,
  GeminiModelOptions,
  GeminiModelSelection,
  GrokModelOptions,
  GrokModelSelection,
  KiloModelSelection,
  ModelSelection,
  OpenCodeModelOptions,
  OpenCodeModelSelection,
  PiModelOptions,
  PiModelSelection,
  ProviderKind,
  ProviderModelOptions,
} from "~/contracts";

/** 根据 ProviderKind 索引的模型选项类型 */
export type ProviderOptions = ProviderModelOptions[ProviderKind];

/**
 * Provider 模型选项，表示选择器中的一个可选项�? */
export interface ProviderModelOption {
  /** 模型的唯一标识 slug */
  slug: string;
  /** 模型的显示名�?*/
  name: string;
  /** 上游 Provider ID（如 "anthropic"�?openai"�?*/
  upstreamProviderId?: string;
  /** 上游 Provider 显示名称 */
  upstreamProviderName?: string;
}

/**
 * Provider 模型选项分组，用于在选择器中按上�?Provider 归类显示�? */
export interface ProviderModelOptionGroup {
  /** 分组的唯一�?*/
  key: string;
  /** 分组的显示标签，null 表示无分组标�?*/
  label: string | null;
  /** 分组内的模型选项列表 */
  options: ProviderModelOption[];
}

/**
 * 将模型标识符人性化显示。将分隔符替换为空格并首字母大写�? *
 * @param value - 原始模型标识�? * @returns 人性化后的显示名称
 */
function humanizeModelIdentifier(value: string): string {
  return value.replace(/[-_/]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/** 生成模型选项的去重键，基�?slug 的小写标准化 */
function modelOptionKey(option: Pick<ProviderModelOption, "slug">): string {
  return option.slug.trim().toLowerCase();
}

/**
 * 格式�?Provider 模型选项的显示名称�? * 不同 Provider 有不同的名称格式化策略：
 * - Cursor: 去除方括号后缀参数
 * - Kilo/OpenCode/Pi: 提取路径最后一段并人性化
 * - 其他: 使用共享�?formatModelDisplayName
 *
 * @param input - 包含 provider �?slug 的输入对�? * @returns 格式化后的模型显示名�? */
export function formatProviderModelOptionName(input: {
  provider: ProviderKind;
  slug: string;
}): string {
  const trimmedSlug =
    input.provider === "cursor" ? input.slug.trim().replace(/\[[^\]]*\]$/u, "") : input.slug.trim();
  if (trimmedSlug.length === 0) {
    return trimmedSlug;
  }

  if (input.provider === "kilo" || input.provider === "opencode" || input.provider === "pi") {
    const modelIdentifier = trimmedSlug.includes("/")
      ? trimmedSlug.slice(trimmedSlug.lastIndexOf("/") + 1)
      : trimmedSlug;
    const sharedDisplayName = formatModelDisplayName(modelIdentifier);
    return sharedDisplayName && sharedDisplayName !== modelIdentifier
      ? sharedDisplayName
      : humanizeModelIdentifier(modelIdentifier);
  }

  return formatModelDisplayName(trimmedSlug) ?? trimmedSlug;
}

/**
 * 合并两组模型选项，优先保�?preferred 中的选项，fallback 中不重复的选项追加到末尾�? *
 * @param preferred - 优先的模型选项列表
 * @param fallback - 回退的模型选项列表
 * @returns 合并后的模型选项数组
 */
export function mergeProviderModelOptions(
  preferred: ReadonlyArray<ProviderModelOption>,
  fallback: ReadonlyArray<ProviderModelOption>,
): ProviderModelOption[] {
  const merged = [...preferred];
  const seen = new Set(preferred.map((option) => modelOptionKey(option)));

  for (const option of fallback) {
    const key = modelOptionKey(option);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(option);
  }

  return merged;
}

/**
 * 将模型选项按上�?Provider 分组。相�?upstreamProviderId 的选项归入同一组，
 * 无上�?Provider 信息的选项归入 "__ungrouped__" 组�? *
 * @param options - 模型选项列表
 * @returns 分组后的模型选项数组
 */
export function groupProviderModelOptions(
  options: ReadonlyArray<ProviderModelOption>,
): ProviderModelOptionGroup[] {
  const groupedOptions: ProviderModelOptionGroup[] = [];
  const groupIndexByKey = new Map<string, number>();

  for (const option of options) {
    const upstreamProviderId = option.upstreamProviderId?.trim();
    const upstreamProviderName = option.upstreamProviderName?.trim();
    const groupLabel =
      upstreamProviderName && upstreamProviderName.length > 0
        ? upstreamProviderName
        : upstreamProviderId && upstreamProviderId.length > 0
          ? upstreamProviderId
          : null;
    const groupKey = groupLabel
      ? `${(upstreamProviderId ?? groupLabel).trim().toLowerCase()}`
      : "__ungrouped__";
    const existingIndex = groupIndexByKey.get(groupKey);

    if (existingIndex !== undefined) {
      groupedOptions[existingIndex]!.options.push(option);
      continue;
    }

    groupIndexByKey.set(groupKey, groupedOptions.length);
    groupedOptions.push({
      key: groupKey,
      label: groupLabel,
      options: [option],
    });
  }

  return groupedOptions;
}

/**
 * 将模型选项按上�?Provider 分组，并将收藏的模型提取到独立的 "Favourites" 分组中�? * 如果没有收藏模型，行为与 groupProviderModelOptions 一致�? *
 * @param input - 包含选项列表、收�?slug 集合和可选分组标签的输入对象
 * @returns 带收藏分组的模型选项分组数组
 */
export function groupProviderModelOptionsWithFavorites(input: {
  options: ReadonlyArray<ProviderModelOption>;
  favoriteSlugs: ReadonlySet<string>;
  favoriteLabel?: string;
}): ProviderModelOptionGroup[] {
  if (input.favoriteSlugs.size === 0) {
    return groupProviderModelOptions(input.options);
  }

  const favoriteOptions = input.options.filter((option) => input.favoriteSlugs.has(option.slug));
  if (favoriteOptions.length === 0) {
    return groupProviderModelOptions(input.options);
  }
  const groupedOptions = groupProviderModelOptions(
    input.options.filter((option) => !input.favoriteSlugs.has(option.slug)),
  );

  return [
    {
      key: "__favorites__",
      label: input.favoriteLabel ?? "Favourites",
      options: favoriteOptions,
    },
    ...groupedOptions,
  ];
}

/**
 * 根据补丁构建指定 Provider 的下一个模型选项状态�? * 对于 Gemini，切�?thinkingLevel/thinkingBudget 时会清除之前的思维相关配置�? *
 * @param provider - Provider 类型
 * @param modelOptions - 当前模型选项
 * @param patch - 要应用的选项补丁
 * @returns 合并后的模型选项
 */
export function buildNextProviderOptions(
  provider: ProviderKind,
  modelOptions: ProviderOptions | null | undefined,
  patch: Record<string, unknown>,
): ProviderOptions {
  if (provider === "codex") {
    return { ...(modelOptions as CodexModelOptions | undefined), ...patch } as CodexModelOptions;
  }
  if (provider === "claudeAgent") {
    return { ...(modelOptions as ClaudeModelOptions | undefined), ...patch } as ClaudeModelOptions;
  }
  if (provider === "cursor") {
    return { ...(modelOptions as CursorModelOptions | undefined), ...patch } as CursorModelOptions;
  }
  if (provider === "gemini") {
    return {
      ...(modelOptions as GeminiModelOptions | undefined),
      thinkingLevel: undefined,
      thinkingBudget: undefined,
      ...patch,
    } as GeminiModelOptions;
  }
  if (provider === "grok") {
    return {
      ...(modelOptions as GrokModelOptions | undefined),
      ...patch,
    } as GrokModelOptions;
  }
  if (provider === "opencode") {
    return {
      ...(modelOptions as OpenCodeModelOptions | undefined),
      ...patch,
    } as OpenCodeModelOptions;
  }
  return {
    ...(modelOptions as PiModelOptions | undefined),
    ...patch,
  } as PiModelOptions;
}

/**
 * 根据选项 ID 和值构建模型选项补丁�? * 对于 Gemini �?thinkingLevel/thinkingBudget，会通过 effort 值推导出完整的选项集�? *
 * @param provider - Provider 类型
 * @param optionId - 选项 ID
 * @param value - 选项�? * @returns 选项补丁对象
 */
export function buildProviderOptionPatch(
  provider: ProviderKind,
  optionId: string,
  value: string | boolean,
): Record<string, unknown> {
  if (
    provider === "gemini" &&
    typeof value === "string" &&
    (optionId === "thinkingLevel" || optionId === "thinkingBudget")
  ) {
    return (geminiModelOptionsFromEffortValue(value) ?? {}) as Record<string, unknown>;
  }
  return { [optionId]: value };
}

/**
 * 构建模型选择对象。根�?Provider 类型返回对应的强类型 ModelSelection�? * 包含多个重载签名以确保类型安全�? *
 * @param provider - Provider 类型
 * @param model - 模型标识
 * @param options - 可选的模型选项
 * @returns 对应类型的模型选择对象
 */
export function buildModelSelection(
  provider: "codex",
  model: string,
  options?: CodexModelOptions | null | undefined,
): CodexModelSelection;
export function buildModelSelection(
  provider: "claudeAgent",
  model: string,
  options?: ClaudeModelOptions | null | undefined,
): ClaudeModelSelection;
export function buildModelSelection(
  provider: "cursor",
  model: string,
  options?: CursorModelOptions | null | undefined,
): CursorModelSelection;
export function buildModelSelection(
  provider: "gemini",
  model: string,
  options?: GeminiModelOptions | null | undefined,
): GeminiModelSelection;
export function buildModelSelection(
  provider: "grok",
  model: string,
  options?: GrokModelOptions | null | undefined,
): GrokModelSelection;
export function buildModelSelection(
  provider: "opencode",
  model: string,
  options?: OpenCodeModelOptions | null | undefined,
): OpenCodeModelSelection;
export function buildModelSelection(
  provider: "kilo",
  model: string,
  options?: OpenCodeModelOptions | null | undefined,
): KiloModelSelection;
export function buildModelSelection(
  provider: "pi",
  model: string,
  options?: PiModelOptions | null | undefined,
): PiModelSelection;
export function buildModelSelection(
  provider: ProviderKind,
  model: string,
  options?: ProviderOptions | null | undefined,
): ModelSelection;
export function buildModelSelection(
  provider: ProviderKind,
  model: string,
  options?: ProviderOptions | null | undefined,
): ModelSelection {
  switch (provider) {
    case "codex":
      return options
        ? {
            provider,
            model,
            options: options as CodexModelOptions,
          }
        : { provider, model };
    case "claudeAgent":
      return options
        ? {
            provider,
            model,
            options: options as ClaudeModelOptions,
          }
        : { provider, model };
    case "cursor":
      return options
        ? {
            provider,
            model,
            options: options as CursorModelOptions,
          }
        : { provider, model };
    case "gemini":
      return options
        ? {
            provider,
            model,
            options: options as GeminiModelOptions,
          }
        : { provider, model };
    case "grok":
      return options
        ? {
            provider,
            model,
            options: options as GrokModelOptions,
          }
        : { provider, model };
    case "kilo":
      return options
        ? {
            provider,
            model,
            options: options as OpenCodeModelOptions,
          }
        : { provider, model };
    case "opencode":
      return options
        ? {
            provider,
            model,
            options: options as OpenCodeModelOptions,
          }
        : { provider, model };
    case "pi":
      return options
        ? {
            provider,
            model,
            options: options as PiModelOptions,
          }
        : { provider, model };
  }
}
