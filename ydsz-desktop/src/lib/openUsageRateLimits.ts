/**
 * @file OpenUsage 速率限制模块
 *
 * 本模块将 OpenUsage 的本地 HTTP 快照统一为前端速率限制组件所使用的共享速率限制模型，
 * 包含进度条与文本行的解析、ProviderKind 映射以及用量百分比计算等逻辑。
 *
 * ## 核心导出
 *
 * - `RateLimit`：速率限制条目（窗口、重置时间、剩余量、进度）
 * - `RateLimitsSnapshot`：速率限制快照
 * - `parseRateLimits`：从 OpenUsage 响应解析为统一模型
 * - `mapProviderKind`：将 OpenUsage Provider 映射到 ydsz ProviderKind
 * - `computeUsagePercent`：计算用量百分比
 *
 * ## 使用场景
 *
 * - RateLimitBanner 横幅展示
 * - RateLimitsPanel 完整面板
 * - ProviderUsagePanelContent 详细用量
 *
 * ## 注意事项
 *
 * - 不同 Provider 的速率限制字段不同，需要规范化
 * - 时间字段统一转换为 UTC
 * - 进度条使用 `usagePercent` 字段（0-100）
 */

import type { ProviderKind } from "~/contracts";

import type { ProviderRateLimit, RateLimitWindow } from "~/lib/rateLimits";
import { normalizeRateLimitLabel } from "~/lib/rateLimits";

/** OpenUsage 杩涘害琛屽師濮嬫暟鎹粨鏋勶紙瀛楁鍧囦负 unknown 浠ヨ繘琛屽畨鍏ㄧ被鍨嬫牎楠岋級 */
interface OpenUsageProgressLine {
  type?: unknown;
  label?: unknown;
  used?: unknown;
  limit?: unknown;
  resetsAt?: unknown;
  periodDurationMs?: unknown;
}

/** OpenUsage 鏂囨湰琛屽師濮嬫暟鎹粨鏋勶紙瀛楁鍧囦负 unknown 浠ヨ繘琛屽畨鍏ㄧ被鍨嬫牎楠岋級 */
interface OpenUsageTextLine {
  type?: unknown;
  label?: unknown;
  value?: unknown;
  subtitle?: unknown;
}

/** OpenUsage 蹇収鍘熷鏁版嵁缁撴瀯 */
interface OpenUsageSnapshot {
  providerId?: unknown;
  fetchedAt?: unknown;
  lines?: unknown;
}

/** OpenUsage 鐢ㄩ噺鏂囨湰琛岋紝鍖呭惈鏍囩銆佸€煎拰鍙€夊壇鏍囬 */
export interface OpenUsageUsageLine {
  /** 琛屾爣绛?*/
  label: string;
  /** 琛屽€?*/
  value: string;
  /** 鍙€夊壇鏍囬 */
  subtitle?: string;
}

/** 灏?unknown 鍊煎畨鍏ㄨ浆鎹负 Record 绫诲瀷 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** 灏?unknown 鍊煎畨鍏ㄨ浆鎹负鏈夐檺鏁板瓧 */
function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 灏?unknown 鍊煎畨鍏ㄨ浆鎹负闈炵┖瀛楃涓?*/
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** 灏嗘绉掔骇鐨勫懆鏈熸椂闀胯浆鎹负鍒嗛挓鏁?*/
function toWindowDurationMins(periodDurationMs: number | undefined): number | undefined {
  if (periodDurationMs === undefined) return undefined;
  return Math.round(periodDurationMs / 60_000);
}

/** 鏍规嵁杩涘害琛岀殑 used/limit 璁＄畻宸茬敤鐧惧垎姣旓紙0-100锛?*/
function toUsedPercent(line: OpenUsageProgressLine): number | undefined {
  const used = asFiniteNumber(line.used);
  const limit = asFiniteNumber(line.limit);
  if (used === undefined || limit === undefined || limit <= 0) return undefined;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}

/** 灏?OpenUsage providerId 鏄犲皠涓哄唴閮?ProviderKind */
function toProviderKind(providerId: string | undefined): ProviderKind | null {
  if (providerId === "codex") return "codex";
  if (providerId === "claude") return "claudeAgent";
  if (providerId === "gemini") return "gemini";
  return null;
}

/**
 * 灏嗗唴閮?ProviderKind 鏄犲皠涓?OpenUsage 鐨?providerId
 *
 * @param provider - 鍐呴儴 ProviderKind
 * @returns 瀵瑰簲鐨?OpenUsage providerId锛岃嫢鏃犳硶鏄犲皠鍒欒繑鍥?null
 */
export function openUsageProviderIdForProvider(
  provider: ProviderKind | null | undefined,
): string | null {
  if (provider === "codex") return "codex";
  if (provider === "claudeAgent") return "claude";
  if (provider === "gemini") return "gemini";
  return null;
}

/** 灏?OpenUsage 杩涘害琛屽綊涓€鍖栦负 RateLimitWindow */
function normalizeProgressLine(line: OpenUsageProgressLine): RateLimitWindow | null {
  if (line.type !== "progress") return null;

  const label = asString(line.label);
  const usedPercent = toUsedPercent(line);
  const resetsAt = asString(line.resetsAt);
  const windowDurationMins = toWindowDurationMins(asFiniteNumber(line.periodDurationMs));

  if (usedPercent === undefined && !resetsAt) return null;

  return {
    window: normalizeRateLimitLabel(label, windowDurationMins),
    ...(usedPercent !== undefined ? { usedPercent } : {}),
    ...(resetsAt ? { resetsAt } : {}),
    ...(windowDurationMins !== undefined ? { windowDurationMins } : {}),
  };
}

/** 灏?OpenUsage 鏂囨湰琛屽綊涓€鍖栦负 OpenUsageUsageLine */
function normalizeTextLine(line: OpenUsageTextLine): OpenUsageUsageLine | null {
  if (line.type !== "text") return null;

  const label = asString(line.label);
  const value = asString(line.value);
  const subtitle = asString(line.subtitle);
  if (!label || !value) return null;

  return {
    label,
    value,
    ...(subtitle ? { subtitle } : {}),
  };
}

/**
 * 灏?OpenUsage 蹇収褰掍竴鍖栦负 ProviderRateLimit 妯″瀷
 *
 * @param snapshot - OpenUsage 鍘熷蹇収鏁版嵁
 * @param preferredProvider - 褰撳揩鐓т腑鏃犳硶璇嗗埆 providerId 鏃朵娇鐢ㄧ殑澶囬€?ProviderKind
 * @returns 褰掍竴鍖栧悗鐨?ProviderRateLimit锛岃嫢鏁版嵁鏃犳晥鍒欒繑鍥?null
 */
export function normalizeOpenUsageSnapshot(
  snapshot: unknown,
  preferredProvider?: ProviderKind | null,
): ProviderRateLimit | null {
  const parsed = asRecord(snapshot) as OpenUsageSnapshot | null;
  if (!parsed) return null;

  const provider =
    toProviderKind(asString(parsed.providerId)) ??
    (preferredProvider !== undefined ? preferredProvider : null);
  if (!provider) return null;

  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const limits = lines
    .map((line) => normalizeProgressLine(asRecord(line) ?? {}))
    .filter((line): line is RateLimitWindow => line !== null);

  if (limits.length === 0) return null;

  return {
    provider,
    updatedAt: asString(parsed.fetchedAt) ?? new Date().toISOString(),
    limits,
  };
}

/**
 * 浠?OpenUsage 蹇収涓彁鍙栫敤閲忔枃鏈
 *
 * @param snapshot - OpenUsage 鍘熷蹇収鏁版嵁
 * @returns 褰掍竴鍖栧悗鐨?OpenUsageUsageLine 鏁扮粍
 */
export function normalizeOpenUsageUsageLines(snapshot: unknown): OpenUsageUsageLine[] {
  const parsed = asRecord(snapshot) as OpenUsageSnapshot | null;
  if (!parsed) return [];

  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  return lines
    .map((line) => normalizeTextLine(asRecord(line) ?? {}))
    .filter((line): line is OpenUsageUsageLine => line !== null);
}