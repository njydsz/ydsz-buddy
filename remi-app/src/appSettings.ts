/**
 * @file 鎼存梻鏁ょ拋鍓х枂缁狅紕鎮? * @description 缁狅紕鎮婃惔鏃傛暏閻ㄥ嫭婀伴崷鎷岊啎缂冾喕绗岄張宥呭閸ｃ劏顔曠純顕嗙礉閸栧懏瀚?Schema 鐎规矮绠熼妴浣哥秺娑撯偓閸栨牓鈧? * 閺堝秴濮熼崳銊ユ倱濮濄儯鈧浇鍤滅€规矮绠熷Ο鈥崇€风粻锛勬倞閵嗕焦褰佹笟娑溾偓鍛村帳缂冾喚鐡戦妴? * 鐠佸墽鐤嗛崚鍡曡礋娑撱倗琚敍? * - 閺堫剙婀寸拋鍓х枂閿涙矮绮庣€涙ê鍋嶉崷?localStorage 娑擃叏绱欐俊鍌欐櫠鏉堣鐖担宥囩枂閵嗕礁鐡ф担鎾炽亣鐏忓繒鐡?UI 閸嬪繐銈介敍? * - 閺堝秴濮熼崳銊啎缂冾噯绱伴崥灞绢劄閸掔増婀囬崝鈥虫珤缁旑垽绱欐俊鍌欑癌鏉╂稑鍩楃捄顖氱窞閵嗕浇鍤滅€规矮绠熷Ο鈥崇€烽崚妤勩€冪粵澶涚礆
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

/** 閺堫剙婀寸拋鍓х枂閻?localStorage key */
const APP_SETTINGS_STORAGE_KEY = "remicode:app-settings:v1";
/** 閺堝秴濮熼崳銊啎缂冾喛绺肩粔璇茬暚閹存劗娈?localStorage 閺嶅洩顔?key */
const SERVER_SETTINGS_MIGRATION_STORAGE_KEY = "remicode:server-settings-migrated:v1";
/** 濮ｅ繋閲滈幓鎰返閼板懎鍘戠拋鍝ユ畱閺堚偓婢堆嗗殰鐎规矮绠熷Ο鈥崇€烽弫浼村櫤 */
const MAX_CUSTOM_MODEL_COUNT = 32;
/** 閼奉亜鐣炬稊澶嬆侀崹?slug 閻ㄥ嫭娓舵径褔鏆辨惔?*/
export const MAX_CUSTOM_MODEL_LENGTH = 256;
/** 閼卞﹤銇夌€涙ぞ缍嬮張鈧亸蹇撳剼缁辩姴鈧?*/
export const MIN_CHAT_FONT_SIZE_PX = 11;
/** 閼卞﹤銇夌€涙ぞ缍嬮張鈧径褍鍎氱槐鐘测偓?*/
export const MAX_CHAT_FONT_SIZE_PX = 18;
/** 閼卞﹤銇夌€涙ぞ缍嬫妯款吇閸嶅繒绀岄崐?*/
export const DEFAULT_CHAT_FONT_SIZE_PX = 12;

/** 閺冨爼妫块幋铏壐瀵?Schema閿涙ocale閿涘牊婀伴崷鏉垮閿涘鈧?2-hour閿?2鐏忓繑妞傞崚璁圭礆閵?4-hour閿?4鐏忓繑妞傞崚璁圭礆 */
export const TimestampFormat = Schema.Literal("locale", "12-hour", "24-hour");
/** 閺冨爼妫块幋铏壐瀵繒琚崹?*/
export type TimestampFormat = typeof TimestampFormat.Type;
/** 姒涙顓婚弮鍫曟？閹磋櫕鐗稿?*/
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";
/** 娓氀嗙珶閺嶅繋缍呯純?Schema閿涙eft閿涘牆涔忔笟褝绱氶妴涔篿ght閿涘牆褰告笟褝绱?*/
export const SidebarSide = Schema.Literal("left", "right");
/** 娓氀嗙珶閺嶅繋缍呯純顔捐閸?*/
export type SidebarSide = typeof SidebarSide.Type;
/** 姒涙顓绘笟褑绔熼弽蹇庣秴缂?*/
export const DEFAULT_SIDEBAR_SIDE: SidebarSide = "left";
/** 娓氀嗙珶閺嶅繘銆嶉惄顔藉笓鎼?Schema閿涙pdated_at閿涘牊瀵滈弴瀛樻煀閺冨爼妫块敍澶堚偓涔eated_at閿涘牊瀵滈崚娑樼紦閺冨爼妫块敍澶堚偓涔礱nual閿涘牊澧滈崝銊﹀笓鎼村骏绱?*/
export const SidebarProjectSortOrder = Schema.Literal("updated_at", "created_at", "manual");
/** 娓氀嗙珶閺嶅繘銆嶉惄顔藉笓鎼村繒琚崹?*/
export type SidebarProjectSortOrder = typeof SidebarProjectSortOrder.Type;
/** 姒涙顓绘笟褑绔熼弽蹇涖€嶉惄顔藉笓鎼村繑鏌熷?*/
export const DEFAULT_SIDEBAR_PROJECT_SORT_ORDER: SidebarProjectSortOrder = "manual";
/** 娓氀嗙珶閺嶅繒鍤庣粙瀣笓鎼?Schema閿涙pdated_at閿涘牊瀵滈弴瀛樻煀閺冨爼妫块敍澶堚偓涔eated_at閿涘牊瀵滈崚娑樼紦閺冨爼妫块敍?*/
export const SidebarThreadSortOrder = Schema.Literal("updated_at", "created_at");
/** 娓氀嗙珶閺嶅繒鍤庣粙瀣笓鎼村繒琚崹?*/
export type SidebarThreadSortOrder = typeof SidebarThreadSortOrder.Type;
/** 姒涙顓绘笟褑绔熼弽蹇曞殠缁嬪甯撴惔蹇旀煙瀵?*/
export const DEFAULT_SIDEBAR_THREAD_SORT_ORDER: SidebarThreadSortOrder = "updated_at";
/** 鐠囶叀鈻堢拋鍓х枂 Schema */
export const LanguageSchema = Schema.Literal("en", "zh");
/** 鐠囶叀鈻堢拋鍓х枂缁鐎?*/
export type LanguageSetting = typeof LanguageSchema.Type;
/** 姒涙顓荤拠顓♀枅鐠佸墽鐤?*/
export const DEFAULT_LANGUAGE_SETTING: LanguageSetting = DEFAULT_LANGUAGE;

/**
 * 閼惧嘲褰囨妯款吇閻ㄥ嫬甯悽鐔风摟娴ｆ挸閽╁鎴ｎ啎缂? *
 * @description macOS/iOS 姒涙顓婚崥顖滄暏鐎涙ぞ缍嬮獮铏拨閿涘苯鍙炬禒鏍ч挬閸欎即绮拋銈呭彠闂傤厹鈧? *
 * @param platform - 楠炲啿褰撮弽鍥槕鐎涙顑佹稉璇х礉姒涙顓婚崣?navigator.platform
 * @returns 閺勵垰鎯侀崥顖滄暏閸樼喓鏁撶€涙ぞ缍嬮獮铏拨
 */
export function getDefaultNativeFontSmoothing(platform = globalThis.navigator?.platform ?? "") {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** 閼奉亜鐣炬稊澶嬆侀崹瀣啎缂冾喖鐡у▓闈涙倳閼辨柨鎮庣猾璇茬€?*/
type CustomModelSettingsKey =
  | "customCodexModels"
  | "customClaudeModels"
  | "customCursorModels"
  | "customGeminiModels"
  | "customGrokModels"
  | "customKiloModels"
  | "customOpenCodeModels"
  | "customPiModels";

/** 閹绘劒绶甸懓鍛板殰鐎规矮绠熷Ο鈥崇€烽柊宥囩枂 */
export type ProviderCustomModelConfig = {
  /** 閹绘劒绶甸懓鍛閸?*/
  provider: ProviderKind;
  /** 鐎电懓绨查惃鍕啎缂冾喖鐡у▓闈涙倳 */
  settingsKey: CustomModelSettingsKey;
  /** 鐎电懓绨查惃鍕帛鐠併倛顔曠純顔肩摟濞堥潧鎮?*/
  defaultSettingsKey: CustomModelSettingsKey;
  /** 闁板秶鐤嗛弽鍥暯 */
  title: string;
  /** 闁板秶鐤嗛幓蹇氬牚 */
  description: string;
  /** 鏉堟挸鍙嗗鍡楀窗娴ｅ秵鏋冮張?*/
  placeholder: string;
  /** 鏉堟挸鍙嗙粈杞扮伐 */
  example: string;
};

/** 閸氬嫭褰佹笟娑溾偓鍛畱閸愬懐鐤嗗Ο鈥崇€?slug 闂嗗棗鎮庨敍宀€鏁ゆ禍搴″箵闁插秷鍤滅€规矮绠熷Ο鈥崇€?*/
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

/** Provider 缁鐎?Schema */
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

/** 鎼存梻鏁ょ拋鍓х枂 Schema閿涘奔濞囬悽?Effect Schema 鐎规矮绠熼幍鈧張澶婄摟濞堥潧寮锋妯款吇閸?*/
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
/** 鎼存梻鏁ょ拋鍓х枂缁鐎烽敍灞肩矤 Schema 閼奉亜濮╅幒銊ヮ嚤 */
export type AppSettings = typeof AppSettingsSchema.Type;
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableServerSettingsPatch = Mutable<ServerSettingsPatch>;
type MutableServerSettingsProvidersPatch = Mutable<NonNullable<ServerSettingsPatch["providers"]>>;

/** 鎼存梻鏁ゅΟ鈥崇€烽柅澶愩€嶉敍灞惧⒖鐏?ProviderModelOption 婢х偛濮為幓鎰返閼板懎鎷伴懛顏勭暰娑斿鐖ｇ拠?*/
export interface AppModelOption extends ProviderModelOption {
  /** 閹绘劒绶甸懓鍛閸?*/
  provider: ProviderKind;
  /** 閺勵垰鎯佹稉铏规暏閹寸柉鍤滅€规矮绠熷Ο鈥崇€?*/
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

/** 閹碘偓閺堝褰佹笟娑溾偓鍛畱閼奉亜鐣炬稊澶嬆侀崹瀣帳缂冾喖鍨悰?*/
export const MODEL_PROVIDER_SETTINGS = Object.values(PROVIDER_CUSTOM_MODEL_CONFIG);

/**
 * 瑜版帊绔撮崠鏍殰鐎规矮绠熷Ο鈥崇€?slug 閸掓銆? *
 * @description 鐎电绶崗銉ф畱濡€崇€?slug 閸掓銆冩潻娑滎攽閸樺鍣搁妴渚€鏆辨惔锕傛閸掕翰鈧礁鍞寸純顔侥侀崹瀣箖濠娿倗鐡戣ぐ鎺嶇閸栨牕顦╅悶鍡愨偓? *
 * @param models - 瀵板懎缍婃稉鈧崠鏍畱濡€崇€?slug 閸欘垵鍑禒锝咁嚠鐠? * @param provider - 閹绘劒绶甸懓鍛閸ㄥ绱濇妯款吇娑?"codex"
 * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫭膩閸?slug 閺佹壆绮? */
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
 * 瑜版帊绔撮崠鏍喊婢垛晛鐡ф担鎾炽亣鐏? *
 * @description 鐏忓棗鐡ф担鎾炽亣鐏忓繘妾洪崚璺烘躬 [MIN_CHAT_FONT_SIZE_PX, MAX_CHAT_FONT_SIZE_PX] 閼煎啫娲块崘鍜冪礉
 * 閺冪姵鏅ラ崐鐓庢礀闁偓娑撴椽绮拋銈呪偓绗衡偓? *
 * @param value - 鏉堟挸鍙嗛惃鍕摟娴ｆ挸銇囩亸蹇撯偓? * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫬鐡ф担鎾炽亣鐏? */
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
        ? { customModels: [...(patch.customClaudeModels ?? [])] }
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
        ? { customModels: [...(patch.customCursorModels ?? [])] }
        : {}),
    };
  }
  if (hasOwn(patch, "geminiBinaryPath") || hasOwn(patch, "customGeminiModels")) {
    providers.gemini = {
      ...(hasOwn(patch, "geminiBinaryPath") ? { binaryPath: patch.geminiBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customGeminiModels")
        ? { customModels: [...(patch.customGeminiModels ?? [])] }
        : {}),
    };
  }
  if (hasOwn(patch, "grokBinaryPath") || hasOwn(patch, "customGrokModels")) {
    providers.grok = {
      ...(hasOwn(patch, "grokBinaryPath") ? { binaryPath: patch.grokBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customGrokModels") ? { customModels: [...(patch.customGrokModels ?? [])] } : {}),
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
      ...(hasOwn(patch, "customKiloModels") ? { customModels: [...(patch.customKiloModels ?? [])] } : {}),
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
        ? { customModels: [...(patch.customOpenCodeModels ?? [])] }
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
      ...(hasOwn(patch, "customPiModels") ? { customModels: [...(patch.customPiModels ?? [])] } : {}),
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
 * 瑜版帊绔撮崠鏍х摠閸屻劎娈戞惔鏃傛暏鐠佸墽鐤? *
 * @description 鐎甸€涚矤 localStorage 鐠囪褰囬惃鍕啎缂冾喛绻樼悰灞界秺娑撯偓閸栨牕顦╅悶鍡礉
 * 绾喕绻氶懛顏勭暰娑斿膩閸ㄥ鈧礁鐡ф担鎾炽亣鐏忓繈鈧焦褰佹笟娑溾偓鍛淬€庢惔蹇曠搼鐎涙顔岀粭锕€鎮庣痪锔芥将閵? *
 * @param settings - 瀵板懎缍婃稉鈧崠鏍畱鎼存梻鏁ょ拋鍓х枂
 * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫬绨查悽銊啎缂? */
export function normalizeStoredAppSettings(settings: AppSettings): AppSettings {
  return normalizeAppSettings(settings);
}

/**
 * 閼惧嘲褰囬幐鍥х暰閹绘劒绶甸懓鍛畱閼奉亜鐣炬稊澶嬆侀崹瀣灙鐞? *
 * @param settings - 鎼存梻鏁ょ拋鍓х枂閿涘牅绮庨棁鈧懛顏勭暰娑斿膩閸ㄥ娴夐崗鍐茬摟濞堢绱? * @param provider - 閹绘劒绶甸懓鍛閸? * @returns 閼奉亜鐣炬稊澶嬆侀崹?slug 閸掓銆? */
export function getCustomModelsForProvider(
  settings: Pick<AppSettings, CustomModelSettingsKey>,
  provider: ProviderKind,
): readonly string[] {
  return settings[PROVIDER_CUSTOM_MODEL_CONFIG[provider].settingsKey];
}

/**
 * 閼惧嘲褰囬幐鍥х暰閹绘劒绶甸懓鍛畱姒涙顓婚懛顏勭暰娑斿膩閸ㄥ鍨悰? *
 * @param defaults - 姒涙顓荤拋鍓х枂閿涘牅绮庨棁鈧懛顏勭暰娑斿膩閸ㄥ娴夐崗鍐茬摟濞堢绱? * @param provider - 閹绘劒绶甸懓鍛閸? * @returns 姒涙顓婚懛顏勭暰娑斿膩閸?slug 閸掓銆? */
export function getDefaultCustomModelsForProvider(
  defaults: Pick<AppSettings, CustomModelSettingsKey>,
  provider: ProviderKind,
): readonly string[] {
  return defaults[PROVIDER_CUSTOM_MODEL_CONFIG[provider].defaultSettingsKey];
}

/**
 * 閺嬪嫰鈧姵瀵氱€规碍褰佹笟娑溾偓鍛畱閼奉亜鐣炬稊澶嬆侀崹瀣夋稉? *
 * @param provider - 閹绘劒绶甸懓鍛閸? * @param models - 閺傛壆娈戦懛顏勭暰娑斿膩閸ㄥ鍨悰? * @returns 娴犲懎瀵橀崥顐ヮ嚉閹绘劒绶甸懓鍛板殰鐎规矮绠熷Ο鈥崇€风€涙顔岄惃鍕啎缂冾喛藟娑? */
export function patchCustomModels(
  provider: ProviderKind,
  models: string[],
): Partial<Pick<AppSettings, CustomModelSettingsKey>> {
  return {
    [PROVIDER_CUSTOM_MODEL_CONFIG[provider].settingsKey]: models,
  };
}

/**
 * 閼惧嘲褰囬幍鈧張澶嬪絹娓氭稖鈧懐娈戦懛顏勭暰娑斿膩閸ㄥ妲х亸? *
 * @param settings - 鎼存梻鏁ょ拋鍓х枂閿涘牅绮庨棁鈧懛顏勭暰娑斿膩閸ㄥ娴夐崗鍐茬摟濞堢绱? * @returns 閹稿褰佹笟娑溾偓鍛閸ㄥ鍌ㄥ鏇犳畱閼奉亜鐣炬稊澶嬆侀崹瀣灙鐞涖劍妲х亸? */
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
 * 閼惧嘲褰囨惔鏃傛暏濡€崇€烽柅澶愩€嶉崚妤勩€? *
 * @description 閸氬牆鑻熼崘鍛枂濡€崇€烽崪宀冨殰鐎规矮绠熷Ο鈥崇€烽敍灞藉箵闁插秴鎮楁潻鏂挎礀鐎瑰本鏆ｉ惃鍕侀崹瀣偓澶愩€嶉崚妤勩€冮妴? * 閼汇儱缍嬮崜宥夆偓澶夎厬閻ㄥ嫭膩閸ㄥ绗夐崷銊ュ灙鐞涖劋鑵戦敍灞肩窗閼奉亜濮╂潻钘夊閵? *
 * @param provider - 閹绘劒绶甸懓鍛閸? * @param customModels - 閼奉亜鐣炬稊澶嬆侀崹?slug 閸掓銆? * @param selectedModel - 瑜版挸澧犻柅澶夎厬閻ㄥ嫭膩閸?slug閿涘苯褰查柅? * @returns 濡€崇€烽柅澶愩€嶉崚妤勩€? */
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
 * 閼惧嘲褰?Git 閺傚洦婀伴悽鐔稿灇濡€崇€烽柅澶愩€嶉崚妤勩€? *
 * @description 閸氬牆鑻?Codex閵嗕甫ilo閵嗕副penCode 娑撳閲滈幓鎰返閼板懐娈戝Ο鈥崇€烽柅澶愩€嶉敍? * 閸樺鍣搁崥搴ょ箲閸ョ偛鐣弫瀵告畱閺傚洦婀伴悽鐔稿灇濡€崇€烽崚妤勩€冮妴? *
 * @param settings - 鎼存梻鏁ょ拋鍓х枂閿涘牅绮庨棁鈧惄绋垮彠鐎涙顔岄敍? * @returns 閸樺鍣搁崥搴ｆ畱閺傚洦婀伴悽鐔稿灇濡€崇€烽柅澶愩€嶉崚妤勩€? */
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
 * 鐟欙絾鐎芥惔鏃傛暏濡€崇€烽柅澶嬪
 *
 * @description 閺嶈宓侀幓鎰返閼板懌鈧浇鍤滅€规矮绠熷Ο鈥崇€烽崚妤勩€冮崪灞界秼閸撳秹鈧鑵戝Ο鈥崇€烽敍? * 鐟欙絾鐎介崙鐑樻付缂佸牆褰查悽銊ф畱濡€崇€?slug閵? *
 * @param provider - 閹绘劒绶甸懓鍛閸? * @param customModels - 閸氬嫭褰佹笟娑溾偓鍛畱閼奉亜鐣炬稊澶嬆侀崹瀣Ё鐏? * @param selectedModel - 瑜版挸澧犻柅澶夎厬閻ㄥ嫭膩閸?slug
 * @returns 鐟欙絾鐎介崥搴ｆ畱濡€崇€?slug 鐎涙顑佹稉? */
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
 * 閼惧嘲褰囬幍鈧張澶嬪絹娓氭稖鈧懐娈戦懛顏勭暰娑斿膩閸ㄥ鈧銆嶉弰鐘茬殸
 *
 * @param settings - 鎼存梻鏁ょ拋鍓х枂閿涘牅绮庨棁鈧懛顏勭暰娑斿膩閸ㄥ娴夐崗鍐茬摟濞堢绱? * @returns 閹稿褰佹笟娑溾偓鍛閸ㄥ鍌ㄥ鏇犳畱濡€崇€烽柅澶愩€嶉崚妤勩€冮弰鐘茬殸
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
 * 閼惧嘲褰囬幓鎰返閼板懎鎯庨崝銊┾偓澶愩€? *
 * @description 娴犲骸绨查悽銊啎缂冾喕鑵戦幓鎰絿閸氬嫭褰佹笟娑溾偓鍛畱娴滃矁绻橀崚鎯扮熅瀵板嫨鈧焦婀囬崝鈥虫珤 URL 缁涘鍘ょ純顕嗙礉
 * 閺嬪嫰鈧?ProviderStartOptions 鐎电钖勯悽銊ょ艾閸氼垰濮╅幓鎰返閼板懓绻樼粙瀣ㄢ偓? *
 * @param settings - 鎼存梻鏁ょ拋鍓х枂閿涘牅绮庨棁鈧禍宀冪箻閸掓儼鐭惧鍕祲閸忓啿鐡у▓纰夌礆
 * @returns 閹绘劒绶甸懓鍛儙閸斻劑鈧銆嶉敍灞炬￥闁板秶鐤嗛弮鎯扮箲閸?undefined
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
 * 閼惧嘲褰囬幐鍥х暰閹绘劒绶甸懓鍛畱閼奉亜鐣炬稊澶夌癌鏉╂稑鍩楃捄顖氱窞
 *
 * @param settings - 鎼存梻鏁ょ拋鍓х枂閿涘牅绮庨棁鈧禍宀冪箻閸掓儼鐭惧鍕祲閸忓啿鐡у▓纰夌礆
 * @param provider - 閹绘劒绶甸懓鍛閸? * @returns 閼奉亜鐣炬稊澶夌癌鏉╂稑鍩楃捄顖氱窞鐎涙顑佹稉? */
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
 * React Hook閿涙俺骞忛崣鏍ф嫲閺囧瓨鏌婃惔鏃傛暏鐠佸墽鐤? *
 * @description 閸氬牆鑻熼張顒€婀?localStorage 鐠佸墽鐤嗛崪灞炬箛閸斺€虫珤鐠佸墽鐤嗛敍? * 閹绘劒绶甸弴瀛樻煀閸滃矂鍣哥純顔芥煙濞夋洏鈧倿顩诲▎鈥冲鏉炶姤妞傞懛顏勫З鐏忓棙婀伴崷鎷岊啎缂冾喛绺肩粔璇插煂閺堝秴濮熼崳銊ｂ偓? *
 * @returns 鐠佸墽鐤嗙€电钖勯崣濠冩惙娴ｆ粍鏌熷▔? * @returns settings - 閸氬牆鑻熼崥搴ｆ畱鎼存梻鏁ょ拋鍓х枂
 * @returns updateSettings - 閺囧瓨鏌婄拋鍓х枂閻ㄥ嫬鍤遍弫甯礄閸氬本妞傞弴瀛樻煀閺堫剙婀撮崪灞炬箛閸斺€虫珤閿? * @returns resetSettings - 闁插秶鐤嗘稉娲帛鐠併倛顔曠純顔炬畱閸戣姤鏆? * @returns defaults - 閸氬牆鑻熸禍鍡樻箛閸斺€虫珤姒涙顓婚崐鑲╂畱姒涙顓荤拋鍓х枂
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
