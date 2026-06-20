/**
 * @file Provider 妯″瀷閫夐」绠＄悊
 *
 * 鎻愪緵鍚?Provider 妯″瀷閫夐」鐨勬牸寮忓寲銆佸悎骞躲€佸垎缁勫拰鏋勫缓宸ュ叿鍑芥暟銆? * 鏀寔澶氱 Provider锛圕odex銆丆laude銆丆ursor銆丟emini銆丟rok銆丱penCode銆丳i銆並ilo锛? * 鐨勬ā鍨嬮€夐」澶勭悊锛屽寘鎷ā鍨嬪悕绉版牸寮忓寲銆侀€夐」鍚堝苟鍘婚噸銆佹寜涓婃父 Provider 鍒嗙粍銆? * 鏀惰棌妯″瀷鍒嗙粍浠ュ強妯″瀷閫夐」琛ヤ竵鏋勫缓銆? */

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

/** 鏍规嵁 ProviderKind 绱㈠紩鐨勬ā鍨嬮€夐」绫诲瀷 */
export type ProviderOptions = ProviderModelOptions[ProviderKind];

/**
 * Provider 妯″瀷閫夐」锛岃〃绀洪€夋嫨鍣ㄤ腑鐨勪竴涓彲閫夐」銆? */
export interface ProviderModelOption {
  /** 妯″瀷鐨勫敮涓€鏍囪瘑 slug */
  slug: string;
  /** 妯″瀷鐨勬樉绀哄悕绉?*/
  name: string;
  /** 涓婃父 Provider ID锛堝 "anthropic"銆?openai"锛?*/
  upstreamProviderId?: string;
  /** 涓婃父 Provider 鏄剧ず鍚嶇О */
  upstreamProviderName?: string;
}

/**
 * Provider 妯″瀷閫夐」鍒嗙粍锛岀敤浜庡湪閫夋嫨鍣ㄤ腑鎸変笂娓?Provider 褰掔被鏄剧ず銆? */
export interface ProviderModelOptionGroup {
  /** 鍒嗙粍鐨勫敮涓€閿?*/
  key: string;
  /** 鍒嗙粍鐨勬樉绀烘爣绛撅紝null 琛ㄧず鏃犲垎缁勬爣绛?*/
  label: string | null;
  /** 鍒嗙粍鍐呯殑妯″瀷閫夐」鍒楄〃 */
  options: ProviderModelOption[];
}

/**
 * 灏嗘ā鍨嬫爣璇嗙浜烘€у寲鏄剧ず銆傚皢鍒嗛殧绗︽浛鎹负绌烘牸骞堕瀛楁瘝澶у啓銆? *
 * @param value - 鍘熷妯″瀷鏍囪瘑绗? * @returns 浜烘€у寲鍚庣殑鏄剧ず鍚嶇О
 */
function humanizeModelIdentifier(value: string): string {
  return value.replace(/[-_/]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/** 鐢熸垚妯″瀷閫夐」鐨勫幓閲嶉敭锛屽熀浜?slug 鐨勫皬鍐欐爣鍑嗗寲 */
function modelOptionKey(option: Pick<ProviderModelOption, "slug">): string {
  return option.slug.trim().toLowerCase();
}

/**
 * 鏍煎紡鍖?Provider 妯″瀷閫夐」鐨勬樉绀哄悕绉般€? * 涓嶅悓 Provider 鏈変笉鍚岀殑鍚嶇О鏍煎紡鍖栫瓥鐣ワ細
 * - Cursor: 鍘婚櫎鏂规嫭鍙峰悗缂€鍙傛暟
 * - Kilo/OpenCode/Pi: 鎻愬彇璺緞鏈€鍚庝竴娈靛苟浜烘€у寲
 * - 鍏朵粬: 浣跨敤鍏变韩鐨?formatModelDisplayName
 *
 * @param input - 鍖呭惈 provider 鍜?slug 鐨勮緭鍏ュ璞? * @returns 鏍煎紡鍖栧悗鐨勬ā鍨嬫樉绀哄悕绉? */
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
 * 鍚堝苟涓ょ粍妯″瀷閫夐」锛屼紭鍏堜繚鐣?preferred 涓殑閫夐」锛宖allback 涓笉閲嶅鐨勯€夐」杩藉姞鍒版湯灏俱€? *
 * @param preferred - 浼樺厛鐨勬ā鍨嬮€夐」鍒楄〃
 * @param fallback - 鍥為€€鐨勬ā鍨嬮€夐」鍒楄〃
 * @returns 鍚堝苟鍚庣殑妯″瀷閫夐」鏁扮粍
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
 * 灏嗘ā鍨嬮€夐」鎸変笂娓?Provider 鍒嗙粍銆傜浉鍚?upstreamProviderId 鐨勯€夐」褰掑叆鍚屼竴缁勶紝
 * 鏃犱笂娓?Provider 淇℃伅鐨勯€夐」褰掑叆 "__ungrouped__" 缁勩€? *
 * @param options - 妯″瀷閫夐」鍒楄〃
 * @returns 鍒嗙粍鍚庣殑妯″瀷閫夐」鏁扮粍
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
 * 灏嗘ā鍨嬮€夐」鎸変笂娓?Provider 鍒嗙粍锛屽苟灏嗘敹钘忕殑妯″瀷鎻愬彇鍒扮嫭绔嬬殑 "Favourites" 鍒嗙粍涓€? * 濡傛灉娌℃湁鏀惰棌妯″瀷锛岃涓轰笌 groupProviderModelOptions 涓€鑷淬€? *
 * @param input - 鍖呭惈閫夐」鍒楄〃銆佹敹钘?slug 闆嗗悎鍜屽彲閫夊垎缁勬爣绛剧殑杈撳叆瀵硅薄
 * @returns 甯︽敹钘忓垎缁勭殑妯″瀷閫夐」鍒嗙粍鏁扮粍
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
 * 鏍规嵁琛ヤ竵鏋勫缓鎸囧畾 Provider 鐨勪笅涓€涓ā鍨嬮€夐」鐘舵€併€? * 瀵逛簬 Gemini锛屽垏鎹?thinkingLevel/thinkingBudget 鏃朵細娓呴櫎涔嬪墠鐨勬€濈淮鐩稿叧閰嶇疆銆? *
 * @param provider - Provider 绫诲瀷
 * @param modelOptions - 褰撳墠妯″瀷閫夐」
 * @param patch - 瑕佸簲鐢ㄧ殑閫夐」琛ヤ竵
 * @returns 鍚堝苟鍚庣殑妯″瀷閫夐」
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
 * 鏍规嵁閫夐」 ID 鍜屽€兼瀯寤烘ā鍨嬮€夐」琛ヤ竵銆? * 瀵逛簬 Gemini 鐨?thinkingLevel/thinkingBudget锛屼細閫氳繃 effort 鍊兼帹瀵煎嚭瀹屾暣鐨勯€夐」闆嗐€? *
 * @param provider - Provider 绫诲瀷
 * @param optionId - 閫夐」 ID
 * @param value - 閫夐」鍊? * @returns 閫夐」琛ヤ竵瀵硅薄
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
 * 鏋勫缓妯″瀷閫夋嫨瀵硅薄銆傛牴鎹?Provider 绫诲瀷杩斿洖瀵瑰簲鐨勫己绫诲瀷 ModelSelection銆? * 鍖呭惈澶氫釜閲嶈浇绛惧悕浠ョ‘淇濈被鍨嬪畨鍏ㄣ€? *
 * @param provider - Provider 绫诲瀷
 * @param model - 妯″瀷鏍囪瘑
 * @param options - 鍙€夌殑妯″瀷閫夐」
 * @returns 瀵瑰簲绫诲瀷鐨勬ā鍨嬮€夋嫨瀵硅薄
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
