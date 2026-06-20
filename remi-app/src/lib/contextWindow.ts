/**
 * @file 涓婁笅鏂囩獥鍙ｇ鐞嗘ā鍧? * @description 鎻愪緵涓婁笅鏂囩獥鍙ｄ娇鐢ㄦ儏鍐电殑蹇収銆佽绠楀拰鏍煎紡鍖栧姛鑳姐€? *              鐢ㄤ簬璺熻釜鍜屽睍绀烘ā鍨嬩笂涓嬫枃绐楀彛鐨?token 浣跨敤鎯呭喌銆? */

import type { OrchestrationThreadActivity, ThreadTokenUsageSnapshot } from "~/contracts";

/**
 * 灏嗘湭鐭ュ€艰浆鎹负璁板綍瀵硅薄锛堝唴閮ㄥ嚱鏁帮級
 * @param value - 鏈煡鍊? * @returns 濡傛灉鏄璞″垯杩斿洖璁板綍锛屽惁鍒欒繑鍥?null
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * 灏嗘湭鐭ュ€艰浆鎹负鏈夐檺鏁板瓧锛堝唴閮ㄥ嚱鏁帮級
 * @param value - 鏈煡鍊? * @returns 濡傛灉鏄湁闄愭暟瀛楀垯杩斿洖锛屽惁鍒欒繑鍥?null
 */
function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 灏嗘湭鐭ュ€艰浆鎹负甯冨皵鍊硷紙鍐呴儴鍑芥暟锛? * @param value - 鏈煡鍊? * @returns 濡傛灉鏄竷灏斿€煎垯杩斿洖锛屽惁鍒欒繑鍥?null
 */
function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * 灏嗘湭鐭ュ€艰浆鎹负涓婁笅鏂囩獥鍙ｇ櫨鍒嗘瘮锛堝唴閮ㄥ嚱鏁帮級
 * @param value - 鏈煡鍊? * @returns 闄愬埗鍦?0-100 鑼冨洿鍐呯殑鐧惧垎姣斿€硷紝濡傛灉鏃犳晥鍒欒繑鍥?null
 */
function asContextWindowPercent(value: unknown): number | null {
  const percent = asFiniteNumber(value);
  if (percent === null) {
    return null;
  }
  return Math.max(0, Math.min(100, percent));
}

/**
 * 鍙┖涓婁笅鏂囩獥鍙ｄ娇鐢ㄩ噺绫诲瀷
 * 灏?ThreadTokenUsageSnapshot 涓彲閫夌殑瀛楁涔熸爣璁颁负鍙┖
 */
type NullableContextWindowUsage = {
  readonly [Key in keyof ThreadTokenUsageSnapshot]: undefined extends ThreadTokenUsageSnapshot[Key]
    ? Exclude<ThreadTokenUsageSnapshot[Key], undefined> | null
    : ThreadTokenUsageSnapshot[Key];
};

/**
 * 涓婁笅鏂囩獥鍙ｅ揩鐓ф帴鍙? * 鍖呭惈 token 浣跨敤閲忋€佸墿浣欓噺銆佺櫨鍒嗘瘮绛変俊鎭? */
export type ContextWindowSnapshot = NullableContextWindowUsage & {
  /** 鍓╀綑 token 鏁伴噺 */
  readonly remainingTokens: number | null;
  /** 宸蹭娇鐢ㄧ櫨鍒嗘瘮 */
  readonly usedPercentage: number | null;
  /** 鍓╀綑鐧惧垎姣?*/
  readonly remainingPercentage: number | null;
  /** 鏇存柊鏃堕棿鎴?*/
  readonly updatedAt: string;
};

/**
 * 涓婁笅鏂囩獥鍙ｉ€夋嫨鐘舵€佹帴鍙? */
export interface ContextWindowSelectionStatus {
  /** 褰撳墠娲诲姩鐨勪笂涓嬫枃绐楀彛鏍囩 */
  readonly activeLabel: string | null;
  /** 宸查€夋嫨鐨勪笂涓嬫枃绐楀彛鏍囩 */
  readonly selectedLabel: string | null;
  /** 寰呯敓鏁堢殑閫夋嫨鏍囩锛堜笌褰撳墠娲诲姩涓嶅悓鏃舵樉绀猴級 */
  readonly pendingSelectedLabel: string | null;
}

/**
 * 涓婁笅鏂囩獥鍙ｄ华琛ㄦ樉绀轰俊鎭帴鍙? */
export interface ContextWindowMeterDisplay {
  /** 宸蹭娇鐢ㄧ櫨鍒嗘瘮鏍囩 */
  readonly usedPercentageLabel: string | null;
  /** token 浣跨敤閲忔爣绛?*/
  readonly tokenUsageLabel: string;
  /** 鏄惁鏈夊彲闈犵殑 token 姣斾緥鏁版嵁 */
  readonly hasReliableTokenRatio: boolean;
  /** 瑙勮寖鍖栧悗鐨勭櫨鍒嗘瘮锛?-100锛?*/
  readonly normalizedPercentage: number;
  /** 绱у噾鏍囩 */
  readonly compactLabel: string;
  /** 鏃犻殰纰嶆爣绛?*/
  readonly ariaLabel: string;
}

/** 宸茬煡鐨勪笂涓嬫枃绐楀彛鏈€澶?token 閰嶇疆 */
const KNOWN_CONTEXT_WINDOW_MAX_TOKENS = {
  "200k": 200_000,
  "1m": 1_000_000,
} as const;

/**
 * 浠庢椿鍔ㄥ垪琛ㄤ腑鎻愬彇鏈€鏂扮殑浣跨敤閲忓揩鐓э紙鍐呴儴鍑芥暟锛? * @param activities - 绾跨▼娲诲姩鍒楄〃
 * @returns 鏈€鏂扮殑涓婁笅鏂囩獥鍙ｄ娇鐢ㄩ噺蹇収锛屽鏋滄湭鎵惧埌鍒欒繑鍥?null
 */
function deriveLatestUsageContextWindowSnapshot(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ContextWindowSnapshot | null {
  // 浠庡悗鍚戝墠閬嶅巻锛屾壘鍒版渶鏂扮殑 context-window.updated 娲诲姩
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== "context-window.updated") {
      continue;
    }

    const payload = asRecord(activity.payload);
    const rawUsedTokens = asFiniteNumber(payload?.usedTokens);
    const usedTokens = rawUsedTokens ?? 0;
    const payloadUsedPercent = asContextWindowPercent(payload?.usedPercent);
    const maxTokens = asFiniteNumber(payload?.maxTokens);
    
    // 璺宠繃鏃犳晥鐨勪娇鐢ㄩ噺鏁版嵁
    if (usedTokens <= 0 && payloadUsedPercent === null && (maxTokens === null || maxTokens <= 0)) {
      continue;
    }

    // 璁＄畻宸蹭娇鐢ㄧ櫨鍒嗘瘮
    const usedPercentage =
      payloadUsedPercent ??
      (maxTokens !== null && maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : null);
    
    // 鍒ゆ柇 token 浣跨敤閲忔槸鍚﹀彲闈?    const hasReliableTokenUsage =
      rawUsedTokens !== null &&
      (usedTokens > 0 || payloadUsedPercent === null || (maxTokens !== null && maxTokens > 0));
    
    // 璁＄畻鍓╀綑 token 鍜岀櫨鍒嗘瘮
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
 * 浠庢椿鍔ㄥ垪琛ㄤ腑鎻愬彇鏈€鏂扮殑閰嶇疆鏈€澶?token 鏁帮紙鍐呴儴鍑芥暟锛? * @param activities - 绾跨▼娲诲姩鍒楄〃
 * @returns 閰嶇疆鐨勬渶澶?token 鏁帮紝濡傛灉鏈壘鍒板垯杩斿洖 null
 */
function deriveLatestConfiguredContextWindowMaxTokens(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): number | null {
  // 浠庡悗鍚戝墠閬嶅巻锛屾壘鍒版渶鏂扮殑 context-window.configured 娲诲姩
  for (let index = activities.length - 1; index >= 0; index -= 1) {
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
 * 浠庢椿鍔ㄥ垪琛ㄤ腑娲剧敓鏈€鏂扮殑涓婁笅鏂囩獥鍙ｅ揩鐓? * @param activities - 绾跨▼娲诲姩鍒楄〃
 * @returns 鏈€鏂扮殑涓婁笅鏂囩獥鍙ｅ揩鐓э紝濡傛灉鏈壘鍒板垯杩斿洖 null
 */
export function deriveLatestContextWindowSnapshot(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ContextWindowSnapshot | null {
  const usageSnapshot = deriveLatestUsageContextWindowSnapshot(activities);
  const configuredMaxTokens = deriveLatestConfiguredContextWindowMaxTokens(activities);

  if (usageSnapshot === null && configuredMaxTokens === null) {
    return null;
  }

  // 浼樺厛浣跨敤閰嶇疆鐨勬渶澶?token 鏁?  const usedTokens = usageSnapshot?.usedTokens ?? 0;
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
 * 鏍规嵁閫夋嫨鍊兼淳鐢熶笂涓嬫枃绐楀彛蹇収
 * @param selectedValue - 閫夋嫨鐨勪笂涓嬫枃绐楀彛鍊硷紙濡?"200k" 鎴?"1m"锛? * @returns 瀵瑰簲鐨勪笂涓嬫枃绐楀彛蹇収锛屽鏋滃€兼棤鏁堝垯杩斿洖 null
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

  // 杩斿洖涓€涓垵濮嬬姸鎬佺殑蹇収锛岃〃绀哄皻鏈娇鐢?  return {
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
 * 鏍煎紡鍖栫櫨鍒嗘瘮鍊硷紙鍐呴儴鍑芥暟锛? * @param value - 鐧惧垎姣斿€? * @returns 鏍煎紡鍖栧悗鐨勭櫨鍒嗘瘮瀛楃涓诧紝濡傛灉鏃犳晥鍒欒繑鍥?null
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
 * 娲剧敓涓婁笅鏂囩獥鍙ｄ华琛ㄦ樉绀轰俊鎭? * @param usage - 涓婁笅鏂囩獥鍙ｅ揩鐓? * @returns 浠〃鏄剧ず淇℃伅瀵硅薄
 */
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
 * 娲剧敓绱鎴愭湰锛堢編鍏冿級
 * @param activities - 绾跨▼娲诲姩鍒楄〃
 * @returns 绱鎴愭湰锛屽鏋滄湭鎵惧埌鍒欒繑鍥?null
 */
export function deriveCumulativeCostUsd(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): number | null {
  let turnDeltaTotal = 0;
  let latestCumulative: number | null = null;
  let foundTurnDelta = false;
  
  // 閬嶅巻鎵€鏈?turn.completed 娲诲姩锛岀疮璁℃垚鏈?  for (const activity of activities) {
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
 * 鏍煎紡鍖栦笂涓嬫枃绐楀彛閫夋嫨鏍囩
 * @param value - 閫夋嫨鍊? * @returns 鏍煎紡鍖栧悗鐨勬爣绛撅紝濡傛灉鏃犳晥鍒欒繑鍥?null
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
 * 浠庢渶澶?token 鏁版帹鏂€夋嫨鍊? * @param maxTokens - 鏈€澶?token 鏁? * @returns 鍖归厤鐨勯€夋嫨鍊硷紝濡傛灉鏃犲尮閰嶅垯杩斿洖 null
 */
export function inferContextWindowSelectionValue(
  maxTokens: number | null | undefined,
): string | null {
  if (maxTokens == null || !Number.isFinite(maxTokens) || maxTokens <= 0) {
    return null;
  }
  
  // 鎵惧埌鏈€鎺ヨ繎鐨勫凡鐭ラ厤缃?  const bestMatch = Object.entries(KNOWN_CONTEXT_WINDOW_MAX_TOKENS).reduce<{
    value: string | null;
    relativeDistance: number;
  }>(
    (best, [value, knownMaxTokens]) => {
      const relativeDistance = Math.abs(maxTokens - knownMaxTokens) / knownMaxTokens;
      return relativeDistance < best.relativeDistance ? { value, relativeDistance } : best;
    },
    { value: null, relativeDistance: Number.POSITIVE_INFINITY },
  );
  
  // 浠呭綋鐩稿璺濈鍦?20% 浠ュ唴鏃舵墠杩斿洖鍖归厤鍊?  return bestMatch.relativeDistance <= 0.2 ? bestMatch.value : null;
}

/**
 * 娲剧敓涓婁笅鏂囩獥鍙ｉ€夋嫨鐘舵€? * @param input - 杈撳叆鍙傛暟
 * @param input.activeSnapshot - 褰撳墠娲诲姩鐨勫揩鐓? * @param input.selectedValue - 鐢ㄦ埛閫夋嫨鐨勫€? * @returns 閫夋嫨鐘舵€佸璞? */
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
 * 鏍煎紡鍖栨垚鏈紙缇庡厓锛? * @param value - 鎴愭湰鍊? * @returns 鏍煎紡鍖栧悗鐨勬垚鏈瓧绗︿覆
 */
export function formatCostUsd(value: number): string {
  if (value < 0.0001) return `$${value.toFixed(6)}`;
  if (value < 0.001) return `$${value.toFixed(5)}`;
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 0.1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * 鏍煎紡鍖栦笂涓嬫枃绐楀彛 token 鏁伴噺
 * @param value - token 鏁伴噺
 * @returns 鏍煎紡鍖栧悗鐨勫瓧绗︿覆锛堝 "1.5k" 鎴?"2m"锛? */
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
