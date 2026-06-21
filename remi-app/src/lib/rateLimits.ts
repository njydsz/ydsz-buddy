// FILE: rateLimits.ts
// Purpose: Centralizes rate-limit parsing, normalization, formatting, and row derivation
// for provider runtime events so UI components can stay presentation-only.

import type { OrchestrationThread } from "@remi-claw/contracts";

export interface RateLimitWindow {
  window: string;
  usedPercent?: number;
  utilization?: number;
  resetsAt?: string;
  windowDurationMins?: number;
}

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

export interface VisibleRateLimitRow {
  id: string;
  label: string;
  remainingPercent: number;
  resetsAt?: string;
  windowDurationMins?: number;
}

// Payload type definitions for rate limit activities
interface RateLimitWindowPayload {
  usedPercent?: number;
  utilization?: number;
  resetsAt?: string | number;
  windowDurationMins?: number;
  window?: string;
}

interface RateLimitEntryPayload {
  label?: string;
  window?: string;
  primary?: RateLimitWindowPayload;
  secondary?: RateLimitWindowPayload;
}

interface RateLimitsByIdPayload {
  [limitId: string]: RateLimitEntryPayload;
}

interface RateLimitArrayEntryPayload {
  window: string;
  usedPercent?: number;
  utilization?: number;
  resetsAt?: string | number;
  windowDurationMins?: number;
}

interface CodexRateLimitPayload {
  rateLimits?: {
    rateLimits?: {
      primary?: RateLimitWindowPayload;
      secondary?: RateLimitWindowPayload;
    };
    primary?: RateLimitWindowPayload;
    secondary?: RateLimitWindowPayload;
  };
}

interface ClaudeRateLimitInfoPayload {
  rateLimitType?: string;
  utilization?: number;
  resetsAt?: string;
  status?: string;
}

interface RateLimitActivityPayload {
  provider?: string;
  rateLimitsByLimitId?: RateLimitsByIdPayload;
  limits?: RateLimitArrayEntryPayload[];
  rateLimits?: CodexRateLimitPayload["rateLimits"];
  rate_limit_info?: ClaudeRateLimitInfoPayload;
  usedPercent?: number;
  utilization?: number;
  resetsAt?: string | number;
  windowDurationMins?: number;
}

const WINDOW_ORDER = new Map([
  ["5h", 0],
  ["Weekly", 1],
  ["Sonnet", 2],
  ["Current", 3],
]);

function asRateLimitPayload(value: unknown): RateLimitActivityPayload | null {
  return value && typeof value === "object" ? (value as RateLimitActivityPayload) : null;
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
  usedPercent?: number;
  utilization?: number;
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
  rawWindow: RateLimitWindowPayload,
): RateLimitWindow | null {
  const usedPercent = resolveUsedPercent(rawWindow);
  const windowDurationMins = rawWindow.windowDurationMins;
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

function extractLimitsFromById(payload: RateLimitActivityPayload): RateLimitWindow[] | undefined {
  const rateLimitsByLimitId = payload.rateLimitsByLimitId;
  if (!rateLimitsByLimitId) return undefined;

  const limits = Object.values(rateLimitsByLimitId)
    .flatMap((entry) => {
      const primary = entry.primary;
      if (!primary) return [];
      const label = entry.label ?? entry.window ?? "";
      const normalized = normalizeLimitWindow(label, primary);
      return normalized ? [normalized] : [];
    });

  return limits.length > 0 ? limits : undefined;
}

function extractLimitsFromArray(payload: RateLimitActivityPayload): RateLimitWindow[] | undefined {
  if (!Array.isArray(payload.limits)) return undefined;

  const limits = payload.limits
    .flatMap((entry) => {
      if (!entry.window) return [];
      const normalized = normalizeLimitWindow(entry.window, entry);
      return normalized ? [normalized] : [];
    });

  return limits.length > 0 ? limits : undefined;
}

function extractLimitsFromCodexPayload(
  payload: RateLimitActivityPayload,
): RateLimitWindow[] | undefined {
  const rateLimitsRoot = payload.rateLimits;
  if (!rateLimitsRoot) return undefined;

  const nestedRateLimits = rateLimitsRoot.rateLimits ?? rateLimitsRoot;
  
  const primary = nestedRateLimits.primary;
  const secondary = nestedRateLimits.secondary;
  const limits: RateLimitWindow[] = [];

  if (primary) {
    const normalized = normalizeLimitWindow("Session", primary);
    if (normalized) limits.push(normalized);
  }

  if (secondary) {
    const normalized = normalizeLimitWindow("Weekly", secondary);
    if (normalized) limits.push(normalized);
  }

  return limits.length > 0 ? limits : undefined;
}

function extractLimitsFromClaudePayload(
  payload: RateLimitActivityPayload,
): { limits?: RateLimitWindow[]; status?: string } | undefined {
  const info = payload.rate_limit_info;
  if (!info) return undefined;

  const rateLimitType = info.rateLimitType;
  const windowDurationMins =
    rateLimitType === "five_hour" ? 300 : rateLimitType === "seven_day" ? 10_080 : undefined;
  const normalized = normalizeLimitWindow(rateLimitType ?? "Current", {
    utilization: info.utilization,
    resetsAt: info.resetsAt,
    windowDurationMins,
  });

  return {
    ...(normalized ? { limits: [normalized] } : {}),
    ...(info.status ? { status: info.status } : {}),
  };
}

function extractFallbackLimits(payload: RateLimitActivityPayload): RateLimitWindow[] | undefined {
  const usedPercent = resolveUsedPercent(payload);
  const resetsAt = toIsoReset(payload.resetsAt);
  const windowDurationMins = payload.windowDurationMins;

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

      const payload = asRateLimitPayload(activity.payload);
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

export function formatRateLimitRemainingPercent(remainingPercent: number | undefined): string {
  if (remainingPercent === undefined) return "â€?;
  return `${Math.round(Math.min(100, Math.max(0, remainingPercent)))}%`;
}

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

export function deriveRateLimitLearnMoreHref(
  rateLimits: ReadonlyArray<ProviderRateLimit>,
): string | null {
  const providers = new Set(rateLimits.map((rateLimit) => rateLimit.provider));
  if (providers.size !== 1) return null;

  const [provider] = providers;
  return deriveProviderUsageLearnMoreHref(provider);
}

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
