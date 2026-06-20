import { writeFileSync } from 'fs';

const files = {
  'd:/Code/remi/org/modules/remi-code/remi-app/src/lib/projectReactQuery.ts': /**
 * @file projectReactQuery.ts
 * @description 项目搜索相关的 React Query 查询配置，提供工作区条目搜索和
 * 本地文件系统条目搜索的 queryOptions，供项目选择器等组件消费。
 */

import type {
  ProjectSearchEntriesResult,
  ProjectSearchLocalEntriesResult,
} from "~/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

/** 项目查询键集合，用于 React Query 缓存管理 */
export const projectQueryKeys = {
  /** 全局查询键前缀 */
  all: ["projects"] as const,
  /**
   * 工作区条目搜索查询键
   *
   * @param cwd - 工作目录
   * @param query - 搜索关键词
   * @param limit - 结果数量限制
   */
  searchEntries: (cwd: string | null, query: string, limit: number) =>
    ["projects", "search-entries", cwd, query, limit] as const,
  /**
   * 本地文件系统条目搜索查询键
   *
   * @param rootPath - 根路径
   * @param query - 搜索关键词
   * @param limit - 结果数量限制
   */
  searchLocalEntries: (rootPath: string | null, query: string, limit: number) =>
    ["projects", "search-local-entries", rootPath, query, limit] as const,
};

/** 默认工作区条目搜索结果数量限制 */
const DEFAULT_SEARCH_ENTRIES_LIMIT = 80;
/** 默认工作区条目搜索过期时间（毫秒） */
const DEFAULT_SEARCH_ENTRIES_STALE_TIME = 15_000;
/** 默认本地条目搜索结果数量限制 */
const DEFAULT_SEARCH_LOCAL_ENTRIES_LIMIT = 50;
/** 默认本地条目搜索过期时间（毫秒） */
const DEFAULT_SEARCH_LOCAL_ENTRIES_STALE_TIME = 10_000;
/** 空的工作区条目搜索结果占位 */
const EMPTY_SEARCH_ENTRIES_RESULT: ProjectSearchEntriesResult = {
  entries: [],
  truncated: false,
};
/** 空的本地条目搜索结果占位 */
const EMPTY_SEARCH_LOCAL_ENTRIES_RESULT: ProjectSearchLocalEntriesResult = {
  entries: [],
  truncated: false,
};

/**
 * 创建工作区条目搜索查询配置
 *
 * @param input - 搜索输入参数
 * @param input.cwd - 工作目录
 * @param input.query - 搜索关键词
 * @param input.enabled - 是否启用查询
 * @param input.limit - 结果数量限制
 * @param input.staleTime - 过期时间
 * @returns React Query queryOptions 配置对象
 */
export function projectSearchEntriesQueryOptions(input: {
  cwd: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_ENTRIES_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.searchEntries(input.cwd, input.query, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace entry search is unavailable.");
      }
      return api.projects.searchEntries({
        cwd: input.cwd,
        query: input.query,
        limit,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null && input.query.length > 0,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_ENTRIES_RESULT,
  });
}

/**
 * 创建本地文件系统条目搜索查询配置
 *
 * @param input - 搜索输入参数
 * @param input.rootPath - 根路径
 * @param input.query - 搜索关键词
 * @param input.enabled - 是否启用查询
 * @param input.limit - 结果数量限制
 * @param input.includeFiles - 是否包含文件
 * @param input.staleTime - 过期时间
 * @returns React Query queryOptions 配置对象
 */
export function projectSearchLocalEntriesQueryOptions(input: {
  rootPath: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  includeFiles?: boolean;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_LOCAL_ENTRIES_LIMIT;
  const trimmedQuery = input.query.trim();
  return queryOptions({
    queryKey: projectQueryKeys.searchLocalEntries(input.rootPath, trimmedQuery, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.rootPath) {
        throw new Error("Local entry search is unavailable.");
      }
      return api.projects.searchLocalEntries({
        rootPath: input.rootPath,
        query: trimmedQuery,
        limit,
        ...(input.includeFiles !== undefined ? { includeFiles: input.includeFiles } : {}),
      });
    },
    enabled: (input.enabled ?? true) && input.rootPath !== null && trimmedQuery.length >= 2,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_LOCAL_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_LOCAL_ENTRIES_RESULT,
  });
}
,

  'd:/Code/remi/org/modules/remi-code/remi-app/src/lib/projectScriptKeybindings.ts': /**
 * @file projectScriptKeybindings.ts
 * @description 项目脚本快捷键绑定处理，提供快捷键规则解码和
 * 已解析快捷键配置的命令值查询功能。
 */

import {
  type KeybindingCommand,
  type KeybindingRule,
  type ResolvedKeybindingsConfig,
} from "~/contracts";

/** 无效快捷键绑定错误提示 */
export const PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE = "Invalid keybinding.";

/** 规范化快捷键输入，去除首尾空白后返回非空字符串或 null */
function normalizeProjectScriptKeybindingInput(
  keybinding: string | null | undefined,
): string | null {
  const trimmed = keybinding?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 将原始快捷键输入解码为 KeybindingRule 对象
 *
 * @param input - 解码输入
 * @param input.keybinding - 原始快捷键字符串
 * @param input.command - 绑定的命令
 * @returns 解码后的 KeybindingRule，若快捷键为空则返回 null
 *
 * @remarks 迁移期间仅做基础非空校验；后续可接入 zod/effect schema 校验
 */
export function decodeProjectScriptKeybindingRule(input: {
  keybinding: string | null | undefined;
  command: KeybindingCommand;
}): KeybindingRule | null {
  const normalizedKey = normalizeProjectScriptKeybindingInput(input.keybinding);
  if (!normalizedKey) return null;

  if (typeof input.command !== "string" || input.command.length === 0) {
    throw new Error(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE);
  }

  return {
    key: normalizedKey,
    command: input.command,
  };
}

/**
 * 从已解析的快捷键配置中查找指定命令的快捷键值
 *
 * @param keybindings - 已解析的快捷键配置列表
 * @param command - 目标命令
 * @returns 快捷键字符串（如 "mod+shift+p"），若未找到则返回 null
 */
export function keybindingValueForCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
): string | null {
  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding || binding.command !== command) continue;

    const parts: string[] = [];
    if (binding.shortcut.modKey) parts.push("mod");
    if (binding.shortcut.ctrlKey) parts.push("ctrl");
    if (binding.shortcut.metaKey) parts.push("meta");
    if (binding.shortcut.altKey) parts.push("alt");
    if (binding.shortcut.shiftKey) parts.push("shift");
    const keyToken =
      binding.shortcut.key === " "
        ? "space"
        : binding.shortcut.key === "escape"
          ? "esc"
          : binding.shortcut.key;
    parts.push(keyToken);
    return parts.join("+");
  }
  return null;
}
,

  'd:/Code/remi/org/modules/remi-code/remi-app/src/lib/projectShortcutTargets.ts': /**
 * @file projectShortcutTargets.ts
 * @description 项目快捷方式目标解析，根据聚焦项目和最近使用项目
 * 确定快捷方式应指向的目标项目 ID。
 */

import type { ProjectId } from "~/contracts";

import type { Project } from "../types";

/** 从项目列表中解析可用的项目 ID（仅匹配 kind 为 "project" 的活跃项目） */
function resolveUsableProjectId(
  projects: readonly Project[],
  projectId: ProjectId | null,
): ProjectId | null {
  if (!projectId) {
    return null;
  }

  const project = projects.find(
    (candidate) => candidate.id === projectId && candidate.kind === "project",
  );
  return project?.id ?? null;
}

/**
 * 解析当前聚焦项目对应的目标项目 ID
 *
 * @param projects - 项目列表
 * @param focusedProjectId - 当前聚焦的项目 ID
 * @returns 可用的目标项目 ID，若不可用则返回 null
 */
export function resolveCurrentProjectTargetId(
  projects: readonly Project[],
  focusedProjectId: ProjectId | null,
): ProjectId | null {
  return resolveUsableProjectId(projects, focusedProjectId);
}

/**
 * 解析最近使用项目对应的目标项目 ID
 *
 * @param projects - 项目列表
 * @param latestProjectId - 最近使用的项目 ID
 * @returns 可用的目标项目 ID，若不可用则返回 null
 */
export function resolveLatestProjectTargetId(
  projects: readonly Project[],
  latestProjectId: ProjectId | null,
): ProjectId | null {
  return resolveUsableProjectId(projects, latestProjectId);
}
,

  'd:/Code/remi/org/modules/remi-code/remi-app/src/lib/providerAvailability.ts': /**
 * @file providerAvailability.ts
 * @description Provider 可用性状态处理，包含自定义二进制路径规范化、
 * 本地配置状态归一化、可用性判断及不可用原因提示等功能。
 */

import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ServerProviderStatus,
} from "~/contracts";

/**
 * 规范化自定义二进制路径，去除首尾空白后返回非空字符串或 null
 *
 * @param value - 原始自定义二进制路径
 * @returns 规范化后的路径，若为空则返回 null
 */
export function normalizeCustomBinaryPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 根据本地配置归一化 Provider 状态
 *
 * @param input - 归一化输入
 * @param input.provider - Provider 类型
 * @param input.status - 服务端返回的 Provider 状态
 * @param input.customBinaryPath - 用户配置的自定义二进制路径
 * @param input.confirmedCustomBinaryPath - 已确认可用的自定义二进制路径
 * @returns 归一化后的 Provider 状态，若原始状态为空则返回 null
 *
 * @remarks 当 Provider 状态未知但用户配置了自定义二进制路径时，
 * 若路径与已确认路径一致则标记为 ready，否则标记为 warning 提示可用性待确认
 */
export function normalizeProviderStatusForLocalConfig(input: {
  provider: ProviderKind;
  status: ServerProviderStatus | null | undefined;
  customBinaryPath?: string | null | undefined;
  confirmedCustomBinaryPath?: string | null | undefined;
}): ServerProviderStatus | null {
  const status = input.status ?? null;
  if (!status) {
    return null;
  }

  const customBinaryPath = normalizeCustomBinaryPath(input.customBinaryPath);
  if (!customBinaryPath) {
    return status;
  }

  if (status.available || status.authStatus !== "unknown") {
    return status;
  }

  if (normalizeCustomBinaryPath(input.confirmedCustomBinaryPath) === customBinaryPath) {
    return {
      provider: status.provider,
      available: true,
      status: "ready",
      authStatus: status.authStatus,
      checkedAt: status.checkedAt,
      ...(status.authType ? { authType: status.authType } : {}),
      ...(status.authLabel ? { authLabel: status.authLabel } : {}),
      ...(status.voiceTranscriptionAvailable !== undefined
        ? { voiceTranscriptionAvailable: status.voiceTranscriptionAvailable }
        : {}),
    };
  }

  return {
    ...status,
    available: true,
    status: "warning",
    message: \\ uses a custom local binary path in this app. Availability will be confirmed when you start a session.\,
  };
}

/**
 * 判断 Provider 是否可用（已安装且已认证）
 *
 * @param status - Provider 状态
 * @returns 是否可用
 */
export function isProviderUsable(status: ServerProviderStatus | null | undefined): boolean {
  if (!status) {
    return false;
  }
  return status.available && status.authStatus !== "unauthenticated";
}

/**
 * 获取 Provider 不可用的原因描述
 *
 * @param status - Provider 状态
 * @returns 不可用原因的人类可读描述
 */
export function providerUnavailableReason(status: ServerProviderStatus | null | undefined): string {
  if (!status) {
    return "Provider status is still loading.";
  }
  const providerLabel = PROVIDER_DISPLAY_NAMES[status.provider] ?? status.provider;
  if (status.authStatus === "unauthenticated") {
    return \\ is not authenticated yet.\;
  }
  if (!status.available) {
    return status.message ?? \\ is unavailable right now.\;
  }
  return status.message ?? \\ has limited availability right now.\;
}
,

  'd:/Code/remi/org/modules/remi-code/remi-app/src/lib/providerDiscovery.ts': /**
 * @file providerDiscovery.ts
 * @description Provider 发现相关工具函数，在聊天和浏览器界面间共享。
 * 包含工作目录解析、搜索文本归一化、技能/插件/命令搜索文本构建等辅助功能。
 */

import { resolveThreadBranchSourceCwd } from "~/shared/threadEnvironment";
import type {
  ProviderNativeCommandDescriptor,
  ProviderPluginDescriptor,
  ProviderSkillDescriptor,
} from "~/contracts";

/**
 * 解析 Provider 发现所需的工作目录
 *
 * @param options - 解析选项
 * @param options.activeThreadWorktreePath - 当前活跃线程的工作树路径
 * @param options.activeProjectCwd - 当前活跃项目的工作目录
 * @param options.serverCwd - 服务器工作目录
 * @returns 解析后的工作目录，优先使用线程工作树路径，其次使用项目目录，最后使用服务器目录
 */
export function resolveProviderDiscoveryCwd(options: {
  activeThreadWorktreePath: string | null;
  activeProjectCwd: string | null;
  serverCwd: string | null;
}): string | null {
  return (
    resolveThreadBranchSourceCwd({
      projectCwd: options.activeProjectCwd,
      worktreePath: options.activeThreadWorktreePath,
    }) ?? options.serverCwd
  );
}

/**
 * 归一化 Provider 发现搜索文本（转小写、替换分隔符为空格、合并空白）
 *
 * @param value - 原始搜索文本
 * @returns 归一化后的搜索文本
 */
export function normalizeProviderDiscoveryText(value: string | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[:\\/_-]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

/**
 * 构建技能搜索文本块，用于模糊匹配
 *
 * @param skill - Provider 技能描述
 * @returns 归一化后的搜索文本
 */
export function buildSkillSearchBlob(
  skill: Pick<ProviderSkillDescriptor, "name" | "description" | "interface">,
): string {
  return normalizeProviderDiscoveryText(
    [skill.name, skill.interface?.displayName, skill.interface?.shortDescription, skill.description]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join("\\n"),
  );
}

/**
 * 判断插件是否为已安装状态
 *
 * @param plugin - 插件描述
 * @returns 是否已安装（installed、enabled 或默认安装策略）
 */
export function isInstalledProviderPlugin(
  plugin: Pick<ProviderPluginDescriptor, "installed" | "enabled" | "installPolicy">,
): boolean {
  return plugin.installed || plugin.enabled || plugin.installPolicy === "INSTALLED_BY_DEFAULT";
}

/**
 * 构建插件搜索文本块，用于模糊匹配
 *
 * @param plugin - 插件描述
 * @returns 归一化后的搜索文本
 */
export function buildPluginSearchBlob(
  plugin: Pick<ProviderPluginDescriptor, "name" | "interface">,
): string {
  return normalizeProviderDiscoveryText(
    [
      plugin.name,
      plugin.interface?.displayName,
      plugin.interface?.shortDescription,
      plugin.interface?.category,
      plugin.interface?.developerName,
    ]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join("\\n"),
  );
}

/**
 * 构建命令搜索文本块，用于模糊匹配
 *
 * @param command - 命令描述
 * @returns 归一化后的搜索文本
 */
export function buildCommandSearchBlob(
  command: Pick<ProviderNativeCommandDescriptor, "name" | "description">,
): string {
  return normalizeProviderDiscoveryText(
    [command.name, command.description].filter(Boolean).join("\\n"),
  );
}

/**
 * 格式化技能作用域标签（首字母大写，空值默认为 "Personal"）
 *
 * @param scope - 原始作用域字符串
 * @returns 格式化后的作用域标签
 */
export function formatSkillScope(scope: string | undefined): string {
  if (!scope) return "Personal";
  const normalized = scope.trim();
  if (normalized.length === 0) return "Personal";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
,
};

for (const [filePath, content] of Object.entries(files)) {
  writeFileSync(filePath, content, 'utf8');
  console.log('Written:', filePath);
}