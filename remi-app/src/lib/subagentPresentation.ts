/**
 * @file subagentPresentation.ts
 * @description 子代理身份、昵称颜色和状态标签的归一化处理，
 * 供侧边栏行、聊天卡片和线程水合等 UI 组件消费。
 */

import {
  buildSubagentIdentityDirectory,
  extractSubagentIdentityHints as extractParsedSubagentIdentityHints,
  resolveSubagentIdentityFromDirectory,
} from "~/shared/subagents";
import { formatModelDisplayName } from "~/shared/model";

const SUBAGENT_ACCENT_PALETTE = [
  "#b84e44",
  "#2f7a5d",
  "#345fa8",
  "#a86834",
  "#7352a8",
  "#2f7480",
  "#a84d71",
  "#6a8531",
] as const;

const GENERIC_SUBAGENT_TITLES = new Set([
  "",
  "agent",
  "chat",
  "child thread",
  "conversation",
  "new chat",
  "new conversation",
  "new thread",
  "subagent",
  "thread",
]);

/** 子代理状态类型 */
export type SubagentStatusKind = "running" | "completed" | "failed" | "stopped" | "queued" | "idle";

/** 子代理展示信息，包含主标签、昵称、角色、标题、完整标签和强调色 */
export interface SubagentPresentation {
  primaryLabel: string;
  nickname: string | null;
  role: string | null;
  title: string | null;
  fullLabel: string;
  accentColor: string;
}

type SubagentThreadActivityLike = {
  payload?: unknown;
};

type SubagentThreadLike = {
  id: string;
  title?: string | null | undefined;
  parentThreadId?: string | null | undefined;
  subagentAgentId?: string | null | undefined;
  subagentNickname?: string | null | undefined;
  subagentRole?: string | null | undefined;
  activities?: ReadonlyArray<SubagentThreadActivityLike> | undefined;
};

const subagentIdentityDirectoryByActivities = new WeakMap<
  ReadonlyArray<SubagentThreadActivityLike>,
  ReturnType<typeof buildSubagentIdentityDirectory>
>();

function basename(value: string): string {
  const slashIndex = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return slashIndex >= 0 ? value.slice(slashIndex + 1) : value;
}

function fallbackSubagentLabel(value: string | null): string | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("subagent:")) {
    const segments = normalized.split(":").filter((segment) => segment.length > 0);
    return segments.at(-1) ?? normalized;
  }

  return basename(normalized);
}

function normalizeWhitespace(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeRole(role: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(role);
  return normalized ? normalized.toLowerCase() : null;
}

function isGenericSubagentTitle(title: string | null): boolean {
  if (!title) {
    return true;
  }
  const normalized = title.trim().toLowerCase();
  return GENERIC_SUBAGENT_TITLES.has(normalized) || normalized.startsWith("subagent ");
}

function parseBracketedSubagentLabel(label: string | null): {
  nickname: string | null;
  role: string | null;
} {
  if (!label) {
    return { nickname: null, role: null };
  }

  const match = /^(.*?)\s*\[([^\]]+)\]$/.exec(label.trim());
  if (!match) {
    return { nickname: null, role: null };
  }

  return {
    nickname: normalizeWhitespace(match[1]),
    role: normalizeRole(match[2]),
  };
}

function capitalizeRoleLabel(role: string | null): string | null {
  if (!role) {
    return null;
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function providerThreadIdForThread(input: {
  threadId: string;
  parentThreadId: string | null;
}): string {
  const threadId = normalizeWhitespace(input.threadId) ?? input.threadId;
  const parentThreadId = normalizeWhitespace(input.parentThreadId);
  if (!parentThreadId) {
    return threadId;
  }
  const prefix = `subagent:${parentThreadId}:`;
  return threadId.startsWith(prefix) ? threadId.slice(prefix.length) : threadId;
}

function resolveSubagentIdentityFromParentActivity(input: {
  thread: Pick<SubagentThreadLike, "id" | "parentThreadId" | "subagentAgentId">;
  threads: ReadonlyArray<SubagentThreadLike>;
}): {
  nickname: string | null;
  role: string | null;
} | null {
  const parentThreadId = normalizeWhitespace(input.thread.parentThreadId);
  if (!parentThreadId) {
    return null;
  }

  const parentThread = input.threads.find((thread) => thread.id === parentThreadId);
  if (!parentThread) {
    return null;
  }

  const activities = parentThread.activities ?? [];
  const identityDirectory =
    subagentIdentityDirectoryByActivities.get(activities) ??
    (() => {
      const nextDirectory = buildSubagentIdentityDirectory(
        activities.flatMap((activity) => {
          const root = asRecord(activity?.payload);
          const data = asRecord(root?.data);
          const item = asRecord(data?.item) ?? data ?? root;
          return item ? extractParsedSubagentIdentityHints(item) : [];
        }),
      );
      subagentIdentityDirectoryByActivities.set(activities, nextDirectory);
      return nextDirectory;
    })();
  const resolved = resolveSubagentIdentityFromDirectory(identityDirectory, {
    providerThreadId: providerThreadIdForThread({
      threadId: input.thread.id,
      parentThreadId,
    }),
    agentId: input.thread.subagentAgentId ?? null,
  });

  if (!resolved) {
    return null;
  }

  return {
    nickname: normalizeWhitespace(resolved.nickname),
    role: normalizeRole(resolved.role),
  };
}

function hashLabelSeed(seed: string): number {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

/**
 * 根据种子值计算子代理强调色
 *
 * @param seed - 种子字符串（通常为昵称或主标签）
 * @returns 十六进制颜色值
 */
export function subagentAccentColor(seed: string | null | undefined): string {
  const normalized = normalizeWhitespace(seed)?.toLowerCase() ?? "subagent";
  const index = hashLabelSeed(normalized) % SUBAGENT_ACCENT_PALETTE.length;
  return SUBAGENT_ACCENT_PALETTE[index] ?? SUBAGENT_ACCENT_PALETTE[0];
}

/**
 * 解析子代理展示信息
 *
 * @param input - 解析输入
 * @param input.nickname - 显式昵称
 * @param input.role - 显式角色
 * @param input.title - 线程标题
 * @param input.fallbackId - 备选 ID
 * @returns 子代理展示信息对象
 */
export function resolveSubagentPresentation(input: {
  nickname?: string | null | undefined;
  role?: string | null | undefined;
  title?: string | null | undefined;
  fallbackId?: string | null | undefined;
}): SubagentPresentation {
  const explicitNickname = normalizeWhitespace(input.nickname);
  const explicitRole = normalizeRole(input.role);
  const normalizedTitle = normalizeWhitespace(input.title);
  const parsedTitle = parseBracketedSubagentLabel(normalizedTitle);
  const parsedTitleNickname = isGenericSubagentTitle(parsedTitle.nickname)
    ? null
    : parsedTitle.nickname;
  const titleLabel = isGenericSubagentTitle(normalizedTitle) ? null : normalizedTitle;
  const nickname = explicitNickname ?? parsedTitleNickname;
  const role = explicitRole ?? parsedTitle.role;
  const resolvedTitle = parsedTitleNickname ? null : titleLabel;
  const normalizedFallbackId = normalizeWhitespace(input.fallbackId);
  const fallbackLabel = fallbackSubagentLabel(normalizedFallbackId) ?? "Subagent";
  const primaryLabel = nickname ?? resolvedTitle ?? capitalizeRoleLabel(role) ?? fallbackLabel;
  const fullLabel = role && nickname ? `${nickname} [${role}]` : primaryLabel;

  return {
    primaryLabel,
    nickname,
    role,
    title: resolvedTitle,
    fullLabel,
    accentColor: subagentAccentColor(nickname ?? primaryLabel),
  };
}

/**
 * 从线程对象解析子代理展示信息
 *
 * @param input - 解析输入
 * @param input.thread - 线程对象
 * @param input.threads - 线程列表（用于从父线程活动中提取身份信息）
 * @returns 子代理展示信息对象
 */
export function resolveSubagentPresentationForThread(input: {
  thread: Pick<
    SubagentThreadLike,
    "id" | "title" | "parentThreadId" | "subagentAgentId" | "subagentNickname" | "subagentRole"
  >;
  threads?: ReadonlyArray<SubagentThreadLike> | undefined;
}): SubagentPresentation {
  const derivedIdentity =
    input.threads && input.thread.parentThreadId
      ? resolveSubagentIdentityFromParentActivity({
          thread: input.thread,
          threads: input.threads,
        })
      : null;

  return resolveSubagentPresentation({
    nickname: input.thread.subagentNickname ?? derivedIdentity?.nickname,
    role: input.thread.subagentRole ?? derivedIdentity?.role,
    title: input.thread.title,
    fallbackId: input.thread.id,
  });
}

/**
 * 归一化子代理状态类型
 *
 * @param status - 原始状态字符串
 * @param isActive - 是否为活跃状态
 * @returns 归一化后的状态类型，若无法识别则返回 null
 */
export function normalizeSubagentStatusKind(
  status: string | null | undefined,
  isActive = false,
): SubagentStatusKind | null {
  if (isActive) {
    return "running";
  }

  const normalized = status?.trim().toLowerCase().replaceAll("_", " ").replaceAll("-", " ");
  if (!normalized || normalized === "unknown") {
    return null;
  }

  if (
    normalized === "running" ||
    normalized === "working" ||
    normalized === "in progress" ||
    normalized === "inprogress" ||
    normalized === "active"
  ) {
    return "running";
  }
  if (
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "finished" ||
    normalized === "success" ||
    normalized === "succeeded"
  ) {
    return "completed";
  }
  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "errored" ||
    normalized === "failure"
  ) {
    return "failed";
  }
  if (
    normalized === "stopped" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "interrupted" ||
    normalized === "aborted"
  ) {
    return "stopped";
  }
  if (
    normalized === "queued" ||
    normalized === "pending" ||
    normalized === "waiting" ||
    normalized === "starting"
  ) {
    return "queued";
  }
  if (normalized === "idle") {
    return "idle";
  }

  return null;
}

/**
 * 将子代理状态转换为人可读的标签
 *
 * @param status - 原始状态字符串
 * @param isActive - 是否为活跃状态
 * @returns 人可读的状态标签（如 "Running"、"Completed"）
 */
export function humanizeSubagentStatus(
  status: string | null | undefined,
  isActive = false,
): string | undefined {
  const normalized = normalizeSubagentStatusKind(status, isActive);
  if (!normalized) {
    return undefined;
  }

  switch (normalized) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "queued":
      return "Queued";
    case "idle":
      return "Idle";
  }
}

/**
 * 格式化子代理模型标签
 *
 * @param model - 模型标识
 * @returns 格式化后的模型显示名称
 */
export function formatSubagentModelLabel(model: string | null | undefined): string | undefined {
  return formatModelDisplayName(normalizeWhitespace(model));
}
