/**
 * @file 上下文窗口管理模�? * @description 提供上下文窗口使用情况的快照、计算和格式化功能�? *              用于跟踪和展示模型上下文窗口�?token 使用情况�? */

import type { OrchestrationThreadActivity, ThreadTokenUsageSnapshot } from "~/contracts";

/**
 * 将未知值转换为记录对象（内部函数）
 * @param value - 未知�? * @returns 如果是对象则返回记录，否则返�?null
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * 将未知值转换为有限数字（内部函数）
 * @param value - 未知�? * @returns 如果是有限数字则返回，否则返�?null
 */
function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 将未知值转换为布尔值（内部函数�? * @param value - 未知�? * @returns 如果是布尔值则返回，否则返�?null
 */
function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * 将未知值转换为上下文窗口百分比（内部函数）
 * @param value - 未知�? * @returns 限制�?0-100 范围内的百分比值，如果无效则返�?null
 */
function asContextWindowPercent(value: unknown): number | null {
  const percent = asFiniteNumber(value);
  if (percent === null) {
    return null;
  }
  return Math.max(0, Math.min(100, percent));
}

/**
 * 可空上下文窗口使用量类型
 * �?ThreadTokenUsageSnapshot 中可选的字段也标记为可空
 */
type NullableContextWindowUsage = {
  readonly [Key in keyof ThreadTokenUsageSnapshot]: undefined extends ThreadTokenUsageSnapshot[Key]
    ? Exclude<ThreadTokenUsageSnapshot[Key], undefined> | null
    : ThreadTokenUsageSnapshot[Key];
};

/**
 * 上下文窗口快照接�? * 包含 token 使用量、剩余量、百分比等信�? */
export type ContextWindowSnapshot = NullableContextWindowUsage & {
  /** 剩余 token 数量 */
  readonly remainingTokens: number | null;
  /** 已使用百分比 */
  readonly usedPercentage: number | null;
  /** 剩余百分�?*/
  readonly remainingPercentage: number | null;
  /** 更新时间�?*/
  readonly updatedAt: string;
};

/**
 * 上下文窗口选择状态接�? */
export interface ContextWindowSelectionStatus {
  /** 当前活动的上下文窗口标签 */
  readonly activeLabel: string | null;
  /** 已选择的上下文窗口标签 */
  readonly selectedLabel: string | null;
  /** 待生效的选择标签（与当前活动不同时显示） */
  readonly pendingSelectedLabel: string | null;
}

/**
 * 上下文窗口仪表显示信息接�? */
export interface ContextWindowMeterDisplay {
  /** 已使用百分比标签 */
  readonly usedPercentageLabel: string | null;
  /** token 使用量标�?*/
  readonly tokenUsageLabel: string;
  /** 是否有可靠的 token 比例数据 */
  readonly hasReliableTokenRatio: boolean;
  /** 规范化后的百分比�?-100�?*/
  readonly normalizedPercentage: number;
  /** 紧凑标签 */
  readonly compactLabel: string;
  /** 无障碍标�?*/
  readonly ariaLabel: string;
}

/** 已知的上下文窗口最�?token 配置 */
const KNOWN_CONTEXT_WINDOW_MAX_TOKENS = {
  "200k": 200_000,
  "1m": 1_000_000,
} as const;

/**
 * 从活动列表中提取最新的使用量快照（内部函数�? * @param activities - 线程活动列表
 * @returns 最新的上下文窗口使用量快照，如果未找到则返�?null
 */
function deriveLatestUsageContextWindowSnapshot(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ContextWindowSnapshot | null {
  // 从后向前遍历，找到最新的 context-window.updated 活动
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
    
    // 跳过无效的使用量数据
    if (usedTokens <= 0 && payloadUsedPercent === null && (maxTokens === null || maxTokens <= 0)) {
      continue;
    }

    // 计算已使用百分比
    const usedPercentage =
      payloadUsedPercent ??
      (maxTokens !== null && maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : null);
    
    // 判断 token 使用量是否可�?    const hasReliableTokenUsage =
      rawUsedTokens !== null &&
      (usedTokens > 0 || payloadUsedPercent === null || (maxTokens !== null && maxTokens > 0));
    
    // 计算剩余 token 和百分比
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
 * 从活动列表中提取最新的配置最�?token 数（内部函数�? * @param activities - 线程活动列表
 * @returns 配置的最�?token 数，如果未找到则返回 null
 */
function deriveLatestConfiguredContextWindowMaxTokens(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): number | null {
  // 从后向前遍历，找到最新的 context-window.configured 活动
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
 * 从活动列表中派生最新的上下文窗口快�? * @param activities - 线程活动列表
 * @returns 最新的上下文窗口快照，如果未找到则返回 null
 */
export function deriveLatestContextWindowSnapshot(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ContextWindowSnapshot | null {
  const usageSnapshot = deriveLatestUsageContextWindowSnapshot(activities);
  const configuredMaxTokens = deriveLatestConfiguredContextWindowMaxTokens(activities);

  if (usageSnapshot === null && configuredMaxTokens === null) {
    return null;
  }

  // 优先使用配置的最�?token �?  const usedTokens = usageSnapshot?.usedTokens ?? 0;
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
 * 根据选择值派生上下文窗口快照
 * @param selectedValue - 选择的上下文窗口值（�?"200k" �?"1m"�? * @returns 对应的上下文窗口快照，如果值无效则返回 null
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

  // 返回一个初始状态的快照，表示尚未使�?  return {
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
 * 格式化百分比值（内部函数�? * @param value - 百分比�? * @returns 格式化后的百分比字符串，如果无效则返�?null
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
 * 派生上下文窗口仪表显示信�? * @param usage - 上下文窗口快�? * @returns 仪表显示信息对象
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
 * 派生累计成本（美元）
 * @param activities - 线程活动列表
 * @returns 累计成本，如果未找到则返�?null
 */
export function deriveCumulativeCostUsd(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): number | null {
  let turnDeltaTotal = 0;
  let latestCumulative: number | null = null;
  let foundTurnDelta = false;
  
  // 遍历所�?turn.completed 活动，累计成�?  for (const activity of activities) {
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
 * 格式化上下文窗口选择标签
 * @param value - 选择�? * @returns 格式化后的标签，如果无效则返�?null
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
 * 从最�?token 数推断选择�? * @param maxTokens - 最�?token �? * @returns 匹配的选择值，如果无匹配则返回 null
 */
export function inferContextWindowSelectionValue(
  maxTokens: number | null | undefined,
): string | null {
  if (maxTokens == null || !Number.isFinite(maxTokens) || maxTokens <= 0) {
    return null;
  }
  
  // 找到最接近的已知配�?  const bestMatch = Object.entries(KNOWN_CONTEXT_WINDOW_MAX_TOKENS).reduce<{
    value: string | null;
    relativeDistance: number;
  }>(
    (best, [value, knownMaxTokens]) => {
      const relativeDistance = Math.abs(maxTokens - knownMaxTokens) / knownMaxTokens;
      return relativeDistance < best.relativeDistance ? { value, relativeDistance } : best;
    },
    { value: null, relativeDistance: Number.POSITIVE_INFINITY },
  );
  
  // 仅当相对距离�?20% 以内时才返回匹配�?  return bestMatch.relativeDistance <= 0.2 ? bestMatch.value : null;
}

/**
 * 派生上下文窗口选择状�? * @param input - 输入参数
 * @param input.activeSnapshot - 当前活动的快�? * @param input.selectedValue - 用户选择的�? * @returns 选择状态对�? */
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
 * 格式化成本（美元�? * @param value - 成本�? * @returns 格式化后的成本字符串
 */
export function formatCostUsd(value: number): string {
  if (value < 0.0001) return `$${value.toFixed(6)}`;
  if (value < 0.001) return `$${value.toFixed(5)}`;
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 0.1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * 格式化上下文窗口 token 数量
 * @param value - token 数量
 * @returns 格式化后的字符串（如 "1.5k" �?"2m"�? */
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
