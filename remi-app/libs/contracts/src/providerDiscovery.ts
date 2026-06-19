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
 * 这些类型用于查询 Provider 支持的功能和可用资源。
 */

import type { TrimmedNonEmptyString } from "./baseSchemas";
import type { ProviderOptionDescriptor } from "./model";

/** Provider 发现类型枚举，标识不同的 Provider 来源 */
type ProviderDiscoveryKind =
  | "codex"
  | "claudeAgent"
  | "cursor"
  | "gemini"
  | "grok"
  | "kilo"
  | "opencode"
  | "pi";

/** 技能接口描述，包含显示名称和简短描述 */
export interface ProviderSkillInterface {
  /** 显示名称 */
  displayName?: TrimmedNonEmptyString;
  /** 简短描述 */
  shortDescription?: TrimmedNonEmptyString;
}

/**
 * 技能描述符
 *
 * 描述一个可用的技能，包含名称、描述、路径、启用状态等信息。
 * 技能是 Provider 提供的特定功能模块。
 */
export interface ProviderSkillDescriptor {
  /** 技能名称 */
  name: TrimmedNonEmptyString;
  /** 技能描述 */
  description?: TrimmedNonEmptyString;
  /** 技能路径 */
  path: TrimmedNonEmptyString;
  /** 是否启用 */
  enabled: boolean;
  /** 作用域 */
  scope?: TrimmedNonEmptyString;
  /** 接口信息 */
  interface?: ProviderSkillInterface;
  /** 依赖项 */
  dependencies?: unknown;
}

/** 技能引用，用于在消息中引用特定技能 */
export interface ProviderSkillReference {
  /** 技能名称 */
  name: TrimmedNonEmptyString;
  /** 技能路径 */
  path: TrimmedNonEmptyString;
}

/** @提及引用，用于在消息中 @提及特定资源 */
export interface ProviderMentionReference {
  /** 提及名称 */
  name: TrimmedNonEmptyString;
  /** 资源路径 */
  path: TrimmedNonEmptyString;
}

/**
 * Provider 编辑器能力
 *
 * 描述 Provider 在编辑器中支持的功能特性，
 * 如技能提及、插件发现、模型列表等。
 */
export interface ProviderComposerCapabilities {
  /** Provider 类型 */
  provider: ProviderDiscoveryKind;
  /** 是否支持技能提及 */
  supportsSkillMentions: boolean;
  /** 是否支持技能发现 */
  supportsSkillDiscovery: boolean;
  /** 是否支持原生命令发现 */
  supportsNativeSlashCommandDiscovery: boolean;
  /** 是否支持插件提及 */
  supportsPluginMentions: boolean;
  /** 是否支持插件发现 */
  supportsPluginDiscovery: boolean;
  /** 是否支持运行时模型列表 */
  supportsRuntimeModelList: boolean;
  /** 是否支持线程压缩 */
  supportsThreadCompaction?: boolean;
  /** 是否支持线程导入 */
  supportsThreadImport?: boolean;
}

/** 获取 Provider 编辑器能力的输入参数 */
export interface ProviderGetComposerCapabilitiesInput {
  /** Provider 类型 */
  provider: ProviderDiscoveryKind;
}

/** 列出技能的输入参数 */
export interface ProviderListSkillsInput {
  /** Provider 类型 */
  provider: ProviderDiscoveryKind;
  /** 工作目录 */
  cwd: TrimmedNonEmptyString;
  /** 线程 ID */
  threadId?: TrimmedNonEmptyString;
  /** 代理目录 */
  agentDir?: TrimmedNonEmptyString;
  /** 是否强制重新加载 */
  forceReload?: boolean;
}

/** 列出技能的结果 */
export interface ProviderListSkillsResult {
  /** 技能列表 */
  skills: ProviderSkillDescriptor[];
  /** 数据来源 */
  source?: TrimmedNonEmptyString;
  /** 是否来自缓存 */
  cached?: boolean;
}

/** 本地用户技能来源枚举 */
export type LocalUserSkillSource = "claude" | "codex" | "agents" | "openclaw" | "unknown";

/** 本地用户技能描述符 */
export interface LocalUserSkillDescriptor {
  /** 技能名称 */
  name: TrimmedNonEmptyString;
  /** 技能描述 */
  description?: TrimmedNonEmptyString;
  /** 版本号 */
  version?: TrimmedNonEmptyString;
  /** 主页链接 */
  homepage?: TrimmedNonEmptyString;
  /** 技能路径 */
  path: TrimmedNonEmptyString;
  /** 来源类型 */
  source: LocalUserSkillSource;
  /** 来源目录 */
  sourceDir: TrimmedNonEmptyString;
  /** 是否启用 */
  enabled: boolean;
}

/** 列出本地用户技能的结果 */
export interface ListLocalUserSkillsResult {
  /** 技能列表 */
  skills: LocalUserSkillDescriptor[];
  /** 搜索的目录列表 */
  searchedDirs: TrimmedNonEmptyString[];
}

/** 列出本地用户技能的输入参数 */
export interface ListLocalUserSkillsInput {}

/** Provider 原生命令描述符 */
export interface ProviderNativeCommandDescriptor {
  /** 命令名称 */
  name: TrimmedNonEmptyString;
  /** 命令描述 */
  description?: TrimmedNonEmptyString;
}

/** 列出命令的输入参数 */
export interface ProviderListCommandsInput {
  /** Provider 类型 */
  provider: ProviderDiscoveryKind;
  /** 工作目录 */
  cwd: TrimmedNonEmptyString;
  /** 线程 ID */
  threadId?: TrimmedNonEmptyString;
  /** 代理目录 */
  agentDir?: TrimmedNonEmptyString;
  /** 是否强制重新加载 */
  forceReload?: boolean;
}

/** 列出命令的结果 */
export interface ProviderListCommandsResult {
  /** 命令列表 */
  commands: ProviderNativeCommandDescriptor[];
  /** 数据来源 */
  source?: TrimmedNonEmptyString;
  /** 是否来自缓存 */
  cached?: boolean;
}

// Plugin discovery mirrors Codex app-server's marketplace + plugin summary surface.
/** 插件市场接口描述 */
export interface ProviderPluginMarketplaceInterface {
  /** 显示名称 */
  displayName?: TrimmedNonEmptyString;
}

/** 插件安装策略枚举 */
export type ProviderPluginInstallPolicy = "NOT_AVAILABLE" | "AVAILABLE" | "INSTALLED_BY_DEFAULT";

/** 插件认证策略枚举 */
export type ProviderPluginAuthPolicy = "ON_INSTALL" | "ON_USE";

/** 插件来源描述 */
export interface ProviderPluginSource {
  /** 来源类型，目前仅支持本地 */
  type: "local";
  /** 本地路径 */
  path: TrimmedNonEmptyString;
}

/**
 * 插件接口描述
 *
 * 包含插件的详细信息，如名称、描述、开发者、分类、能力等。
 */
export interface ProviderPluginInterface {
  /** 显示名称 */
  displayName?: TrimmedNonEmptyString;
  /** 简短描述 */
  shortDescription?: TrimmedNonEmptyString;
  /** 详细描述 */
  longDescription?: TrimmedNonEmptyString;
  /** 开发者名称 */
  developerName?: TrimmedNonEmptyString;
  /** 分类 */
  category?: TrimmedNonEmptyString;
  /** 能力列表 */
  capabilities?: TrimmedNonEmptyString[];
  /** 网站链接 */
  websiteUrl?: TrimmedNonEmptyString;
  /** 隐私政策链接 */
  privacyPolicyUrl?: TrimmedNonEmptyString;
  /** 服务条款链接 */
  termsOfServiceUrl?: TrimmedNonEmptyString;
  /** 默认提示词 */
  defaultPrompt?: TrimmedNonEmptyString[];
  /** 品牌颜色 */
  brandColor?: TrimmedNonEmptyString;
  /** 编辑器图标 */
  composerIcon?: TrimmedNonEmptyString;
  /** Logo */
  logo?: TrimmedNonEmptyString;
  /** 截图列表 */
  screenshots?: TrimmedNonEmptyString[];
}

/**
 * 插件描述符
 *
 * 描述一个插件的基本信息，包括 ID、名称、来源、安装状态等。
 */
export interface ProviderPluginDescriptor {
  /** 插件 ID */
  id: TrimmedNonEmptyString;
  /** 插件名称 */
  name: TrimmedNonEmptyString;
  /** 来源信息 */
  source: ProviderPluginSource;
  /** 是否已安装 */
  installed: boolean;
  /** 是否已启用 */
  enabled: boolean;
  /** 安装策略 */
  installPolicy: ProviderPluginInstallPolicy;
  /** 认证策略 */
  authPolicy: ProviderPluginAuthPolicy;
  /** 接口信息 */
  interface?: ProviderPluginInterface;
}

/** 插件市场加载错误描述 */
export interface ProviderPluginMarketplaceLoadError {
  /** 市场路径 */
  marketplacePath: TrimmedNonEmptyString;
  /** 错误信息 */
  message: TrimmedNonEmptyString;
}

/**
 * 插件市场描述符
 *
 * 描述一个插件市场，包含市场名称、路径和其中的插件列表。
 */
export interface ProviderPluginMarketplaceDescriptor {
  /** 市场名称 */
  name: TrimmedNonEmptyString;
  /** 市场路径 */
  path: TrimmedNonEmptyString;
  /** 接口信息 */
  interface?: ProviderPluginMarketplaceInterface;
  /** 插件列表 */
  plugins: ProviderPluginDescriptor[];
}

/** 插件应用摘要 */
export interface ProviderPluginAppSummary {
  /** 应用 ID */
  id: TrimmedNonEmptyString;
  /** 应用名称 */
  name: TrimmedNonEmptyString;
  /** 应用描述 */
  description?: TrimmedNonEmptyString;
  /** 安装链接 */
  installUrl?: TrimmedNonEmptyString;
  /** 是否需要认证 */
  needsAuth: boolean;
}

/** 列出插件的输入参数 */
export interface ProviderListPluginsInput {
  /** Provider 类型 */
  provider: ProviderDiscoveryKind;
  /** 工作目录 */
  cwd?: TrimmedNonEmptyString;
  /** 线程 ID */
  threadId?: TrimmedNonEmptyString;
  /** 是否强制远程同步 */
  forceRemoteSync?: boolean;
  /** 是否强制重新加载 */
  forceReload?: boolean;
}

/** 列出插件的结果 */
export interface ProviderListPluginsResult {
  /** 市场列表 */
  marketplaces: ProviderPluginMarketplaceDescriptor[];
  /** 市场加载错误列表 */
  marketplaceLoadErrors: ProviderPluginMarketplaceLoadError[];
  /** 远程同步错误 */
  remoteSyncError: TrimmedNonEmptyString | null;
  /** 推荐插件 ID 列表 */
  featuredPluginIds: TrimmedNonEmptyString[];
  /** 数据来源 */
  source?: TrimmedNonEmptyString;
  /** 是否来自缓存 */
  cached?: boolean;
}

/** 读取插件详情的输入参数 */
export interface ProviderReadPluginInput {
  /** Provider 类型 */
  provider: ProviderDiscoveryKind;
  /** 市场路径 */
  marketplacePath: TrimmedNonEmptyString;
  /** 插件名称 */
  pluginName: TrimmedNonEmptyString;
}

/**
 * 插件详情
 *
 * 包含插件的完整信息，包括市场信息、描述、技能列表、应用列表等。
 */
export interface ProviderPluginDetail {
  /** 市场名称 */
  marketplaceName: TrimmedNonEmptyString;
  /** 市场路径 */
  marketplacePath: TrimmedNonEmptyString;
  /** 插件摘要信息 */
  summary: ProviderPluginDescriptor;
  /** 插件描述 */
  description?: TrimmedNonEmptyString;
  /** 技能列表 */
  skills: ProviderSkillDescriptor[];
  /** 应用列表 */
  apps: ProviderPluginAppSummary[];
  /** MCP 服务器列表 */
  mcpServers: TrimmedNonEmptyString[];
}

/** 读取插件详情的结果 */
export interface ProviderReadPluginResult {
  /** 插件详情 */
  plugin: ProviderPluginDetail;
  /** 数据来源 */
  source?: TrimmedNonEmptyString;
  /** 是否来自缓存 */
  cached?: boolean;
}

/** 列出模型的输入参数 */
export interface ProviderListModelsInput {
  /** Provider 类型 */
  provider: ProviderDiscoveryKind;
  /** 二进制文件路径 */
  binaryPath?: TrimmedNonEmptyString;
  /** API 端点 */
  apiEndpoint?: TrimmedNonEmptyString;
  /** 代理目录 */
  agentDir?: TrimmedNonEmptyString;
}

/** 推理努力程度描述符 */
export interface ProviderReasoningEffortDescriptor {
  /** 值 */
  value: TrimmedNonEmptyString;
  /** 显示标签 */
  label?: TrimmedNonEmptyString;
  /** 描述 */
  description?: TrimmedNonEmptyString;
}

/** 上下文窗口选项描述符 */
export interface ProviderContextWindowDescriptor {
  /** 值 */
  value: TrimmedNonEmptyString;
  /** 显示标签 */
  label: TrimmedNonEmptyString;
  /** 是否为默认选项 */
  isDefault?: true;
}

/**
 * 模型描述符
 *
 * 描述一个可用的 AI 模型，包含名称、提供者、推理能力、上下文窗口等信息。
 */
export interface ProviderModelDescriptor {
  /** 模型标识 */
  slug: TrimmedNonEmptyString;
  /** 模型名称 */
  name: TrimmedNonEmptyString;
  /** 上游提供者 ID */
  upstreamProviderId?: TrimmedNonEmptyString;
  /** 上游提供者名称 */
  upstreamProviderName?: TrimmedNonEmptyString;
  /** 选项描述符列表 */
  optionDescriptors?: ProviderOptionDescriptor[];
  // Codex model/list results are normalized here so the web app can consume both
  // the legacy string array and Remodex-style reasoning objects uniformly.
  /** 支持的推理努力程度 */
  supportedReasoningEfforts?: ProviderReasoningEffortDescriptor[];
  /** 默认推理努力程度 */
  defaultReasoningEffort?: TrimmedNonEmptyString;
  /** 是否支持快速模式 */
  supportsFastMode?: boolean;
  /** 是否支持思考切换 */
  supportsThinkingToggle?: boolean;
  /** 上下文窗口选项 */
  contextWindowOptions?: ProviderContextWindowDescriptor[];
  /** 默认上下文窗口 */
  defaultContextWindow?: TrimmedNonEmptyString;
}

/** 列出模型的结果 */
export interface ProviderListModelsResult {
  /** 模型列表 */
  models: ProviderModelDescriptor[];
  /** 数据来源 */
  source?: TrimmedNonEmptyString;
  /** 是否来自缓存 */
  cached?: boolean;
}

/** 列出代理的输入参数 */
export interface ProviderListAgentsInput {
  /** Provider 类型 */
  provider: ProviderDiscoveryKind;
}

/** 代理描述符 */
export interface ProviderAgentDescriptor {
  /** 代理名称 */
  name: TrimmedNonEmptyString;
  /** 显示名称 */
  displayName: TrimmedNonEmptyString;
  /** 代理描述 */
  description?: TrimmedNonEmptyString;
  /** 使用的模型 */
  model?: TrimmedNonEmptyString;
}

/** 列出代理的结果 */
export interface ProviderListAgentsResult {
  /** 代理列表 */
  agents: ProviderAgentDescriptor[];
  /** 数据来源 */
  source?: TrimmedNonEmptyString;
  /** 是否来自缓存 */
  cached?: boolean;
}
