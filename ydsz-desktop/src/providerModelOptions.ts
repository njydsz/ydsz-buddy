/**
 * @file Provider 模型选项模块
 * @description 构建各 AI Provider 的模型选择选项，处理模型标识符的格式化、
 *              选项合并和分组等操作。
 */

import { formatModelDisplayName, geminiModelOptionsFromEffortValue } from "@njydsz/shared/model";
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
} from "@ydsz-buddy/contracts";

export type ProviderOptions = ProviderModelOptions[ProviderKind];

/**
 * 模型能力 flag 集合
 *
 * 仅声明 UI 关心的 4 项（其余 cap 字段如 streaming / temperature 等不在此暴露）。
 * 字段缺省视为"未知",过滤时会被剔除（见 `modelCapabilities.filterModelsByCapabilities`）。
 */
export interface ModelCapabilityFlags {
  imageInput?: boolean;
  toolUse?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  /** 其它不在 4 项里的 cap（如 streaming）允许透传 */
  [key: string]: boolean | undefined;
}

/** 模型定价（USD / 1M tokens） */
export interface ModelCost {
  /** 输入 token 单价（USD / 1M tokens） */
  input?: number;
  /** 输出 token 单价（USD / 1M tokens） */
  output?: number;
}

/** 模型上下文窗口（K / M 字符串或纯数字,见 `formatContextWindow`） */
export interface ModelContextWindow {
  /** 上下文大小字符串,如 "128000" / "200K" / "1M" */
  size: string;
}

export interface ProviderModelOption {
  slug: string;
  name: string;
  upstreamProviderId?: string;
  upstreamProviderName?: string;
  /** 模型能力（P0-2 引入,缺省视为"未知"） */
  capabilities?: ModelCapabilityFlags;
  /** 上下文窗口（可选） */
  contextWindow?: string | ModelContextWindow;
  /** 定价（可选） */
  cost?: ModelCost;
}

export interface ProviderModelOptionGroup {
  key: string;
  label: string | null;
  options: ProviderModelOption[];
}

function humanizeModelIdentifier(value: string): string {
  return value.replace(/[-_/]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function modelOptionKey(option: Pick<ProviderModelOption, "slug">): string {
  return option.slug.trim().toLowerCase();
}

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
    return geminiModelOptionsFromEffortValue(value) ?? {};
  }
  return { [optionId]: value };
}

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
    // 国内 6 家 OpenAI 兼容 Provider：使用通用 ModelSelection
    case "glm":
    case "deepseek":
    case "moonshot":
    case "qwen":
    case "mimo":
    case "MiniMax":
    // 新增 3 家国内 Provider：同上,使用通用 ModelSelection(无 options)
    case "doubao":
    case "ernie":
    case "hunyuan":
      return { provider, model };
    default: {
      // Exhaustive check：所有 ProviderKind 应在 switch 中处理
      const _exhaustive: never = provider;
      void _exhaustive;
      throw new Error(`Unhandled provider: ${String(provider)}`);
    }
  }
}
