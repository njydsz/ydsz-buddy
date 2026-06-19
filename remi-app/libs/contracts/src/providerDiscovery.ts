/**
 * Provider 发现与能力查询契约
 *
 * 定义 Provider 能力发现相关的数据结构，包括：
 * - 技能（Skills）的发现与描述
 * - 命令（Commands）的列表
 * - 插件（Plugins）的市场与详情
 * - 模型（Models）的列表与配置
 * - 代理（Agents）的列表
 *
 * 这些 Schema 用于查询 Provider 支持的功能和可用资源。
 */

// FILE: providerDiscovery.ts
// Purpose: Defines provider discovery request/response contracts shared across web and server.
// Layer: Shared contracts
// Exports: provider discovery schemas and inferred types used by the WS/native API.

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";
import { ProviderOptionDescriptor } from "./model";

/** Provider 发现类型枚举，标识不同的 Provider 来源 */
const ProviderDiscoveryKind = Schema.Literals([
  "codex",
  "claudeAgent",
  "cursor",
  "gemini",
  "grok",
  "kilo",
  "opencode",
  "pi",
]);

/** 技能接口描述，包含显示名称和简短描述 */
export const ProviderSkillInterface = Schema.Struct({
  /** 显示名称 */
  displayName: Schema.optional(TrimmedNonEmptyString),
  /** 简短描述 */
  shortDescription: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderSkillInterface = typeof ProviderSkillInterface.Type;

/**
 * 技能描述符
 *
 * 描述一个可用的技能，包含名称、描述、路径、启用状态等信息。
 * 技能是 Provider 提供的特定功能模块。
 */
export const ProviderSkillDescriptor = Schema.Struct({
  /** 技能名称 */
  name: TrimmedNonEmptyString,
  /** 技能描述 */
  description: Schema.optional(TrimmedNonEmptyString),
  /** 技能路径 */
  path: TrimmedNonEmptyString,
  /** 是否启用 */
  enabled: Schema.Boolean,
  /** 作用域 */
  scope: Schema.optional(TrimmedNonEmptyString),
  /** 接口信息 */
  interface: Schema.optional(ProviderSkillInterface),
  /** 依赖项 */
  dependencies: Schema.optional(Schema.Unknown),
});
export type ProviderSkillDescriptor = typeof ProviderSkillDescriptor.Type;

/** 技能引用，用于在消息中引用特定技能 */
export const ProviderSkillReference = Schema.Struct({
  /** 技能名称 */
  name: TrimmedNonEmptyString,
  /** 技能路径 */
  path: TrimmedNonEmptyString,
});
export type ProviderSkillReference = typeof ProviderSkillReference.Type;

/** @提及引用，用于在消息中 @提及特定资源 */
export const ProviderMentionReference = Schema.Struct({
  /** 提及名称 */
  name: TrimmedNonEmptyString,
  /** 资源路径 */
  path: TrimmedNonEmptyString,
});
export type ProviderMentionReference = typeof ProviderMentionReference.Type;

/**
 * Provider 编辑器能力
 *
 * 描述 Provider 在编辑器中支持的功能特性，
 * 如技能提及、插件发现、模型列表等。
 */
export const ProviderComposerCapabilities = Schema.Struct({
  /** Provider 类型 */
  provider: ProviderDiscoveryKind,
  /** 是否支持技能提及 */
  supportsSkillMentions: Schema.Boolean,
  /** 是否支持技能发现 */
  supportsSkillDiscovery: Schema.Boolean,
  /** 是否支持原生命令发现 */
  supportsNativeSlashCommandDiscovery: Schema.Boolean,
  /** 是否支持插件提及 */
  supportsPluginMentions: Schema.Boolean,
  /** 是否支持插件发现 */
  supportsPluginDiscovery: Schema.Boolean,
  /** 是否支持运行时模型列表 */
  supportsRuntimeModelList: Schema.Boolean,
  /** 是否支持线程压缩 */
  supportsThreadCompaction: Schema.optional(Schema.Boolean),
  /** 是否支持线程导入 */
  supportsThreadImport: Schema.optional(Schema.Boolean),
});
export type ProviderComposerCapabilities = typeof ProviderComposerCapabilities.Type;

/** 获取 Provider 编辑器能力的输入参数 */
export const ProviderGetComposerCapabilitiesInput = Schema.Struct({
  /** Provider 类型 */
  provider: ProviderDiscoveryKind,
});
export type ProviderGetComposerCapabilitiesInput = typeof ProviderGetComposerCapabilitiesInput.Type;

/** 列出技能的输入参数 */
export const ProviderListSkillsInput = Schema.Struct({
  /** Provider 类型 */
  provider: ProviderDiscoveryKind,
  /** 工作目录 */
  cwd: TrimmedNonEmptyString,
  /** 线程 ID */
  threadId: Schema.optional(TrimmedNonEmptyString),
  /** 代理目录 */
  agentDir: Schema.optional(TrimmedNonEmptyString),
  /** 是否强制重新加载 */
  forceReload: Schema.optional(Schema.Boolean),
});
export type ProviderListSkillsInput = typeof ProviderListSkillsInput.Type;

/** 列出技能的结果 */
export const ProviderListSkillsResult = Schema.Struct({
  /** 技能列表 */
  skills: Schema.Array(ProviderSkillDescriptor),
  /** 数据来源 */
  source: Schema.optional(TrimmedNonEmptyString),
  /** 是否来自缓存 */
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListSkillsResult = typeof ProviderListSkillsResult.Type;

/** 本地用户技能来源枚举 */
export const LocalUserSkillSource = Schema.Literals([
  "claude",
  "codex",
  "agents",
  "openclaw",
  "unknown",
]);
export type LocalUserSkillSource = typeof LocalUserSkillSource.Type;

/** 本地用户技能描述符 */
export const LocalUserSkillDescriptor = Schema.Struct({
  /** 技能名称 */
  name: TrimmedNonEmptyString,
  /** 技能描述 */
  description: Schema.optional(TrimmedNonEmptyString),
  /** 版本号 */
  version: Schema.optional(TrimmedNonEmptyString),
  /** 主页链接 */
  homepage: Schema.optional(TrimmedNonEmptyString),
  /** 技能路径 */
  path: TrimmedNonEmptyString,
  /** 来源类型 */
  source: LocalUserSkillSource,
  /** 来源目录 */
  sourceDir: TrimmedNonEmptyString,
  /** 是否启用 */
  enabled: Schema.Boolean,
});
export type LocalUserSkillDescriptor = typeof LocalUserSkillDescriptor.Type;

/** 列出本地用户技能的结果 */
export const ListLocalUserSkillsResult = Schema.Struct({
  /** 技能列表 */
  skills: Schema.Array(LocalUserSkillDescriptor),
  /** 搜索的目录列表 */
  searchedDirs: Schema.Array(TrimmedNonEmptyString),
});
export type ListLocalUserSkillsResult = typeof ListLocalUserSkillsResult.Type;

/** 列出本地用户技能的输入参数 */
export const ListLocalUserSkillsInput = Schema.Struct({});
export type ListLocalUserSkillsInput = typeof ListLocalUserSkillsInput.Type;

/** Provider 原生命令描述符 */
export const ProviderNativeCommandDescriptor = Schema.Struct({
  /** 命令名称 */
  name: TrimmedNonEmptyString,
  /** 命令描述 */
  description: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderNativeCommandDescriptor = typeof ProviderNativeCommandDescriptor.Type;

/** 列出命令的输入参数 */
export const ProviderListCommandsInput = Schema.Struct({
  /** Provider 类型 */
  provider: ProviderDiscoveryKind,
  /** 工作目录 */
  cwd: TrimmedNonEmptyString,
  /** 线程 ID */
  threadId: Schema.optional(TrimmedNonEmptyString),
  /** 代理目录 */
  agentDir: Schema.optional(TrimmedNonEmptyString),
  /** 是否强制重新加载 */
  forceReload: Schema.optional(Schema.Boolean),
});
export type ProviderListCommandsInput = typeof ProviderListCommandsInput.Type;

/** 列出命令的结果 */
export const ProviderListCommandsResult = Schema.Struct({
  /** 命令列表 */
  commands: Schema.Array(ProviderNativeCommandDescriptor),
  /** 数据来源 */
  source: Schema.optional(TrimmedNonEmptyString),
  /** 是否来自缓存 */
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListCommandsResult = typeof ProviderListCommandsResult.Type;

// Plugin discovery mirrors Codex app-server's marketplace + plugin summary surface.
/** 插件市场接口描述 */
export const ProviderPluginMarketplaceInterface = Schema.Struct({
  /** 显示名称 */
  displayName: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderPluginMarketplaceInterface = typeof ProviderPluginMarketplaceInterface.Type;

/** 插件安装策略枚举 */
export const ProviderPluginInstallPolicy = Schema.Literals([
  /** 不可用 */
  "NOT_AVAILABLE",
  /** 可用 */
  "AVAILABLE",
  /** 默认安装 */
  "INSTALLED_BY_DEFAULT",
]);
export type ProviderPluginInstallPolicy = typeof ProviderPluginInstallPolicy.Type;

/** 插件认证策略枚举 */
export const ProviderPluginAuthPolicy = Schema.Literals([
  /** 安装时认证 */
  "ON_INSTALL",
  /** 使用时认证 */
  "ON_USE",
]);
export type ProviderPluginAuthPolicy = typeof ProviderPluginAuthPolicy.Type;

/** 插件来源描述 */
export const ProviderPluginSource = Schema.Struct({
  /** 来源类型，目前仅支持本地 */
  type: Schema.Literal("local"),
  /** 本地路径 */
  path: TrimmedNonEmptyString,
});
export type ProviderPluginSource = typeof ProviderPluginSource.Type;

/**
 * 插件接口描述
 *
 * 包含插件的详细信息，如名称、描述、开发者、分类、能力等。
 */
export const ProviderPluginInterface = Schema.Struct({
  /** 显示名称 */
  displayName: Schema.optional(TrimmedNonEmptyString),
  /** 简短描述 */
  shortDescription: Schema.optional(TrimmedNonEmptyString),
  /** 详细描述 */
  longDescription: Schema.optional(TrimmedNonEmptyString),
  /** 开发者名称 */
  developerName: Schema.optional(TrimmedNonEmptyString),
  /** 分类 */
  category: Schema.optional(TrimmedNonEmptyString),
  /** 能力列表 */
  capabilities: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  /** 网站链接 */
  websiteUrl: Schema.optional(TrimmedNonEmptyString),
  /** 隐私政策链接 */
  privacyPolicyUrl: Schema.optional(TrimmedNonEmptyString),
  /** 服务条款链接 */
  termsOfServiceUrl: Schema.optional(TrimmedNonEmptyString),
  /** 默认提示词 */
  defaultPrompt: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  /** 品牌颜色 */
  brandColor: Schema.optional(TrimmedNonEmptyString),
  /** 编辑器图标 */
  composerIcon: Schema.optional(TrimmedNonEmptyString),
  /** Logo */
  logo: Schema.optional(TrimmedNonEmptyString),
  /** 截图列表 */
  screenshots: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type ProviderPluginInterface = typeof ProviderPluginInterface.Type;

/**
 * 插件描述符
 *
 * 描述一个插件的基本信息，包括 ID、名称、来源、安装状态等。
 */
export const ProviderPluginDescriptor = Schema.Struct({
  /** 插件 ID */
  id: TrimmedNonEmptyString,
  /** 插件名称 */
  name: TrimmedNonEmptyString,
  /** 来源信息 */
  source: ProviderPluginSource,
  /** 是否已安装 */
  installed: Schema.Boolean,
  /** 是否已启用 */
  enabled: Schema.Boolean,
  /** 安装策略 */
  installPolicy: ProviderPluginInstallPolicy,
  /** 认证策略 */
  authPolicy: ProviderPluginAuthPolicy,
  /** 接口信息 */
  interface: Schema.optional(ProviderPluginInterface),
});
export type ProviderPluginDescriptor = typeof ProviderPluginDescriptor.Type;

/** 插件市场加载错误描述 */
export const ProviderPluginMarketplaceLoadError = Schema.Struct({
  /** 市场路径 */
  marketplacePath: TrimmedNonEmptyString,
  /** 错误信息 */
  message: TrimmedNonEmptyString,
});
export type ProviderPluginMarketplaceLoadError = typeof ProviderPluginMarketplaceLoadError.Type;

/**
 * 插件市场描述符
 *
 * 描述一个插件市场，包含市场名称、路径和其中的插件列表。
 */
export const ProviderPluginMarketplaceDescriptor = Schema.Struct({
  /** 市场名称 */
  name: TrimmedNonEmptyString,
  /** 市场路径 */
  path: TrimmedNonEmptyString,
  /** 接口信息 */
  interface: Schema.optional(ProviderPluginMarketplaceInterface),
  /** 插件列表 */
  plugins: Schema.Array(ProviderPluginDescriptor),
});
export type ProviderPluginMarketplaceDescriptor = typeof ProviderPluginMarketplaceDescriptor.Type;

/** 插件应用摘要 */
export const ProviderPluginAppSummary = Schema.Struct({
  /** 应用 ID */
  id: TrimmedNonEmptyString,
  /** 应用名称 */
  name: TrimmedNonEmptyString,
  /** 应用描述 */
  description: Schema.optional(TrimmedNonEmptyString),
  /** 安装链接 */
  installUrl: Schema.optional(TrimmedNonEmptyString),
  /** 是否需要认证 */
  needsAuth: Schema.Boolean,
});
export type ProviderPluginAppSummary = typeof ProviderPluginAppSummary.Type;

/** 列出插件的输入参数 */
export const ProviderListPluginsInput = Schema.Struct({
  /** Provider 类型 */
  provider: ProviderDiscoveryKind,
  /** 工作目录 */
  cwd: Schema.optional(TrimmedNonEmptyString),
  /** 线程 ID */
  threadId: Schema.optional(TrimmedNonEmptyString),
  /** 是否强制远程同步 */
  forceRemoteSync: Schema.optional(Schema.Boolean),
  /** 是否强制重新加载 */
  forceReload: Schema.optional(Schema.Boolean),
});
export type ProviderListPluginsInput = typeof ProviderListPluginsInput.Type;

/** 列出插件的结果 */
export const ProviderListPluginsResult = Schema.Struct({
  /** 市场列表 */
  marketplaces: Schema.Array(ProviderPluginMarketplaceDescriptor),
  /** 市场加载错误列表 */
  marketplaceLoadErrors: Schema.Array(ProviderPluginMarketplaceLoadError),
  /** 远程同步错误 */
  remoteSyncError: Schema.NullOr(TrimmedNonEmptyString),
  /** 推荐插件 ID 列表 */
  featuredPluginIds: Schema.Array(TrimmedNonEmptyString),
  /** 数据来源 */
  source: Schema.optional(TrimmedNonEmptyString),
  /** 是否来自缓存 */
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListPluginsResult = typeof ProviderListPluginsResult.Type;

/** 读取插件详情的输入参数 */
export const ProviderReadPluginInput = Schema.Struct({
  /** Provider 类型 */
  provider: ProviderDiscoveryKind,
  /** 市场路径 */
  marketplacePath: TrimmedNonEmptyString,
  /** 插件名称 */
  pluginName: TrimmedNonEmptyString,
});
export type ProviderReadPluginInput = typeof ProviderReadPluginInput.Type;

/**
 * 插件详情
 *
 * 包含插件的完整信息，包括市场信息、描述、技能列表、应用列表等。
 */
export const ProviderPluginDetail = Schema.Struct({
  /** 市场名称 */
  marketplaceName: TrimmedNonEmptyString,
  /** 市场路径 */
  marketplacePath: TrimmedNonEmptyString,
  /** 插件摘要信息 */
  summary: ProviderPluginDescriptor,
  /** 插件描述 */
  description: Schema.optional(TrimmedNonEmptyString),
  /** 技能列表 */
  skills: Schema.Array(ProviderSkillDescriptor),
  /** 应用列表 */
  apps: Schema.Array(ProviderPluginAppSummary),
  /** MCP 服务器列表 */
  mcpServers: Schema.Array(TrimmedNonEmptyString),
});
export type ProviderPluginDetail = typeof ProviderPluginDetail.Type;

/** 读取插件详情的结果 */
export const ProviderReadPluginResult = Schema.Struct({
  /** 插件详情 */
  plugin: ProviderPluginDetail,
  /** 数据来源 */
  source: Schema.optional(TrimmedNonEmptyString),
  /** 是否来自缓存 */
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderReadPluginResult = typeof ProviderReadPluginResult.Type;

/** 列出模型的输入参数 */
export const ProviderListModelsInput = Schema.Struct({
  /** Provider 类型 */
  provider: ProviderDiscoveryKind,
  /** 二进制文件路径 */
  binaryPath: Schema.optional(TrimmedNonEmptyString),
  /** API 端点 */
  apiEndpoint: Schema.optional(TrimmedNonEmptyString),
  /** 代理目录 */
  agentDir: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderListModelsInput = typeof ProviderListModelsInput.Type;

/** 推理努力程度描述符 */
export const ProviderReasoningEffortDescriptor = Schema.Struct({
  /** 值 */
  value: TrimmedNonEmptyString,
  /** 显示标签 */
  label: Schema.optional(TrimmedNonEmptyString),
  /** 描述 */
  description: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderReasoningEffortDescriptor = typeof ProviderReasoningEffortDescriptor.Type;

/** 上下文窗口选项描述符 */
export const ProviderContextWindowDescriptor = Schema.Struct({
  /** 值 */
  value: TrimmedNonEmptyString,
  /** 显示标签 */
  label: TrimmedNonEmptyString,
  /** 是否为默认选项 */
  isDefault: Schema.optional(Schema.Literal(true)),
});
export type ProviderContextWindowDescriptor = typeof ProviderContextWindowDescriptor.Type;

/**
 * 模型描述符
 *
 * 描述一个可用的 AI 模型，包含名称、提供者、推理能力、上下文窗口等信息。
 */
export const ProviderModelDescriptor = Schema.Struct({
  /** 模型标识 */
  slug: TrimmedNonEmptyString,
  /** 模型名称 */
  name: TrimmedNonEmptyString,
  /** 上游提供者 ID */
  upstreamProviderId: Schema.optional(TrimmedNonEmptyString),
  /** 上游提供者名称 */
  upstreamProviderName: Schema.optional(TrimmedNonEmptyString),
  /** 选项描述符列表 */
  optionDescriptors: Schema.optional(Schema.Array(ProviderOptionDescriptor)),
  // Codex model/list results are normalized here so the web app can consume both
  // the legacy string array and Remodex-style reasoning objects uniformly.
  /** 支持的推理努力程度 */
  supportedReasoningEfforts: Schema.optional(Schema.Array(ProviderReasoningEffortDescriptor)),
  /** 默认推理努力程度 */
  defaultReasoningEffort: Schema.optional(TrimmedNonEmptyString),
  /** 是否支持快速模式 */
  supportsFastMode: Schema.optional(Schema.Boolean),
  /** 是否支持思考切换 */
  supportsThinkingToggle: Schema.optional(Schema.Boolean),
  /** 上下文窗口选项 */
  contextWindowOptions: Schema.optional(Schema.Array(ProviderContextWindowDescriptor)),
  /** 默认上下文窗口 */
  defaultContextWindow: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderModelDescriptor = typeof ProviderModelDescriptor.Type;

/** 列出模型的结果 */
export const ProviderListModelsResult = Schema.Struct({
  /** 模型列表 */
  models: Schema.Array(ProviderModelDescriptor),
  /** 数据来源 */
  source: Schema.optional(TrimmedNonEmptyString),
  /** 是否来自缓存 */
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListModelsResult = typeof ProviderListModelsResult.Type;

/** 列出代理的输入参数 */
export const ProviderListAgentsInput = Schema.Struct({
  /** Provider 类型 */
  provider: ProviderDiscoveryKind,
});
export type ProviderListAgentsInput = typeof ProviderListAgentsInput.Type;

/** 代理描述符 */
export const ProviderAgentDescriptor = Schema.Struct({
  /** 代理名称 */
  name: TrimmedNonEmptyString,
  /** 显示名称 */
  displayName: TrimmedNonEmptyString,
  /** 代理描述 */
  description: Schema.optional(TrimmedNonEmptyString),
  /** 使用的模型 */
  model: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderAgentDescriptor = typeof ProviderAgentDescriptor.Type;

/** 列出代理的结果 */
export const ProviderListAgentsResult = Schema.Struct({
  /** 代理列表 */
  agents: Schema.Array(ProviderAgentDescriptor),
  /** 数据来源 */
  source: Schema.optional(TrimmedNonEmptyString),
  /** 是否来自缓存 */
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListAgentsResult = typeof ProviderListAgentsResult.Type;
