/**
 * @file 应用设置管理模块
 * @description 提供应用级别的配置管理，包括本地存储设置和服务器端设置的同步。
 *   支持多 Provider 模型配置、字体设置、侧边栏行为、时间格式等 UI 偏好。
 *   实现了 localStorage 与服务器设置的迁移和双向同步机制。
 * @layer 状态管理层
 * @depends @tanstack/react-query, effect, useLocalStorage, providerModelOptions, i18n
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import {
  DEFAULT_GIT_TEXT_GENERATION_MODEL,
  DEFAULT_SERVER_SETTINGS,
  TrimmedNonEmptyString,
  ProviderKind,
  type ProviderStartOptions,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@ydsz-buddy/contracts";
import {
  getDefaultModel,
  getModelOptions,
  normalizeModelSlug,
  resolveSelectableModel,
} from "@njydsz/shared/model";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { EnvMode } from "./components/BranchToolbar.logic";
import { formatProviderModelOptionName, type ProviderModelOption } from "./providerModelOptions";
import {
  DEFAULT_PROVIDER_ORDER,
  normalizeHiddenProviders,
  normalizeProviderOrder,
} from "./providerOrdering";
import { ensureNativeApi } from "./nativeApi";
import { serverQueryKeys, serverSettingsQueryOptions } from "./lib/serverReactQuery";
import { DEFAULT_LANGUAGE, normalizeLanguage } from "./i18n";

/** localStorage 中应用设置的存储键 */
const APP_SETTINGS_STORAGE_KEY = "ydsz-buddy:app-settings:v1";

/** localStorage 中服务器设置迁移标记键，用于避免重复迁移 */
const SERVER_SETTINGS_MIGRATION_STORAGE_KEY = "ydsz-buddy:server-settings-migrated:v1";

/** 自定义模型数量上限 */
const MAX_CUSTOM_MODEL_COUNT = 32;

/** 自定义模型名称最大长度限制 */
export const MAX_CUSTOM_MODEL_LENGTH = 256;

/** 聊天字体最小大小 (px) */
export const MIN_CHAT_FONT_SIZE_PX = 11;

/** 聊天字体最大大小 (px) */
export const MAX_CHAT_FONT_SIZE_PX = 18;

/** 聊天字体默认大小 (px) */
export const DEFAULT_CHAT_FONT_SIZE_PX = 12;

export const TimestampFormat = Schema.Literal("locale", "12-hour", "24-hour");
export type TimestampFormat = typeof TimestampFormat.Type;
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";
export const SidebarSide = Schema.Literal("left", "right");
export type SidebarSide = typeof SidebarSide.Type;
export const DEFAULT_SIDEBAR_SIDE: SidebarSide = "left";
export const SidebarProjectSortOrder = Schema.Literal("updated_at", "created_at", "manual");
export type SidebarProjectSortOrder = typeof SidebarProjectSortOrder.Type;
export const DEFAULT_SIDEBAR_PROJECT_SORT_ORDER: SidebarProjectSortOrder = "manual";
export const SidebarThreadSortOrder = Schema.Literal("updated_at", "created_at");
export type SidebarThreadSortOrder = typeof SidebarThreadSortOrder.Type;
export const DEFAULT_SIDEBAR_THREAD_SORT_ORDER: SidebarThreadSortOrder = "updated_at";
export const LanguageSchema = Schema.Literal("en", "zh");
export type LanguageSetting = typeof LanguageSchema.Type;
export const DEFAULT_LANGUAGE_SETTING: LanguageSetting = DEFAULT_LANGUAGE;

export function getDefaultNativeFontSmoothing(platform = globalThis.navigator?.platform ?? "") {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

type CustomModelSettingsKey =
  | "customCodexModels"
  | "customClaudeModels"
  | "customCursorModels"
  | "customGeminiModels"
  | "customGrokModels"
  | "customKiloModels"
  | "customOpenCodeModels"
  | "customPiModels"
  | "customGlmModels"
  | "customDeepSeekModels"
  | "customMoonshotModels"
  | "customQwenModels"
  | "customMimoModels"
  | "customMiniMaxModels"
  // 新增 3 家国内 Provider
  | "customDoubaoModels"
  | "customErnieModels"
  | "customHunyuanModels";
export type ProviderCustomModelConfig = {
  provider: ProviderKind;
  settingsKey: CustomModelSettingsKey;
  defaultSettingsKey: CustomModelSettingsKey;
  title: string;
  description: string;
  placeholder: string;
  example: string;
};

const BUILT_IN_MODEL_SLUGS_BY_PROVIDER: Record<ProviderKind, ReadonlySet<string>> = {
  codex: new Set(getModelOptions("codex").map((option) => option.slug)),
  claudeAgent: new Set(getModelOptions("claudeAgent").map((option) => option.slug)),
  cursor: new Set(getModelOptions("cursor").map((option) => option.slug)),
  gemini: new Set(getModelOptions("gemini").map((option) => option.slug)),
  grok: new Set(getModelOptions("grok").map((option) => option.slug)),
  kilo: new Set(getModelOptions("kilo").map((option) => option.slug)),
  opencode: new Set(getModelOptions("opencode").map((option) => option.slug)),
  pi: new Set(getModelOptions("pi").map((option) => option.slug)),
  // 国内 6 家 OpenAI 兼容 Provider
  glm: new Set(getModelOptions("glm").map((option) => option.slug)),
  deepseek: new Set(getModelOptions("deepseek").map((option) => option.slug)),
  moonshot: new Set(getModelOptions("moonshot").map((option) => option.slug)),
  qwen: new Set(getModelOptions("qwen").map((option) => option.slug)),
  mimo: new Set(getModelOptions("mimo").map((option) => option.slug)),
  MiniMax: new Set(getModelOptions("MiniMax").map((option) => option.slug)),
  // 新增 3 家国内 OpenAI 兼容 Provider
  doubao: new Set(getModelOptions("doubao").map((option) => option.slug)),
  ernie: new Set(getModelOptions("ernie").map((option) => option.slug)),
  hunyuan: new Set(getModelOptions("hunyuan").map((option) => option.slug)),
};

const withDefaults = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  fallback: () => A,
): Schema.Schema<A, I | undefined, R> =>
  Schema.optionalWith(schema, { default: fallback }) as unknown as Schema.Schema<A, I | undefined, R>;

export const AppSettingsSchema = Schema.Struct({
  claudeBinaryPath: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  chatFontSizePx: withDefaults(Schema.Number, () => DEFAULT_CHAT_FONT_SIZE_PX),
  chatCodeFontFamily: withDefaults(Schema.String.pipe(Schema.maxLength(256)), () => ""),
  /**
   * Skill Marketplace 远端 URL（运行时切换）
   *
   * - 空字符串 / 缺省：使用后端默认（`https://marketplace.njydsz.com/index.json`）或 `YDSZ_MARKETPLACE_URL` 环境变量
   * - `http(s)://...`：覆盖默认 URL，下次启动时由 `useAppSettings().settings.marketplaceUrl` 同步到后端
   */
  marketplaceUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  codexBinaryPath: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  codexHomePath: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  cursorBinaryPath: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  cursorApiEndpoint: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  geminiBinaryPath: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  grokBinaryPath: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  kiloBinaryPath: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  kiloServerUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  kiloServerPassword: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  openCodeBinaryPath: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  piBinaryPath: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  piAgentDir: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  openCodeServerUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  openCodeServerPassword: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  // 国内 6 家 OpenAI 兼容 Provider 的 API Key / Base URL
  // Base URL 默认由后端配置覆盖；用户只填 API Key 即可
  glmApiKey: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  glmBaseUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  deepseekApiKey: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  deepseekBaseUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  moonshotApiKey: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  moonshotBaseUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  qwenApiKey: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  qwenBaseUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  mimoApiKey: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  mimoBaseUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  MiniMaxApiKey: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  MiniMaxBaseUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  // 新增 3 家国内 Provider 的 API Key / Base URL
  doubaoApiKey: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  doubaoBaseUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  ernieApiKey: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  ernieBaseUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  hunyuanApiKey: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  hunyuanBaseUrl: withDefaults(Schema.String.pipe(Schema.maxLength(4096)), () => ""),
  defaultThreadEnvMode: withDefaults(EnvMode, () => "local" as const satisfies EnvMode),
  confirmThreadDelete: withDefaults(Schema.Boolean, () => true),
  confirmThreadArchive: withDefaults(Schema.Boolean, () => false),
  confirmTerminalTabClose: withDefaults(Schema.Boolean, () => true),
  diffWordWrap: withDefaults(Schema.Boolean, () => false),
  enableAssistantStreaming: withDefaults(Schema.Boolean, () => false),
  enableNativeFontSmoothing: withDefaults(Schema.Boolean, () => getDefaultNativeFontSmoothing()),
  enableTaskCompletionToasts: withDefaults(Schema.Boolean, () => true),
  enableSystemTaskCompletionNotifications: withDefaults(Schema.Boolean, () => true),
  enableVoicePolish: withDefaults(Schema.Boolean, () => true),
  voicePolishRemoveFillerWords: withDefaults(Schema.Boolean, () => true),
  voicePolishFixGrammar: withDefaults(Schema.Boolean, () => true),
  voicePolishAddStructure: withDefaults(Schema.Boolean, () => false),
  voicePolishTargetLanguage: withDefaults(
    Schema.Literal("zh", "en", "auto"),
    () => "auto" as const,
  ),
  sidebarSide: withDefaults(SidebarSide, () => DEFAULT_SIDEBAR_SIDE),
  sidebarProjectSortOrder: withDefaults(SidebarProjectSortOrder, () => DEFAULT_SIDEBAR_PROJECT_SORT_ORDER),
  sidebarThreadSortOrder: withDefaults(SidebarThreadSortOrder, () => DEFAULT_SIDEBAR_THREAD_SORT_ORDER),
  timestampFormat: withDefaults(TimestampFormat, () => DEFAULT_TIMESTAMP_FORMAT),
  customCodexModels: withDefaults(Schema.Array(Schema.String), () => []),
  customClaudeModels: withDefaults(Schema.Array(Schema.String), () => []),
  customCursorModels: withDefaults(Schema.Array(Schema.String), () => []),
  customGeminiModels: withDefaults(Schema.Array(Schema.String), () => []),
  customGrokModels: withDefaults(Schema.Array(Schema.String), () => []),
  customKiloModels: withDefaults(Schema.Array(Schema.String), () => []),
  customOpenCodeModels: withDefaults(Schema.Array(Schema.String), () => []),
  customPiModels: withDefaults(Schema.Array(Schema.String), () => []),
  // 国内 6 家 OpenAI 兼容 Provider
  customGlmModels: withDefaults(Schema.Array(Schema.String), () => []),
  customDeepSeekModels: withDefaults(Schema.Array(Schema.String), () => []),
  customMoonshotModels: withDefaults(Schema.Array(Schema.String), () => []),
  customQwenModels: withDefaults(Schema.Array(Schema.String), () => []),
  customMimoModels: withDefaults(Schema.Array(Schema.String), () => []),
  customMiniMaxModels: withDefaults(Schema.Array(Schema.String), () => []),
  // 新增 3 家国内 Provider:customXxxModels 字段
  customDoubaoModels: withDefaults(Schema.Array(Schema.String), () => []),
  customErnieModels: withDefaults(Schema.Array(Schema.String), () => []),
  customHunyuanModels: withDefaults(Schema.Array(Schema.String), () => []),
  textGenerationProvider: withDefaults(ProviderKind, () => "codex" as const),
  textGenerationModel: Schema.optional(TrimmedNonEmptyString),
  uiFontFamily: withDefaults(Schema.String.pipe(Schema.maxLength(256)), () => ""),
  defaultProvider: withDefaults(ProviderKind, () => "codex" as const),
  language: withDefaults(LanguageSchema, () => DEFAULT_LANGUAGE_SETTING),
  hiddenProviders: withDefaults(Schema.Array(ProviderKind), () => []),
  providerOrder: withDefaults(Schema.Array(ProviderKind), () => [...DEFAULT_PROVIDER_ORDER]),
  hiddenModels: withDefaults(
    Schema.Array(
      Schema.Struct({
        provider: ProviderKind,
        slug: Schema.String,
      }),
    ),
    () => [],
  ),
});
export type AppSettings = typeof AppSettingsSchema.Type;
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableServerSettingsPatch = Mutable<ServerSettingsPatch>;
type MutableServerSettingsProvidersPatch = Mutable<NonNullable<ServerSettingsPatch["providers"]>>;

export interface AppModelOption extends ProviderModelOption {
  provider: ProviderKind;
  isCustom: boolean;
}

const DEFAULT_APP_SETTINGS = Schema.decodeUnknownSync(AppSettingsSchema)({});
let serverSettingsMigrationInFlight = false;

const PROVIDER_CUSTOM_MODEL_CONFIG: Record<ProviderKind, ProviderCustomModelConfig> = {
  codex: {
    provider: "codex",
    settingsKey: "customCodexModels",
    defaultSettingsKey: "customCodexModels",
    title: "Codex",
    description: "Save additional Codex model slugs for the picker and `/model` command.",
    placeholder: "your-codex-model-slug",
    example: "gpt-6.7-codex-ultra-preview",
  },
  claudeAgent: {
    provider: "claudeAgent",
    settingsKey: "customClaudeModels",
    defaultSettingsKey: "customClaudeModels",
    title: "Claude",
    description: "Save additional Claude model slugs for the picker and `/model` command.",
    placeholder: "your-claude-model-slug",
    example: "claude-sonnet-5-0",
  },
  cursor: {
    provider: "cursor",
    settingsKey: "customCursorModels",
    defaultSettingsKey: "customCursorModels",
    title: "Cursor",
    description: "Save additional Cursor model slugs for the picker and provider runtime.",
    placeholder: "cursor-model-slug",
    example: "composer-2",
  },
  gemini: {
    provider: "gemini",
    settingsKey: "customGeminiModels",
    defaultSettingsKey: "customGeminiModels",
    title: "Gemini",
    description: "Save additional Gemini model slugs for the picker and `/model` command.",
    placeholder: "your-gemini-model-slug",
    example: "gemini-3.5-pro-preview",
  },
  grok: {
    provider: "grok",
    settingsKey: "customGrokModels",
    defaultSettingsKey: "customGrokModels",
    title: "Grok",
    description: "Save additional Grok model slugs for the picker and `/model` command.",
    placeholder: "your-grok-model-slug",
    example: "grok-build-0.1",
  },
  kilo: {
    provider: "kilo",
    settingsKey: "customKiloModels",
    defaultSettingsKey: "customKiloModels",
    title: "Kilo",
    description: "Save additional Kilo model slugs for the picker and provider runtime.",
    placeholder: "provider/model",
    example: "kilo/kilo-auto/free",
  },
  opencode: {
    provider: "opencode",
    settingsKey: "customOpenCodeModels",
    defaultSettingsKey: "customOpenCodeModels",
    title: "OpenCode",
    description: "Save additional OpenCode model slugs for the picker and provider runtime.",
    placeholder: "provider/model",
    example: "openai/gpt-5",
  },
  pi: {
    provider: "pi",
    settingsKey: "customPiModels",
    defaultSettingsKey: "customPiModels",
    title: "Pi",
    description: "Save additional Pi model slugs for the picker and provider runtime.",
    placeholder: "provider/model",
    example: "anthropic/claude-sonnet-4-5",
  },
  // 国内 6 家 OpenAI 兼容 Provider
  glm: {
    provider: "glm",
    settingsKey: "customGlmModels",
    defaultSettingsKey: "customGlmModels",
    title: "智谱 GLM",
    description: "Save additional 智谱 GLM model slugs for the picker and `/model` command.",
    placeholder: "glm-model-slug",
    example: "glm-4-0520",
  },
  deepseek: {
    provider: "deepseek",
    settingsKey: "customDeepSeekModels",
    defaultSettingsKey: "customDeepSeekModels",
    title: "深度求索 DeepSeek",
    description: "Save additional DeepSeek model slugs for the picker and `/model` command.",
    placeholder: "deepseek-model-slug",
    example: "deepseek-chat",
  },
  moonshot: {
    provider: "moonshot",
    settingsKey: "customMoonshotModels",
    defaultSettingsKey: "customMoonshotModels",
    title: "月之暗面 Kimi",
    description: "Save additional Kimi/Moonshot model slugs for the picker and `/model` command.",
    placeholder: "moonshot-model-slug",
    example: "moonshot-v1-128k",
  },
  qwen: {
    provider: "qwen",
    settingsKey: "customQwenModels",
    defaultSettingsKey: "customQwenModels",
    title: "通义千问 Qwen",
    description: "Save additional Qwen model slugs for the picker and `/model` command.",
    placeholder: "qwen-model-slug",
    example: "qwen3-coder-plus",
  },
  mimo: {
    provider: "mimo",
    settingsKey: "customMimoModels",
    defaultSettingsKey: "customMimoModels",
    title: "小米 MiMo",
    description: "Save additional MiMo model slugs for the picker and `/model` command.",
    placeholder: "mimo-model-slug",
    example: "mimo-v2-pro",
  },
  MiniMax: {
    provider: "MiniMax",
    settingsKey: "customMiniMaxModels",
    defaultSettingsKey: "customMiniMaxModels",
    title: "MiniMax",
    description: "Save additional MiniMax model slugs for the picker and `/model` command.",
    placeholder: "MiniMax-model-slug",
    example: "MiniMax-Text-01",
  },
  // 新增 3 家国内 Provider
  doubao: {
    provider: "doubao",
    settingsKey: "customDoubaoModels",
    defaultSettingsKey: "customDoubaoModels",
    title: "字节跳动 豆包",
    description: "Save additional Doubao model slugs for the picker and `/model` command.",
    placeholder: "doubao-model-slug",
    example: "doubao-1.5-pro-32k",
  },
  ernie: {
    provider: "ernie",
    settingsKey: "customErnieModels",
    defaultSettingsKey: "customErnieModels",
    title: "百度 文心一言",
    description: "Save additional Ernie model slugs for the picker and `/model` command.",
    placeholder: "ernie-model-slug",
    example: "ernie-4.0-8k-latest",
  },
  hunyuan: {
    provider: "hunyuan",
    settingsKey: "customHunyuanModels",
    defaultSettingsKey: "customHunyuanModels",
    title: "腾讯 混元",
    description: "Save additional Hunyuan model slugs for the picker and `/model` command.",
    placeholder: "hunyuan-model-slug",
    example: "hunyuan-pro",
  },
};

export const MODEL_PROVIDER_SETTINGS = Object.values(PROVIDER_CUSTOM_MODEL_CONFIG);

export function normalizeCustomModelSlugs(
  models: Iterable<string | null | undefined>,
  provider: ProviderKind = "codex",
): string[] {
  const normalizedModels: string[] = [];
  const seen = new Set<string>();
  const builtInModelSlugs = BUILT_IN_MODEL_SLUGS_BY_PROVIDER[provider];

  for (const candidate of models) {
    const normalized = normalizeModelSlug(candidate, provider);
    if (
      !normalized ||
      normalized.length > MAX_CUSTOM_MODEL_LENGTH ||
      builtInModelSlugs.has(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    normalizedModels.push(normalized);
    if (normalizedModels.length >= MAX_CUSTOM_MODEL_COUNT) {
      break;
    }
  }

  return normalizedModels;
}

export function normalizeChatFontSizePx(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CHAT_FONT_SIZE_PX;
  }

  return Math.min(MAX_CHAT_FONT_SIZE_PX, Math.max(MIN_CHAT_FONT_SIZE_PX, Math.round(value)));
}

/**
 * 归一化 marketplaceUrl：
 *
 * - 空字符串 / 仅空白 → 返回空字符串（让后端走默认 / 环境变量）
 * - 非 `http(s)://` 开头 → 返回空字符串（防止误填本地路径或脚本）
 * - 末尾斜杠保留：JSON URL 兼容
 *
 * 用于：
 *
 * 1. `useSkillMarketplaceActions().setUrl` 入参校验
 * 2. `appSettings.marketplaceUrl` 持久化前净化
 * 3. 表单输入即时反馈（`MarketplaceUrlDialog` 校验态）
 */
export function normalizeMarketplaceUrl(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    chatFontSizePx: normalizeChatFontSizePx(settings.chatFontSizePx),
    customCodexModels: normalizeCustomModelSlugs(settings.customCodexModels, "codex"),
    customClaudeModels: normalizeCustomModelSlugs(settings.customClaudeModels, "claudeAgent"),
    customCursorModels: normalizeCustomModelSlugs(settings.customCursorModels, "cursor"),
    customGeminiModels: normalizeCustomModelSlugs(settings.customGeminiModels, "gemini"),
    customGrokModels: normalizeCustomModelSlugs(settings.customGrokModels, "grok"),
    customKiloModels: normalizeCustomModelSlugs(settings.customKiloModels, "kilo"),
    customOpenCodeModels: normalizeCustomModelSlugs(settings.customOpenCodeModels, "opencode"),
    customPiModels: normalizeCustomModelSlugs(settings.customPiModels, "pi"),
    customGlmModels: normalizeCustomModelSlugs(settings.customGlmModels ?? [], "glm"),
    customDeepSeekModels: normalizeCustomModelSlugs(settings.customDeepSeekModels ?? [], "deepseek"),
    customMoonshotModels: normalizeCustomModelSlugs(settings.customMoonshotModels ?? [], "moonshot"),
    customQwenModels: normalizeCustomModelSlugs(settings.customQwenModels ?? [], "qwen"),
    customMimoModels: normalizeCustomModelSlugs(settings.customMimoModels ?? [], "mimo"),
    customMiniMaxModels: normalizeCustomModelSlugs(settings.customMiniMaxModels ?? [], "MiniMax"),
    // 新增 3 家国内 Provider
    customDoubaoModels: normalizeCustomModelSlugs(settings.customDoubaoModels ?? [], "doubao"),
    customErnieModels: normalizeCustomModelSlugs(settings.customErnieModels ?? [], "ernie"),
    customHunyuanModels: normalizeCustomModelSlugs(settings.customHunyuanModels ?? [], "hunyuan"),
    hiddenProviders: normalizeHiddenProviders(settings.hiddenProviders),
    providerOrder: normalizeProviderOrder(settings.providerOrder),
    language: normalizeLanguage(settings.language),
    hiddenModels: [],
    voicePolishTargetLanguage:
      settings.voicePolishTargetLanguage === "zh" ||
      settings.voicePolishTargetLanguage === "en" ||
      settings.voicePolishTargetLanguage === "auto"
        ? settings.voicePolishTargetLanguage
        : "auto",
  };
}

function serverSettingsToAppSettings(settings: ServerSettings): Partial<AppSettings> {
  const providers = settings.providers ?? DEFAULT_SERVER_SETTINGS.providers;
  const textGen = settings.textGenerationModelSelection ?? DEFAULT_SERVER_SETTINGS.textGenerationModelSelection;
  return {
    claudeBinaryPath: providers.claudeAgent.binaryPath,
    codexBinaryPath: providers.codex.binaryPath,
    codexHomePath: providers.codex.homePath,
    cursorApiEndpoint: providers.cursor.apiEndpoint,
    cursorBinaryPath: providers.cursor.binaryPath,
    defaultThreadEnvMode: settings.defaultThreadEnvMode,
    enableAssistantStreaming: settings.enableAssistantStreaming,
    geminiBinaryPath: providers.gemini.binaryPath,
    grokBinaryPath: providers.grok.binaryPath,
    kiloBinaryPath: providers.kilo.binaryPath,
    kiloServerPassword: providers.kilo.serverPassword,
    kiloServerUrl: providers.kilo.serverUrl,
    openCodeBinaryPath: providers.opencode.binaryPath,
    openCodeServerPassword: providers.opencode.serverPassword,
    openCodeServerUrl: providers.opencode.serverUrl,
    piAgentDir: providers.pi.agentDir,
    piBinaryPath: providers.pi.binaryPath,
    customCodexModels: providers.codex.customModels,
    customClaudeModels: providers.claudeAgent.customModels,
    customCursorModels: providers.cursor.customModels,
    customGeminiModels: providers.gemini.customModels,
    customGrokModels: providers.grok.customModels,
    customKiloModels: providers.kilo.customModels,
    customOpenCodeModels: providers.opencode.customModels,
    customPiModels: providers.pi.customModels,
    textGenerationProvider: textGen.provider,
    textGenerationModel: textGen.model,
  };
}

function resolveTextGenerationProvider(input: {
  readonly provider?: ProviderKind | null;
  readonly model?: string | null;
}): ProviderKind {
  if (input.provider) {
    return input.provider;
  }
  const model = input.model;
  return model?.includes("/") ? "opencode" : "codex";
}

function hasOwn<Key extends keyof AppSettings>(patch: Partial<AppSettings>, key: Key): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

function appSettingsPatchToServerSettingsPatch(patch: Partial<AppSettings>): ServerSettingsPatch {
  const providers: MutableServerSettingsProvidersPatch = {};
  const serverPatch: MutableServerSettingsPatch = {};

  if (hasOwn(patch, "enableAssistantStreaming")) {
    serverPatch.enableAssistantStreaming = Boolean(patch.enableAssistantStreaming);
  }
  if (patch.defaultThreadEnvMode === "local" || patch.defaultThreadEnvMode === "worktree") {
    serverPatch.defaultThreadEnvMode = patch.defaultThreadEnvMode;
  }
  if (hasOwn(patch, "textGenerationModel") || hasOwn(patch, "textGenerationProvider")) {
    const model = patch.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL;
    serverPatch.textGenerationModelSelection = {
      provider: resolveTextGenerationProvider({
        ...(patch.textGenerationProvider !== undefined
          ? { provider: patch.textGenerationProvider }
          : {}),
        model,
      }),
      model,
    };
  }

  if (
    hasOwn(patch, "codexBinaryPath") ||
    hasOwn(patch, "codexHomePath") ||
    hasOwn(patch, "customCodexModels")
  ) {
    providers.codex = {
      ...(hasOwn(patch, "codexBinaryPath") ? { binaryPath: patch.codexBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "codexHomePath") ? { homePath: patch.codexHomePath ?? "" } : {}),
      ...(hasOwn(patch, "customCodexModels")
        ? { customModels: patch.customCodexModels ?? [] }
        : {}),
    };
  }
  if (hasOwn(patch, "claudeBinaryPath") || hasOwn(patch, "customClaudeModels")) {
    providers.claudeAgent = {
      ...(hasOwn(patch, "claudeBinaryPath") ? { binaryPath: patch.claudeBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customClaudeModels")
        ? { customModels: patch.customClaudeModels ?? [] }
        : {}),
    };
  }
  if (
    hasOwn(patch, "cursorApiEndpoint") ||
    hasOwn(patch, "cursorBinaryPath") ||
    hasOwn(patch, "customCursorModels")
  ) {
    providers.cursor = {
      ...(hasOwn(patch, "cursorApiEndpoint") ? { apiEndpoint: patch.cursorApiEndpoint ?? "" } : {}),
      ...(hasOwn(patch, "cursorBinaryPath") ? { binaryPath: patch.cursorBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customCursorModels")
        ? { customModels: patch.customCursorModels ?? [] }
        : {}),
    };
  }
  if (hasOwn(patch, "geminiBinaryPath") || hasOwn(patch, "customGeminiModels")) {
    providers.gemini = {
      ...(hasOwn(patch, "geminiBinaryPath") ? { binaryPath: patch.geminiBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customGeminiModels")
        ? { customModels: patch.customGeminiModels ?? [] }
        : {}),
    };
  }
  if (hasOwn(patch, "grokBinaryPath") || hasOwn(patch, "customGrokModels")) {
    providers.grok = {
      ...(hasOwn(patch, "grokBinaryPath") ? { binaryPath: patch.grokBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customGrokModels") ? { customModels: patch.customGrokModels ?? [] } : {}),
    };
  }
  if (
    hasOwn(patch, "kiloBinaryPath") ||
    hasOwn(patch, "kiloServerUrl") ||
    hasOwn(patch, "kiloServerPassword") ||
    hasOwn(patch, "customKiloModels")
  ) {
    providers.kilo = {
      ...(hasOwn(patch, "kiloBinaryPath") ? { binaryPath: patch.kiloBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "kiloServerUrl") ? { serverUrl: patch.kiloServerUrl ?? "" } : {}),
      ...(hasOwn(patch, "kiloServerPassword")
        ? { serverPassword: patch.kiloServerPassword ?? "" }
        : {}),
      ...(hasOwn(patch, "customKiloModels") ? { customModels: patch.customKiloModels ?? [] } : {}),
    };
  }
  if (
    hasOwn(patch, "openCodeBinaryPath") ||
    hasOwn(patch, "openCodeServerUrl") ||
    hasOwn(patch, "openCodeServerPassword") ||
    hasOwn(patch, "customOpenCodeModels")
  ) {
    providers.opencode = {
      ...(hasOwn(patch, "openCodeBinaryPath")
        ? { binaryPath: patch.openCodeBinaryPath ?? "" }
        : {}),
      ...(hasOwn(patch, "openCodeServerUrl") ? { serverUrl: patch.openCodeServerUrl ?? "" } : {}),
      ...(hasOwn(patch, "openCodeServerPassword")
        ? { serverPassword: patch.openCodeServerPassword ?? "" }
        : {}),
      ...(hasOwn(patch, "customOpenCodeModels")
        ? { customModels: patch.customOpenCodeModels ?? [] }
        : {}),
    };
  }
  if (
    hasOwn(patch, "piAgentDir") ||
    hasOwn(patch, "piBinaryPath") ||
    hasOwn(patch, "customPiModels")
  ) {
    providers.pi = {
      ...(hasOwn(patch, "piAgentDir") ? { agentDir: patch.piAgentDir ?? "" } : {}),
      ...(hasOwn(patch, "piBinaryPath") ? { binaryPath: patch.piBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customPiModels") ? { customModels: patch.customPiModels ?? [] } : {}),
    };
  }

  if (Object.keys(providers).length > 0) {
    serverPatch.providers = providers;
  }
  return serverPatch;
}

function isServerSettingsPatchEmpty(patch: ServerSettingsPatch): boolean {
  return Object.keys(patch).length === 0;
}

function buildInitialServerSettingsMigrationPatch(settings: AppSettings): ServerSettingsPatch {
  const patch: Partial<Mutable<AppSettings>> = {};
  const defaults = DEFAULT_APP_SETTINGS;

  for (const key of [
    "claudeBinaryPath",
    "codexBinaryPath",
    "codexHomePath",
    "cursorApiEndpoint",
    "cursorBinaryPath",
    "defaultThreadEnvMode",
    "enableAssistantStreaming",
    "geminiBinaryPath",
    "grokBinaryPath",
    "kiloBinaryPath",
    "kiloServerPassword",
    "kiloServerUrl",
    "openCodeBinaryPath",
    "openCodeServerPassword",
    "openCodeServerUrl",
    "piAgentDir",
    "piBinaryPath",
    "textGenerationModel",
    "textGenerationProvider",
  ] as const) {
    if (settings[key] !== defaults[key]) {
      patch[key] = settings[key] as never;
    }
  }

  for (const key of [
    "customCodexModels",
    "customClaudeModels",
    "customCursorModels",
    "customGeminiModels",
    "customGrokModels",
    "customKiloModels",
    "customOpenCodeModels",
    "customPiModels",
  ] as const) {
    if (settings[key].length > 0) {
      patch[key] = settings[key] as never;
    }
  }

  return appSettingsPatchToServerSettingsPatch(patch);
}

export function normalizeStoredAppSettings(settings: AppSettings): AppSettings {
  return normalizeAppSettings(settings);
}

export function getCustomModelsForProvider(
  settings: Pick<AppSettings, CustomModelSettingsKey>,
  provider: ProviderKind,
): readonly string[] {
  return settings[PROVIDER_CUSTOM_MODEL_CONFIG[provider].settingsKey] ?? [];
}

export function getDefaultCustomModelsForProvider(
  defaults: Pick<AppSettings, CustomModelSettingsKey>,
  provider: ProviderKind,
): readonly string[] {
  return defaults[PROVIDER_CUSTOM_MODEL_CONFIG[provider].defaultSettingsKey];
}

export function patchCustomModels(
  provider: ProviderKind,
  models: string[],
): Partial<Pick<AppSettings, CustomModelSettingsKey>> {
  return {
    [PROVIDER_CUSTOM_MODEL_CONFIG[provider].settingsKey]: models,
  };
}

export function getCustomModelsByProvider(
  settings: Pick<AppSettings, CustomModelSettingsKey>,
): Record<ProviderKind, readonly string[]> {
  return {
    codex: getCustomModelsForProvider(settings, "codex"),
    claudeAgent: getCustomModelsForProvider(settings, "claudeAgent"),
    cursor: getCustomModelsForProvider(settings, "cursor"),
    gemini: getCustomModelsForProvider(settings, "gemini"),
    grok: getCustomModelsForProvider(settings, "grok"),
    kilo: getCustomModelsForProvider(settings, "kilo"),
    opencode: getCustomModelsForProvider(settings, "opencode"),
    pi: getCustomModelsForProvider(settings, "pi"),
    // 国内 6 家 OpenAI 兼容 Provider
    glm: getCustomModelsForProvider(settings, "glm"),
    deepseek: getCustomModelsForProvider(settings, "deepseek"),
    moonshot: getCustomModelsForProvider(settings, "moonshot"),
    qwen: getCustomModelsForProvider(settings, "qwen"),
    mimo: getCustomModelsForProvider(settings, "mimo"),
    MiniMax: getCustomModelsForProvider(settings, "MiniMax"),
    // 新增 3 家国内 Provider
    doubao: getCustomModelsForProvider(settings, "doubao"),
    ernie: getCustomModelsForProvider(settings, "ernie"),
    hunyuan: getCustomModelsForProvider(settings, "hunyuan"),
  };
}

export function getAppModelOptions(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel?: string | null,
): AppModelOption[] {
  const options: AppModelOption[] = getModelOptions(provider).map(({ slug, name }) => ({
    provider,
    slug,
    name,
    isCustom: false,
  }));
  const seen = new Set(options.map((option) => option.slug));
  const trimmedSelectedModel = selectedModel?.trim().toLowerCase();

  for (const slug of normalizeCustomModelSlugs(customModels, provider)) {
    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    options.push({
      provider,
      slug,
      name: formatProviderModelOptionName({ provider, slug }),
      isCustom: true,
    });
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  const selectedModelMatchesExistingName =
    typeof trimmedSelectedModel === "string" &&
    options.some((option) => option.name.toLowerCase() === trimmedSelectedModel);
  if (
    normalizedSelectedModel &&
    !seen.has(normalizedSelectedModel) &&
    !selectedModelMatchesExistingName
  ) {
    options.push({
      provider,
      slug: normalizedSelectedModel,
      name: formatProviderModelOptionName({ provider, slug: normalizedSelectedModel }),
      isCustom: true,
    });
  }

  return options;
}

export function getGitTextGenerationModelOptions(
  settings: Pick<
    AppSettings,
    | "customCodexModels"
    | "customKiloModels"
    | "customOpenCodeModels"
    | "textGenerationModel"
    | "textGenerationProvider"
  >,
): AppModelOption[] {
  const options = [
    ...getAppModelOptions("codex", settings.customCodexModels),
    ...getAppModelOptions("kilo", settings.customKiloModels),
    ...getAppModelOptions("opencode", settings.customOpenCodeModels),
  ];
  const deduped: AppModelOption[] = [];
  const seen = new Set<string>();

  for (const option of options) {
    const key = `${option.provider}:${option.slug}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(option);
  }

  const selectedModel = settings.textGenerationModel?.trim();
  const selectedProvider =
    settings.textGenerationProvider ??
    resolveTextGenerationProvider(selectedModel !== undefined ? { model: selectedModel } : {});
  if (selectedModel && !seen.has(`${selectedProvider}:${selectedModel}`)) {
    deduped.push({
      provider: selectedProvider,
      slug: selectedModel,
      name: formatProviderModelOptionName({ provider: selectedProvider, slug: selectedModel }),
      isCustom: true,
    });
  }

  return deduped;
}

export function resolveAppModelSelection(
  provider: ProviderKind,
  customModels: Record<ProviderKind, readonly string[]>,
  selectedModel: string | null | undefined,
): string {
  const customModelsForProvider = customModels[provider];
  const options = getAppModelOptions(provider, customModelsForProvider, selectedModel);
  return (
    resolveSelectableModel(provider, selectedModel, options) ?? getDefaultModel(provider) ?? ""
  );
}

export function getCustomModelOptionsByProvider(
  settings: Pick<AppSettings, CustomModelSettingsKey>,
): Record<ProviderKind, ReadonlyArray<ProviderModelOption>> {
  const customModelsByProvider = getCustomModelsByProvider(settings);
  return {
    codex: getAppModelOptions("codex", customModelsByProvider.codex),
    claudeAgent: getAppModelOptions("claudeAgent", customModelsByProvider.claudeAgent),
    cursor: getAppModelOptions("cursor", customModelsByProvider.cursor),
    gemini: getAppModelOptions("gemini", customModelsByProvider.gemini),
    grok: getAppModelOptions("grok", customModelsByProvider.grok),
    kilo: getAppModelOptions("kilo", customModelsByProvider.kilo),
    opencode: getAppModelOptions("opencode", customModelsByProvider.opencode),
    pi: getAppModelOptions("pi", customModelsByProvider.pi),
    // 国内 6 家 OpenAI 兼容 Provider
    glm: getAppModelOptions("glm", customModelsByProvider.glm),
    deepseek: getAppModelOptions("deepseek", customModelsByProvider.deepseek),
    moonshot: getAppModelOptions("moonshot", customModelsByProvider.moonshot),
    qwen: getAppModelOptions("qwen", customModelsByProvider.qwen),
    mimo: getAppModelOptions("mimo", customModelsByProvider.mimo),
    MiniMax: getAppModelOptions("MiniMax", customModelsByProvider.MiniMax),
    // 新增 3 家国内 Provider
    doubao: getAppModelOptions("doubao", customModelsByProvider.doubao),
    ernie: getAppModelOptions("ernie", customModelsByProvider.ernie),
    hunyuan: getAppModelOptions("hunyuan", customModelsByProvider.hunyuan),
  };
}

export function getProviderStartOptions(
  settings: Pick<
    AppSettings,
    | "claudeBinaryPath"
    | "codexBinaryPath"
    | "codexHomePath"
    | "cursorApiEndpoint"
    | "cursorBinaryPath"
    | "geminiBinaryPath"
    | "grokBinaryPath"
    | "kiloBinaryPath"
    | "kiloServerPassword"
    | "kiloServerUrl"
    | "openCodeBinaryPath"
    | "openCodeServerPassword"
    | "openCodeServerUrl"
    | "piAgentDir"
    | "piBinaryPath"
    | "glmApiKey"
    | "glmBaseUrl"
    | "deepseekApiKey"
    | "deepseekBaseUrl"
    | "moonshotApiKey"
    | "moonshotBaseUrl"
    | "qwenApiKey"
    | "qwenBaseUrl"
    | "mimoApiKey"
    | "mimoBaseUrl"
    | "MiniMaxApiKey"
    | "MiniMaxBaseUrl"
    // 新增 3 家国内 Provider 的 API Key / Base URL
    | "doubaoApiKey"
    | "doubaoBaseUrl"
    | "ernieApiKey"
    | "ernieBaseUrl"
    | "hunyuanApiKey"
    | "hunyuanBaseUrl"
  >,
): ProviderStartOptions | undefined {
  const providerOptions: ProviderStartOptions = {
    ...(settings.codexBinaryPath || settings.codexHomePath
      ? {
          codex: {
            ...(settings.codexBinaryPath ? { binaryPath: settings.codexBinaryPath } : {}),
            ...(settings.codexHomePath ? { homePath: settings.codexHomePath } : {}),
          },
        }
      : {}),
    ...(settings.claudeBinaryPath
      ? {
          claudeAgent: {
            binaryPath: settings.claudeBinaryPath,
          },
        }
      : {}),
    ...(settings.cursorBinaryPath || settings.cursorApiEndpoint
      ? {
          cursor: {
            ...(settings.cursorBinaryPath ? { binaryPath: settings.cursorBinaryPath } : {}),
            ...(settings.cursorApiEndpoint ? { apiEndpoint: settings.cursorApiEndpoint } : {}),
          },
        }
      : {}),
    ...(settings.geminiBinaryPath
      ? {
          gemini: {
            binaryPath: settings.geminiBinaryPath,
          },
        }
      : {}),
    ...(settings.grokBinaryPath
      ? {
          grok: {
            binaryPath: settings.grokBinaryPath,
          },
        }
      : {}),
    ...(settings.kiloBinaryPath || settings.kiloServerUrl || settings.kiloServerPassword
      ? {
          kilo: {
            ...(settings.kiloBinaryPath ? { binaryPath: settings.kiloBinaryPath } : {}),
            ...(settings.kiloServerUrl ? { serverUrl: settings.kiloServerUrl } : {}),
            ...(settings.kiloServerPassword ? { serverPassword: settings.kiloServerPassword } : {}),
          },
        }
      : {}),
    ...(settings.openCodeBinaryPath || settings.openCodeServerUrl || settings.openCodeServerPassword
      ? {
          opencode: {
            ...(settings.openCodeBinaryPath ? { binaryPath: settings.openCodeBinaryPath } : {}),
            ...(settings.openCodeServerUrl ? { serverUrl: settings.openCodeServerUrl } : {}),
            ...(settings.openCodeServerPassword
              ? { serverPassword: settings.openCodeServerPassword }
              : {}),
          },
        }
      : {}),
    ...(settings.piBinaryPath || settings.piAgentDir
      ? {
          pi: {
            ...(settings.piBinaryPath ? { binaryPath: settings.piBinaryPath } : {}),
            ...(settings.piAgentDir ? { agentDir: settings.piAgentDir } : {}),
          },
        }
      : {}),
    // 国内 6 家 OpenAI 兼容 Provider 启动参数
    ...(settings.glmApiKey || settings.glmBaseUrl
      ? {
          glm: {
            ...(settings.glmApiKey ? { apiKey: settings.glmApiKey } : {}),
            ...(settings.glmBaseUrl ? { baseUrl: settings.glmBaseUrl } : {}),
          },
        }
      : {}),
    ...(settings.deepseekApiKey || settings.deepseekBaseUrl
      ? {
          deepseek: {
            ...(settings.deepseekApiKey ? { apiKey: settings.deepseekApiKey } : {}),
            ...(settings.deepseekBaseUrl ? { baseUrl: settings.deepseekBaseUrl } : {}),
          },
        }
      : {}),
    ...(settings.moonshotApiKey || settings.moonshotBaseUrl
      ? {
          moonshot: {
            ...(settings.moonshotApiKey ? { apiKey: settings.moonshotApiKey } : {}),
            ...(settings.moonshotBaseUrl ? { baseUrl: settings.moonshotBaseUrl } : {}),
          },
        }
      : {}),
    ...(settings.qwenApiKey || settings.qwenBaseUrl
      ? {
          qwen: {
            ...(settings.qwenApiKey ? { apiKey: settings.qwenApiKey } : {}),
            ...(settings.qwenBaseUrl ? { baseUrl: settings.qwenBaseUrl } : {}),
          },
        }
      : {}),
    ...(settings.mimoApiKey || settings.mimoBaseUrl
      ? {
          mimo: {
            ...(settings.mimoApiKey ? { apiKey: settings.mimoApiKey } : {}),
            ...(settings.mimoBaseUrl ? { baseUrl: settings.mimoBaseUrl } : {}),
          },
        }
      : {}),
    ...(settings.MiniMaxApiKey || settings.MiniMaxBaseUrl
      ? {
          MiniMax: {
            ...(settings.MiniMaxApiKey ? { apiKey: settings.MiniMaxApiKey } : {}),
            ...(settings.MiniMaxBaseUrl ? { baseUrl: settings.MiniMaxBaseUrl } : {}),
          },
        }
      : {}),
    // 新增 3 家国内 Provider 启动参数
    ...(settings.doubaoApiKey || settings.doubaoBaseUrl
      ? {
          doubao: {
            ...(settings.doubaoApiKey ? { apiKey: settings.doubaoApiKey } : {}),
            ...(settings.doubaoBaseUrl ? { baseUrl: settings.doubaoBaseUrl } : {}),
          },
        }
      : {}),
    ...(settings.ernieApiKey || settings.ernieBaseUrl
      ? {
          ernie: {
            ...(settings.ernieApiKey ? { apiKey: settings.ernieApiKey } : {}),
            ...(settings.ernieBaseUrl ? { baseUrl: settings.ernieBaseUrl } : {}),
          },
        }
      : {}),
    ...(settings.hunyuanApiKey || settings.hunyuanBaseUrl
      ? {
          hunyuan: {
            ...(settings.hunyuanApiKey ? { apiKey: settings.hunyuanApiKey } : {}),
            ...(settings.hunyuanBaseUrl ? { baseUrl: settings.hunyuanBaseUrl } : {}),
          },
        }
      : {}),
  };

  return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
}

export function getCustomBinaryPathForProvider(
  settings: Pick<
    AppSettings,
    | "claudeBinaryPath"
    | "codexBinaryPath"
    | "cursorBinaryPath"
    | "geminiBinaryPath"
    | "grokBinaryPath"
    | "kiloBinaryPath"
    | "openCodeBinaryPath"
    | "piBinaryPath"
  >,
  provider: ProviderKind,
): string {
  switch (provider) {
    case "codex":
      return settings.codexBinaryPath;
    case "claudeAgent":
      return settings.claudeBinaryPath;
    case "cursor":
      return settings.cursorBinaryPath;
    case "gemini":
      return settings.geminiBinaryPath;
    case "grok":
      return settings.grokBinaryPath;
    case "kilo":
      return settings.kiloBinaryPath;
    case "opencode":
      return settings.openCodeBinaryPath;
    case "pi":
      return settings.piBinaryPath;
    // 国内 6 家 OpenAI 兼容 Provider 无本地 binary，返回空字符串
    case "glm":
    case "deepseek":
    case "moonshot":
    case "qwen":
    case "mimo":
    case "MiniMax":
    // 新增 3 家国内 Provider 同样无本地 binary
    case "doubao":
    case "ernie":
    case "hunyuan":
      return "";
  }
}

export function useAppSettings() {
  const queryClient = useQueryClient();
  const serverSettingsQuery = useQuery(serverSettingsQueryOptions());
  const [localSettings, setSettings] = useLocalStorage(
    APP_SETTINGS_STORAGE_KEY,
    DEFAULT_APP_SETTINGS,
    AppSettingsSchema,
  );
  const normalizedStoredSettingsRef = useRef(false);

  const defaults = useMemo(
    () =>
      normalizeAppSettings({
        ...DEFAULT_APP_SETTINGS,
        ...serverSettingsToAppSettings(DEFAULT_SERVER_SETTINGS),
      }),
    [],
  );

  const settings = useMemo(
    () =>
      normalizeAppSettings({
        ...localSettings,
        ...(serverSettingsQuery.data ? serverSettingsToAppSettings(serverSettingsQuery.data) : {}),
      }),
    [localSettings, serverSettingsQuery.data],
  );

  useEffect(() => {
    if (normalizedStoredSettingsRef.current) {
      return;
    }
    normalizedStoredSettingsRef.current = true;

    setSettings((previous: AppSettings) => normalizeStoredAppSettings(previous));
  }, [setSettings]);

  useEffect(() => {
    if (!serverSettingsQuery.data || serverSettingsMigrationInFlight) {
      return;
    }
    if (globalThis.localStorage?.getItem(SERVER_SETTINGS_MIGRATION_STORAGE_KEY) === "1") {
      return;
    }

    const migrationPatch = buildInitialServerSettingsMigrationPatch(localSettings);
    if (isServerSettingsPatchEmpty(migrationPatch)) {
      globalThis.localStorage?.setItem(SERVER_SETTINGS_MIGRATION_STORAGE_KEY, "1");
      return;
    }

    serverSettingsMigrationInFlight = true;
    void ensureNativeApi()
      .server.updateSettings(migrationPatch)
      .then((nextSettings) => {
        queryClient.setQueryData(serverQueryKeys.settings(), nextSettings);
        globalThis.localStorage?.setItem(SERVER_SETTINGS_MIGRATION_STORAGE_KEY, "1");
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
      })
      .finally(() => {
        serverSettingsMigrationInFlight = false;
      });
  }, [localSettings, queryClient, serverSettingsQuery.data]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev: AppSettings) => normalizeAppSettings({ ...prev, ...patch }));

      const serverPatch = appSettingsPatchToServerSettingsPatch(patch);
      if (isServerSettingsPatchEmpty(serverPatch)) {
        return;
      }

      void ensureNativeApi()
        .server.updateSettings(serverPatch)
        .then((nextSettings) => {
          queryClient.setQueryData(serverQueryKeys.settings(), nextSettings);
        })
        .catch(() => {
          void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
        });
    },
    [queryClient, setSettings],
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_APP_SETTINGS);
    const serverPatch = appSettingsPatchToServerSettingsPatch(defaults);
    void ensureNativeApi()
      .server.updateSettings(serverPatch)
      .then((nextSettings) => {
        queryClient.setQueryData(serverQueryKeys.settings(), nextSettings);
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
      });
  }, [defaults, queryClient, setSettings]);

  return {
    settings,
    updateSettings,
    resetSettings,
    defaults,
  } as const;
}
