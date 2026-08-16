/**
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
    .replace(/[/:_-]+/g, " ")
    .replace(/\s+/g, " ")
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
      .join("\n"),
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
      .join("\n"),
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
    [command.name, command.description].filter(Boolean).join("\n"),
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