/**
 * @file providerDiscoveryReactQuery.ts
 * @description Provider 发现功能的 React Query 查询配置，提供技能、命令、模型、
 * Agent、插件等资源的查询 options，供 Composer 和浏览器等界面消费。
 */

import type {
  ProviderComposerCapabilities,
  ProviderKind,
  ProviderListAgentsResult,
  ProviderListCommandsResult,
  ProviderListModelsResult,
  ProviderListPluginsResult,
  ProviderListSkillsResult,
  ProviderReadPluginResult,
} from "~/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

/** 空的技能列表结果占位 */
const EMPTY_SKILLS_RESULT: ProviderListSkillsResult = {
  skills: [],
  source: "empty",
  cached: false,
};

/** 空的命令列表结果占位 */
const EMPTY_COMMANDS_RESULT: ProviderListCommandsResult = {
  commands: [],
  source: "empty",
  cached: false,
};

/** 空的模型列表结果占位 */
const EMPTY_MODELS_RESULT: ProviderListModelsResult = {
  models: [],
  source: "empty",
  cached: false,
};

/** 空的 Agent 列表结果占位 */
const EMPTY_AGENTS_RESULT: ProviderListAgentsResult = {
  agents: [],
  source: "empty",
  cached: false,
};

/** 空的插件列表结果占位 */
const EMPTY_PLUGINS_RESULT: ProviderListPluginsResult = {
  marketplaces: [],
  marketplaceLoadErrors: [],
  remoteSyncError: null,
  featuredPluginIds: [],
  source: "empty",
  cached: false,
};

/** Provider 发现查询键集合，用于 React Query 缓存管理 */
export const providerDiscoveryQueryKeys = {
  /** 全局查询键前缀 */
  all: ["provider-discovery"] as const,
  /** Composer 能力查询键 */
  composerCapabilities: (provider: ProviderKind) =>
    ["provider-discovery", "composer-capabilities", provider] as const,
  /** 命令发现查询键 */
  commands: (provider: ProviderKind, cwd: string | null, query: string, agentDir: string | null) =>
    ["provider-discovery", "commands", provider, cwd, query, agentDir] as const,
  /** 技能发现查询键 */
  skills: (provider: ProviderKind, cwd: string | null, query: string, agentDir: string | null) =>
    ["provider-discovery", "skills", provider, cwd, query, agentDir] as const,
  /** 插件列表查询键 */
  plugins: (provider: ProviderKind, cwd: string | null) =>
    ["provider-discovery", "plugins", provider, cwd] as const,
  /** 单个插件详情查询键 */
  plugin: (provider: ProviderKind, marketplacePath: string, pluginName: string) =>
    ["provider-discovery", "plugin", provider, marketplacePath, pluginName] as const,
  /** 模型列表查询键 */
  models: (
    provider: ProviderKind,
    binaryPath: string | null,
    apiEndpoint: string | null,
    agentDir: string | null,
  ) => ["provider-discovery", "models", provider, binaryPath, apiEndpoint, agentDir] as const,
  /** Agent 列表查询键 */
  agents: (provider: ProviderKind) => ["provider-discovery", "agents", provider] as const,
};

/**
 * 创建 Provider Composer 能力查询配置
 *
 * @param provider - Provider 类型
 * @returns React Query queryOptions 配置对象，staleTime 为 Infinity
 */
export function providerComposerCapabilitiesQueryOptions(provider: ProviderKind) {
  return queryOptions({
    queryKey: providerDiscoveryQueryKeys.composerCapabilities(provider),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.provider.getComposerCapabilities({ provider });
    },
    staleTime: Infinity,
  });
}

/**
 * 创建 Provider 技能列表查询配置
 *
 * @param input - 查询输入参数
 * @param input.provider - Provider 类型
 * @param input.cwd - 工作目录
 * @param input.threadId - 线程 ID
 * @param input.agentDir - Agent 目录
 * @param input.query - 搜索关键词
 * @param input.enabled - 是否启用查询
 * @returns React Query queryOptions 配置对象
 */
export function providerSkillsQueryOptions(input: {
  provider: ProviderKind;
  cwd: string | null;
  threadId?: string | null;
  agentDir?: string | null;
  query: string;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: providerDiscoveryQueryKeys.skills(
      input.provider,
      input.cwd,
      input.query,
      input.agentDir ?? null,
    ),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Skill discovery is unavailable.");
      }
      return api.provider.listSkills({
        provider: input.provider,
        cwd: input.cwd,
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(input.agentDir ? { agentDir: input.agentDir } : {}),
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null,
    staleTime: 30_000,
    placeholderData: (previous) => previous ?? EMPTY_SKILLS_RESULT,
  });
}

/**
 * 创建 Provider 命令列表查询配置
 *
 * @param input - 查询输入参数
 * @param input.provider - Provider 类型
 * @param input.cwd - 工作目录
 * @param input.threadId - 线程 ID
 * @param input.agentDir - Agent 目录
 * @param input.query - 搜索关键词
 * @param input.enabled - 是否启用查询
 * @returns React Query queryOptions 配置对象
 */
export function providerCommandsQueryOptions(input: {
  provider: ProviderKind;
  cwd: string | null;
  threadId?: string | null;
  agentDir?: string | null;
  query: string;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: providerDiscoveryQueryKeys.commands(
      input.provider,
      input.cwd,
      input.query,
      input.agentDir ?? null,
    ),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Command discovery is unavailable.");
      }
      return api.provider.listCommands({
        provider: input.provider,
        cwd: input.cwd,
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(input.agentDir ? { agentDir: input.agentDir } : {}),
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null,
    staleTime: 30_000,
    placeholderData: (previous) => previous ?? EMPTY_COMMANDS_RESULT,
  });
}

/**
 * 创建 Provider 模型列表查询配置
 *
 * @param input - 查询输入参数
 * @param input.provider - Provider 类型
 * @param input.binaryPath - 自定义二进制路径
 * @param input.apiEndpoint - API 端点
 * @param input.agentDir - Agent 目录
 * @param input.enabled - 是否启用查询
 * @returns React Query queryOptions 配置对象
 */
export function providerModelsQueryOptions(input: {
  provider: ProviderKind;
  binaryPath?: string | null;
  apiEndpoint?: string | null;
  agentDir?: string | null;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: providerDiscoveryQueryKeys.models(
      input.provider,
      input.binaryPath ?? null,
      input.apiEndpoint ?? null,
      input.agentDir ?? null,
    ),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.provider.listModels({
        provider: input.provider,
        ...(input.binaryPath ? { binaryPath: input.binaryPath } : {}),
        ...(input.apiEndpoint ? { apiEndpoint: input.apiEndpoint } : {}),
        ...(input.agentDir ? { agentDir: input.agentDir } : {}),
      });
    },
    enabled: input.enabled ?? true,
    retry: input.provider === "cursor" ? 1 : 3,
    staleTime: 60_000,
    placeholderData: (previous) => previous ?? EMPTY_MODELS_RESULT,
  });
}

/**
 * 创建 Provider Agent 列表查询配置
 *
 * @param input - 查询输入参数
 * @param input.provider - Provider 类型
 * @param input.enabled - 是否启用查询
 * @returns React Query queryOptions 配置对象
 */
export function providerAgentsQueryOptions(input: { provider: ProviderKind; enabled?: boolean }) {
  return queryOptions({
    queryKey: providerDiscoveryQueryKeys.agents(input.provider),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.provider.listAgents({ provider: input.provider });
    },
    enabled: input.enabled ?? true,
    staleTime: 60_000,
    placeholderData: (previous) => previous ?? EMPTY_AGENTS_RESULT,
  });
}

/**
 * 创建 Provider 插件列表查询配置
 *
 * @param input - 查询输入参数
 * @param input.provider - Provider 类型
 * @param input.cwd - 工作目录
 * @param input.threadId - 线程 ID
 * @param input.enabled - 是否启用查询
 * @returns React Query queryOptions 配置对象
 */
export function providerPluginsQueryOptions(input: {
  provider: ProviderKind;
  cwd: string | null;
  threadId?: string | null;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: providerDiscoveryQueryKeys.plugins(input.provider, input.cwd),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.provider.listPlugins({
        provider: input.provider,
        ...(input.cwd ? { cwd: input.cwd } : {}),
        ...(input.threadId ? { threadId: input.threadId } : {}),
      });
    },
    enabled: input.enabled ?? true,
    staleTime: 30_000,
    placeholderData: (previous) => previous ?? EMPTY_PLUGINS_RESULT,
  });
}

/**
 * 创建 Provider 单个插件详情查询配置
 *
 * @param input - 查询输入参数
 * @param input.provider - Provider 类型
 * @param input.marketplacePath - 插件市场路径
 * @param input.pluginName - 插件名称
 * @param input.enabled - 是否启用查询
 * @returns React Query queryOptions 配置对象
 */
export function providerReadPluginQueryOptions(input: {
  provider: ProviderKind;
  marketplacePath: string;
  pluginName: string;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: providerDiscoveryQueryKeys.plugin(
      input.provider,
      input.marketplacePath,
      input.pluginName,
    ),
    queryFn: async (): Promise<ProviderReadPluginResult> => {
      const api = ensureNativeApi();
      return api.provider.readPlugin({
        provider: input.provider,
        marketplacePath: input.marketplacePath,
        pluginName: input.pluginName,
      });
    },
    enabled: input.enabled ?? true,
    staleTime: 60_000,
  });
}

/**
 * 判断 Provider 是否支持技能发现
 *
 * @param capabilities - Composer 能力描述
 * @returns 是否支持技能发现
 */
export function supportsSkillDiscovery(
  capabilities: ProviderComposerCapabilities | undefined,
): boolean {
  return capabilities?.supportsSkillDiscovery === true;
}

/**
 * 判断 Provider 是否支持原生斜杠命令发现
 *
 * @param capabilities - Composer 能力描述
 * @returns 是否支持原生斜杠命令发现
 */
export function supportsNativeSlashCommandDiscovery(
  capabilities: ProviderComposerCapabilities | undefined,
): boolean {
  return capabilities?.supportsNativeSlashCommandDiscovery === true;
}

/**
 * 判断 Provider 是否支持插件发现
 *
 * @param capabilities - Composer 能力描述
 * @returns 是否支持插件发现
 */
export function supportsPluginDiscovery(
  capabilities: ProviderComposerCapabilities | undefined,
): boolean {
  return capabilities?.supportsPluginDiscovery === true;
}

/**
 * 判断 Provider 是否支持线程压缩
 *
 * @param capabilities - Composer 能力描述
 * @returns 是否支持线程压缩
 */
export function supportsThreadCompaction(
  capabilities: ProviderComposerCapabilities | undefined,
): boolean {
  return capabilities?.supportsThreadCompaction === true;
}

/**
 * 判断 Provider 是否支持线程导入
 *
 * @param capabilities - Composer 能力描述
 * @returns 是否支持线程导入
 */
export function supportsThreadImport(
  capabilities: ProviderComposerCapabilities | undefined,
): boolean {
  return capabilities?.supportsThreadImport === true;
}