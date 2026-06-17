/**
 * Provider 发现合约定义
 *
 * 用途：定义 Provider 能力发现、技能/命令/插件/模型/Agent 列表等请求/响应结构。
 * 所属模块：共享契约层（Shared Contracts）
 * 主要导出：
 *   - ProviderSkillDescriptor / ProviderSkillReference —— 技能描述与引用
 *   - ProviderMentionReference —— 提及引用
 *   - ProviderComposerCapabilities —— 编辑器能力
 *   - ProviderNativeCommandDescriptor —— 原生命令描述
 *   - ProviderPluginDescriptor / PluginMarketplaceDescriptor —— 插件描述
 *   - ProviderModelDescriptor —— 模型描述
 *   - ProviderAgentDescriptor —— Agent 描述
 *   - 各类 List/Read 操作的 Input/Result 类型
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";
import { ProviderOptionDescriptor } from "./model";

/** Provider 发现类型 */
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

/** Provider 技能接口 */
export const ProviderSkillInterface = Schema.Struct({
  displayName: Schema.optional(TrimmedNonEmptyString),
  shortDescription: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderSkillInterface = typeof ProviderSkillInterface.Type;

/** Provider 技能描述 */
export const ProviderSkillDescriptor = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  path: TrimmedNonEmptyString,
  enabled: Schema.Boolean,
  scope: Schema.optional(TrimmedNonEmptyString),
  interface: Schema.optional(ProviderSkillInterface),
  dependencies: Schema.optional(Schema.Unknown),
});
export type ProviderSkillDescriptor = typeof ProviderSkillDescriptor.Type;

/** Provider 技能引用 */
export const ProviderSkillReference = Schema.Struct({
  name: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
});
export type ProviderSkillReference = typeof ProviderSkillReference.Type;

/** Provider 提及引用 */
export const ProviderMentionReference = Schema.Struct({
  name: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
});
export type ProviderMentionReference = typeof ProviderMentionReference.Type;

/** Provider 编辑器能力 */
export const ProviderComposerCapabilities = Schema.Struct({
  provider: ProviderDiscoveryKind,
  supportsSkillMentions: Schema.Boolean,
  supportsSkillDiscovery: Schema.Boolean,
  supportsNativeSlashCommandDiscovery: Schema.Boolean,
  supportsPluginMentions: Schema.Boolean,
  supportsPluginDiscovery: Schema.Boolean,
  supportsRuntimeModelList: Schema.Boolean,
  supportsThreadCompaction: Schema.optional(Schema.Boolean),
  supportsThreadImport: Schema.optional(Schema.Boolean),
});
export type ProviderComposerCapabilities = typeof ProviderComposerCapabilities.Type;

/** 获取编辑器能力输入 */
export const ProviderGetComposerCapabilitiesInput = Schema.Struct({
  provider: ProviderDiscoveryKind,
});
export type ProviderGetComposerCapabilitiesInput = typeof ProviderGetComposerCapabilitiesInput.Type;

/** 获取技能列表输入 */
export const ProviderListSkillsInput = Schema.Struct({
  provider: ProviderDiscoveryKind,
  cwd: TrimmedNonEmptyString,
  threadId: Schema.optional(TrimmedNonEmptyString),
  agentDir: Schema.optional(TrimmedNonEmptyString),
  forceReload: Schema.optional(Schema.Boolean),
});
export type ProviderListSkillsInput = typeof ProviderListSkillsInput.Type;

/** 获取技能列表结果 */
export const ProviderListSkillsResult = Schema.Struct({
  skills: Schema.Array(ProviderSkillDescriptor),
  source: Schema.optional(TrimmedNonEmptyString),
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListSkillsResult = typeof ProviderListSkillsResult.Type;

/** 本地用户技能来源 */
export const LocalUserSkillSource = Schema.Literals([
  "claude",
  "codex",
  "agents",
  "openclaw",
  "unknown",
]);
export type LocalUserSkillSource = typeof LocalUserSkillSource.Type;

/** 本地用户技能描述 */
export const LocalUserSkillDescriptor = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  version: Schema.optional(TrimmedNonEmptyString),
  homepage: Schema.optional(TrimmedNonEmptyString),
  path: TrimmedNonEmptyString,
  source: LocalUserSkillSource,
  sourceDir: TrimmedNonEmptyString,
  enabled: Schema.Boolean,
});
export type LocalUserSkillDescriptor = typeof LocalUserSkillDescriptor.Type;

/** 本地用户技能列表结果 */
export const ListLocalUserSkillsResult = Schema.Struct({
  skills: Schema.Array(LocalUserSkillDescriptor),
  searchedDirs: Schema.Array(TrimmedNonEmptyString),
});
export type ListLocalUserSkillsResult = typeof ListLocalUserSkillsResult.Type;

/** 本地用户技能列表输入 */
export const ListLocalUserSkillsInput = Schema.Struct({});
export type ListLocalUserSkillsInput = typeof ListLocalUserSkillsInput.Type;

/** Provider 原生命令描述 */
export const ProviderNativeCommandDescriptor = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderNativeCommandDescriptor = typeof ProviderNativeCommandDescriptor.Type;

/** 获取命令列表输入 */
export const ProviderListCommandsInput = Schema.Struct({
  provider: ProviderDiscoveryKind,
  cwd: TrimmedNonEmptyString,
  threadId: Schema.optional(TrimmedNonEmptyString),
  agentDir: Schema.optional(TrimmedNonEmptyString),
  forceReload: Schema.optional(Schema.Boolean),
});
export type ProviderListCommandsInput = typeof ProviderListCommandsInput.Type;

/** 获取命令列表结果 */
export const ProviderListCommandsResult = Schema.Struct({
  commands: Schema.Array(ProviderNativeCommandDescriptor),
  source: Schema.optional(TrimmedNonEmptyString),
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListCommandsResult = typeof ProviderListCommandsResult.Type;

/** 插件市场接口描述 */
export const ProviderPluginMarketplaceInterface = Schema.Struct({
  displayName: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderPluginMarketplaceInterface = typeof ProviderPluginMarketplaceInterface.Type;

/** 插件安装策略 */
export const ProviderPluginInstallPolicy = Schema.Literals([
  "NOT_AVAILABLE",
  "AVAILABLE",
  "INSTALLED_BY_DEFAULT",
]);
export type ProviderPluginInstallPolicy = typeof ProviderPluginInstallPolicy.Type;

/** 插件认证策略 */
export const ProviderPluginAuthPolicy = Schema.Literals(["ON_INSTALL", "ON_USE"]);
export type ProviderPluginAuthPolicy = typeof ProviderPluginAuthPolicy.Type;

/** 插件来源（本地） */
export const ProviderPluginSource = Schema.Struct({
  type: Schema.Literal("local"),
  path: TrimmedNonEmptyString,
});
export type ProviderPluginSource = typeof ProviderPluginSource.Type;

/** 插件接口描述 */
export const ProviderPluginInterface = Schema.Struct({
  displayName: Schema.optional(TrimmedNonEmptyString),
  shortDescription: Schema.optional(TrimmedNonEmptyString),
  longDescription: Schema.optional(TrimmedNonEmptyString),
  developerName: Schema.optional(TrimmedNonEmptyString),
  category: Schema.optional(TrimmedNonEmptyString),
  capabilities: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  websiteUrl: Schema.optional(TrimmedNonEmptyString),
  privacyPolicyUrl: Schema.optional(TrimmedNonEmptyString),
  termsOfServiceUrl: Schema.optional(TrimmedNonEmptyString),
  defaultPrompt: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  brandColor: Schema.optional(TrimmedNonEmptyString),
  composerIcon: Schema.optional(TrimmedNonEmptyString),
  logo: Schema.optional(TrimmedNonEmptyString),
  screenshots: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type ProviderPluginInterface = typeof ProviderPluginInterface.Type;

/** 插件描述 */
export const ProviderPluginDescriptor = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  source: ProviderPluginSource,
  installed: Schema.Boolean,
  enabled: Schema.Boolean,
  installPolicy: ProviderPluginInstallPolicy,
  authPolicy: ProviderPluginAuthPolicy,
  interface: Schema.optional(ProviderPluginInterface),
});
export type ProviderPluginDescriptor = typeof ProviderPluginDescriptor.Type;

/** 插件市场加载错误 */
export const ProviderPluginMarketplaceLoadError = Schema.Struct({
  marketplacePath: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
});
export type ProviderPluginMarketplaceLoadError = typeof ProviderPluginMarketplaceLoadError.Type;

/** 插件市场描述 */
export const ProviderPluginMarketplaceDescriptor = Schema.Struct({
  name: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  interface: Schema.optional(ProviderPluginMarketplaceInterface),
  plugins: Schema.Array(ProviderPluginDescriptor),
});
export type ProviderPluginMarketplaceDescriptor = typeof ProviderPluginMarketplaceDescriptor.Type;

/** 插件应用摘要 */
export const ProviderPluginAppSummary = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  installUrl: Schema.optional(TrimmedNonEmptyString),
  needsAuth: Schema.Boolean,
});
export type ProviderPluginAppSummary = typeof ProviderPluginAppSummary.Type;

/** 获取插件列表输入 */
export const ProviderListPluginsInput = Schema.Struct({
  provider: ProviderDiscoveryKind,
  cwd: Schema.optional(TrimmedNonEmptyString),
  threadId: Schema.optional(TrimmedNonEmptyString),
  forceRemoteSync: Schema.optional(Schema.Boolean),
  forceReload: Schema.optional(Schema.Boolean),
});
export type ProviderListPluginsInput = typeof ProviderListPluginsInput.Type;

/** 获取插件列表结果 */
export const ProviderListPluginsResult = Schema.Struct({
  marketplaces: Schema.Array(ProviderPluginMarketplaceDescriptor),
  marketplaceLoadErrors: Schema.Array(ProviderPluginMarketplaceLoadError),
  remoteSyncError: Schema.NullOr(TrimmedNonEmptyString),
  featuredPluginIds: Schema.Array(TrimmedNonEmptyString),
  source: Schema.optional(TrimmedNonEmptyString),
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListPluginsResult = typeof ProviderListPluginsResult.Type;

/** 读取插件详情输入 */
export const ProviderReadPluginInput = Schema.Struct({
  provider: ProviderDiscoveryKind,
  marketplacePath: TrimmedNonEmptyString,
  pluginName: TrimmedNonEmptyString,
});
export type ProviderReadPluginInput = typeof ProviderReadPluginInput.Type;

/** 插件详情 */
export const ProviderPluginDetail = Schema.Struct({
  marketplaceName: TrimmedNonEmptyString,
  marketplacePath: TrimmedNonEmptyString,
  summary: ProviderPluginDescriptor,
  description: Schema.optional(TrimmedNonEmptyString),
  skills: Schema.Array(ProviderSkillDescriptor),
  apps: Schema.Array(ProviderPluginAppSummary),
  mcpServers: Schema.Array(TrimmedNonEmptyString),
});
export type ProviderPluginDetail = typeof ProviderPluginDetail.Type;

/** 读取插件详情结果 */
export const ProviderReadPluginResult = Schema.Struct({
  plugin: ProviderPluginDetail,
  source: Schema.optional(TrimmedNonEmptyString),
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderReadPluginResult = typeof ProviderReadPluginResult.Type;

/** 获取模型列表输入 */
export const ProviderListModelsInput = Schema.Struct({
  provider: ProviderDiscoveryKind,
  binaryPath: Schema.optional(TrimmedNonEmptyString),
  apiEndpoint: Schema.optional(TrimmedNonEmptyString),
  agentDir: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderListModelsInput = typeof ProviderListModelsInput.Type;

/** 推理力度描述 */
export const ProviderReasoningEffortDescriptor = Schema.Struct({
  value: TrimmedNonEmptyString,
  label: Schema.optional(TrimmedNonEmptyString),
  description: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderReasoningEffortDescriptor = typeof ProviderReasoningEffortDescriptor.Type;

/** 上下文窗口描述 */
export const ProviderContextWindowDescriptor = Schema.Struct({
  value: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  isDefault: Schema.optional(Schema.Literal(true)),
});
export type ProviderContextWindowDescriptor = typeof ProviderContextWindowDescriptor.Type;

/** 模型描述 */
export const ProviderModelDescriptor = Schema.Struct({
  slug: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  upstreamProviderId: Schema.optional(TrimmedNonEmptyString),
  upstreamProviderName: Schema.optional(TrimmedNonEmptyString),
  optionDescriptors: Schema.optional(Schema.Array(ProviderOptionDescriptor)),
  // Codex 模型列表结果统一归一化，使 Web 应用能同时消费旧版字符串数组和 Remodex 风格的推理对象
  supportedReasoningEfforts: Schema.optional(Schema.Array(ProviderReasoningEffortDescriptor)),
  defaultReasoningEffort: Schema.optional(TrimmedNonEmptyString),
  supportsFastMode: Schema.optional(Schema.Boolean),
  supportsThinkingToggle: Schema.optional(Schema.Boolean),
  contextWindowOptions: Schema.optional(Schema.Array(ProviderContextWindowDescriptor)),
  defaultContextWindow: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderModelDescriptor = typeof ProviderModelDescriptor.Type;

/** 获取模型列表结果 */
export const ProviderListModelsResult = Schema.Struct({
  models: Schema.Array(ProviderModelDescriptor),
  source: Schema.optional(TrimmedNonEmptyString),
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListModelsResult = typeof ProviderListModelsResult.Type;

/** 获取 Agent 列表输入 */
export const ProviderListAgentsInput = Schema.Struct({
  provider: ProviderDiscoveryKind,
});
export type ProviderListAgentsInput = typeof ProviderListAgentsInput.Type;

/** Agent 描述 */
export const ProviderAgentDescriptor = Schema.Struct({
  name: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  model: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderAgentDescriptor = typeof ProviderAgentDescriptor.Type;

/** 获取 Agent 列表结果 */
export const ProviderListAgentsResult = Schema.Struct({
  agents: Schema.Array(ProviderAgentDescriptor),
  source: Schema.optional(TrimmedNonEmptyString),
  cached: Schema.optional(Schema.Boolean),
});
export type ProviderListAgentsResult = typeof ProviderListAgentsResult.Type;