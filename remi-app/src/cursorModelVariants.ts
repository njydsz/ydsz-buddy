/**
 * @file Cursor 濡€崇€烽崣妯圭秼婢跺嫮鎮? *
 * 婢跺嫮鎮?Cursor Provider 閻ㄥ嫭膩閸ㄥ褰夋担鎾崇秺楠炲爼鈧槒绶妴渚皍rsor CLI 娴兼矮璐熼崥灞肩閸╄櫣顢呭Ο鈥崇€? * 閻㈢喐鍨氭径姘嚋閸欐ü缍嬮敍鍫濐洤娑撳秴鎮撻幒銊ф倞瀵搫瀹抽妴涔玜st 濡€崇础閵嗕辜hinking 濡€崇础缁涘绱氶敍? * 閺堫剚膩閸ф鐨㈡潻娆庣昂閸欐ü缍嬭ぐ鎺戣嫙娑撹櫣绮烘稉鈧惃鍕侀崹瀣蒋閻╊噯绱濋崥鍫濊嫙閹恒劎鎮婂鍝勫闁銆嶉妴浣风瑐娑撳鏋冪粣妤€褰涢柅澶愩€嶇粵澶堚偓? */

import type { ProviderModelDescriptor } from "~/contracts";

/**
 * 閺嶈宓?value 鐎涙顔岄崢濠氬櫢閿涘奔绻氶悾娆擃浕濞嗏€冲毉閻滄壆娈戦崗鍐閵? *
 * @param values - 瀵板懎骞撻柌宥囨畱閺佹壆绮? * @returns 閸樺鍣搁崥搴ｆ畱閺佹壆绮? */
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
 * 鐏忓棙甯归悶鍡楀繁鎼达箑鈧壈娴嗛幑顫礋閸欘垵顕伴弽鍥╊劮閵? *
 * @param value - 閹恒劎鎮婂鍝勫閸樼喎顫愰崐纭风礄婵?"xhigh"閵?max"閵?low"閿? * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫭鐖ｇ粵? */
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
 * 娴?Cursor CLI 濡€崇€烽崥宥囆炴稉顓⌒掗弸鎰腹閻炲棗宸辨惔锔肩礄reasoning effort閿涘鎮楃紓鈧妴? * 娴犲孩膩閸ㄥ鎮曠粔鐗堟汞鐏忔儳鎮滈崜宥嗗閹诲骏绱濈拠鍡楀焼 "max"閵?none"閵?low"閵?medium"閵?high"閵?xhigh" 缁涘鐖ｇ拋鑸偓? * "extra-high" 娴兼俺顫﹁ぐ鎺嶇閸栨牔璐?"xhigh"閵? *
 * @param model - Cursor CLI 濡€崇€烽崥宥囆? * @returns 閹恒劎鎮婂鍝勫閸婄》绱濋張顏呭閸掓媽绻戦崶?undefined
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
 * 閸樺娅?Cursor 濡€崇€烽崥宥囆炴稉顓犳畱閸欏倹鏆熼崠鏍ф倵缂傗偓閿涘牊鏌熼幏顒€褰块崘鍛啇閿涘鈧? * 娓氬顩?"claude-3.5-sonnet[thinking]" 閳?"claude-3.5-sonnet"
 *
 * @param value - 閸樼喎顫愬Ο鈥崇€烽崥宥囆? * @returns 閸樺娅庨崣鍌涙殶閸栨牕鎮楃紓鈧惃鍕倳缁? */
function stripCursorParameterizedSuffix(value: string): string {
  return value.trim().replace(/\[[^\]]*\]$/u, "");
}

/**
 * 鐏?Cursor 濡€崇€烽崣妯圭秼閻?slug 閺嶅洤鍣崠鏍﹁礋閸╄櫣顢呭Ο鈥崇€?ID閵? * 娓氭繃顐奸崢濠氭珟閿涙艾寮弫鏉垮閸氬海绱戦妴?fast 閸氬海绱戦妴浣瑰腹閻炲棗宸辨惔锕€鎮楃紓鈧妴?thinking 閸氬海绱戦妴? * 闁插秴顦查惃?-fast 閸滃本甯归悶鍡楀繁鎼达箑鎮楃紓鈧妴?max 閸氬海绱戦敍鍧坥dex-max 闂勩倕顦婚敍澶涚礉
 * 楠炶泛顕?Claude 濡€崇€烽崥宥囆炴潻娑滎攽閻楀牊婀伴崣宄版嫲鐎硅埖妫岄崥宥囨畱闁插秵甯撴惔蹇嬧偓? *
 * @param model - 濡€崇€?slug
 * @returns 閸╄櫣顢呭Ο鈥崇€?ID閿涘矁绶崗銉よ礋缁岀儤妞傛潻鏂挎礀 null
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
 * 閸樺娅庨崣妯圭秼閺勫墽銇氶崥宥囆炴稉顓犳畱濡€崇础閸氬海绱戦敍鍫濐洤 "Fast"閵?Thinking"閵?High"閵?1M" 缁涘绱氶妴? *
 * @param name - 閸樼喎顫愰弰鍓с仛閸氬秶袨
 * @returns 閸樺娅庨崥搴ｇ磻閻ㄥ嫬鎮曠粔? */
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
 * 閺嶈宓侀崺铏诡攨濡€崇€?slug 閹恒劍鏌囩拠銉ュ瀻缂佸嫮娈戞妯款吇閹恒劎鎮婂鍝勫閵? * - GPT/Codex 缁鍨妯款吇 medium
 * - Claude 缁鍨妯款吇 high
 * - 閸忔湹绮化璇插灙閸欐牜顑囨稉鈧稉顏勫讲閻劌鈧? *
 * @param baseSlug - 閸╄櫣顢呭Ο鈥崇€?slug
 * @param efforts - 閸欘垳鏁ら惃鍕腹閻炲棗宸辨惔锕€鈧厧鍨悰? * @returns 姒涙顓婚幒銊ф倞瀵搫瀹抽敍灞炬￥閸欘垳鏁ら崐鍏兼鏉╂柨娲?undefined
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
 * 閸掋倖鏌囧Ο鈥崇€烽弰顖氭儊娑?1M 娑撳﹣绗呴弬鍥╃崶閸欙絽褰夋担鎾扁偓? * 闁俺绻?defaultContextWindow閵嗕恭ontextWindowOptions 閹存牕鎮曠粔棰佽厬閻?"1M" 閺嶅洩鐦戦崚銈嗘焽閵? *
 * @param model - 濡€崇€烽幓蹇氬牚缁? * @returns 閺勵垰鎯佹稉?1M 娑撳﹣绗呴弬鍥╃崶閸欙絽褰夋担? */
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
 * 鐏?Cursor 閻ㄥ嫬顦挎稉顏吥侀崹瀣綁娴ｆ挸缍婇獮鏈佃礋缂佺喍绔撮惃鍕侀崹瀣蒋閻╊喓鈧? * 閹稿鐔€绾偓濡€崇€?ID 閸掑棛绮嶉敍灞芥値楠炶泛鎮囬崣妯圭秼閻ㄥ嫭甯归悶鍡楀繁鎼达箓鈧銆嶉妴浣风瑐娑撳鏋冪粣妤€褰涢柅澶愩€嶉妴? * fast 濡€崇础閸?thinking 濡€崇础閺€顖涘瘮閻樿埖鈧降鈧? *
 * @param models - 閸樼喎顫愰惃鍕侀崹瀣伎鏉╂壆顑侀崚妤勩€? * @returns 瑜版帒鑻熼崥搴ｆ畱濡€崇€烽幓蹇氬牚缁楋箑鍨悰? */
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
