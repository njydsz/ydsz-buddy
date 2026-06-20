/**
 * @file 娑撳﹣绗呴弬鍥╃崶閸欙絿顓搁悶鍡樐侀崸? * @description 閹绘劒绶垫稉濠佺瑓閺傚洨鐛ラ崣锝勫▏閻劍鍎忛崘鐢垫畱韫囶偆鍙庨妴浣筋吀缁犳鎷伴弽鐓庣础閸栨牕濮涢懗濮愨偓? *              閻劋绨捄鐔婚嚋閸滃苯鐫嶇粈鐑樐侀崹瀣╃瑐娑撳鏋冪粣妤€褰涢惃?token 娴ｈ法鏁ら幆鍛枌閵? */

import type { OrchestrationThreadActivity, ThreadTokenUsageSnapshot } from "~/contracts";

/**
 * 鐏忓棙婀惌銉モ偓鑹版祮閹诡澀璐熺拋鏉跨秿鐎电钖勯敍鍫濆敶闁劌鍤遍弫甯礆
 * @param value - 閺堫亞鐓￠崐? * @returns 婵″倹鐏夐弰顖氼嚠鐠炩€冲灟鏉╂柨娲栫拋鏉跨秿閿涘苯鎯侀崚娆掔箲閸?null
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * 鐏忓棙婀惌銉モ偓鑹版祮閹诡澀璐熼張澶愭閺佹澘鐡ч敍鍫濆敶闁劌鍤遍弫甯礆
 * @param value - 閺堫亞鐓￠崐? * @returns 婵″倹鐏夐弰顖涙箒闂勬劖鏆熺€涙鍨潻鏂挎礀閿涘苯鎯侀崚娆掔箲閸?null
 */
function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 鐏忓棙婀惌銉モ偓鑹版祮閹诡澀璐熺敮鍐ㄧ毜閸婄》绱欓崘鍛村劥閸戣姤鏆熼敍? * @param value - 閺堫亞鐓￠崐? * @returns 婵″倹鐏夐弰顖氱鐏忔柨鈧厧鍨潻鏂挎礀閿涘苯鎯侀崚娆掔箲閸?null
 */
function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * 鐏忓棙婀惌銉モ偓鑹版祮閹诡澀璐熸稉濠佺瑓閺傚洨鐛ラ崣锝囨閸掑棙鐦敍鍫濆敶闁劌鍤遍弫甯礆
 * @param value - 閺堫亞鐓￠崐? * @returns 闂勬劕鍩楅崷?0-100 閼煎啫娲块崘鍛畱閻ф儳鍨庡В鏂库偓纭风礉婵″倹鐏夐弮鐘虫櫏閸掓瑨绻戦崶?null
 */
function asContextWindowPercent(value: unknown): number | null {
  const percent = asFiniteNumber(value);
  if (percent === null) {
    return null;
  }
  return Math.max(0, Math.min(100, percent));
}

/**
 * 閸欘垳鈹栨稉濠佺瑓閺傚洨鐛ラ崣锝勫▏閻劑鍣虹猾璇茬€? * 鐏?ThreadTokenUsageSnapshot 娑擃厼褰查柅澶屾畱鐎涙顔屾稊鐔哥垼鐠侀璐熼崣顖溾敄
 */
type NullableContextWindowUsage = {
  readonly [Key in keyof ThreadTokenUsageSnapshot]: undefined extends ThreadTokenUsageSnapshot[Key]
    ? Exclude<ThreadTokenUsageSnapshot[Key], undefined> | null
    : ThreadTokenUsageSnapshot[Key];
};

/**
 * 娑撳﹣绗呴弬鍥╃崶閸欙絽鎻╅悡褎甯撮崣? * 閸栧懎鎯?token 娴ｈ法鏁ら柌蹇嬧偓浣稿⒖娴ｆ瑩鍣洪妴浣烘閸掑棙鐦粵澶変繆閹? */
export type ContextWindowSnapshot = NullableContextWindowUsage & {
  /** 閸撯晙缍?token 閺佷即鍣?*/
  readonly remainingTokens: number | null;
  /** 瀹歌弓濞囬悽銊ф閸掑棙鐦?*/
  readonly usedPercentage: number | null;
  /** 閸撯晙缍戦惂鎯у瀻濮?*/
  readonly remainingPercentage: number | null;
  /** 閺囧瓨鏌婇弮鍫曟？閹?*/
  readonly updatedAt: string;
};

/**
 * 娑撳﹣绗呴弬鍥╃崶閸欙綁鈧瀚ㄩ悩鑸碘偓浣瑰复閸? */
export interface ContextWindowSelectionStatus {
  /** 瑜版挸澧犲ú璇插З閻ㄥ嫪绗傛稉瀣瀮缁愭褰涢弽鍥╊劮 */
  readonly activeLabel: string | null;
  /** 瀹告煡鈧瀚ㄩ惃鍕瑐娑撳鏋冪粣妤€褰涢弽鍥╊劮 */
  readonly selectedLabel: string | null;
  /** 瀵板懐鏁撻弫鍫㈡畱闁瀚ㄩ弽鍥╊劮閿涘牅绗岃ぐ鎾冲濞茶濮╂稉宥呮倱閺冭埖妯夌粈鐚寸礆 */
  readonly pendingSelectedLabel: string | null;
}

/**
 * 娑撳﹣绗呴弬鍥╃崶閸欙絼鍗庣悰銊︽▔缁€杞颁繆閹垱甯撮崣? */
export interface ContextWindowMeterDisplay {
  /** 瀹歌弓濞囬悽銊ф閸掑棙鐦弽鍥╊劮 */
  readonly usedPercentageLabel: string | null;
  /** token 娴ｈ法鏁ら柌蹇旂垼缁?*/
  readonly tokenUsageLabel: string;
  /** 閺勵垰鎯侀張澶婂讲闂堢姷娈?token 濮ｆ柧绶ラ弫鐗堝祦 */
  readonly hasReliableTokenRatio: boolean;
  /** 鐟欏嫯瀵栭崠鏍ф倵閻ㄥ嫮娅ㄩ崚鍡樼槷閿?-100閿?*/
  readonly normalizedPercentage: number;
  /** 缁毖冨櫨閺嶅洨顒?*/
  readonly compactLabel: string;
  /** 閺冪娀娈扮喊宥嗙垼缁?*/
  readonly ariaLabel: string;
}

/** 瀹歌尙鐓￠惃鍕瑐娑撳鏋冪粣妤€褰涢張鈧径?token 闁板秶鐤?*/
const KNOWN_CONTEXT_WINDOW_MAX_TOKENS = {
  "200k": 200_000,
  "1m": 1_000_000,
} as const;

/**
 * 娴犲孩妞块崝銊ュ灙鐞涖劋鑵戦幓鎰絿閺堚偓閺傛壆娈戞担璺ㄦ暏闁插繐鎻╅悡褝绱欓崘鍛村劥閸戣姤鏆熼敍? * @param activities - 缁捐法鈻煎ú璇插З閸掓銆? * @returns 閺堚偓閺傛壆娈戞稉濠佺瑓閺傚洨鐛ラ崣锝勫▏閻劑鍣鸿箛顐ゅ弾閿涘苯顩ч弸婊勬弓閹垫儳鍩岄崚娆掔箲閸?null
 */
function deriveLatestUsageContextWindowSnapshot(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ContextWindowSnapshot | null {
  // 娴犲骸鎮楅崥鎴濆闁秴宸婚敍灞惧閸掔増娓堕弬鎵畱 context-window.updated 濞茶濮?  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== "context-window.updated") {
      continue;
    }

    const payload = asRecord(activity.payload);
    const rawUsedTokens = asFiniteNumber(payload?.usedTokens);
    const usedTokens = rawUsedTokens ?? 0;
    const payloadUsedPercent = asContextWindowPercent(payload?.usedPercent);
    const maxTokens = asFiniteNumber(payload?.maxTokens);
    
    // 鐠哄疇绻冮弮鐘虫櫏閻ㄥ嫪濞囬悽銊╁櫤閺佺増宓?    if (usedTokens <= 0 && payloadUsedPercent === null && (maxTokens === null || maxTokens <= 0)) {
      continue;
    }

    // 鐠侊紕鐣诲韫▏閻劎娅ㄩ崚鍡樼槷
    const usedPercentage =
      payloadUsedPercent ??
      (maxTokens !== null && maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : null);
    
    // 閸掋倖鏌?token 娴ｈ法鏁ら柌蹇旀Ц閸氾箑褰查棃?    const hasReliableTokenUsage =
      rawUsedTokens !== null &&
      (usedTokens > 0 || payloadUsedPercent === null || (maxTokens !== null && maxTokens > 0));
    
    // 鐠侊紕鐣婚崜鈺€缍?token 閸滃瞼娅ㄩ崚鍡樼槷
    const remainingTokens =
      maxTokens !== null && hasReliableTokenUsage
        ? Math.max(0, Math.round(maxTokens - usedTokens))
        : null;
    const remainingPercentage = usedPercentage !== null ? Math.max(0, 100 - usedPercentage) : null;

    return {
      usedTokens,
      usedPercent: payloadUsedPercent,
      totalProcessedTokens: asFiniteNumber(payload?.totalProcessedTokens),
      maxTokens,
      remainingTokens,
      usedPercentage,
      remainingPercentage,
      inputTokens: asFiniteNumber(payload?.inputTokens),
      cachedInputTokens: asFiniteNumber(payload?.cachedInputTokens),
      outputTokens: asFiniteNumber(payload?.outputTokens),
      reasoningOutputTokens: asFiniteNumber(payload?.reasoningOutputTokens),
      lastUsedTokens: asFiniteNumber(payload?.lastUsedTokens),
      lastInputTokens: asFiniteNumber(payload?.lastInputTokens),
      lastCachedInputTokens: asFiniteNumber(payload?.lastCachedInputTokens),
      lastOutputTokens: asFiniteNumber(payload?.lastOutputTokens),
      lastReasoningOutputTokens: asFiniteNumber(payload?.lastReasoningOutputTokens),
      toolUses: asFiniteNumber(payload?.toolUses),
      durationMs: asFiniteNumber(payload?.durationMs),
      compactsAutomatically: asBoolean(payload?.compactsAutomatically) ?? false,
      updatedAt: activity.createdAt,
    };
  }

  return null;
}

/**
 * 娴犲孩妞块崝銊ュ灙鐞涖劋鑵戦幓鎰絿閺堚偓閺傛壆娈戦柊宥囩枂閺堚偓婢?token 閺佸府绱欓崘鍛村劥閸戣姤鏆熼敍? * @param activities - 缁捐法鈻煎ú璇插З閸掓銆? * @returns 闁板秶鐤嗛惃鍕付婢?token 閺佸府绱濇俊鍌涚亯閺堫亝澹橀崚鏉垮灟鏉╂柨娲?null
 */
function deriveLatestConfiguredContextWindowMaxTokens(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): number | null {
  // 娴犲骸鎮楅崥鎴濆闁秴宸婚敍灞惧閸掔増娓堕弬鎵畱 context-window.configured 濞茶濮?  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== "context-window.configured") {
      continue;
    }

    const payload = asRecord(activity.payload);
    const maxTokens = asFiniteNumber(payload?.maxTokens);
    if (maxTokens !== null && maxTokens > 0) {
      return maxTokens;
    }
  }

  return null;
}

/**
 * 娴犲孩妞块崝銊ュ灙鐞涖劋鑵戝ú鍓ф晸閺堚偓閺傛壆娈戞稉濠佺瑓閺傚洨鐛ラ崣锝呮彥閻? * @param activities - 缁捐法鈻煎ú璇插З閸掓銆? * @returns 閺堚偓閺傛壆娈戞稉濠佺瑓閺傚洨鐛ラ崣锝呮彥閻撗嶇礉婵″倹鐏夐張顏呭閸掓澘鍨潻鏂挎礀 null
 */
export function deriveLatestContextWindowSnapshot(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ContextWindowSnapshot | null {
  const usageSnapshot = deriveLatestUsageContextWindowSnapshot(activities);
  const configuredMaxTokens = deriveLatestConfiguredContextWindowMaxTokens(activities);

  if (usageSnapshot === null && configuredMaxTokens === null) {
    return null;
  }

  // 娴兼ê鍘涙担璺ㄦ暏闁板秶鐤嗛惃鍕付婢?token 閺?  const usedTokens = usageSnapshot?.usedTokens ?? 0;
  const maxTokens = configuredMaxTokens ?? usageSnapshot?.maxTokens ?? null;
  const usedPercentage =
    usageSnapshot?.usedPercent ??
    (maxTokens !== null && maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : null);
  const hasReliableTokenUsage =
    usageSnapshot === null ||
    usageSnapshot.usedTokens > 0 ||
    usageSnapshot.usedPercent === null ||
    usageSnapshot.maxTokens !== null;
  const remainingTokens =
    maxTokens !== null && hasReliableTokenUsage
      ? Math.max(0, Math.round(maxTokens - usedTokens))
      : null;
  const remainingPercentage = usedPercentage !== null ? Math.max(0, 100 - usedPercentage) : null;

  return {
    usedTokens,
    usedPercent: usageSnapshot?.usedPercent ?? null,
    totalProcessedTokens: usageSnapshot?.totalProcessedTokens ?? null,
    maxTokens,
    remainingTokens,
    usedPercentage,
    remainingPercentage,
    inputTokens: usageSnapshot?.inputTokens ?? null,
    cachedInputTokens: usageSnapshot?.cachedInputTokens ?? null,
    outputTokens: usageSnapshot?.outputTokens ?? null,
    reasoningOutputTokens: usageSnapshot?.reasoningOutputTokens ?? null,
    lastUsedTokens: usageSnapshot?.lastUsedTokens ?? null,
    lastInputTokens: usageSnapshot?.lastInputTokens ?? null,
    lastCachedInputTokens: usageSnapshot?.lastCachedInputTokens ?? null,
    lastOutputTokens: usageSnapshot?.lastOutputTokens ?? null,
    lastReasoningOutputTokens: usageSnapshot?.lastReasoningOutputTokens ?? null,
    toolUses: usageSnapshot?.toolUses ?? null,
    durationMs: usageSnapshot?.durationMs ?? null,
    compactsAutomatically: usageSnapshot?.compactsAutomatically ?? false,
    updatedAt: usageSnapshot?.updatedAt ?? activities[activities.length - 1]?.createdAt ?? "",
  };
}

/**
 * 閺嶈宓侀柅澶嬪閸婂吋娣抽悽鐔剁瑐娑撳鏋冪粣妤€褰涜箛顐ゅ弾
 * @param selectedValue - 闁瀚ㄩ惃鍕瑐娑撳鏋冪粣妤€褰涢崐纭风礄婵?"200k" 閹?"1m"閿? * @returns 鐎电懓绨查惃鍕瑐娑撳鏋冪粣妤€褰涜箛顐ゅ弾閿涘苯顩ч弸婊冣偓鍏兼￥閺佸牆鍨潻鏂挎礀 null
 */
export function deriveSelectedContextWindowSnapshot(
  selectedValue: string | null | undefined,
): ContextWindowSnapshot | null {
  const normalized = selectedValue?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const maxTokens =
    KNOWN_CONTEXT_WINDOW_MAX_TOKENS[normalized as keyof typeof KNOWN_CONTEXT_WINDOW_MAX_TOKENS] ??
    null;
  if (maxTokens === null) {
    return null;
  }

  // 鏉╂柨娲栨稉鈧稉顏勫灥婵濮搁幀浣烘畱韫囶偆鍙庨敍宀冦€冪粈鍝勭毣閺堫亙濞囬悽?  return {
    usedTokens: 0,
    usedPercent: null,
    totalProcessedTokens: null,
    maxTokens,
    remainingTokens: maxTokens,
    usedPercentage: 0,
    remainingPercentage: 100,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    lastUsedTokens: null,
    lastInputTokens: null,
    lastCachedInputTokens: null,
    lastOutputTokens: null,
    lastReasoningOutputTokens: null,
    toolUses: null,
    durationMs: null,
    compactsAutomatically: false,
    updatedAt: "",
  };
}

/**
 * 閺嶇厧绱￠崠鏍閸掑棙鐦崐纭风礄閸愬懘鍎撮崙鑺ユ殶閿? * @param value - 閻ф儳鍨庡В鏂库偓? * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫮娅ㄩ崚鍡樼槷鐎涙顑佹稉璇х礉婵″倹鐏夐弮鐘虫櫏閸掓瑨绻戦崶?null
 */
function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

/**
 * 濞插墽鏁撴稉濠佺瑓閺傚洨鐛ラ崣锝勫崕鐞涖劍妯夌粈杞颁繆閹? * @param usage - 娑撳﹣绗呴弬鍥╃崶閸欙絽鎻╅悡? * @returns 娴狀亣銆冮弰鍓с仛娣団剝浼呯€电钖? */
export function deriveContextWindowMeterDisplay(
  usage: ContextWindowSnapshot,
): ContextWindowMeterDisplay {
  const usedPercentageLabel = formatPercentage(usage.usedPercentage);
  const tokenUsageLabel = formatContextWindowTokens(usage.usedTokens);
  const hasReliableTokenRatio =
    usage.maxTokens !== null &&
    (usage.usedTokens > 0 || usage.usedPercent === null || usage.remainingTokens !== null);
  const normalizedPercentage = Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
  return {
    usedPercentageLabel,
    tokenUsageLabel,
    hasReliableTokenRatio,
    normalizedPercentage,
    compactLabel:
      usage.usedPercentage !== null ? `${Math.round(usage.usedPercentage)}%` : tokenUsageLabel,
    ariaLabel: usedPercentageLabel
      ? `Context window ${usedPercentageLabel} used`
      : `Context window ${tokenUsageLabel} tokens used`,
  };
}

/**
 * 濞插墽鏁撶槐顖濐吀閹存劖婀伴敍鍫㈢法閸忓喛绱? * @param activities - 缁捐法鈻煎ú璇插З閸掓銆? * @returns 缁鳖垵顓搁幋鎰拱閿涘苯顩ч弸婊勬弓閹垫儳鍩岄崚娆掔箲閸?null
 */
export function deriveCumulativeCostUsd(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): number | null {
  let turnDeltaTotal = 0;
  let latestCumulative: number | null = null;
  let foundTurnDelta = false;
  
  // 闁秴宸婚幍鈧張?turn.completed 濞茶濮╅敍宀€鐤拋鈩冨灇閺?  for (const activity of activities) {
    if (activity.kind !== "turn.completed") continue;
    const payload = asRecord(activity.payload);
    const cumulativeCost = asFiniteNumber(payload?.cumulativeCostUsd);
    if (cumulativeCost !== null) {
      latestCumulative = cumulativeCost;
      continue;
    }
    const cost = asFiniteNumber(payload?.totalCostUsd);
    if (cost === null) continue;
    turnDeltaTotal += cost;
    foundTurnDelta = true;
  }
  
  if (latestCumulative !== null) {
    return latestCumulative + turnDeltaTotal;
  }
  return foundTurnDelta ? turnDeltaTotal : null;
}

/**
 * 閺嶇厧绱￠崠鏍︾瑐娑撳鏋冪粣妤€褰涢柅澶嬪閺嶅洨顒? * @param value - 闁瀚ㄩ崐? * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫭鐖ｇ粵鎾呯礉婵″倹鐏夐弮鐘虫櫏閸掓瑨绻戦崶?null
 */
export function formatContextWindowSelectionLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "1m") {
    return "1M";
  }
  if (normalized === "200k") {
    return "200k";
  }
  return normalized.replace(/m$/u, "M");
}

/**
 * 娴犲孩娓舵径?token 閺佺増甯归弬顓⑩偓澶嬪閸? * @param maxTokens - 閺堚偓婢?token 閺? * @returns 閸栧綊鍘ら惃鍕偓澶嬪閸婄》绱濇俊鍌涚亯閺冪姴灏柊宥呭灟鏉╂柨娲?null
 */
export function inferContextWindowSelectionValue(
  maxTokens: number | null | undefined,
): string | null {
  if (maxTokens == null || !Number.isFinite(maxTokens) || maxTokens <= 0) {
    return null;
  }
  
  // 閹垫儳鍩岄張鈧幒銉ㄧ箮閻ㄥ嫬鍑￠惌銉╁帳缂?  const bestMatch = Object.entries(KNOWN_CONTEXT_WINDOW_MAX_TOKENS).reduce<{
    value: string | null;
    relativeDistance: number;
  }>(
    (best, [value, knownMaxTokens]) => {
      const relativeDistance = Math.abs(maxTokens - knownMaxTokens) / knownMaxTokens;
      return relativeDistance < best.relativeDistance ? { value, relativeDistance } : best;
    },
    { value: null, relativeDistance: Number.POSITIVE_INFINITY },
  );
  
  // 娴犲懎缍嬮惄绋款嚠鐠烘繄顬囬崷?20% 娴犮儱鍞撮弮鑸靛鏉╂柨娲栭崠褰掑帳閸?  return bestMatch.relativeDistance <= 0.2 ? bestMatch.value : null;
}

/**
 * 濞插墽鏁撴稉濠佺瑓閺傚洨鐛ラ崣锝夆偓澶嬪閻樿埖鈧? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.activeSnapshot - 瑜版挸澧犲ú璇插З閻ㄥ嫬鎻╅悡? * @param input.selectedValue - 閻劍鍩涢柅澶嬪閻ㄥ嫬鈧? * @returns 闁瀚ㄩ悩鑸碘偓浣割嚠鐠? */
export function deriveContextWindowSelectionStatus(input: {
  activeSnapshot: ContextWindowSnapshot | null;
  selectedValue: string | null | undefined;
}): ContextWindowSelectionStatus {
  const activeValue = inferContextWindowSelectionValue(input.activeSnapshot?.maxTokens ?? null);
  const selectedValue = input.selectedValue?.trim().toLowerCase() ?? null;
  const activeLabel =
    formatContextWindowSelectionLabel(activeValue) ??
    (input.activeSnapshot?.maxTokens != null
      ? formatContextWindowTokens(input.activeSnapshot.maxTokens)
      : null);
  const selectedLabel = formatContextWindowSelectionLabel(selectedValue);
  const pendingSelectedLabel =
    selectedLabel !== null && activeValue !== null && selectedValue !== activeValue
      ? selectedLabel
      : null;

  return {
    activeLabel,
    selectedLabel,
    pendingSelectedLabel,
  };
}

/**
 * 閺嶇厧绱￠崠鏍ㄥ灇閺堫剨绱欑紘搴″帗閿? * @param value - 閹存劖婀伴崐? * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫭鍨氶張顒€鐡х粭锔胯
 */
export function formatCostUsd(value: number): string {
  if (value < 0.0001) return `$${value.toFixed(6)}`;
  if (value < 0.001) return `$${value.toFixed(5)}`;
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 0.1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * 閺嶇厧绱￠崠鏍︾瑐娑撳鏋冪粣妤€褰?token 閺佷即鍣? * @param value - token 閺佷即鍣? * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫬鐡х粭锔胯閿涘牆顩?"1.5k" 閹?"2m"閿? */
export function formatContextWindowTokens(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "0";
  }
  if (value < 1_000) {
    return `${Math.round(value)}`;
  }
  if (value < 10_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  if (value < 1_000_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}
