/**
 * @file openUsageRateLimits.ts
 * @description 将 OpenUsage 本地 HTTP 快照归一化为本地工具栏弹窗所使用的共享速率限制模型。
 * 包含进度行与文本行的解析、ProviderKind 映射以及用量百分比计算等逻辑。
 */

import type { ProviderKind } from "@remi-code/contracts";

import type { ProviderRateLimit, RateLimitWindow } from "~/lib/rateLimits";
import { normalizeRateLimitLabel } from "~/lib/rateLimits";

/** OpenUsage 进度行原始数据结构（字段均为 unknown 以进行安全类型校验） */
interface OpenUsageProgressLine {
  type?: unknown;
  label?: unknown;
  used?: unknown;
  limit?: unknown;
  resetsAt?: unknown;
  periodDurationMs?: unknown;
}

/** OpenUsage 文本行原始数据结构（字段均为 unknown 以进行安全类型校验） */
interface OpenUsageTextLine {
  type?: unknown;
  label?: unknown;
  value?: unknown;
  subtitle?: unknown;
}

/** OpenUsage 快照原始数据结构 */
interface OpenUsageSnapshot {
  providerId?: unknown;
  fetchedAt?: unknown;
  lines?: unknown;
}

/** OpenUsage 用量文本行，包含标签、值和可选副标题 */
export interface OpenUsageUsageLine {
  /** 行标签 */
  label: string;
  /** 行值 */
  value: string;
  /** 可选副标题 */
  subtitle?: string;
}

/** 将 unknown 值安全转换为 Record 类型 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** 将 unknown 值安全转换为有限数字 */
function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 将 unknown 值安全转换为非空字符串 */
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** 将毫秒级的周期时长转换为分钟数 */
function toWindowDurationMins(periodDurationMs: number | undefined): number | undefined {
  if (periodDurationMs === undefined) return undefined;
  return Math.round(periodDurationMs / 60_000);
}

/** 根据进度行的 used/limit 计算已用百分比（0-100） */
function toUsedPercent(line: OpenUsageProgressLine): number | undefined {
  const used = asFiniteNumber(line.used);
  const limit = asFiniteNumber(line.limit);
  if (used === undefined || limit === undefined || limit <= 0) return undefined;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}

/** 将 OpenUsage providerId 映射为内部 ProviderKind */
function toProviderKind(providerId: string | undefined): ProviderKind | null {
  if (providerId === "codex") return "codex";
  if (providerId === "claude") return "claudeAgent";
  if (providerId === "gemini") return "gemini";
  return null;
}

/**
 * 将内部 ProviderKind 映射为 OpenUsage 的 providerId
 *
 * @param provider - 内部 ProviderKind
 * @returns 对应的 OpenUsage providerId，若无法映射则返回 null
 */
export function openUsageProviderIdForProvider(
  provider: ProviderKind | null | undefined,
): string | null {
  if (provider === "codex") return "codex";
  if (provider === "claudeAgent") return "claude";
  if (provider === "gemini") return "gemini";
  return null;
}

/** 将 OpenUsage 进度行归一化为 RateLimitWindow */
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

/** 将 OpenUsage 文本行归一化为 OpenUsageUsageLine */
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
 * 将 OpenUsage 快照归一化为 ProviderRateLimit 模型
 *
 * @param snapshot - OpenUsage 原始快照数据
 * @param preferredProvider - 当快照中无法识别 providerId 时使用的备选 ProviderKind
 * @returns 归一化后的 ProviderRateLimit，若数据无效则返回 null
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
 * 从 OpenUsage 快照中提取用量文本行
 *
 * @param snapshot - OpenUsage 原始快照数据
 * @returns 归一化后的 OpenUsageUsageLine 数组
 */
export function normalizeOpenUsageUsageLines(snapshot: unknown): OpenUsageUsageLine[] {
  const parsed = asRecord(snapshot) as OpenUsageSnapshot | null;
  if (!parsed) return [];

  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  return lines
    .map((line) => normalizeTextLine(asRecord(line) ?? {}))
    .filter((line): line is OpenUsageUsageLine => line !== null);
}