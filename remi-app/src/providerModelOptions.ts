/**
 * @file Provider 濡€崇€烽柅澶愩€嶇粻锛勬倞
 *
 * 閹绘劒绶甸崥?Provider 濡€崇€烽柅澶愩€嶉惃鍕壐瀵繐瀵查妴浣告値楠炶翰鈧礁鍨庣紒鍕嫲閺嬪嫬缂撳銉ュ徔閸戣姤鏆熼妴? * 閺€顖涘瘮婢舵氨顫?Provider閿涘湑odex閵嗕竼laude閵嗕竼ursor閵嗕笩emini閵嗕笩rok閵嗕副penCode閵嗕赋i閵嗕甫ilo閿? * 閻ㄥ嫭膩閸ㄥ鈧銆嶆径鍕倞閿涘苯瀵橀幏顒伳侀崹瀣倳缁夌増鐗稿蹇撳閵嗕線鈧銆嶉崥鍫濊嫙閸樺鍣搁妴浣瑰瘻娑撳﹥鐖?Provider 閸掑棛绮嶉妴? * 閺€鎯版濡€崇€烽崚鍡欑矋娴犮儱寮峰Ο鈥崇€烽柅澶愩€嶇悰銉ょ閺嬪嫬缂撻妴? */

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

/** 閺嶈宓?ProviderKind 缁便垹绱╅惃鍕侀崹瀣偓澶愩€嶇猾璇茬€?*/
export type ProviderOptions = ProviderModelOptions[ProviderKind];

/**
 * Provider 濡€崇€烽柅澶愩€嶉敍宀冦€冪粈娲偓澶嬪閸ｃ劋鑵戦惃鍕娑擃亜褰查柅澶愩€嶉妴? */
export interface ProviderModelOption {
  /** 濡€崇€烽惃鍕暜娑撯偓閺嶅洩鐦?slug */
  slug: string;
  /** 濡€崇€烽惃鍕▔缁€鍝勬倳缁?*/
  name: string;
  /** 娑撳﹥鐖?Provider ID閿涘牆顩?"anthropic"閵?openai"閿?*/
  upstreamProviderId?: string;
  /** 娑撳﹥鐖?Provider 閺勫墽銇氶崥宥囆?*/
  upstreamProviderName?: string;
}

/**
 * Provider 濡€崇€烽柅澶愩€嶉崚鍡欑矋閿涘瞼鏁ゆ禍搴℃躬闁瀚ㄩ崳銊よ厬閹稿绗傚〒?Provider 瑜版帞琚弰鍓с仛閵? */
export interface ProviderModelOptionGroup {
  /** 閸掑棛绮嶉惃鍕暜娑撯偓闁?*/
  key: string;
  /** 閸掑棛绮嶉惃鍕▔缁€鐑樼垼缁涙拝绱漬ull 鐞涖劎銇氶弮鐘插瀻缂佸嫭鐖ｇ粵?*/
  label: string | null;
  /** 閸掑棛绮嶉崘鍛畱濡€崇€烽柅澶愩€嶉崚妤勩€?*/
  options: ProviderModelOption[];
}

/**
 * 鐏忓棙膩閸ㄥ鐖ｇ拠鍡欘儊娴滅儤鈧冨閺勫墽銇氶妴鍌氱殺閸掑棝娈х粭锔芥禌閹诡澀璐熺粚鐑樼壐楠炲爼顩荤€涙鐦濇径褍鍟撻妴? *
 * @param value - 閸樼喎顫愬Ο鈥崇€烽弽鍥槕缁? * @returns 娴滅儤鈧冨閸氬海娈戦弰鍓с仛閸氬秶袨
 */
function humanizeModelIdentifier(value: string): string {
  return value.replace(/[-_/]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/** 閻㈢喐鍨氬Ο鈥崇€烽柅澶愩€嶉惃鍕箵闁插秹鏁敍灞界唨娴?slug 閻ㄥ嫬鐨崘娆愮垼閸戝棗瀵?*/
function modelOptionKey(option: Pick<ProviderModelOption, "slug">): string {
  return option.slug.trim().toLowerCase();
}

/**
 * 閺嶇厧绱￠崠?Provider 濡€崇€烽柅澶愩€嶉惃鍕▔缁€鍝勬倳缁夎埇鈧? * 娑撳秴鎮?Provider 閺堝绗夐崥宀€娈戦崥宥囆為弽鐓庣础閸栨牜鐡ラ悾銉窗
 * - Cursor: 閸樺娅庨弬瑙勫閸欏嘲鎮楃紓鈧崣鍌涙殶
 * - Kilo/OpenCode/Pi: 閹绘劕褰囩捄顖氱窞閺堚偓閸氬簼绔村▓闈涜嫙娴滅儤鈧冨
 * - 閸忔湹绮? 娴ｈ法鏁ら崗鍙橀煩閻?formatModelDisplayName
 *
 * @param input - 閸栧懎鎯?provider 閸?slug 閻ㄥ嫯绶崗銉ヮ嚠鐠? * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫭膩閸ㄥ妯夌粈鍝勬倳缁? */
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
 * 閸氬牆鑻熸稉銈囩矋濡€崇€烽柅澶愩€嶉敍灞肩喘閸忓牅绻氶悾?preferred 娑擃厾娈戦柅澶愩€嶉敍瀹朼llback 娑擃厺绗夐柌宥咁槻閻ㄥ嫰鈧銆嶆潻钘夊閸掔増婀亸淇扁偓? *
 * @param preferred - 娴兼ê鍘涢惃鍕侀崹瀣偓澶愩€嶉崚妤勩€? * @param fallback - 閸ョ偤鈧偓閻ㄥ嫭膩閸ㄥ鈧銆嶉崚妤勩€? * @returns 閸氬牆鑻熼崥搴ｆ畱濡€崇€烽柅澶愩€嶉弫鎵矋
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
 * 鐏忓棙膩閸ㄥ鈧銆嶉幐澶夌瑐濞?Provider 閸掑棛绮嶉妴鍌滄祲閸?upstreamProviderId 閻ㄥ嫰鈧銆嶈ぐ鎺戝弳閸氬奔绔寸紒鍕剁礉
 * 閺冪姳绗傚〒?Provider 娣団剝浼呴惃鍕偓澶愩€嶈ぐ鎺戝弳 "__ungrouped__" 缂佸嫨鈧? *
 * @param options - 濡€崇€烽柅澶愩€嶉崚妤勩€? * @returns 閸掑棛绮嶉崥搴ｆ畱濡€崇€烽柅澶愩€嶉弫鎵矋
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
 * 鐏忓棙膩閸ㄥ鈧銆嶉幐澶夌瑐濞?Provider 閸掑棛绮嶉敍灞借嫙鐏忓棙鏁归挊蹇曟畱濡€崇€烽幓鎰絿閸掓壆瀚粩瀣畱 "Favourites" 閸掑棛绮嶆稉顓溾偓? * 婵″倹鐏夊▽鈩冩箒閺€鎯版濡€崇€烽敍宀冾攽娑撹桨绗?groupProviderModelOptions 娑撯偓閼锋番鈧? *
 * @param input - 閸栧懎鎯堥柅澶愩€嶉崚妤勩€冮妴浣规暪閽?slug 闂嗗棗鎮庨崪灞藉讲闁鍨庣紒鍕垼缁涘墽娈戞潏鎾冲弳鐎电钖? * @returns 鐢附鏁归挊蹇撳瀻缂佸嫮娈戝Ο鈥崇€烽柅澶愩€嶉崚鍡欑矋閺佹壆绮? */
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
 * 閺嶈宓佺悰銉ょ閺嬪嫬缂撻幐鍥х暰 Provider 閻ㄥ嫪绗呮稉鈧稉顏吥侀崹瀣偓澶愩€嶉悩鑸碘偓浣碘偓? * 鐎甸€涚艾 Gemini閿涘苯鍨忛幑?thinkingLevel/thinkingBudget 閺冩湹绱板〒鍛存珟娑斿澧犻惃鍕偓婵堟樊閻╃鍙ч柊宥囩枂閵? *
 * @param provider - Provider 缁鐎? * @param modelOptions - 瑜版挸澧犲Ο鈥崇€烽柅澶愩€? * @param patch - 鐟曚礁绨查悽銊ф畱闁銆嶇悰銉ょ
 * @returns 閸氬牆鑻熼崥搴ｆ畱濡€崇€烽柅澶愩€? */
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
 * 閺嶈宓侀柅澶愩€?ID 閸滃苯鈧吋鐎鐑樐侀崹瀣偓澶愩€嶇悰銉ょ閵? * 鐎甸€涚艾 Gemini 閻?thinkingLevel/thinkingBudget閿涘奔绱伴柅姘崇箖 effort 閸婂吋甯圭€电厧鍤€瑰本鏆ｉ惃鍕偓澶愩€嶉梿鍡愨偓? *
 * @param provider - Provider 缁鐎? * @param optionId - 闁銆?ID
 * @param value - 闁銆嶉崐? * @returns 闁銆嶇悰銉ょ鐎电钖? */
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
 * 閺嬪嫬缂撳Ο鈥崇€烽柅澶嬪鐎电钖勯妴鍌涚壌閹?Provider 缁鐎锋潻鏂挎礀鐎电懓绨查惃鍕繁缁鐎?ModelSelection閵? * 閸栧懎鎯堟径姘嚋闁插秷娴囩粵鎯ф倳娴犮儳鈥樻穱婵堣閸ㄥ鐣ㄩ崗銊ｂ偓? *
 * @param provider - Provider 缁鐎? * @param model - 濡€崇€烽弽鍥槕
 * @param options - 閸欘垶鈧娈戝Ο鈥崇€烽柅澶愩€? * @returns 鐎电懓绨茬猾璇茬€烽惃鍕侀崹瀣偓澶嬪鐎电钖? */
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
