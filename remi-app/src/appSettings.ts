/**
 * @file 搴旂敤璁剧疆绠＄悊
 * @description 绠＄悊搴旂敤鐨勬湰鍦拌缃笌鏈嶅姟鍣ㄨ缃紝鍖呮嫭 Schema 瀹氫箟銆佸綊涓€鍖栥€? * 鏈嶅姟鍣ㄥ悓姝ャ€佽嚜瀹氫箟妯″瀷绠＄悊銆佹彁渚涜€呴厤缃瓑銆? * 璁剧疆鍒嗕负涓ょ被锛? * - 鏈湴璁剧疆锛氫粎瀛樺偍鍦?localStorage 涓紙濡備晶杈规爮浣嶇疆銆佸瓧浣撳ぇ灏忕瓑 UI 鍋忓ソ锛? * - 鏈嶅姟鍣ㄨ缃細鍚屾鍒版湇鍔″櫒绔紙濡備簩杩涘埗璺緞銆佽嚜瀹氫箟妯″瀷鍒楄〃绛夛級
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Schema } from "effect";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  DEFAULT_GIT_TEXT_GENERATION_MODEL,
  DEFAULT_SERVER_SETTINGS,
  type ProviderKind,
  type ProviderStartOptions,
  type ServerSettings,
  type ServerSettingsPatch,
} from "~/contracts";
import {
  getDefaultModel,
  getModelOptions,
  normalizeModelSlug,
  resolveSelectableModel,
} from "~/shared/model";
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

/** 鏈湴璁剧疆鐨?localStorage key */
const APP_SETTINGS_STORAGE_KEY = "remicode:app-settings:v1";
/** 鏈嶅姟鍣ㄨ缃縼绉诲畬鎴愮殑 localStorage 鏍囪 key */
const SERVER_SETTINGS_MIGRATION_STORAGE_KEY = "remicode:server-settings-migrated:v1";
/** 姣忎釜鎻愪緵鑰呭厑璁哥殑鏈€澶ц嚜瀹氫箟妯″瀷鏁伴噺 */
const MAX_CUSTOM_MODEL_COUNT = 32;
/** 鑷畾涔夋ā鍨?slug 鐨勬渶澶ч暱搴?*/
export const MAX_CUSTOM_MODEL_LENGTH = 256;
/** 鑱婂ぉ瀛椾綋鏈€灏忓儚绱犲€?*/
export const MIN_CHAT_FONT_SIZE_PX = 11;
/** 鑱婂ぉ瀛椾綋鏈€澶у儚绱犲€?*/
export const MAX_CHAT_FONT_SIZE_PX = 18;
/** 鑱婂ぉ瀛椾綋榛樿鍍忕礌鍊?*/
export const DEFAULT_CHAT_FONT_SIZE_PX = 12;

/** 鏃堕棿鎴虫牸寮?Schema锛歭ocale锛堟湰鍦板寲锛夈€?2-hour锛?2灏忔椂鍒讹級銆?4-hour锛?4灏忔椂鍒讹級 */
export const TimestampFormat = Schema.Literal("locale", "12-hour", "24-hour");
/** 鏃堕棿鎴虫牸寮忕被鍨?*/
export type TimestampFormat = typeof TimestampFormat.Type;
/** 榛樿鏃堕棿鎴虫牸寮?*/
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";
/** 渚ц竟鏍忎綅缃?Schema锛歭eft锛堝乏渚э級銆乺ight锛堝彸渚э級 */
export const SidebarSide = Schema.Literal("left", "right");
/** 渚ц竟鏍忎綅缃被鍨?*/
export type SidebarSide = typeof SidebarSide.Type;
/** 榛樿渚ц竟鏍忎綅缃?*/
export const DEFAULT_SIDEBAR_SIDE: SidebarSide = "left";
/** 渚ц竟鏍忛」鐩帓搴?Schema锛歶pdated_at锛堟寜鏇存柊鏃堕棿锛夈€乧reated_at锛堟寜鍒涘缓鏃堕棿锛夈€乵anual锛堟墜鍔ㄦ帓搴忥級 */
export const SidebarProjectSortOrder = Schema.Literal("updated_at", "created_at", "manual");
/** 渚ц竟鏍忛」鐩帓搴忕被鍨?*/
export type SidebarProjectSortOrder = typeof SidebarProjectSortOrder.Type;
/** 榛樿渚ц竟鏍忛」鐩帓搴忔柟寮?*/
export const DEFAULT_SIDEBAR_PROJECT_SORT_ORDER: SidebarProjectSortOrder = "manual";
/** 渚ц竟鏍忕嚎绋嬫帓搴?Schema锛歶pdated_at锛堟寜鏇存柊鏃堕棿锛夈€乧reated_at锛堟寜鍒涘缓鏃堕棿锛?*/
export const SidebarThreadSortOrder = Schema.Literal("updated_at", "created_at");
/** 渚ц竟鏍忕嚎绋嬫帓搴忕被鍨?*/
export type SidebarThreadSortOrder = typeof SidebarThreadSortOrder.Type;
/** 榛樿渚ц竟鏍忕嚎绋嬫帓搴忔柟寮?*/
export const DEFAULT_SIDEBAR_THREAD_SORT_ORDER: SidebarThreadSortOrder = "updated_at";
/** 璇█璁剧疆 Schema */
export const LanguageSchema = Schema.Literal("en", "zh");
/** 璇█璁剧疆绫诲瀷 */
export type LanguageSetting = typeof LanguageSchema.Type;
/** 榛樿璇█璁剧疆 */
export const DEFAULT_LANGUAGE_SETTING: LanguageSetting = DEFAULT_LANGUAGE;

/**
 * 鑾峰彇榛樿鐨勫師鐢熷瓧浣撳钩婊戣缃? *
 * @description macOS/iOS 榛樿鍚敤瀛椾綋骞虫粦锛屽叾浠栧钩鍙伴粯璁ゅ叧闂€? *
 * @param platform - 骞冲彴鏍囪瘑瀛楃涓诧紝榛樿鍙?navigator.platform
 * @returns 鏄惁鍚敤鍘熺敓瀛椾綋骞虫粦
 */
export function getDefaultNativeFontSmoothing(platform = globalThis.navigator?.platform ?? "") {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** 鑷畾涔夋ā鍨嬭缃瓧娈靛悕鑱斿悎绫诲瀷 */
type CustomModelSettingsKey =
  | "customCodexModels"
  | "customClaudeModels"
  | "customCursorModels"
  | "customGeminiModels"
  | "customGrokModels"
  | "customKiloModels"
  | "customOpenCodeModels"
  | "customPiModels";

/** 鎻愪緵鑰呰嚜瀹氫箟妯″瀷閰嶇疆 */
export type ProviderCustomModelConfig = {
  /** 鎻愪緵鑰呯被鍨?*/
  provider: ProviderKind;
  /** 瀵瑰簲鐨勮缃瓧娈靛悕 */
  settingsKey: CustomModelSettingsKey;
  /** 瀵瑰簲鐨勯粯璁よ缃瓧娈靛悕 */
  defaultSettingsKey: CustomModelSettingsKey;
  /** 閰嶇疆鏍囬 */
  title: string;
  /** 閰嶇疆鎻忚堪 */
  description: string;
  /** 杈撳叆妗嗗崰浣嶆枃鏈?*/
  placeholder: string;
  /** 杈撳叆绀轰緥 */
  example: string;
};

/** 鍚勬彁渚涜€呯殑鍐呯疆妯″瀷 slug 闆嗗悎锛岀敤浜庡幓閲嶈嚜瀹氫箟妯″瀷 */
const BUILT_IN_MODEL_SLUGS_BY_PROVIDER: Record<ProviderKind, ReadonlySet<string>> = {
  codex: new Set(getModelOptions("codex").map((option) => option.slug)),
  claudeAgent: new Set(getModelOptions("claudeAgent").map((option) => option.slug)),
  cursor: new Set(getModelOptions("cursor").map((option) => option.slug)),
  gemini: new Set(getModelOptions("gemini").map((option) => option.slug)),
  grok: new Set(getModelOptions("grok").map((option) => option.slug)),
  kilo: new Set(getModelOptions("kilo").map((option) => option.slug)),
  opencode: new Set(getModelOptions("opencode").map((option) => option.slug)),
  pi: new Set(getModelOptions("pi").map((option) => option.slug)),
};

/** Provider 绫诲瀷 Schema */
const ProviderKindSchema = Schema.Literal(
  "codex",
  "claudeAgent",
  "cursor",
  "gemini",
  "grok",
  "kilo",
  "opencode",
  "pi",
);

const withDefaults =
  <A>(fallback: () => A) =>
  <S extends Schema.Schema.Any>(schema: S) =>
    Schema.optional(schema).pipe(
      Schema.withDecodingDefault(() => fallback() as never),
      Schema.withConstructorDefault(() => fallback() as never),
    );

/** 搴旂敤璁剧疆 Schema锛屼娇鐢?Effect Schema 瀹氫箟鎵€鏈夊瓧娈靛強榛樿鍊?*/
export const AppSettingsSchema = Schema.Struct({
  claudeBinaryPath: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  chatFontSizePx: Schema.Number.pipe(withDefaults(() => DEFAULT_CHAT_FONT_SIZE_PX)),
  chatCodeFontFamily: Schema.String.pipe(Schema.maxLength(256)).pipe(withDefaults(() => "")),
  codexBinaryPath: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  codexHomePath: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  cursorBinaryPath: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  cursorApiEndpoint: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  geminiBinaryPath: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  grokBinaryPath: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  kiloBinaryPath: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  kiloServerUrl: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  kiloServerPassword: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  openCodeBinaryPath: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  piBinaryPath: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  piAgentDir: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  openCodeServerUrl: Schema.String.pipe(Schema.maxLength(4096)).pipe(withDefaults(() => "")),
  openCodeServerPassword: Schema.String.pipe(Schema.maxLength(4096)).pipe(
    withDefaults(() => ""),
  ),
  defaultThreadEnvMode: EnvMode.pipe(withDefaults(() => "local" as const satisfies EnvMode)),
  confirmThreadDelete: Schema.Boolean.pipe(withDefaults(() => true)),
  confirmThreadArchive: Schema.Boolean.pipe(withDefaults(() => false)),
  confirmTerminalTabClose: Schema.Boolean.pipe(withDefaults(() => true)),
  diffWordWrap: Schema.Boolean.pipe(withDefaults(() => false)),
  enableAssistantStreaming: Schema.Boolean.pipe(withDefaults(() => false)),
  enableNativeFontSmoothing: Schema.Boolean.pipe(withDefaults(getDefaultNativeFontSmoothing)),
  enableTaskCompletionToasts: Schema.Boolean.pipe(withDefaults(() => true)),
  enableSystemTaskCompletionNotifications: Schema.Boolean.pipe(withDefaults(() => true)),
  sidebarSide: SidebarSide.pipe(withDefaults(() => DEFAULT_SIDEBAR_SIDE)),
  sidebarProjectSortOrder: SidebarProjectSortOrder.pipe(
    withDefaults(() => DEFAULT_SIDEBAR_PROJECT_SORT_ORDER),
  ),
  sidebarThreadSortOrder: SidebarThreadSortOrder.pipe(
    withDefaults(() => DEFAULT_SIDEBAR_THREAD_SORT_ORDER),
  ),
  timestampFormat: TimestampFormat.pipe(withDefaults(() => DEFAULT_TIMESTAMP_FORMAT)),
  customCodexModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customClaudeModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customCursorModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customGeminiModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customGrokModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customKiloModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customOpenCodeModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customPiModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  textGenerationProvider: ProviderKindSchema.pipe(withDefaults(() => "codex" as const)),
  textGenerationModel: Schema.optional(Schema.String),
  uiFontFamily: Schema.String.pipe(Schema.maxLength(256)).pipe(withDefaults(() => "")),
  defaultProvider: ProviderKindSchema.pipe(withDefaults(() => "codex" as const)),
  language: LanguageSchema.pipe(withDefaults(() => DEFAULT_LANGUAGE_SETTING)),
  // Local-only UI preference: providers explicitly hidden from the composer picker.
  // The active/locked provider for a thread is always shown regardless, so users
  // never get stuck on a thread whose provider they later chose to hide.
  hiddenProviders: Schema.Array(ProviderKindSchema).pipe(withDefaults(() => [])),
  // Local-only UI preference: top-level provider order in Settings and the composer picker.
  providerOrder: Schema.Array(ProviderKindSchema).pipe(withDefaults(() => [...DEFAULT_PROVIDER_ORDER])),
  // Deprecated local-only preference kept for backward-compatible decoding.
  // Model-level hiding caused too many edge cases, so the app now normalizes it away.
  hiddenModels: Schema.Array(
    Schema.Struct({
      provider: ProviderKindSchema,
      slug: Schema.String,
    }),
  ).pipe(withDefaults(() => [])),
});
/** 搴旂敤璁剧疆绫诲瀷锛屼粠 Schema 鑷姩鎺ㄥ */
export type AppSettings = typeof AppSettingsSchema.Type;
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableServerSettingsPatch = Mutable<ServerSettingsPatch>;
type MutableServerSettingsProvidersPatch = Mutable<NonNullable<ServerSettingsPatch["providers"]>>;

/** 搴旂敤妯″瀷閫夐」锛屾墿灞?ProviderModelOption 澧炲姞鎻愪緵鑰呭拰鑷畾涔夋爣璇?*/
export interface AppModelOption extends ProviderModelOption {
  /** 鎻愪緵鑰呯被鍨?*/
  provider: ProviderKind;
  /** 鏄惁涓虹敤鎴疯嚜瀹氫箟妯″瀷 */
  isCustom: boolean;
}

const DEFAULT_APP_SETTINGS = AppSettingsSchema.make({});
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
};

/** 鎵€鏈夋彁渚涜€呯殑鑷畾涔夋ā鍨嬮厤缃垪琛?*/
export const MODEL_PROVIDER_SETTINGS = Object.values(PROVIDER_CUSTOM_MODEL_CONFIG);

/**
 * 褰掍竴鍖栬嚜瀹氫箟妯″瀷 slug 鍒楄〃
 *
 * @description 瀵硅緭鍏ョ殑妯″瀷 slug 鍒楄〃杩涜鍘婚噸銆侀暱搴﹂檺鍒躲€佸唴缃ā鍨嬭繃婊ょ瓑褰掍竴鍖栧鐞嗐€? *
 * @param models - 寰呭綊涓€鍖栫殑妯″瀷 slug 鍙凯浠ｅ璞? * @param provider - 鎻愪緵鑰呯被鍨嬶紝榛樿涓?"codex"
 * @returns 褰掍竴鍖栧悗鐨勬ā鍨?slug 鏁扮粍
 */
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

/**
 * 褰掍竴鍖栬亰澶╁瓧浣撳ぇ灏? *
 * @description 灏嗗瓧浣撳ぇ灏忛檺鍒跺湪 [MIN_CHAT_FONT_SIZE_PX, MAX_CHAT_FONT_SIZE_PX] 鑼冨洿鍐咃紝
 * 鏃犳晥鍊煎洖閫€涓洪粯璁ゅ€笺€? *
 * @param value - 杈撳叆鐨勫瓧浣撳ぇ灏忓€? * @returns 褰掍竴鍖栧悗鐨勫瓧浣撳ぇ灏? */
export function normalizeChatFontSizePx(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CHAT_FONT_SIZE_PX;
  }

  return Math.min(MAX_CHAT_FONT_SIZE_PX, Math.max(MIN_CHAT_FONT_SIZE_PX, Math.round(value)));
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
    hiddenProviders: normalizeHiddenProviders(settings.hiddenProviders),
    providerOrder: normalizeProviderOrder(settings.providerOrder),
    language: normalizeLanguage(settings.language),
    hiddenModels: [],
  };
}

function serverSettingsToAppSettings(settings: ServerSettings): Partial<AppSettings> {
  return {
    claudeBinaryPath: settings.providers.claudeAgent.binaryPath,
    codexBinaryPath: settings.providers.codex.binaryPath,
    codexHomePath: settings.providers.codex.homePath,
    cursorApiEndpoint: settings.providers.cursor.apiEndpoint,
    cursorBinaryPath: settings.providers.cursor.binaryPath,
    defaultThreadEnvMode: settings.defaultThreadEnvMode,
    enableAssistantStreaming: settings.enableAssistantStreaming,
    geminiBinaryPath: settings.providers.gemini.binaryPath,
    grokBinaryPath: settings.providers.grok.binaryPath,
    kiloBinaryPath: settings.providers.kilo.binaryPath,
    kiloServerPassword: settings.providers.kilo.serverPassword,
    kiloServerUrl: settings.providers.kilo.serverUrl,
    openCodeBinaryPath: settings.providers.opencode.binaryPath,
    openCodeServerPassword: settings.providers.opencode.serverPassword,
    openCodeServerUrl: settings.providers.opencode.serverUrl,
    piAgentDir: settings.providers.pi.agentDir,
    piBinaryPath: settings.providers.pi.binaryPath,
    customCodexModels: settings.providers.codex.customModels,
    customClaudeModels: settings.providers.claudeAgent.customModels,
    customCursorModels: settings.providers.cursor.customModels,
    customGeminiModels: settings.providers.gemini.customModels,
    customGrokModels: settings.providers.grok.customModels,
    customKiloModels: settings.providers.kilo.customModels,
    customOpenCodeModels: settings.providers.opencode.customModels,
    customPiModels: settings.providers.pi.customModels,
    textGenerationProvider: settings.textGenerationModelSelection.provider,
    textGenerationModel: settings.textGenerationModelSelection.model,
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

/**
 * 褰掍竴鍖栧瓨鍌ㄧ殑搴旂敤璁剧疆
 *
 * @description 瀵逛粠 localStorage 璇诲彇鐨勮缃繘琛屽綊涓€鍖栧鐞嗭紝
 * 纭繚鑷畾涔夋ā鍨嬨€佸瓧浣撳ぇ灏忋€佹彁渚涜€呴『搴忕瓑瀛楁绗﹀悎绾︽潫銆? *
 * @param settings - 寰呭綊涓€鍖栫殑搴旂敤璁剧疆
 * @returns 褰掍竴鍖栧悗鐨勫簲鐢ㄨ缃? */
export function normalizeStoredAppSettings(settings: AppSettings): AppSettings {
  return normalizeAppSettings(settings);
}

/**
 * 鑾峰彇鎸囧畾鎻愪緵鑰呯殑鑷畾涔夋ā鍨嬪垪琛? *
 * @param settings - 搴旂敤璁剧疆锛堜粎闇€鑷畾涔夋ā鍨嬬浉鍏冲瓧娈碉級
 * @param provider - 鎻愪緵鑰呯被鍨? * @returns 鑷畾涔夋ā鍨?slug 鍒楄〃
 */
export function getCustomModelsForProvider(
  settings: Pick<AppSettings, CustomModelSettingsKey>,
  provider: ProviderKind,
): readonly string[] {
  return settings[PROVIDER_CUSTOM_MODEL_CONFIG[provider].settingsKey];
}

/**
 * 鑾峰彇鎸囧畾鎻愪緵鑰呯殑榛樿鑷畾涔夋ā鍨嬪垪琛? *
 * @param defaults - 榛樿璁剧疆锛堜粎闇€鑷畾涔夋ā鍨嬬浉鍏冲瓧娈碉級
 * @param provider - 鎻愪緵鑰呯被鍨? * @returns 榛樿鑷畾涔夋ā鍨?slug 鍒楄〃
 */
export function getDefaultCustomModelsForProvider(
  defaults: Pick<AppSettings, CustomModelSettingsKey>,
  provider: ProviderKind,
): readonly string[] {
  return defaults[PROVIDER_CUSTOM_MODEL_CONFIG[provider].defaultSettingsKey];
}

/**
 * 鏋勯€犳寚瀹氭彁渚涜€呯殑鑷畾涔夋ā鍨嬭ˉ涓? *
 * @param provider - 鎻愪緵鑰呯被鍨? * @param models - 鏂扮殑鑷畾涔夋ā鍨嬪垪琛? * @returns 浠呭寘鍚鎻愪緵鑰呰嚜瀹氫箟妯″瀷瀛楁鐨勮缃ˉ涓? */
export function patchCustomModels(
  provider: ProviderKind,
  models: string[],
): Partial<Pick<AppSettings, CustomModelSettingsKey>> {
  return {
    [PROVIDER_CUSTOM_MODEL_CONFIG[provider].settingsKey]: models,
  };
}

/**
 * 鑾峰彇鎵€鏈夋彁渚涜€呯殑鑷畾涔夋ā鍨嬫槧灏? *
 * @param settings - 搴旂敤璁剧疆锛堜粎闇€鑷畾涔夋ā鍨嬬浉鍏冲瓧娈碉級
 * @returns 鎸夋彁渚涜€呯被鍨嬬储寮曠殑鑷畾涔夋ā鍨嬪垪琛ㄦ槧灏? */
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
  };
}

/**
 * 鑾峰彇搴旂敤妯″瀷閫夐」鍒楄〃
 *
 * @description 鍚堝苟鍐呯疆妯″瀷鍜岃嚜瀹氫箟妯″瀷锛屽幓閲嶅悗杩斿洖瀹屾暣鐨勬ā鍨嬮€夐」鍒楄〃銆? * 鑻ュ綋鍓嶉€変腑鐨勬ā鍨嬩笉鍦ㄥ垪琛ㄤ腑锛屼細鑷姩杩藉姞銆? *
 * @param provider - 鎻愪緵鑰呯被鍨? * @param customModels - 鑷畾涔夋ā鍨?slug 鍒楄〃
 * @param selectedModel - 褰撳墠閫変腑鐨勬ā鍨?slug锛屽彲閫? * @returns 妯″瀷閫夐」鍒楄〃
 */
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

/**
 * 鑾峰彇 Git 鏂囨湰鐢熸垚妯″瀷閫夐」鍒楄〃
 *
 * @description 鍚堝苟 Codex銆並ilo銆丱penCode 涓変釜鎻愪緵鑰呯殑妯″瀷閫夐」锛? * 鍘婚噸鍚庤繑鍥炲畬鏁寸殑鏂囨湰鐢熸垚妯″瀷鍒楄〃銆? *
 * @param settings - 搴旂敤璁剧疆锛堜粎闇€鐩稿叧瀛楁锛? * @returns 鍘婚噸鍚庣殑鏂囨湰鐢熸垚妯″瀷閫夐」鍒楄〃
 */
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

/**
 * 瑙ｆ瀽搴旂敤妯″瀷閫夋嫨
 *
 * @description 鏍规嵁鎻愪緵鑰呫€佽嚜瀹氫箟妯″瀷鍒楄〃鍜屽綋鍓嶉€変腑妯″瀷锛? * 瑙ｆ瀽鍑烘渶缁堝彲鐢ㄧ殑妯″瀷 slug銆? *
 * @param provider - 鎻愪緵鑰呯被鍨? * @param customModels - 鍚勬彁渚涜€呯殑鑷畾涔夋ā鍨嬫槧灏? * @param selectedModel - 褰撳墠閫変腑鐨勬ā鍨?slug
 * @returns 瑙ｆ瀽鍚庣殑妯″瀷 slug 瀛楃涓? */
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

/**
 * 鑾峰彇鎵€鏈夋彁渚涜€呯殑鑷畾涔夋ā鍨嬮€夐」鏄犲皠
 *
 * @param settings - 搴旂敤璁剧疆锛堜粎闇€鑷畾涔夋ā鍨嬬浉鍏冲瓧娈碉級
 * @returns 鎸夋彁渚涜€呯被鍨嬬储寮曠殑妯″瀷閫夐」鍒楄〃鏄犲皠
 */
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
  };
}

/**
 * 鑾峰彇鎻愪緵鑰呭惎鍔ㄩ€夐」
 *
 * @description 浠庡簲鐢ㄨ缃腑鎻愬彇鍚勬彁渚涜€呯殑浜岃繘鍒惰矾寰勩€佹湇鍔″櫒 URL 绛夐厤缃紝
 * 鏋勯€?ProviderStartOptions 瀵硅薄鐢ㄤ簬鍚姩鎻愪緵鑰呰繘绋嬨€? *
 * @param settings - 搴旂敤璁剧疆锛堜粎闇€浜岃繘鍒惰矾寰勭浉鍏冲瓧娈碉級
 * @returns 鎻愪緵鑰呭惎鍔ㄩ€夐」锛屾棤閰嶇疆鏃惰繑鍥?undefined
 */
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
  };

  return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
}

/**
 * 鑾峰彇鎸囧畾鎻愪緵鑰呯殑鑷畾涔変簩杩涘埗璺緞
 *
 * @param settings - 搴旂敤璁剧疆锛堜粎闇€浜岃繘鍒惰矾寰勭浉鍏冲瓧娈碉級
 * @param provider - 鎻愪緵鑰呯被鍨? * @returns 鑷畾涔変簩杩涘埗璺緞瀛楃涓? */
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
  }
}

/**
 * React Hook锛氳幏鍙栧拰鏇存柊搴旂敤璁剧疆
 *
 * @description 鍚堝苟鏈湴 localStorage 璁剧疆鍜屾湇鍔″櫒璁剧疆锛? * 鎻愪緵鏇存柊鍜岄噸缃柟娉曘€傞娆″姞杞芥椂鑷姩灏嗘湰鍦拌缃縼绉诲埌鏈嶅姟鍣ㄣ€? *
 * @returns 璁剧疆瀵硅薄鍙婃搷浣滄柟娉? * @returns settings - 鍚堝苟鍚庣殑搴旂敤璁剧疆
 * @returns updateSettings - 鏇存柊璁剧疆鐨勫嚱鏁帮紙鍚屾椂鏇存柊鏈湴鍜屾湇鍔″櫒锛? * @returns resetSettings - 閲嶇疆涓洪粯璁よ缃殑鍑芥暟
 * @returns defaults - 鍚堝苟浜嗘湇鍔″櫒榛樿鍊肩殑榛樿璁剧疆
 */
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

    setSettings((previous) => normalizeStoredAppSettings(previous));
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
      setSettings((prev) => normalizeAppSettings({ ...prev, ...patch }));

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
