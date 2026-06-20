/**
 * @file Cursor 妯″瀷鍙樹綋澶勭悊
 *
 * 澶勭悊 Cursor Provider 鐨勬ā鍨嬪彉浣撳綊骞堕€昏緫銆侰ursor CLI 浼氫负鍚屼竴鍩虹妯″瀷
 * 鐢熸垚澶氫釜鍙樹綋锛堝涓嶅悓鎺ㄧ悊寮哄害銆乫ast 妯″紡銆乼hinking 妯″紡绛夛級锛? * 鏈ā鍧楀皢杩欎簺鍙樹綋褰掑苟涓虹粺涓€鐨勬ā鍨嬫潯鐩紝鍚堝苟鎺ㄧ悊寮哄害閫夐」銆佷笂涓嬫枃绐楀彛閫夐」绛夈€? */

import type { ProviderModelDescriptor } from "~/contracts";

/**
 * 鏍规嵁 value 瀛楁鍘婚噸锛屼繚鐣欓娆″嚭鐜扮殑鍏冪礌銆? *
 * @param values - 寰呭幓閲嶇殑鏁扮粍
 * @returns 鍘婚噸鍚庣殑鏁扮粍
 */
function uniqueByValue<T extends { readonly value: string }>(values: ReadonlyArray<T>): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value.value)) {
      continue;
    }
    seen.add(value.value);
    result.push(value);
  }
  return result;
}

/**
 * 灏嗘帹鐞嗗己搴﹀€艰浆鎹负鍙鏍囩銆? *
 * @param value - 鎺ㄧ悊寮哄害鍘熷鍊硷紙濡?"xhigh"銆?max"銆?low"锛? * @returns 鏍煎紡鍖栧悗鐨勬爣绛? */
function cursorReasoningLabel(value: string): string {
  switch (value) {
    case "xhigh":
      return "Extra High";
    case "max":
      return "Max";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

/**
 * 浠?Cursor CLI 妯″瀷鍚嶇О涓В鏋愭帹鐞嗗己搴︼紙reasoning effort锛夊悗缂€銆? * 浠庢ā鍨嬪悕绉版湯灏惧悜鍓嶆壂鎻忥紝璇嗗埆 "max"銆?none"銆?low"銆?medium"銆?high"銆?xhigh" 绛夋爣璁般€? * "extra-high" 浼氳褰掍竴鍖栦负 "xhigh"銆? *
 * @param model - Cursor CLI 妯″瀷鍚嶇О
 * @returns 鎺ㄧ悊寮哄害鍊硷紝鏈壘鍒拌繑鍥?undefined
 */
function parseCursorCliReasoningEffort(model: string): string | undefined {
  const tokens = model.trim().toLowerCase().split("-");
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (token === "xhigh") {
      return "xhigh";
    }
    if (token === "high" && tokens[index - 1] === "extra") {
      return "xhigh";
    }
    if (
      token === "max" ||
      token === "none" ||
      token === "low" ||
      token === "medium" ||
      token === "high"
    ) {
      return token;
    }
  }
  return undefined;
}

/**
 * 鍘婚櫎 Cursor 妯″瀷鍚嶇О涓殑鍙傛暟鍖栧悗缂€锛堟柟鎷彿鍐呭锛夈€? * 渚嬪 "claude-3.5-sonnet[thinking]" 鈫?"claude-3.5-sonnet"
 *
 * @param value - 鍘熷妯″瀷鍚嶇О
 * @returns 鍘婚櫎鍙傛暟鍖栧悗缂€鐨勫悕绉? */
function stripCursorParameterizedSuffix(value: string): string {
  return value.trim().replace(/\[[^\]]*\]$/u, "");
}

/**
 * 灏?Cursor 妯″瀷鍙樹綋鐨?slug 鏍囧噯鍖栦负鍩虹妯″瀷 ID銆? * 渚濇鍘婚櫎锛氬弬鏁板寲鍚庣紑銆?fast 鍚庣紑銆佹帹鐞嗗己搴﹀悗缂€銆?thinking 鍚庣紑銆? * 閲嶅鐨?-fast 鍜屾帹鐞嗗己搴﹀悗缂€銆?max 鍚庣紑锛坈odex-max 闄ゅ锛夛紝
 * 骞跺 Claude 妯″瀷鍚嶇О杩涜鐗堟湰鍙峰拰瀹舵棌鍚嶇殑閲嶆帓搴忋€? *
 * @param model - 妯″瀷 slug
 * @returns 鍩虹妯″瀷 ID锛岃緭鍏ヤ负绌烘椂杩斿洖 null
 *
 * @example
 * ```ts
 * normalizeCursorModelVariantBaseId("claude-3.5-sonnet-high") // "claude-sonnet-3-5"
 * normalizeCursorModelVariantBaseId("gpt-4o-fast")            // "gpt-4o"
 * ```
 */
export function normalizeCursorModelVariantBaseId(model: string | null | undefined): string | null {
  const trimmed = model?.trim();
  if (!trimmed) {
    return null;
  }
  let base = stripCursorParameterizedSuffix(trimmed)
    .replace(/-fast$/u, "")
    .replace(/-(?:extra-high|none|low|medium|high|xhigh)$/u, "")
    .replace(/-thinking$/u, "")
    .replace(/-fast$/u, "")
    .replace(/-(?:extra-high|none|low|medium|high|xhigh)$/u, "");

  if (base.endsWith("-max") && !base.includes("codex-max")) {
    base = base.slice(0, -"-max".length);
  }
  base = base
    .replace(/^claude-(\d+(?:\.\d+)?)-([a-z]+)-max$/u, "claude-$1-$2")
    .replace(/-preview$/u, "");

  const claudeReordered = base.match(/^claude-(\d+(?:\.\d+)?)-([a-z]+)$/u);
  if (claudeReordered) {
    const version = claudeReordered[1];
    const family = claudeReordered[2];
    if (version && family) {
      return `claude-${family}-${version.replace(".", "-")}`;
    }
  }
  return base;
}

/**
 * 鍘婚櫎鍙樹綋鏄剧ず鍚嶇О涓殑妯″紡鍚庣紑锛堝 "Fast"銆?Thinking"銆?High"銆?1M" 绛夛級銆? *
 * @param name - 鍘熷鏄剧ず鍚嶇О
 * @returns 鍘婚櫎鍚庣紑鐨勫悕绉? */
function removeVariantNameSuffix(name: string): string {
  return name
    .replace(/\s+Fast$/iu, "")
    .replace(/\s+Thinking$/iu, "")
    .replace(/\s+Fast$/iu, "")
    .replace(/\s+(?:None|Low|Medium|High|Extra High)$/iu, "")
    .replace(/\s+1M$/u, "")
    .trim();
}

/**
 * 鏍规嵁鍩虹妯″瀷 slug 鎺ㄦ柇璇ュ垎缁勭殑榛樿鎺ㄧ悊寮哄害銆? * - GPT/Codex 绯诲垪榛樿 medium
 * - Claude 绯诲垪榛樿 high
 * - 鍏朵粬绯诲垪鍙栫涓€涓彲鐢ㄥ€? *
 * @param baseSlug - 鍩虹妯″瀷 slug
 * @param efforts - 鍙敤鐨勬帹鐞嗗己搴﹀€煎垪琛? * @returns 榛樿鎺ㄧ悊寮哄害锛屾棤鍙敤鍊兼椂杩斿洖 undefined
 */
function defaultEffortForGroup(
  baseSlug: string,
  efforts: ReadonlyArray<string>,
): string | undefined {
  if (efforts.length === 0) {
    return undefined;
  }
  if (baseSlug.includes("gpt") || baseSlug.includes("codex")) {
    return efforts.includes("medium") ? "medium" : efforts[0];
  }
  if (baseSlug.includes("claude")) {
    return efforts.includes("high") ? "high" : efforts[0];
  }
  return efforts[0];
}

/**
 * 鍒ゆ柇妯″瀷鏄惁涓?1M 涓婁笅鏂囩獥鍙ｅ彉浣撱€? * 閫氳繃 defaultContextWindow銆乧ontextWindowOptions 鎴栧悕绉颁腑鐨?"1M" 鏍囪瘑鍒ゆ柇銆? *
 * @param model - 妯″瀷鎻忚堪绗? * @returns 鏄惁涓?1M 涓婁笅鏂囩獥鍙ｅ彉浣? */
function isCursorOneMillionVariant(model: ProviderModelDescriptor): boolean {
  if (model.defaultContextWindow === "1m") {
    return true;
  }
  if (
    model.contextWindowOptions?.some((option) => option.value === "1m" && option.isDefault === true)
  ) {
    return true;
  }
  return /\b1M\b/u.test(model.name ?? "");
}

/**
 * 灏?Cursor 鐨勫涓ā鍨嬪彉浣撳綊骞朵负缁熶竴鐨勬ā鍨嬫潯鐩€? * 鎸夊熀纭€妯″瀷 ID 鍒嗙粍锛屽悎骞跺悇鍙樹綋鐨勬帹鐞嗗己搴﹂€夐」銆佷笂涓嬫枃绐楀彛閫夐」銆? * fast 妯″紡鍜?thinking 妯″紡鏀寔鐘舵€併€? *
 * @param models - 鍘熷鐨勬ā鍨嬫弿杩扮鍒楄〃
 * @returns 褰掑苟鍚庣殑妯″瀷鎻忚堪绗﹀垪琛? */
export function collapseCursorModelVariants(
  models: ReadonlyArray<ProviderModelDescriptor>,
): ProviderModelDescriptor[] {
  const groups = new Map<string, ProviderModelDescriptor[]>();
  for (const model of models) {
    const baseSlug = normalizeCursorModelVariantBaseId(model.slug) ?? model.slug;
    const group = groups.get(baseSlug);
    if (group) {
      group.push(model);
    } else {
      groups.set(baseSlug, [model]);
    }
  }

  return Array.from(groups.entries()).map(([baseSlug, variants]) => {
    const preferredName =
      variants.find((variant) => variant.slug === baseSlug)?.name ??
      variants.find((variant) => !variant.slug.endsWith("-fast"))?.name ??
      variants[0]?.name ??
      baseSlug;
    const efforts = uniqueByValue(
      variants.flatMap((variant) => [
        ...(variant.supportedReasoningEfforts ?? []),
        ...(parseCursorCliReasoningEffort(variant.slug)
          ? [
              {
                value: parseCursorCliReasoningEffort(variant.slug)!,
                label: cursorReasoningLabel(parseCursorCliReasoningEffort(variant.slug)!),
              },
            ]
          : []),
      ]),
    );
    const defaultEffort =
      variants.find((variant) => normalizeCursorModelVariantBaseId(variant.slug) === variant.slug)
        ?.defaultReasoningEffort ??
      defaultEffortForGroup(
        baseSlug,
        efforts.map((effort) => effort.value),
      );
    const hasOneMillionContext = variants.some(isCursorOneMillionVariant);
    const contextWindowOptions = uniqueByValue([
      ...variants.flatMap((variant) => variant.contextWindowOptions ?? []),
      ...(hasOneMillionContext ? [{ value: "1m", label: "1M", isDefault: true as const }] : []),
    ]);

    return {
      slug: baseSlug,
      name: removeVariantNameSuffix(preferredName),
      ...(variants[0]?.upstreamProviderId
        ? { upstreamProviderId: variants[0].upstreamProviderId }
        : {}),
      ...(variants[0]?.upstreamProviderName
        ? { upstreamProviderName: variants[0].upstreamProviderName }
        : {}),
      ...(efforts.length > 0
        ? {
            supportedReasoningEfforts: efforts.map((effort) => ({
              value: effort.value,
              label: effort.label,
              ...(effort.value === defaultEffort ? { isDefault: true as const } : {}),
            })),
            ...(defaultEffort ? { defaultReasoningEffort: defaultEffort } : {}),
          }
        : {}),
      ...(variants.some((variant) => variant.supportsFastMode === true)
        ? { supportsFastMode: true as const }
        : {}),
      ...(variants.some((variant) => variant.supportsThinkingToggle === true)
        ? { supportsThinkingToggle: true as const }
        : {}),
      ...(contextWindowOptions.length > 0
        ? {
            contextWindowOptions,
            defaultContextWindow:
              contextWindowOptions.find((option) => option.isDefault === true)?.value ??
              contextWindowOptions[0]?.value,
          }
        : {}),
    };
  });
}
