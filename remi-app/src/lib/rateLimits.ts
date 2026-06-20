/**
 * @file rateLimits.ts
 * @description é€ŸçŽ‡é™åˆ¶è§£æžã€å½’ä¸€åŒ–ã€æ ¼å¼åŒ–å’Œè¡Œæ´¾ç”Ÿçš„é›†ä¸­å¤„ç†æ¨¡å—ï¼Œ
 * ä½¿ UI ç»„ä»¶ä¿æŒçº¯å±•ç¤ºèŒè´£ã€‚æ”¯æŒå¤šç§ Provider çš„é€ŸçŽ‡é™åˆ¶æ•°æ®æ ¼å¼ã€‚
 */

import type { OrchestrationThread } from "~/contracts";

/** é€ŸçŽ‡é™åˆ¶çª—å£ï¼ŒåŒ…å«çª—å£æ ‡ç­¾ã€å·²ç”¨ç™¾åˆ†æ¯”ã€é‡ç½®æ—¶é—´ç­‰ä¿¡æ¯ */
export interface RateLimitWindow {
  window: string;
  usedPercent?: number;
  utilization?: number;
  resetsAt?: string;
  windowDurationMins?: number;
}

/** Provider é€ŸçŽ‡é™åˆ¶ï¼ŒåŒ…å« Provider æ ‡è¯†ã€æ›´æ–°æ—¶é—´åŠé™åˆ¶çª—å£åˆ—è¡¨ */
export interface ProviderRateLimit {
  provider: string;
  updatedAt: string;
  limits?: RateLimitWindow[];
  usedPercent?: number;
  utilization?: number;
  resetsAt?: string;
  windowDurationMins?: number;
  status?: string;
}

/** å¯è§çš„é€ŸçŽ‡é™åˆ¶è¡Œï¼Œç”¨äºŽ UI å±•ç¤º */
export interface VisibleRateLimitRow {
  id: string;
  label: string;
  remainingPercent: number;
  resetsAt?: string;
  windowDurationMins?: number;
}

const WINDOW_ORDER = new Map([
  ["5h", 0],
  ["Weekly", 1],
  ["Sonnet", 2],
  ["Current", 3],
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function clampPercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

function toUsedPercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return clampPercent(value <= 1 ? value * 100 : value);
}

function resolveUsedPercent(values: {
  usedPercent?: unknown;
  utilization?: unknown;
}): number | undefined {
  if (typeof values.usedPercent === "number") return clampPercent(values.usedPercent);
  if (typeof values.utilization === "number") return toUsedPercent(values.utilization);
  return undefined;
}

function isUpcomingReset(resetsAt: string | undefined, nowMs: number): boolean {
  if (!resetsAt) return true;
  const resetMs = Date.parse(resetsAt);
  return Number.isNaN(resetMs) || resetMs >= nowMs;
}

function toResetString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return undefined;
}

function toIsoReset(value: unknown): string | undefined {
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  return toResetString(value);
}

function windowLabelFromDuration(windowDurationMins: number | undefined): string | undefined {
  if (windowDurationMins === 300) return "5h";
  if (windowDurationMins === 10_080) return "Weekly";
  return undefined;
}

/**
 * å½’ä¸€åŒ–é€ŸçŽ‡é™åˆ¶çª—å£æ ‡ç­¾
 *
 * @param label - åŽŸå§‹æ ‡ç­¾
 * @param windowDurationMins - çª—å£æ—¶é•¿ï¼ˆåˆ†é’Ÿï¼‰
 * @returns å½’ä¸€åŒ–åŽçš„æ ‡ç­¾ï¼ˆå¦‚ "5h"ã€"Weekly"ã€"Sonnet"ã€"Current"ï¼‰
 */
export function normalizeRateLimitLabel(
  label: string | undefined,
  windowDurationMins?: number,
): string {
  const durationLabel = windowLabelFromDuration(windowDurationMins);
  if (durationLabel) return durationLabel;
  if (!label) return "Current";

  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "_");
  if (normalized === "session" || normalized === "five_hour" || normalized === "5h") {
    return "5h";
  }
  if (normalized === "weekly" || normalized === "seven_day" || normalized === "7d") {
    return "Weekly";
  }
  if (
    normalized === "seven_day_sonnet" ||
    normalized === "weekly_sonnet" ||
    normalized === "sonnet"
  ) {
    return "Sonnet";
  }
  return label;
}

function compareWindowLabels(a: string, b: string): number {
  return (WINDOW_ORDER.get(a) ?? 99) - (WINDOW_ORDER.get(b) ?? 99);
}

function normalizeLimitWindow(
  label: string,
  rawWindow: Record<string, unknown>,
): RateLimitWindow | null {
  const usedPercent = resolveUsedPercent(rawWindow);
  const windowDurationMins =
    typeof rawWindow.windowDurationMins === "number" ? rawWindow.windowDurationMins : undefined;
  const resetsAt = toIsoReset(rawWindow.resetsAt);

  if (usedPercent === undefined && !resetsAt) return null;

  const window: RateLimitWindow = {
    window: normalizeRateLimitLabel(label, windowDurationMins),
  };
  if (usedPercent !== undefined) {
    window.usedPercent = usedPercent;
  }
  if (resetsAt) {
    window.resetsAt = resetsAt;
  }
  if (windowDurationMins !== undefined) {
    window.windowDurationMins = windowDurationMins;
  }
  return window;
}

function extractLimitsFromById(payload: Record<string, unknown>): RateLimitWindow[] | undefined {
  const rateLimitsByLimitId = asRecord(payload.rateLimitsByLimitId);
  if (!rateLimitsByLimitId) return undefined;

  const limits = Object.values(rateLimitsByLimitId)
    .map((entry) => asRecord(entry))
    .flatMap((entry) => {
      if (!entry) return [];
      const primary = asRecord(entry.primary);
      if (!primary) return [];
      const label =
        typeof entry.label === "string"
          ? entry.label
          : typeof entry.window === "string"
            ? entry.window
            : "";
      const normalized = normalizeLimitWindow(label, primary);
      return normalized ? [normalized] : [];
    });

  return limits.length > 0 ? limits : undefined;
}

function extractLimitsFromArray(payload: Record<string, unknown>): RateLimitWindow[] | undefined {
  if (!Array.isArray(payload.limits)) return undefined;

  const limits = payload.limits
    .map((entry) => asRecord(entry))
    .flatMap((entry) => {
      if (!entry || typeof entry.window !== "string") return [];
      const normalized = normalizeLimitWindow(entry.window, entry);
      return normalized ? [normalized] : [];
    });

  return limits.length > 0 ? limits : undefined;
}

function extractLimitsFromCodexPayload(
  payload: Record<string, unknown>,
): RateLimitWindow[] | undefined {
  const rateLimitsRoot = asRecord(payload.rateLimits);
  const nestedRateLimits =
    rateLimitsRoot && asRecord(rateLimitsRoot.rateLimits)
      ? asRecord(rateLimitsRoot.rateLimits)
      : (rateLimitsRoot ?? payload);
  if (!nestedRateLimits) return undefined;

  const primary = asRecord(nestedRateLimits.primary);
  const secondary = asRecord(nestedRateLimits.secondary);
  const limits: RateLimitWindow[] = [];

  if (primary) {
    const normalized = normalizeLimitWindow("Session", {
      usedPercent: primary.usedPercent,
      resetsAt: primary.resetsAt,
      windowDurationMins: primary.windowDurationMins,
    });
    if (normalized) limits.push(normalized);
  }

  if (secondary) {
    const normalized = normalizeLimitWindow("Weekly", {
      usedPercent: secondary.usedPercent,
      resetsAt: secondary.resetsAt,
      windowDurationMins: secondary.windowDurationMins,
    });
    if (normalized) limits.push(normalized);
  }

  return limits.length > 0 ? limits : undefined;
}

function extractLimitsFromClaudePayload(
  payload: Record<string, unknown>,
): { limits?: RateLimitWindow[]; status?: string } | undefined {
  const info = asRecord(payload.rate_limit_info);
  if (!info) return undefined;

  const rateLimitType = typeof info.rateLimitType === "string" ? info.rateLimitType : undefined;
  const windowDurationMins =
    rateLimitType === "five_hour" ? 300 : rateLimitType === "seven_day" ? 10_080 : undefined;
  const normalized = normalizeLimitWindow(rateLimitType ?? "Current", {
    utilization: info.utilization,
    resetsAt: info.resetsAt,
    windowDurationMins,
  });

  return {
    ...(normalized ? { limits: [normalized] } : {}),
    ...(typeof info.status === "string" ? { status: info.status } : {}),
  };
}

function extractFallbackLimits(payload: Record<string, unknown>): RateLimitWindow[] | undefined {
  const usedPercent = resolveUsedPercent(payload);
  const resetsAt = toIsoReset(payload.resetsAt);
  const windowDurationMins =
    typeof payload.windowDurationMins === "number" ? payload.windowDurationMins : undefined;

  if (usedPercent === undefined && !resetsAt) return undefined;

  return [
    {
      window: normalizeRateLimitLabel(undefined, windowDurationMins),
      ...(usedPercent !== undefined ? { usedPercent } : {}),
      ...(resetsAt ? { resetsAt } : {}),
      ...(windowDurationMins !== undefined ? { windowDurationMins } : {}),
    },
  ];
}

/**
 * ä»Žçº¿ç¨‹æ´»åŠ¨åˆ—è¡¨ä¸­æ´¾ç”Ÿè´¦æˆ·çº§åˆ«çš„é€ŸçŽ‡é™åˆ¶
 *
 * @param threads - çº¿ç¨‹åˆ—è¡¨
 * @returns æŒ‰ Provider åˆ†ç»„çš„é€ŸçŽ‡é™åˆ¶æ•°ç»„
 */
export function deriveAccountRateLimits(
  threads: ReadonlyArray<Pick<OrchestrationThread, "activities">>,
): ProviderRateLimit[] {
  const byProvider = new Map<string, ProviderRateLimit>();
  const nowMs = Date.now();

  for (const thread of threads) {
    for (const activity of thread.activities) {
      if (
        activity.kind !== "account.rate-limits.updated" &&
        activity.kind !== "account.rate-limited"
      ) {
        continue;
      }

      const payload = asRecord(activity.payload);
      if (!payload) continue;

      const provider = typeof payload.provider === "string" ? payload.provider : "unknown";
      const existing = byProvider.get(provider);
      if (existing && existing.updatedAt > activity.createdAt) continue;

      const claudePayload = extractLimitsFromClaudePayload(payload);
      const limits = (
        extractLimitsFromById(payload) ??
        extractLimitsFromArray(payload) ??
        extractLimitsFromCodexPayload(payload) ??
        claudePayload?.limits ??
        extractFallbackLimits(payload)
      )
        ?.filter((limit) => isUpcomingReset(limit.resetsAt, nowMs))
        .toSorted((a, b) => compareWindowLabels(a.window, b.window));

      if (!limits || limits.length === 0) continue;

      byProvider.set(provider, {
        provider,
        updatedAt: activity.createdAt,
        limits,
        ...(claudePayload?.status ? { status: claudePayload.status } : {}),
      });
    }
  }

  return Array.from(byProvider.values());
}

/**
 * ä»Žé€ŸçŽ‡é™åˆ¶æ•°ç»„ä¸­æ´¾ç”Ÿå¯è§çš„é€ŸçŽ‡é™åˆ¶è¡Œ
 *
 * @param rateLimits - Provider é€ŸçŽ‡é™åˆ¶æ•°ç»„
 * @returns å¯è§çš„é€ŸçŽ‡é™åˆ¶è¡Œæ•°ç»„ï¼ŒæŒ‰çª—å£æ ‡ç­¾æŽ’åº
 */
export function deriveVisibleRateLimitRows(
  rateLimits: ReadonlyArray<ProviderRateLimit>,
): VisibleRateLimitRow[] {
  const rowsByLabel = new Map<string, VisibleRateLimitRow & { usedPercent: number }>();

  for (const rateLimit of rateLimits) {
    const limits =
      rateLimit.limits && rateLimit.limits.length > 0
        ? rateLimit.limits
        : [
            {
              window: normalizeRateLimitLabel(undefined, rateLimit.windowDurationMins),
              ...(() => {
                const usedPercent = resolveUsedPercent(rateLimit);
                return usedPercent !== undefined ? { usedPercent } : {};
              })(),
              ...(rateLimit.resetsAt ? { resetsAt: rateLimit.resetsAt } : {}),
              ...(typeof rateLimit.windowDurationMins === "number"
                ? { windowDurationMins: rateLimit.windowDurationMins }
                : {}),
            },
          ];

    for (const limit of limits) {
      const usedPercent = resolveUsedPercent(limit);
      if (usedPercent === undefined) continue;

      const label = normalizeRateLimitLabel(limit.window, limit.windowDurationMins);
      const row = {
        id: `${rateLimit.provider}-${label}`,
        label,
        remainingPercent: Math.round(100 - usedPercent),
        ...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {}),
        ...(typeof limit.windowDurationMins === "number"
          ? { windowDurationMins: limit.windowDurationMins }
          : {}),
        usedPercent,
      };

      const existing = rowsByLabel.get(label);
      if (!existing || usedPercent > existing.usedPercent) {
        rowsByLabel.set(label, row);
      }
    }
  }

  return Array.from(rowsByLabel.values())
    .toSorted((a, b) => compareWindowLabels(a.label, b.label))
    .map(({ usedPercent: _usedPercent, ...row }) => row);
}

/**
 * æ ¼å¼åŒ–é€ŸçŽ‡é™åˆ¶å‰©ä½™ç™¾åˆ†æ¯”
 *
 * @param remainingPercent - å‰©ä½™ç™¾åˆ†æ¯”
 * @returns æ ¼å¼åŒ–åŽçš„å­—ç¬¦ä¸²ï¼ˆå¦‚ "85%"ï¼‰
 */
export function formatRateLimitRemainingPercent(remainingPercent: number | undefined): string {
  if (remainingPercent === undefined) return "ï¿½?;
  return `${Math.round(Math.min(100, Math.max(0, remainingPercent)))}%`;
}

/**
 * æ ¼å¼åŒ–é€ŸçŽ‡é™åˆ¶é‡ç½®æ—¶é—´
 *
 * @param resetsAt - é‡ç½®æ—¶é—´çš„ ISO å­—ç¬¦ä¸²
 * @returns æ ¼å¼åŒ–åŽçš„æ—¶é—´å­—ç¬¦ä¸²ï¼ˆ24å°æ—¶å†…æ˜¾ç¤ºæ—¶åˆ†ï¼Œå¦åˆ™æ˜¾ç¤ºæœˆæ—¥ï¼‰
 */
export function formatRateLimitResetTime(resetsAt: string): string {
  const resetMs = Date.parse(resetsAt);
  if (Number.isNaN(resetMs)) return "";
  const diffMs = resetMs - Date.now();

  if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(resetMs);
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(resetMs);
}

/**
 * ä»Žé€ŸçŽ‡é™åˆ¶æ•°ç»„ä¸­æ´¾ç”Ÿ"äº†è§£æ›´å¤š"é“¾æŽ¥
 *
 * @param rateLimits - Provider é€ŸçŽ‡é™åˆ¶æ•°ç»„
 * @returns äº†è§£æ›´å¤šé“¾æŽ¥ï¼Œè‹¥å­˜åœ¨å¤šä¸ª Provider åˆ™è¿”å›ž null
 */
export function deriveRateLimitLearnMoreHref(
  rateLimits: ReadonlyArray<ProviderRateLimit>,
): string | null {
  const providers = new Set(rateLimits.map((rateLimit) => rateLimit.provider));
  if (providers.size !== 1) return null;

  const [provider] = providers;
  return deriveProviderUsageLearnMoreHref(provider);
}

/**
 * æ ¹æ® Provider ç±»åž‹æ´¾ç”Ÿç”¨é‡"äº†è§£æ›´å¤š"é“¾æŽ¥
 *
 * @param provider - Provider æ ‡è¯†
 * @returns å¯¹åº”çš„ç”¨é‡æ–‡æ¡£é“¾æŽ¥ï¼Œè‹¥æ— æ³•åŒ¹é…åˆ™è¿”å›ž null
 */
export function deriveProviderUsageLearnMoreHref(
  provider: string | null | undefined,
): string | null {
  if (provider === "codex") return "https://platform.openai.com/usage";
  if (provider === "claudeAgent") {
    return "https://docs.anthropic.com/en/docs/about-claude/models#rate-limits";
  }
  if (provider === "gemini") return "https://ai.google.dev/gemini-api/docs/quota";
  return null;
}

function mergeRateLimitWindowSets(
  preferred: ReadonlyArray<RateLimitWindow>,
  fallback: ReadonlyArray<RateLimitWindow>,
): RateLimitWindow[] {
  const merged = new Map<string, RateLimitWindow>();

  for (const limit of fallback) {
    const label = normalizeRateLimitLabel(limit.window, limit.windowDurationMins);
    merged.set(label, {
      ...limit,
      window: label,
    });
  }

  for (const limit of preferred) {
    const label = normalizeRateLimitLabel(limit.window, limit.windowDurationMins);
    const existing = merged.get(label);
    merged.set(label, {
      ...existing,
      ...limit,
      window: label,
    });
  }

  return Array.from(merged.values()).toSorted((a, b) => compareWindowLabels(a.window, b.window));
}

function mergeProviderRateLimit(
  preferred: ProviderRateLimit,
  fallback: ProviderRateLimit | undefined,
): ProviderRateLimit {
  if (!fallback) return preferred;

  return {
    provider: preferred.provider,
    updatedAt: preferred.updatedAt,
    limits: mergeRateLimitWindowSets(preferred.limits ?? [], fallback.limits ?? []),
    ...((preferred.status ?? fallback.status)
      ? { status: preferred.status ?? fallback.status }
      : {}),
  };
}

/**
 * åˆå¹¶ä¸¤ç»„ Provider é€ŸçŽ‡é™åˆ¶ï¼ˆpreferred ä¼˜å…ˆäºŽ fallbackï¼‰
 *
 * @param preferred - ä¼˜å…ˆçš„é€ŸçŽ‡é™åˆ¶æ•°ç»„
 * @param fallback - å¤‡é€‰çš„é€ŸçŽ‡é™åˆ¶æ•°ç»„
 * @returns åˆå¹¶åŽçš„é€ŸçŽ‡é™åˆ¶æ•°ç»„
 */
export function mergeProviderRateLimits(
  preferred: ReadonlyArray<ProviderRateLimit>,
  fallback: ReadonlyArray<ProviderRateLimit>,
): ProviderRateLimit[] {
  const merged = new Map<string, ProviderRateLimit>();

  for (const rateLimit of fallback) {
    merged.set(rateLimit.provider, rateLimit);
  }

  for (const rateLimit of preferred) {
    merged.set(
      rateLimit.provider,
      mergeProviderRateLimit(rateLimit, merged.get(rateLimit.provider)),
    );
  }

  return Array.from(merged.values());
}
