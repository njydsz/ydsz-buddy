/**
 * @file 妯″瀷閰嶇疆涓庨€夋嫨绠＄悊妯″潡
 *
 * @description
 * 鎻愪緵 AI 妯″瀷閫夐」鏌ヨ銆佽兘鍔涜В鏋愩€佹ā鍨嬪弬鏁板綊涓€鍖栥€佹樉绀哄悕绉版牸寮忓寲绛夋牳蹇冨姛鑳姐€? * 鏀寔澶氱 AI 鏈嶅姟鎻愪緵鍟嗭紙Claude銆丆odex銆丆ursor銆丟emini銆丟rok銆丳i銆丱penCode銆並ilo锛夛紝
 * 骞朵负姣忕鎻愪緵鍟嗘彁渚涚粺涓€鐨勬ā鍨嬮€夋嫨涓庤兘鍔涙弿杩版帴鍙ｃ€? *
 * 鏍稿績鍔熻兘锛? * - 妯″瀷閫夐」涓庨粯璁ゆā鍨嬫煡璇? * - 妯″瀷鑳藉姏锛圕apabilities锛夎В鏋愪笌鏌ヨ
 * - Gemini 鎬濈淮閰嶇疆锛坆udget/level锛夎В鏋? * - 妯″瀷 Slug 褰掍竴鍖栦笌瑙ｆ瀽
 * - 鍚勬彁渚涘晢妯″瀷閫夐」褰掍竴鍖? * - 鎻愪緵鍟嗛€夐」鎻忚堪绗︽瀯寤? * - Claude Ultrathink 鎻愮ず璇嶅墠缂€澶勭悊
 *
 * @module model
 * @layer 鍏变韩宸ュ叿灞? */
import {
  DEFAULT_MODEL_BY_PROVIDER,
  MODEL_CAPABILITIES_INDEX,
  MODEL_OPTIONS_BY_PROVIDER,
  MODEL_SLUG_ALIASES_BY_PROVIDER,
  type ClaudeModelOptions,
  type ClaudeCodeEffort,
  type CodexModelOptions,
  type CursorModelOptions,
  type GeminiModelOptions,
  type GeminiThinkingBudget,
  type GeminiThinkingLevel,
  type GrokModelOptions,
  type GrokReasoningEffort,
  type ModelCapabilities,
  type ModelSelection,
  type ModelSlug,
  type OpenCodeModelOptions,
  type ProviderOptionDescriptor,
  type ProviderOptionSelection,
  type PiModelOptions,
  type PiThinkingLevel,
  type ProviderKind,
  type ProviderWithDefaultModel,
  CodexReasoningEffort,
} from "~/contracts";

/**
 * 鎸夋湇鍔℃彁渚涘晢绱㈠紩鐨勬ā鍨?Slug 闆嗗悎
 *
 * @description
 * 浠?`MODEL_OPTIONS_BY_PROVIDER` 鏋勫缓鐨勬寜鎻愪緵鍟嗗垎缁勭殑 Slug Set 闆嗗悎锛? * 鐢ㄤ簬 O(1) 鏃堕棿澶嶆潅搴﹀垽鏂煇涓ā鍨?Slug 鏄惁灞炰簬鎸囧畾鎻愪緵鍟嗭紝
 * 閬垮厤閬嶅巻鏁扮粍杩涜鏌ユ壘銆? *
 * @constant {Record<ProviderKind, ReadonlySet<ModelSlug>>}
 *
 * @example
 * ```ts
 * MODEL_SLUG_SET_BY_PROVIDER.codex.has('gpt-4'); // true
 * MODEL_SLUG_SET_BY_PROVIDER.claudeAgent.has('gpt-4'); // false
 * ```
 */
const MODEL_SLUG_SET_BY_PROVIDER: Record<ProviderKind, ReadonlySet<ModelSlug>> = {
  claudeAgent: new Set(MODEL_OPTIONS_BY_PROVIDER.claudeAgent.map((option) => option.slug)),
  codex: new Set(MODEL_OPTIONS_BY_PROVIDER.codex.map((option) => option.slug)),
  cursor: new Set(MODEL_OPTIONS_BY_PROVIDER.cursor.map((option) => option.slug)),
  gemini: new Set(MODEL_OPTIONS_BY_PROVIDER.gemini.map((option) => option.slug)),
  grok: new Set(MODEL_OPTIONS_BY_PROVIDER.grok.map((option) => option.slug)),
  kilo: new Set(MODEL_OPTIONS_BY_PROVIDER.kilo.map((option) => option.slug)),
  opencode: new Set(MODEL_OPTIONS_BY_PROVIDER.opencode.map((option) => option.slug)),
  pi: new Set<ModelSlug>(),
};

/**
 * 鍙€夋嫨鐨勬ā鍨嬮€夐」
 *
 * @description
 * 鐢ㄤ簬 UI 涓嬫媺鍒楄〃涓睍绀虹殑妯″瀷閫夐」锛屽寘鍚爣璇嗙鍜屾樉绀哄悕绉般€? * 鐢?`getModelOptions` 杩斿洖鐨勯€夐」鍒楄〃涓殑姣忎釜鍏冪礌绫诲瀷銆? *
 * @interface SelectableModelOption
 *
 * @property {string} slug - 妯″瀷鍞竴鏍囪瘑绗︼紙Slug锛夛紝鐢ㄤ簬 API 璋冪敤鍜屽唴閮ㄥ紩鐢? * @property {string} name - 妯″瀷鏄剧ず鍚嶇О锛岀敤浜?UI 灞曠ず
 *
 * @example
 * ```ts
 * const option: SelectableModelOption = { slug: 'gpt-4', name: 'GPT-4' };
 * ```
 */
export interface SelectableModelOption {
  /** 妯″瀷鍞竴鏍囪瘑绗︼紙Slug锛?*/
  slug: string;
  /** 妯″瀷鏄剧ず鍚嶇О锛岀敤浜?UI 灞曠ず */
  name: string;
}

/**
 * Gemini 鎬濈淮閰嶇疆绫诲瀷
 *
 * @description
 * 鏍囪瘑 Gemini 妯″瀷浣跨敤鐨勬€濈淮閰嶇疆鏂瑰紡锛? * - `"budget"` 琛ㄧず鍩轰簬 Token 棰勭畻閰嶇疆锛堥€傜敤浜?Gemini 2.5 绯诲垪锛? * - `"level"` 琛ㄧず鍩轰簬绾у埆閰嶇疆锛堥€傜敤浜?Gemini 3 绯诲垪锛? *
 * @type {GeminiThinkingConfigKind}
 *
 * @example
 * ```ts
 * const kind: GeminiThinkingConfigKind = 'budget'; // Gemini 2.5
 * const kind: GeminiThinkingConfigKind = 'level';  // Gemini 3
 * ```
 */
export type GeminiThinkingConfigKind = "budget" | "level";

/** 鍖归厤 Gemini 3 绯诲垪妯″瀷 ID 鐨勬鍒欒〃杈惧紡锛堝 gemini-3.0銆乤uto-gemini-3 绛夛級 */
const GEMINI_3_MODEL_PATTERN = /^(?:auto-)?gemini-3(?:[.-]|$)/i;
/** 鍖归厤 Gemini 2.5 绯诲垪妯″瀷 ID 鐨勬鍒欒〃杈惧紡锛堝 gemini-2.5-pro銆乤uto-gemini-2.5 绛夛級 */
const GEMINI_2_5_MODEL_PATTERN = /^(?:auto-)?gemini-2\.5(?:[.-]|$)/i;
/** Gemini 鎬濈淮绾у埆鍚堟硶鍊奸泦鍚?*/
const GEMINI_THINKING_LEVEL_SET = new Set<GeminiThinkingLevel>(["LOW", "HIGH"]);
/** Pi 鎬濈淮绾у埆鍚堟硶鍊奸泦鍚?*/
const PI_THINKING_LEVEL_SET = new Set<PiThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);
/** Gemini 鎬濈淮棰勭畻瀛楃涓插埌鏁板€肩殑鏄犲皠琛?*/
const GEMINI_THINKING_BUDGET_MAP = new Map<string, GeminiThinkingBudget>([
  ["-1", -1],
  ["0", 0],
  ["512", 512],
]);

/**
 * 绌虹殑妯″瀷鑳藉姏瀵硅薄
 *
 * @description
 * 鎵€鏈夎兘鍔涘瓧娈靛潎涓洪粯璁ゅ€?绌哄€硷紝鐢ㄤ綔鏈煡妯″瀷鎴栨棤鐗规畩鑳藉姏妯″瀷鐨勫洖閫€鍊笺€? * 褰撴棤娉曡瘑鍒ā鍨嬫垨妯″瀷鏃犵壒娈婅兘鍔涢厤缃椂锛屼娇鐢ㄦ瀵硅薄浣滀负榛樿鍊笺€? *
 * @constant {ModelCapabilities}
 *
 * @example
 * ```ts
 * const caps = getModelCapabilities('codex', 'unknown-model');
 * // caps === EMPTY_MODEL_CAPABILITIES
 * ```
 */
export const EMPTY_MODEL_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};
/**
 * Gemini 妯″瀷鐨勯粯璁よ兘鍔涘璞? *
 * @description
 * 褰撳墠涓?`EMPTY_MODEL_CAPABILITIES` 鐩稿悓锛岀敤浜?Gemini 妯″瀷鏃犳硶璇嗗埆绯诲垪鏃剁殑鍥為€€銆? *
 * @constant {ModelCapabilities}
 */
export const DEFAULT_GEMINI_MODEL_CAPABILITIES = EMPTY_MODEL_CAPABILITIES;

/**
 * Gemini 3 绯诲垪妯″瀷鐨勮兘鍔涙弿杩? *
 * @description
 * 鏀寔鍩轰簬绾у埆锛圚IGH/LOW锛夌殑鎬濈淮閰嶇疆锛屼笉鏀寔蹇€熸ā寮忓拰鎬濈淮鍒囨崲銆? * 閫傜敤浜?Gemini 3.0 鍙婁互涓婄増鏈殑妯″瀷銆? *
 * @constant {ModelCapabilities}
 *
 * @example
 * ```ts
 * GEMINI_3_MODEL_CAPABILITIES.reasoningEffortLevels;
 * // [{ value: 'HIGH', label: 'High', isDefault: true }, { value: 'LOW', label: 'Low' }]
 * ```
 */
export const GEMINI_3_MODEL_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    { value: "HIGH", label: "High", isDefault: true },
    { value: "LOW", label: "Low" },
  ],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};

/**
 * Gemini 2.5 绯诲垪妯″瀷鐨勮兘鍔涙弿杩? *
 * @description
 * 鏀寔鍩轰簬 Token 棰勭畻锛圖ynamic/-1銆?12锛夌殑鎬濈淮閰嶇疆锛屼笉鏀寔蹇€熸ā寮忓拰鎬濈淮鍒囨崲銆? * 閫傜敤浜?Gemini 2.5 绯诲垪妯″瀷銆? *
 * @constant {ModelCapabilities}
 *
 * @example
 * ```ts
 * GEMINI_2_5_MODEL_CAPABILITIES.reasoningEffortLevels;
 * // [{ value: '-1', label: 'Dynamic', isDefault: true }, { value: '512', label: '512 Tokens' }]
 * ```
 */
export const GEMINI_2_5_MODEL_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    { value: "-1", label: "Dynamic", isDefault: true },
    { value: "512", label: "512 Tokens" },
  ],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};

/**
 * 绫诲瀷瀹堝崼锛氬垽鏂€兼槸鍚︿负 Gemini 鎬濈淮绾у埆
 *
 * @param value - 寰呮鏌ョ殑鍊? * @returns 濡傛灉鍊兼槸鍚堟硶鐨?GeminiThinkingLevel 杩斿洖 true
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function isGeminiThinkingLevel(value: string): value is GeminiThinkingLevel {
  return GEMINI_THINKING_LEVEL_SET.has(value as GeminiThinkingLevel);
}

/**
 * 绫诲瀷瀹堝崼锛氬垽鏂€兼槸鍚︿负 Gemini 鎬濈淮棰勭畻
 *
 * @param value - 寰呮鏌ョ殑鍊? * @returns 濡傛灉鍊兼槸鍚堟硶鐨?GeminiThinkingBudget 瀛楃涓茶繑鍥?true
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function isGeminiThinkingBudget(value: string): value is `${GeminiThinkingBudget}` {
  return GEMINI_THINKING_BUDGET_MAP.has(value);
}

/**
 * 娓呮礂 Gemini 妯″瀷鍒悕鐨勭墖娈碉紝鐢熸垚鍙敤浜?API 璋冪敤鏍囪瘑绗︾殑瀛楃涓? *
 * @description
 * 灏嗘ā鍨嬪悕绉拌浆鎹负灏忓啓銆佺Щ闄ら潪娉曞瓧绗︺€佹浛鎹负杩炲瓧绗︼紝
 * 鐢熸垚閫傚悎浣滀负 API 鍒悕鏍囪瘑绗︾殑鐗囨銆? *
 * @param value - 鍘熷妯″瀷鍚嶇О瀛楃涓? * @returns 娓呮礂鍚庣殑鍒悕鐗囨锛屽鏋滅粨鏋滀负绌哄垯杩斿洖 "model"
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function sanitizeGeminiAliasSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "model";
}

/**
 * 鑾峰彇鎸囧畾鎻愪緵鍟嗙殑妯″瀷閫夐」鍒楄〃
 *
 * @description
 * 杩斿洖鎸囧畾鎻愪緵鍟嗘敮鎸佺殑鎵€鏈夋ā鍨嬮€夐」锛屽寘鍚?slug 鍜?name 绛変俊鎭€? * 榛樿鎻愪緵鍟嗕负 "codex"銆? *
 * @param provider - 鎻愪緵鍟嗙被鍨嬶紝榛樿涓?"codex"
 * @returns 璇ユ彁渚涘晢鏀寔鐨勬ā鍨嬮€夐」鏁扮粍
 *
 * @example
 * ```ts
 * const options = getModelOptions('claudeAgent');
 * // [{ slug: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', ... }, ...]
 * ```
 */
export function getModelOptions(provider: ProviderKind = "codex") {
  return MODEL_OPTIONS_BY_PROVIDER[provider];
}

/**
 * 鍒ゆ柇鎸囧畾鎻愪緵鍟嗘槸鍚︽湁榛樿妯″瀷
 *
 * @description
 * 闄?"pi" 涔嬪鐨勬墍鏈夋彁渚涘晢閮芥湁榛樿妯″瀷銆? *
 * @param provider - 鎻愪緵鍟嗙被鍨? * @returns 濡傛灉鎻愪緵鍟嗘湁榛樿妯″瀷杩斿洖 true
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function hasDefaultModel(provider: ProviderKind): provider is ProviderWithDefaultModel {
  return provider !== "pi";
}

/**
 * 鑾峰彇鎸囧畾鎻愪緵鍟嗙殑榛樿妯″瀷 Slug
 *
 * @description
 * 杩斿洖鎸囧畾鎻愪緵鍟嗙殑榛樿妯″瀷鏍囪瘑绗︺€?pi" 鎻愪緵鍟嗘病鏈夐粯璁ゆā鍨嬶紝杩斿洖 null銆? * 鍏朵粬鎻愪緵鍟嗚繑鍥?`DEFAULT_MODEL_BY_PROVIDER` 涓厤缃殑榛樿妯″瀷銆? *
 * @param provider - 鎻愪緵鍟嗙被鍨嬶紝榛樿涓?"codex"
 * @returns 榛樿妯″瀷鐨?Slug锛?pi" 鎻愪緵鍟嗚繑鍥?null
 *
 * @example
 * ```ts
 * getDefaultModel('codex');       // 'o3'
 * getDefaultModel('claudeAgent'); // 'claude-sonnet-4-20250514'
 * getDefaultModel('pi');          // null
 * ```
 */
export function getDefaultModel(provider: "pi"): null;
export function getDefaultModel(provider?: ProviderWithDefaultModel): ModelSlug;
export function getDefaultModel(provider: ProviderKind): ModelSlug | null;
export function getDefaultModel(provider: ProviderKind = "codex"): ModelSlug | null {
  return hasDefaultModel(provider) ? DEFAULT_MODEL_BY_PROVIDER[provider] : null;
}

/**
 * 鑾峰彇 Gemini 妯″瀷鐨勬€濈淮閰嶇疆绫诲瀷
 *
 * @description
 * 鏍规嵁妯″瀷 ID 鍒ゆ柇鍏朵娇鐢ㄧ殑鎬濈淮閰嶇疆鏂瑰紡锛? * - Gemini 3 绯诲垪杩斿洖 `"level"`锛堝熀浜庣骇鍒級
 * - Gemini 2.5 绯诲垪杩斿洖 `"budget"`锛堝熀浜?Token 棰勭畻锛? * - 鍏朵粬妯″瀷杩斿洖 null
 *
 * @param model - 妯″瀷 ID 瀛楃涓? * @returns 鎬濈淮閰嶇疆绫诲瀷锛屾棤娉曡瘑鍒椂杩斿洖 null
 *
 * @example
 * ```ts
 * getGeminiThinkingConfigKind('gemini-3.0-pro');  // 'level'
 * getGeminiThinkingConfigKind('gemini-2.5-pro');  // 'budget'
 * getGeminiThinkingConfigKind('gpt-4');           // null
 * ```
 */
export function getGeminiThinkingConfigKind(
  model: string | null | undefined,
): GeminiThinkingConfigKind | null {
  const trimmed = trimOrNull(model);
  if (!trimmed) {
    return null;
  }
  if (GEMINI_3_MODEL_PATTERN.test(trimmed)) {
    return "level";
  }
  if (GEMINI_2_5_MODEL_PATTERN.test(trimmed)) {
    return "budget";
  }
  return null;
}

/**
 * 鑾峰彇 Gemini 妯″瀷鐨勮兘鍔涙弿杩? *
 * @description
 * 鏍规嵁妯″瀷 ID 杩斿洖瀵瑰簲鐨?Gemini 鑳藉姏鎻忚堪瀵硅薄銆? * 鑷姩璇嗗埆 Gemini 3锛坙evel 妯″紡锛夊拰 Gemini 2.5锛坆udget 妯″紡锛夌郴鍒楋紝
 * 鏃犳硶璇嗗埆鏃惰繑鍥炴彁渚涚殑鍥為€€鑳藉姏瀵硅薄銆? *
 * @param modelId - 妯″瀷 ID 瀛楃涓? * @param fallbackCapabilities - 鏃犳硶璇嗗埆鏃剁殑鍥為€€鑳藉姏瀵硅薄锛岄粯璁や负 `EMPTY_MODEL_CAPABILITIES`
 * @returns 鍖归厤鐨?Gemini 妯″瀷鑳藉姏鎻忚堪
 *
 * @example
 * ```ts
 * geminiCapabilitiesForModel('gemini-3.0-pro');
 * // 杩斿洖 GEMINI_3_MODEL_CAPABILITIES
 *
 * geminiCapabilitiesForModel('gemini-2.5-flash');
 * // 杩斿洖 GEMINI_2_5_MODEL_CAPABILITIES
 *
 * geminiCapabilitiesForModel('unknown-model');
 * // 杩斿洖 EMPTY_MODEL_CAPABILITIES
 * ```
 */
export function geminiCapabilitiesForModel(
  modelId: string | null | undefined,
  fallbackCapabilities: ModelCapabilities = EMPTY_MODEL_CAPABILITIES,
): ModelCapabilities {
  const trimmed = trimOrNull(modelId)?.toLowerCase();
  switch (getGeminiThinkingConfigKind(modelId)) {
    case "level":
      return GEMINI_3_MODEL_CAPABILITIES;
    case "budget":
      if (!trimmed) {
        return fallbackCapabilities;
      }
      return GEMINI_2_5_MODEL_CAPABILITIES;
    default:
      return fallbackCapabilities;
  }
}

/**
 * 妯″瀷 Slug 鍒版樉绀哄悕绉扮殑鏄犲皠琛? *
 * @description
 * 浠庢墍鏈夋彁渚涘晢鐨勬ā鍨嬮€夐」涓瀯寤虹殑鍏ㄥ眬鏄犲皠琛紝
 * 鐢ㄤ簬灏嗘ā鍨?Slug 杞崲涓轰汉绫诲彲璇荤殑鏄剧ず鍚嶇О銆? * 閿负灏忓啓鐨?Slug锛屽€间负瀵瑰簲鐨?name銆? *
 * @private 姝ゅ父閲忎负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヤ娇鐢? */
const MODEL_NAME_BY_SLUG = new Map(
  Object.values(MODEL_OPTIONS_BY_PROVIDER)
    .flat()
    .map((option) => [option.slug.toLowerCase(), option.name] as const),
);

/**
 * 灏嗘湭鐭ョ殑 GPT 妯″瀷 Slug 杞崲涓轰汉绫诲彲璇荤殑鍚嶇О
 *
 * @description
 * 涓撻棬澶勭悊浠?"gpt-" 寮€澶寸殑妯″瀷 Slug锛屽皢鍏舵牸寮忓寲涓?"GPT-{version} {rest}" 鐨勫舰寮忋€? * 闈?"gpt-" 寮€澶寸殑 Slug 鍘熸牱杩斿洖銆? *
 * @param slug - 妯″瀷 Slug 瀛楃涓? * @returns 鏍煎紡鍖栧悗鐨勬樉绀哄悕绉? *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? *
 * @example
 * ```ts
 * humanizeUnknownModelSlug('gpt-4-turbo'); // 'GPT-4 Turbo'
 * humanizeUnknownModelSlug('gpt-3.5');     // 'GPT-3.5'
 * humanizeUnknownModelSlug('other-model'); // 'other-model'
 * ```
 */
function humanizeUnknownModelSlug(slug: string): string {
  if (!slug.toLowerCase().startsWith("gpt-")) return slug;
  const [, version, ...rest] = slug.split("-");
  if (rest.length === 0) return `GPT-${version}`;
  return `GPT-${version} ${rest.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ")}`;
}

/**
 * 鏍煎紡鍖栨ā鍨嬫樉绀哄悕绉? *
 * @description
 * 灏嗘ā鍨?Slug 杞崲涓轰汉绫诲彲璇荤殑鏄剧ず鍚嶇О銆? * 浼樺厛浠庡叏灞€鏄犲皠琛ㄤ腑鏌ユ壘宸茬煡妯″瀷鐨勫悕绉帮紝
 * 鏈壘鍒版椂浣跨敤 `humanizeUnknownModelSlug` 杩涜鏍煎紡鍖栥€? *
 * @param model - 妯″瀷 Slug 鎴?ID 瀛楃涓? * @returns 鏍煎紡鍖栧悗鐨勬樉绀哄悕绉帮紝杈撳叆涓虹┖鏃惰繑鍥?undefined
 *
 * @example
 * ```ts
 * formatModelDisplayName('gpt-4');              // 'GPT-4'
 * formatModelDisplayName('claude-sonnet-4-20250514'); // 'Claude Sonnet 4'
 * formatModelDisplayName(null);                  // undefined
 * ```
 */
export function formatModelDisplayName(model: string | null | undefined): string | undefined {
  const normalized = trimOrNull(model);
  if (!normalized) {
    return undefined;
  }

  return MODEL_NAME_BY_SLUG.get(normalized.toLowerCase()) ?? humanizeUnknownModelSlug(normalized);
}

/**
 * 鑾峰彇 Gemini 妯″瀷鐨勬€濈淮閰嶇疆閫変腑鍊? *
 * @description
 * 浠庢ā鍨嬮€夐」涓彁鍙栧綋鍓嶉€変腑鐨勬€濈淮閰嶇疆鍊笺€? * 浼樺厛杩斿洖鍖归厤鑳藉姏鍒楄〃涓湁鏁堢骇鍒殑鍊硷紝鍏舵杩斿洖浠绘剰闈炵┖鍊笺€? *
 * @param caps - 妯″瀷鑳藉姏鎻忚堪瀵硅薄
 * @param modelOptions - Gemini 妯″瀷閫夐」锛屽彲鑳藉寘鍚?thinkingLevel 鎴?thinkingBudget
 * @returns 鍖归厤鐨勬€濈淮閰嶇疆鍊硷紝鏈壘鍒拌繑鍥?null
 *
 * @example
 * ```ts
 * getGeminiThinkingSelectionValue(caps, { thinkingLevel: 'HIGH' }); // 'HIGH'
 * getGeminiThinkingSelectionValue(caps, { thinkingBudget: -1 });    // '-1'
 * ```
 */
export function getGeminiThinkingSelectionValue(
  caps: ModelCapabilities,
  modelOptions: GeminiModelOptions | null | undefined,
): string | null {
  const candidates = [
    trimOrNull(modelOptions?.thinkingLevel),
    modelOptions?.thinkingBudget !== undefined ? String(modelOptions.thinkingBudget) : null,
  ];

  return (
    candidates.find(
      (candidate): candidate is string => !!candidate && hasEffortLevel(caps, candidate),
    ) ??
    candidates.find((candidate): candidate is string => !!candidate) ??
    null
  );
}

/**
 * 浠庢€濈淮閰嶇疆鍊艰В鏋?Gemini 妯″瀷閫夐」
 *
 * @description
 * 灏嗗瓧绗︿覆褰㈠紡鐨勬€濈淮閰嶇疆鍊艰浆鎹负缁撴瀯鍖栫殑 GeminiModelOptions 瀵硅薄銆? * 鏀寔璇嗗埆 level 鏍煎紡锛堝 "HIGH"銆?LOW"锛夊拰 budget 鏍煎紡锛堝 "-1"銆?512"锛夈€? *
 * @param value - 鎬濈淮閰嶇疆鍊煎瓧绗︿覆
 * @returns 瑙ｆ瀽鍚庣殑 GeminiModelOptions锛屾棤娉曡瘑鍒繑鍥?undefined
 *
 * @example
 * ```ts
 * geminiModelOptionsFromEffortValue('HIGH');  // { thinkingLevel: 'HIGH' }
 * geminiModelOptionsFromEffortValue('-1');    // { thinkingBudget: -1 }
 * geminiModelOptionsFromEffortValue('invalid'); // undefined
 * ```
 */
export function geminiModelOptionsFromEffortValue(
  value: string | null | undefined,
): GeminiModelOptions | undefined {
  const trimmed = trimOrNull(value);
  if (!trimmed) {
    return undefined;
  }
  if (isGeminiThinkingLevel(trimmed)) {
    return { thinkingLevel: trimmed };
  }
  if (isGeminiThinkingBudget(trimmed)) {
    return {
      thinkingBudget: GEMINI_THINKING_BUDGET_MAP.get(trimmed) as GeminiThinkingBudget,
    };
  }
  return undefined;
}

/**
 * 鑾峰彇 Gemini 妯″瀷鐨勬€濈淮鍒悕
 *
 * @description
 * 鏍规嵁 Gemini 妯″瀷 ID 鍜屾ā鍨嬮€夐」锛岀敓鎴愮敤浜?API 璋冪敤鐨勬€濈淮閰嶇疆鍒悕銆? * 鍒悕鏍煎紡涓?`remicode-gemini-{base}-thinking-{level|budget}-{value}`銆? *
 * @param model - 妯″瀷 ID 瀛楃涓? * @param modelOptions - Gemini 妯″瀷閫夐」
 * @returns 鐢熸垚鐨勬€濈淮鍒悕锛屾棤娉曠敓鎴愯繑鍥?null
 *
 * @example
 * ```ts
 * getGeminiThinkingModelAlias('gemini-3.0-pro', { thinkingLevel: 'HIGH' });
 * // 'remicode-gemini-gemini-3-0-pro-thinking-level-high'
 *
 * getGeminiThinkingModelAlias('gemini-2.5-flash', { thinkingBudget: -1 });
 * // 'remicode-gemini-gemini-2-5-flash-thinking-budget-dynamic'
 * ```
 */
export function getGeminiThinkingModelAlias(
  model: string,
  modelOptions: GeminiModelOptions | null | undefined,
): string | null {
  const kind = getGeminiThinkingConfigKind(model);
  if (!kind || !modelOptions) {
    return null;
  }

  const caps = getModelCapabilities("gemini", model);
  const effort = getGeminiThinkingSelectionValue(caps, modelOptions);
  if (!effort || !hasEffortLevel(caps, effort)) {
    return null;
  }
  const nextOptions = geminiModelOptionsFromEffortValue(effort);
  if (!nextOptions) {
    return null;
  }

  const base = sanitizeGeminiAliasSegment(model);
  if (kind === "level" && nextOptions.thinkingLevel) {
    return `remicode-gemini-${base}-thinking-level-${nextOptions.thinkingLevel.toLowerCase()}`;
  }
  if (kind === "budget" && nextOptions.thinkingBudget !== undefined) {
    const budget =
      nextOptions.thinkingBudget === -1 ? "dynamic" : String(nextOptions.thinkingBudget);
    return `remicode-gemini-${base}-thinking-budget-${budget}`;
  }
  return null;
}

/**
 * 瑙ｆ瀽 Gemini API 鐨勬ā鍨?ID
 *
 * @description
 * 濡傛灉妯″瀷鏈夋€濈淮閰嶇疆鍒悕锛屽垯杩斿洖鍒悕锛涘惁鍒欒繑鍥炲師濮嬫ā鍨?ID銆? * 鍒悕浼樺厛绾ч珮浜庡師濮?ID锛岀‘淇?API 璋冪敤浣跨敤姝ｇ‘鐨勬€濈淮閰嶇疆銆? *
 * @param model - 鍘熷妯″瀷 ID 瀛楃涓? * @param modelOptions - Gemini 妯″瀷閫夐」
 * @returns 鏈€缁堢敤浜?API 璋冪敤鐨勬ā鍨?ID
 *
 * @example
 * ```ts
 * resolveGeminiApiModelId('gemini-3.0-pro', { thinkingLevel: 'HIGH' });
 * // 'remicode-gemini-gemini-3-0-pro-thinking-level-high'
 *
 * resolveGeminiApiModelId('gemini-3.0-pro', null);
 * // 'gemini-3.0-pro'
 * ```
 */
export function resolveGeminiApiModelId(
  model: string,
  modelOptions: GeminiModelOptions | null | undefined,
): string {
  return getGeminiThinkingModelAlias(model, modelOptions) ?? model;
}

// 鈹€鈹€ Effort 杈呭姪鍑芥暟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * 妫€鏌ヨ兘鍔涘璞′腑鏄惁鍖呭惈鎸囧畾鐨勬帹鐞嗗姫鍔涚骇鍒? *
 * @param caps - 妯″瀷鑳藉姏鎻忚堪瀵硅薄
 * @param value - 寰呮鏌ョ殑鎺ㄧ悊鍔姏绾у埆鍊? * @returns 濡傛灉鑳藉姏瀵硅薄涓寘鍚绾у埆杩斿洖 true锛屽惁鍒欒繑鍥?false
 *
 * @example
 * ```ts
 * hasEffortLevel(caps, 'high'); // true 鎴?false
 * ```
 */
export function hasEffortLevel(caps: ModelCapabilities, value: string): boolean {
  return caps.reasoningEffortLevels.some((l) => l.value === value);
}

/**
 * 鑾峰彇鑳藉姏瀵硅薄涓殑榛樿鎺ㄧ悊鍔姏绾у埆鍊? *
 * @param caps - 妯″瀷鑳藉姏鎻忚堪瀵硅薄
 * @returns 榛樿鐨勬帹鐞嗗姫鍔涚骇鍒€硷紝鏃犻粯璁ゅ€兼椂杩斿洖 null
 */
export function getDefaultEffort(caps: ModelCapabilities): string | null {
  return caps.reasoningEffortLevels.find((l) => l.isDefault)?.value ?? null;
}

/**
 * 妫€鏌ヨ兘鍔涘璞′腑鏄惁鍖呭惈鎸囧畾鐨勪笂涓嬫枃绐楀彛閫夐」
 *
 * @param caps - 妯″瀷鑳藉姏鎻忚堪瀵硅薄
 * @param value - 寰呮鏌ョ殑涓婁笅鏂囩獥鍙ｉ€夐」鍊? * @returns 濡傛灉鑳藉姏瀵硅薄涓寘鍚閫夐」杩斿洖 true锛屽惁鍒欒繑鍥?false
 */
export function hasContextWindowOption(caps: ModelCapabilities, value: string): boolean {
  return caps.contextWindowOptions.some((option) => option.value === value);
}

/**
 * 鑾峰彇鑳藉姏瀵硅薄涓殑榛樿涓婁笅鏂囩獥鍙ｉ€夐」鍊? *
 * @param caps - 妯″瀷鑳藉姏鎻忚堪瀵硅薄
 * @returns 榛樿鐨勪笂涓嬫枃绐楀彛閫夐」鍊硷紝鏃犻粯璁ゅ€兼椂杩斿洖 null
 */
export function getDefaultContextWindow(caps: ModelCapabilities): string | null {
  return caps.contextWindowOptions.find((option) => option.isDefault)?.value ?? null;
}

/**
 * 瑙ｆ瀽甯︽爣绛鹃€夐」鐨勫€? *
 * @description
 * 浠庨€夐」鍒楄〃涓В鏋愮粰瀹氬師濮嬪€肩殑鏈夋晥鎬с€傚鏋滃師濮嬪€煎湪閫夐」鍒楄〃涓瓨鍦ㄥ垯鐩存帴杩斿洖锛? * 鍚﹀垯杩斿洖閫夐」鍒楄〃涓殑榛樿鍊兼垨绗竴涓€夐」鍊笺€? *
 * @param options - 甯︽爣绛剧殑閫夐」鏁扮粍锛屾瘡椤瑰寘鍚?value 鍜屽彲閫夌殑 isDefault
 * @param rawValue - 鍘熷杈撳叆鍊? * @returns 瑙ｆ瀽鍚庣殑鏈夋晥鍊硷紝閫夐」鍒楄〃涓虹┖鏃惰繑鍥炲師濮嬪€硷紙淇壀鍚庯級
 *
 * @example
 * ```ts
 * resolveLabeledOptionValue(
 *   [{ value: 'high', isDefault: true }, { value: 'low' }],
 *   'low'
 * ); // 'low'
 *
 * resolveLabeledOptionValue(
 *   [{ value: 'high', isDefault: true }, { value: 'low' }],
 *   'invalid'
 * ); // 'high'锛堝洖閫€鍒伴粯璁ゅ€硷級
 * ```
 */
export function resolveLabeledOptionValue(
  options: ReadonlyArray<{ value: string; isDefault?: boolean | undefined }> | undefined,
  rawValue: string | null | undefined,
): string | null {
  const trimmedValue = trimOrNull(rawValue);
  if (!options || options.length === 0) {
    return trimmedValue;
  }
  if (trimmedValue && options.some((option) => option.value === trimmedValue)) {
    return trimmedValue;
  }
  return options.find((option) => option.isDefault)?.value ?? options[0]?.value ?? null;
}

/**
 * 鎻愪緵鍟嗛€夐」閫夋嫨鍊肩殑杈撳叆绫诲瀷
 *
 * @description
 * 鏀寔涓夌杈撳叆鏍煎紡锛? * - ProviderOptionSelection 鏁扮粍锛堢粨鏋勫寲閫夋嫨鍒楄〃锛? * - Record<string, unknown> 瀵硅薄锛堥敭鍊煎鏄犲皠锛? * - null/undefined锛堟棤閫夋嫨锛? *
 * @private 姝ょ被鍨嬩负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヤ娇鐢? */
type ProviderOptionSelectionsInput =
  | ReadonlyArray<ProviderOptionSelection>
  | Record<string, unknown>
  | null
  | undefined;

/**
 * 娣辨嫹璐濇彁渚涘晢閫夐」鎻忚堪绗? *
 * @description
 * 瀵规弿杩扮杩涜娣辨嫹璐濓紝纭繚淇敼涓嶄細褰卞搷鍘熷鏁版嵁銆? * 瀵逛簬 "select" 绫诲瀷鐨勬弿杩扮锛岄澶栨嫹璐?options 鏁扮粍鍜?promptInjectedValues 鏁扮粍銆? *
 * @param descriptor - 鍘熷鎻忚堪绗? * @returns 娣辨嫹璐濆悗鐨勬弿杩扮
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function cloneProviderOptionDescriptor(
  descriptor: ProviderOptionDescriptor,
): ProviderOptionDescriptor {
  if (descriptor.type === "select") {
    return {
      ...descriptor,
      options: descriptor.options.map((option) => ({ ...option })),
      ...(descriptor.promptInjectedValues
        ? { promptInjectedValues: [...descriptor.promptInjectedValues] }
        : {}),
    };
  }
  return { ...descriptor };
}

/**
 * 浠庨€夐」閫夋嫨鍊间腑鎻愬彇鎸囧畾 ID 鐨勫€? *
 * @description
 * 鏀寔鏁扮粍鍜屽璞′袱绉嶈緭鍏ユ牸寮忥紝鎻愬彇鎸囧畾 ID 瀵瑰簲鐨勯€夋嫨鍊笺€? * 鏁板€肩被鍨嬩細鑷姩杞崲涓哄瓧绗︿覆銆? *
 * @param selections - 閫夐」閫夋嫨鍊艰緭鍏? * @param id - 閫夐」 ID
 * @returns 鎻愬彇鍒扮殑鍊硷紙string 鎴?boolean锛夛紝鏈壘鍒拌繑鍥?undefined
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function providerOptionSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | boolean | undefined {
  if (!selections) {
    return undefined;
  }
  if (Array.isArray(selections)) {
    return selections.find((selection) => selection.id === id)?.value;
  }
  const selectionRecord = selections as Record<string, unknown>;
  const value = selectionRecord[id];
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" || typeof value === "boolean" ? value : undefined;
}

/**
 * 鑾峰彇鎻愪緵鍟嗛€夐」鐨勯€夋嫨鍊硷紙string 鎴?boolean锛? *
 * @param selections - 閫夐」閫夋嫨鍊艰緭鍏? * @param id - 閫夐」 ID
 * @returns 鎻愬彇鍒扮殑鍊硷紝鏈壘鍒拌繑鍥?undefined
 */
export function getProviderOptionSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | boolean | undefined {
  return providerOptionSelectionValue(selections, id);
}

/**
 * 鑾峰彇鎻愪緵鍟嗛€夐」鐨勫瓧绗︿覆绫诲瀷閫夋嫨鍊? *
 * @param selections - 閫夐」閫夋嫨鍊艰緭鍏? * @param id - 閫夐」 ID
 * @returns 瀛楃涓茬被鍨嬬殑閫夋嫨鍊硷紝闈炲瓧绗︿覆鎴栨湭鎵惧埌杩斿洖 undefined
 */
export function getProviderOptionStringSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | undefined {
  const value = getProviderOptionSelectionValue(selections, id);
  return typeof value === "string" ? value : undefined;
}

/**
 * 鑾峰彇鎻愪緵鍟嗛€夐」鐨勫竷灏旂被鍨嬮€夋嫨鍊? *
 * @param selections - 閫夐」閫夋嫨鍊艰緭鍏? * @param id - 閫夐」 ID
 * @returns 甯冨皵绫诲瀷鐨勯€夋嫨鍊硷紝闈炲竷灏旀垨鏈壘鍒拌繑鍥?undefined
 */
export function getProviderOptionBooleanSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): boolean | undefined {
  const value = getProviderOptionSelectionValue(selections, id);
  return typeof value === "boolean" ? value : undefined;
}

/**
 * 鑾峰彇妯″瀷閫夋嫨涓寚瀹?ID 鐨勯€夐」鍊? *
 * @description
 * 浠?ModelSelection 瀵硅薄鐨?options 瀛楁涓彁鍙栨寚瀹?ID 鐨勫€笺€? * 鏄?`getProviderOptionSelectionValue` 鐨勪究鎹峰皝瑁呫€? *
 * @param modelSelection - 妯″瀷閫夋嫨瀵硅薄
 * @param id - 閫夐」 ID
 * @returns 鎻愬彇鍒扮殑鍊硷紝鏈壘鍒拌繑鍥?undefined
 */
export function getModelSelectionOptionValue(
  modelSelection: ModelSelection | null | undefined,
  id: string,
): string | boolean | undefined {
  return getProviderOptionSelectionValue(
    modelSelection?.options as ProviderOptionSelectionsInput,
    id,
  );
}

/**
 * 鑾峰彇妯″瀷閫夋嫨涓寚瀹?ID 鐨勫瓧绗︿覆绫诲瀷閫夐」鍊? *
 * @param modelSelection - 妯″瀷閫夋嫨瀵硅薄
 * @param id - 閫夐」 ID
 * @returns 瀛楃涓茬被鍨嬬殑閫夐」鍊硷紝鏈壘鍒拌繑鍥?undefined
 */
export function getModelSelectionStringOptionValue(
  modelSelection: ModelSelection | null | undefined,
  id: string,
): string | undefined {
  return getProviderOptionStringSelectionValue(
    modelSelection?.options as ProviderOptionSelectionsInput,
    id,
  );
}

/**
 * 鑾峰彇妯″瀷閫夋嫨涓寚瀹?ID 鐨勫竷灏旂被鍨嬮€夐」鍊? *
 * @param modelSelection - 妯″瀷閫夋嫨瀵硅薄
 * @param id - 閫夐」 ID
 * @returns 甯冨皵绫诲瀷鐨勯€夐」鍊硷紝鏈壘鍒拌繑鍥?undefined
 */
export function getModelSelectionBooleanOptionValue(
  modelSelection: ModelSelection | null | undefined,
  id: string,
): boolean | undefined {
  return getProviderOptionBooleanSelectionValue(
    modelSelection?.options as ProviderOptionSelectionsInput,
    id,
  );
}

/**
 * 瑙ｆ瀽閫夋嫨绫诲瀷鎻忚堪绗︾殑褰撳墠鍊? *
 * @description
 * 濡傛灉鍘熷鍊煎湪閫夐」鍒楄〃涓瓨鍦ㄥ垯鐩存帴杩斿洖锛? * 鍚﹀垯浣跨敤鎻忚堪绗︾殑 currentValue 鎴栭€夐」鍒楄〃涓殑榛樿鍊笺€? *
 * @param descriptor - 閫夋嫨绫诲瀷鐨勬弿杩扮
 * @param rawValue - 鍘熷杈撳叆鍊? * @returns 瑙ｆ瀽鍚庣殑閫夐」 ID锛屾棤娉曠‘瀹氳繑鍥?undefined
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function resolveDescriptorChoiceValue(
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
  rawValue: string | null | undefined,
): string | undefined {
  const trimmed = trimOrNull(rawValue);
  if (trimmed && descriptor.options.some((option) => option.id === trimmed)) {
    return trimmed;
  }
  return descriptor.currentValue ?? descriptor.options.find((option) => option.isDefault)?.id;
}

/**
 * 涓烘弿杩扮璁剧疆褰撳墠鍊? *
 * @description
 * 鏍规嵁鎻忚堪绗︾被鍨嬪拰鍘熷鍊硷紝璁剧疆鎻忚堪绗︾殑 currentValue 瀛楁锛? * - 甯冨皵绫诲瀷锛氱洿鎺ヨ缃竷灏斿€? * - 閫夋嫨绫诲瀷锛氫娇鐢?`resolveDescriptorChoiceValue` 瑙ｆ瀽鏈夋晥鍊? * - 鏃犳硶纭畾鍊兼椂绉婚櫎 currentValue 瀛楁
 *
 * @param descriptor - 鍘熷鎻忚堪绗? * @param rawValue - 鍘熷杈撳叆鍊? * @returns 鏇存柊浜?currentValue 鐨勬弿杩扮
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function withProviderOptionCurrentValue(
  descriptor: ProviderOptionDescriptor,
  rawValue: string | boolean | undefined,
): ProviderOptionDescriptor {
  if (descriptor.type === "boolean") {
    return typeof rawValue === "boolean" ? { ...descriptor, currentValue: rawValue } : descriptor;
  }
  const currentValue =
    typeof rawValue === "string"
      ? resolveDescriptorChoiceValue(descriptor, rawValue)
      : resolveDescriptorChoiceValue(descriptor, descriptor.currentValue);
  if (!currentValue) {
    const { currentValue: _currentValue, ...rest } = descriptor;
    return rest;
  }
  return { ...descriptor, currentValue };
}

/**
 * 鑾峰彇鎺ㄧ悊鍔姏绾у埆鎻忚堪绗︾殑閫夐」 ID
 *
 * @description
 * 鏍规嵁鎻愪緵鍟嗙被鍨嬪拰鑳藉姏瀵硅薄锛岀‘瀹氭帹鐞嗗姫鍔涚骇鍒€夐」鐨?ID 鍚嶇О锛? * - claudeAgent: "effort"
 * - kilo/opencode: "variant"
 * - gemini: 鏍规嵁 effort 鍊兼牸寮忓垽鏂负 "thinkingBudget" 鎴?"thinkingLevel"
 * - pi: "thinkingLevel"
 * - 鍏朵粬: "reasoningEffort"
 *
 * @param provider - 鎻愪緵鍟嗙被鍨? * @param caps - 妯″瀷鑳藉姏鎻忚堪瀵硅薄
 * @returns 鎺ㄧ悊鍔姏绾у埆閫夐」鐨?ID
 *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function reasoningDescriptorId(provider: ProviderKind, caps: ModelCapabilities): string {
  if (provider === "claudeAgent") {
    return "effort";
  }
  if (provider === "kilo" || provider === "opencode") {
    return "variant";
  }
  if (provider === "gemini") {
    const values = caps.reasoningEffortLevels.map((option) => option.value);
    return values.length > 0 && values.every((value) => /^-?\d+$/u.test(value))
      ? "thinkingBudget"
      : "thinkingLevel";
  }
  if (provider === "pi") {
    return "thinkingLevel";
  }
  return "reasoningEffort";
}

/**
 * 浠庤兘鍔涘璞℃瀯寤烘棫鐗堥€夐」鎻忚堪绗﹀垪琛? *
 * @description
 * 褰撴ā鍨嬭兘鍔涘璞℃湭鎻愪緵 `optionDescriptors` 鏃讹紝浣跨敤姝ゅ嚱鏁颁粠鑳藉姏瀛楁
 * 鏋勫缓鍏煎鐨勬棫鐗堟弿杩扮鍒楄〃銆傚寘鎷帹鐞嗗姫鍔涚骇鍒€佷笂涓嬫枃绐楀彛銆? * 蹇€熸ā寮忓拰鎬濈淮鍒囨崲绛夐€夐」銆? *
 * @param provider - 鎻愪緵鍟嗙被鍨? * @param caps - 妯″瀷鑳藉姏鎻忚堪瀵硅薄
 * @returns 鏃х増鏍煎紡鐨勯€夐」鎻忚堪绗︽暟缁? *
 * @private 姝ゅ嚱鏁颁负鍐呴儴瀹炵幇缁嗚妭锛屼笉搴旂洿鎺ヨ皟鐢? */
function legacyCapabilityDescriptors(
  provider: ProviderKind,
  caps: ModelCapabilities,
): ProviderOptionDescriptor[] {
  const primaryOptions =
    provider === "kilo" || provider === "opencode"
      ? (caps.variantOptions ?? [])
      : caps.reasoningEffortLevels;
  const descriptors: ProviderOptionDescriptor[] = [];
  if (primaryOptions.length > 0) {
    const defaultPrimaryOption = primaryOptions.find((option) => option.isDefault);
    descriptors.push({
      id: reasoningDescriptorId(provider, caps),
      label: provider === "kilo" || provider === "opencode" ? "Variant" : "Reasoning",
      type: "select",
      options: primaryOptions.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.description ? { description: option.description } : {}),
        ...(option.isDefault ? { isDefault: true as const } : {}),
      })),
      ...(defaultPrimaryOption ? { currentValue: defaultPrimaryOption.value } : {}),
      ...(caps.promptInjectedEffortLevels.length > 0
        ? { promptInjectedValues: [...caps.promptInjectedEffortLevels] }
        : {}),
    });
  }
  if (caps.contextWindowOptions.length > 0) {
    const defaultContextWindowOption = caps.contextWindowOptions.find((option) => option.isDefault);
    descriptors.push({
      id: "contextWindow",
      label: "Context Window",
      type: "select",
      options: caps.contextWindowOptions.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.isDefault ? { isDefault: true as const } : {}),
      })),
      ...(defaultContextWindowOption ? { currentValue: defaultContextWindowOption.value } : {}),
    });
  }
  if (caps.supportsFastMode) {
    descriptors.push({ id: "fastMode", label: "Fast Mode", type: "boolean" });
  }
  if (caps.supportsThinkingToggle) {
    descriptors.push({ id: "thinking", label: "Thinking", type: "boolean", currentValue: true });
  }
  return descriptors;
}

/**
 * 鑾峰彇鎻愪緵鍟嗙殑閫夐」鎻忚堪绗﹀垪琛? *
 * @description
 * 杩斿洖鎸囧畾鎻愪緵鍟嗗拰妯″瀷鑳藉姏鐨勯€夐」鎻忚堪绗﹀垪琛ㄣ€? * 浼樺厛浣跨敤鑳藉姏瀵硅薄涓殑 `optionDescriptors`锛堟柊鐗堟牸寮忥級锛? * 鍚﹀垯浣跨敤 `legacyCapabilityDescriptors`锛堟棫鐗堟牸寮忥級鏋勫缓銆? * 姣忎釜鎻忚堪绗︿細鏍规嵁浼犲叆鐨勯€夋嫨鍊兼洿鏂?currentValue銆? *
 * @param input.provider - 鎻愪緵鍟嗙被鍨? * @param input.caps - 妯″瀷鑳藉姏鎻忚堪瀵硅薄
 * @param input.selections - 鍙€夌殑閫夐」閫夋嫨鍊硷紝鐢ㄤ簬璁剧疆鎻忚堪绗︾殑褰撳墠鍊? * @returns 閫夐」鎻忚堪绗︽暟缁? *
 * @example
 * ```ts
 * const descriptors = getProviderOptionDescriptors({
 *   provider: 'claudeAgent',
 *   caps: getModelCapabilities('claudeAgent', 'claude-sonnet-4-20250514'),
 *   selections: [{ id: 'effort', value: 'high' }]
 * });
 * ```
 */
export function getProviderOptionDescriptors(input: {
  provider: ProviderKind;
  caps: ModelCapabilities;
  selections?: ProviderOptionSelectionsInput;
}): ReadonlyArray<ProviderOptionDescriptor> {
  const descriptors =
    input.caps.optionDescriptors?.map(cloneProviderOptionDescriptor) ??
    legacyCapabilityDescriptors(input.provider, input.caps);
  return descriptors.map((descriptor) =>
    withProviderOptionCurrentValue(
      descriptor,
      getProviderOptionSelectionValue(input.selections, descriptor.id),
    ),
  );
}

/**
 * 鑾峰彇鎻愪緵鍟嗛€夐」鎻忚堪绗︾殑褰撳墠鍊? *
 * @description
 * 浠庢弿杩扮涓彁鍙栧綋鍓嶉€変腑鐨勫€硷細
 * - 甯冨皵绫诲瀷锛氱洿鎺ヨ繑鍥?currentValue
 * - 閫夋嫨绫诲瀷锛氳繑鍥?currentValue 鎴栭粯璁ら€夐」鐨?ID
 *
 * @param descriptor - 閫夐」鎻忚堪绗? * @returns 褰撳墠鍊硷紝鎻忚堪绗︿负绌烘椂杩斿洖 undefined
 */
export function getProviderOptionCurrentValue(
  descriptor: ProviderOptionDescriptor | null | undefined,
): string | boolean | undefined {
  if (!descriptor) {
    return undefined;
  }
  if (descriptor.type === "boolean") {
    return descriptor.currentValue;
  }
  return descriptor.currentValue ?? descriptor.options.find((option) => option.isDefault)?.id;
}

/**
 * 鑾峰彇鎻愪緵鍟嗛€夐」鎻忚堪绗︾殑褰撳墠鏄剧ず鏍囩
 *
 * @description
 * 浠庢弿杩扮涓彁鍙栧綋鍓嶉€変腑鍊肩殑鏄剧ず鏍囩锛? * - 甯冨皵绫诲瀷锛氳繑鍥?"On" 鎴?"Off"
 * - 閫夋嫨绫诲瀷锛氳繑鍥炲綋鍓嶉€夐」鐨?label
 *
 * @param descriptor - 閫夐」鎻忚堪绗? * @returns 褰撳墠鍊肩殑鏄剧ず鏍囩锛屾棤娉曠‘瀹氳繑鍥?undefined
 */
export function getProviderOptionCurrentLabel(
  descriptor: ProviderOptionDescriptor | null | undefined,
): string | undefined {
  const value = getProviderOptionCurrentValue(descriptor);
  if (!descriptor) {
    return undefined;
  }
  if (descriptor.type === "boolean") {
    return typeof value === "boolean" ? (value ? "On" : "Off") : undefined;
  }
  return typeof value === "string"
    ? descriptor.options.find((option) => option.id === value)?.label
    : undefined;
}

/**
 * 浠庨€夐」鎻忚堪绗﹀垪琛ㄦ瀯寤洪€夋嫨鍊兼暟缁? *
 * @description
 * 閬嶅巻鎻忚堪绗﹀垪琛紝鎻愬彇姣忎釜鎻忚堪绗︾殑褰撳墠鍊硷紝鏋勫缓 ProviderOptionSelection 鏁扮粍銆? * 浠呭寘鍚?string 鎴?boolean 绫诲瀷鐨勫€笺€? *
 * @param descriptors - 閫夐」鎻忚堪绗︽暟缁? * @returns 閫夋嫨鍊兼暟缁勶紝鎻忚堪绗﹀垪琛ㄤ负绌烘椂杩斿洖 undefined
 */
export function buildProviderOptionSelectionsFromDescriptors(
  descriptors: ReadonlyArray<ProviderOptionDescriptor> | null | undefined,
): ProviderOptionSelection[] | undefined {
  if (!descriptors || descriptors.length === 0) {
    return undefined;
  }
  const selections = descriptors.flatMap((descriptor) => {
    const value = getProviderOptionCurrentValue(descriptor);
    return typeof value === "string" || typeof value === "boolean"
      ? [{ id: descriptor.id, value }]
      : [];
  });
  return selections.length > 0 ? selections : undefined;
}

// 鈹€鈹€ 鏁版嵁椹卞姩鐨勬ā鍨嬭兘鍔涜В鏋?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/**
 * 鑾峰彇鎸囧畾鎻愪緵鍟嗗拰妯″瀷鐨勮兘鍔涙弿杩? *
 * @description
 * 浠庡叏灞€鑳藉姏绱㈠紩涓煡鎵炬ā鍨嬬殑鑳藉姏鎻忚堪銆傚浜?Gemini 鎻愪緵鍟嗭紝
 * 棰濆鏀寔鍩轰簬妯″瀷 ID 鐨勭郴鍒楄瘑鍒€傛湭鎵惧埌鏃惰繑鍥炵┖鑳藉姏瀵硅薄銆? *
 * @param provider - 鎻愪緵鍟嗙被鍨? * @param model - 妯″瀷 ID 鎴?Slug
 * @returns 妯″瀷鑳藉姏鎻忚堪瀵硅薄
 *
 * @example
 * ```ts
 * getModelCapabilities('claudeAgent', 'claude-sonnet-4-20250514');
 * // 杩斿洖璇ユā鍨嬬殑鑳藉姏鎻忚堪
 *
 * getModelCapabilities('codex', 'unknown-model');
 * // 杩斿洖 EMPTY_MODEL_CAPABILITIES
 * ```
 */
export function getModelCapabilities(
  provider: ProviderKind,
  model: string | null | undefined,
): ModelCapabilities {
  const slug = normalizeModelSlug(model, provider);
  if (slug && MODEL_CAPABILITIES_INDEX[provider]?.[slug]) {
    return MODEL_CAPABILITIES_INDEX[provider][slug];
  }
  if (provider === "gemini") {
    return geminiCapabilitiesForModel(slug ?? model, EMPTY_MODEL_CAPABILITIES);
  }
  return EMPTY_MODEL_CAPABILITIES;
}

/**
 * 鍒ゆ柇鏂囨湰涓槸鍚﹀寘鍚?Claude Ultrathink 鎻愮ず璇? *
 * @description
 * 妫€鏌ユ枃鏈腑鏄惁鍖呭惈 "ultrathink" 鍏抽敭瀛楋紙涓嶅尯鍒嗗ぇ灏忓啓锛夛紝
 * 鐢ㄤ簬鍒ゆ柇鏄惁闇€瑕佷负 Claude 妯″瀷娣诲姞 Ultrathink 鍓嶇紑銆? *
 * @param text - 寰呮鏌ョ殑鏂囨湰
 * @returns 濡傛灉鍖呭惈 ultrathink 鍏抽敭瀛楄繑鍥?true锛屽惁鍒欒繑鍥?false
 *
 * @example
 * ```ts
 * isClaudeUltrathinkPrompt('Please ultrathink this problem'); // true
 * isClaudeUltrathinkPrompt('Normal prompt');                   // false
 * ```
 */
export function isClaudeUltrathinkPrompt(text: string | null | undefined): boolean {
  return typeof text === "string" && /\bultrathink\b/i.test(text);
}

/**
 * 褰掍竴鍖栨ā鍨?Slug
 *
 * @description
 * 灏嗘ā鍨?ID 杞崲涓烘爣鍑嗗寲鐨?Slug 鏍煎紡锛? * 1. 鍘婚櫎棣栧熬绌虹櫧
 * 2. 瀵逛簬 claudeAgent 鎻愪緵鍟嗭紝绉婚櫎鏈熬鐨勬柟鎷彿鏍囪锛堝 `[1m]`锛? * 3. 鏌ユ壘鍒悕鏄犲皠琛紝灏嗗埆鍚嶈浆鎹负鏍囧噯 Slug
 * 4. 鏃犲埆鍚嶆椂鐩存帴浣跨敤澶勭悊鍚庣殑瀛楃涓蹭綔涓?Slug
 *
 * @param model - 鍘熷妯″瀷 ID 瀛楃涓? * @param provider - 鎻愪緵鍟嗙被鍨嬶紝榛樿涓?"codex"
 * @returns 褰掍竴鍖栧悗鐨勬ā鍨?Slug锛岃緭鍏ヤ负绌烘椂杩斿洖 null
 *
 * @example
 * ```ts
 * normalizeModelSlug('gpt-4', 'codex');       // 'gpt-4'
 * normalizeModelSlug('claude-3.5[1m]', 'claudeAgent'); // 'claude-3.5'
 * normalizeModelSlug(null);                    // null
 * ```
 */
export function normalizeModelSlug(
  model: string | null | undefined,
  provider: ProviderKind = "codex",
): ModelSlug | null {
  if (typeof model !== "string") {
    return null;
  }

  const trimmed = model.trim();
  if (!trimmed) {
    return null;
  }

  const providerScopedModel =
    provider === "claudeAgent" ? trimmed.replace(/\[[^\]]+\]$/u, "") : trimmed;
  const aliases = MODEL_SLUG_ALIASES_BY_PROVIDER[provider] as Record<string, ModelSlug>;
  const aliased = Object.prototype.hasOwnProperty.call(aliases, providerScopedModel)
    ? aliases[providerScopedModel]
    : undefined;
  return typeof aliased === "string" ? aliased : (providerScopedModel as ModelSlug);
}

/**
 * 浠庨€夐」鍒楄〃涓В鏋愬彲閫夋嫨鐨勬ā鍨?Slug
 *
 * @description
 * 鎸変互涓嬩紭鍏堢骇瑙ｆ瀽妯″瀷 Slug锛? * 1. 绮剧‘鍖归厤閫夐」鐨?slug
 * 2. 涓嶅尯鍒嗗ぇ灏忓啓鍖归厤閫夐」鐨?name
 * 3. 褰掍竴鍖栧悗鍖归厤閫夐」鐨?slug
 *
 * @param provider - 鎻愪緵鍟嗙被鍨? * @param value - 鐢ㄦ埛杈撳叆鐨勬ā鍨嬫爣璇嗭紙Slug 鎴栧悕绉帮級
 * @param options - 鍙€夋嫨鐨勬ā鍨嬮€夐」鍒楄〃
 * @returns 鍖归厤鍒扮殑妯″瀷 Slug锛屾湭鍖归厤杩斿洖 null
 *
 * @example
 * ```ts
 * resolveSelectableModel('codex', 'gpt-4', options);     // 'gpt-4'
 * resolveSelectableModel('codex', 'GPT-4', options);     // 'gpt-4'锛堟寜鍚嶇О鍖归厤锛? * resolveSelectableModel('codex', 'invalid', options);   // null
 * ```
 */
export function resolveSelectableModel(
  provider: ProviderKind,
  value: string | null | undefined,
  options: ReadonlyArray<SelectableModelOption>,
): ModelSlug | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const direct = options.find((option) => option.slug === trimmed);
  if (direct) {
    return direct.slug;
  }

  const byName = options.find((option) => option.name.toLowerCase() === trimmed.toLowerCase());
  if (byName) {
    return byName.slug;
  }

  const normalized = normalizeModelSlug(trimmed, provider);
  if (!normalized) {
    return null;
  }

  const resolved = options.find((option) => option.slug === normalized);
  return resolved ? resolved.slug : null;
}

/**
 * 瑙ｆ瀽妯″瀷 Slug锛岀‘淇濊繑鍥炴湁鏁堢殑妯″瀷鏍囪瘑
 *
 * @description
 * 褰掍竴鍖栨ā鍨?ID 骞堕獙璇佸叾鏄惁灞炰簬鎸囧畾鎻愪緵鍟嗙殑宸茬煡妯″瀷銆? * 濡傛灉褰掍竴鍖栧悗鐨?Slug 涓嶅湪鎻愪緵鍟嗙殑妯″瀷闆嗗悎涓紝鍒欏洖閫€鍒拌鎻愪緵鍟嗙殑榛樿妯″瀷銆? * "pi" 鎻愪緵鍟嗘病鏈夐粯璁ゆā鍨嬶紝鏈煡 Slug 鏃惰繑鍥炲綊涓€鍖栧悗鐨勫€笺€? *
 * @param model - 鍘熷妯″瀷 ID 瀛楃涓? * @param provider - 鎻愪緵鍟嗙被鍨嬶紝榛樿涓?"codex"
 * @returns 鏈夋晥鐨勬ā鍨?Slug锛岃緭鍏ヤ负绌烘椂杩斿洖鎻愪緵鍟嗙殑榛樿妯″瀷
 *
 * @example
 * ```ts
 * resolveModelSlug('gpt-4', 'codex');     // 'gpt-4'
 * resolveModelSlug('invalid', 'codex');    // 'o3'锛堝洖閫€鍒伴粯璁ゆā鍨嬶級
 * resolveModelSlug(null, 'codex');         // 'o3'锛堥粯璁ゆā鍨嬶級
 * ```
 */
export function resolveModelSlug(
  model: string | null | undefined,
  provider: ProviderKind = "codex",
): ModelSlug | null {
  const normalized = normalizeModelSlug(model, provider);
  if (provider === "pi") {
    return normalized;
  }
  if (!normalized) {
    return DEFAULT_MODEL_BY_PROVIDER[provider];
  }

  return MODEL_SLUG_SET_BY_PROVIDER[provider].has(normalized)
    ? normalized
    : DEFAULT_MODEL_BY_PROVIDER[provider];
}

/**
 * 瑙ｆ瀽鎸囧畾鎻愪緵鍟嗙殑妯″瀷 Slug
 *
 * @description
 * 鏄?`resolveModelSlug` 鐨勫弬鏁伴『搴忚皟鏁寸増鏈紝渚夸簬浠ユ彁渚涘晢涓虹涓€鍙傛暟璋冪敤銆? *
 * @param provider - 鎻愪緵鍟嗙被鍨? * @param model - 鍘熷妯″瀷 ID 瀛楃涓? * @returns 鏈夋晥鐨勬ā鍨?Slug
 *
 * @see {@link resolveModelSlug} - 鏍稿績瑙ｆ瀽閫昏緫
 */
export function resolveModelSlugForProvider(
  provider: ProviderKind,
  model: string | null | undefined,
): ModelSlug | null {
  return resolveModelSlug(model, provider);
}

/**
 * 淇壀瀛楃涓诧紝绌哄€艰繑鍥?null
 *
 * @description
 * 灏嗗瓧绗︿覆鍘婚櫎棣栧熬绌虹櫧锛屽鏋滅粨鏋滀负绌哄瓧绗︿覆鍒欒繑鍥?null銆? * 闈?string 绫诲瀷鐨勮緭鍏ョ洿鎺ヨ繑鍥?null銆? *
 * @template T - 瀛楃涓插瓧闈㈤噺绫诲瀷
 * @param value - 寰呬慨鍓殑鍊? * @returns 淇壀鍚庣殑闈炵┖瀛楃涓诧紝鎴?null
 *
 * @example
 * ```ts
 * trimOrNull('  hello  '); // 'hello'
 * trimOrNull('   ');       // null
 * trimOrNull(null);        // null
 * trimOrNull(undefined);   // null
 * ```
 */
export function trimOrNull<T extends string>(value: T | null | undefined): T | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim() as T;
  return trimmed || null;
}

/**
 * 褰掍竴鍖?Codex 妯″瀷閫夐」
 *
 * @description
 * 灏?Codex 妯″瀷閫夐」褰掍竴鍖栦负浠呭寘鍚笌榛樿鍊间笉鍚岀殑瀛楁锛? * - reasoningEffort锛氫粎褰撲笌榛樿鍊间笉鍚屾椂淇濈暀
 * - fastMode锛氫粎褰撲负 true 鏃朵繚鐣? *
 * @param model - 妯″瀷 ID 瀛楃涓? * @param modelOptions - 鍘熷 Codex 妯″瀷閫夐」
 * @returns 褰掍竴鍖栧悗鐨勬ā鍨嬮€夐」锛屾墍鏈夊瓧娈典笌榛樿鍊肩浉鍚屾椂杩斿洖 undefined
 */
export function normalizeCodexModelOptions(
  model: string | null | undefined,
  modelOptions: CodexModelOptions | null | undefined,
): CodexModelOptions | undefined {
  const caps = getModelCapabilities("codex", model);
  const defaultReasoningEffort = getDefaultEffort(caps) as CodexReasoningEffort;
  const reasoningEffort = trimOrNull(modelOptions?.reasoningEffort) ?? defaultReasoningEffort;
  const fastModeEnabled = modelOptions?.fastMode === true;
  const nextOptions: CodexModelOptions = {
    ...(reasoningEffort !== defaultReasoningEffort ? { reasoningEffort } : {}),
    ...(fastModeEnabled ? { fastMode: true } : {}),
  };
  return Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
}

/**
 * 褰掍竴鍖?Claude 妯″瀷閫夐」
 *
 * @description
 * 灏?Claude 妯″瀷閫夐」褰掍竴鍖栦负浠呭寘鍚笌榛樿鍊间笉鍚岀殑瀛楁锛? * - effort锛氭帓闄ゆ彁绀烘敞鍏ョ殑绾у埆鍜岄粯璁ょ骇鍒? * - contextWindow锛氫粎褰撲笌榛樿鍊间笉鍚屼笖鏈夋晥鏃朵繚鐣? * - thinking锛氫粎褰撲负 false 鏃朵繚鐣欙紙鍏抽棴鎬濈淮锛? * - fastMode锛氫粎褰撲负 true 鏃朵繚鐣? *
 * @param model - 妯″瀷 ID 瀛楃涓? * @param modelOptions - 鍘熷 Claude 妯″瀷閫夐」
 * @returns 褰掍竴鍖栧悗鐨勬ā鍨嬮€夐」锛屾墍鏈夊瓧娈典笌榛樿鍊肩浉鍚屾椂杩斿洖 undefined
 */
export function normalizeClaudeModelOptions(
  model: string | null | undefined,
  modelOptions: ClaudeModelOptions | null | undefined,
): ClaudeModelOptions | undefined {
  const caps = getModelCapabilities("claudeAgent", model);
  const defaultReasoningEffort = getDefaultEffort(caps);
  const defaultContextWindow = getDefaultContextWindow(caps);
  const resolvedEffort = trimOrNull(modelOptions?.effort);
  const resolvedContextWindow = trimOrNull(modelOptions?.contextWindow);
  const isPromptInjected = caps.promptInjectedEffortLevels.includes(resolvedEffort ?? "");
  const effort =
    resolvedEffort &&
    !isPromptInjected &&
    hasEffortLevel(caps, resolvedEffort) &&
    resolvedEffort !== defaultReasoningEffort
      ? resolvedEffort
      : undefined;
  const contextWindow =
    resolvedContextWindow &&
    hasContextWindowOption(caps, resolvedContextWindow) &&
    resolvedContextWindow !== defaultContextWindow
      ? resolvedContextWindow
      : undefined;
  const thinking =
    caps.supportsThinkingToggle && modelOptions?.thinking === false ? false : undefined;
  const fastMode = caps.supportsFastMode && modelOptions?.fastMode === true ? true : undefined;
  const nextOptions: ClaudeModelOptions = {
    ...(thinking === false ? { thinking: false } : {}),
    ...(effort ? { effort } : {}),
    ...(fastMode ? { fastMode: true } : {}),
    ...(contextWindow ? { contextWindow } : {}),
  };
  return Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
}

/**
 * 瑙ｆ瀽 API 璋冪敤浣跨敤鐨勬ā鍨?ID
 *
 * @description
 * 鏍规嵁妯″瀷閫夋嫨淇℃伅鐢熸垚鏈€缁堢敤浜?API 璋冪敤鐨勬ā鍨?ID銆? * 瀵逛簬 Claude 鎻愪緵鍟嗭紝濡傛灉閫夋嫨浜?1M 涓婁笅鏂囩獥鍙ｏ紝浼氬湪妯″瀷 ID 鍚庤拷鍔?`[1m]` 鏍囪銆? * 鍏朵粬鎻愪緵鍟嗙洿鎺ヨ繑鍥炲師濮嬫ā鍨?ID銆? *
 * @param modelSelection - 妯″瀷閫夋嫨瀵硅薄
 * @returns 鐢ㄤ簬 API 璋冪敤鐨勬ā鍨?ID 瀛楃涓? *
 * @example
 * ```ts
 * resolveApiModelId({ provider: 'claudeAgent', model: 'claude-sonnet-4', options: { contextWindow: '1m' } });
 * // 'claude-sonnet-4[1m]'
 *
 * resolveApiModelId({ provider: 'codex', model: 'gpt-4' });
 * // 'gpt-4'
 * ```
 */
export function resolveApiModelId(modelSelection: ModelSelection): string {
  switch (modelSelection.provider) {
    case "claudeAgent": {
      const caps = getModelCapabilities(modelSelection.provider, modelSelection.model);
      return modelSelection.options?.contextWindow === "1m" && hasContextWindowOption(caps, "1m")
        ? `${modelSelection.model}[1m]`
        : modelSelection.model;
    }
    default:
      return modelSelection.model;
  }
}

/**
 * 褰掍竴鍖?Gemini 妯″瀷閫夐」
 *
 * @description
 * 灏?Gemini 妯″瀷閫夐」褰掍竴鍖栵紝浠呬繚鐣欎笌榛樿鍊间笉鍚岀殑鎬濈淮閰嶇疆銆? * 濡傛灉鎬濈淮閰嶇疆鍊间笌榛樿鍊肩浉鍚岋紝杩斿洖 undefined銆? *
 * @param model - 妯″瀷 ID 瀛楃涓? * @param modelOptions - 鍘熷 Gemini 妯″瀷閫夐」
 * @returns 褰掍竴鍖栧悗鐨勬ā鍨嬮€夐」锛屼笌榛樿鍊肩浉鍚屾椂杩斿洖 undefined
 */
export function normalizeGeminiModelOptions(
  model: string | null | undefined,
  modelOptions: GeminiModelOptions | null | undefined,
): GeminiModelOptions | undefined {
  const caps = getModelCapabilities("gemini", model);
  const effort = getGeminiThinkingSelectionValue(caps, modelOptions);
  if (!effort || !hasEffortLevel(caps, effort)) {
    return undefined;
  }
  const defaultEffort = getDefaultEffort(caps);
  const nextOptions = geminiModelOptionsFromEffortValue(effort);
  if (!nextOptions) {
    return undefined;
  }

  const normalizedEffort =
    nextOptions.thinkingLevel !== undefined
      ? nextOptions.thinkingLevel
      : String(nextOptions.thinkingBudget);
  if (normalizedEffort === defaultEffort) {
    return undefined;
  }

  return nextOptions;
}

/**
 * 褰掍竴鍖?Grok 妯″瀷閫夐」
 *
 * @description
 * 灏?Grok 妯″瀷閫夐」褰掍竴鍖栵紝浠呬繚鐣欎笌榛樿鍊间笉鍚岀殑鎺ㄧ悊鍔姏绾у埆銆? *
 * @param model - 妯″瀷 ID 瀛楃涓? * @param modelOptions - 鍘熷 Grok 妯″瀷閫夐」
 * @returns 褰掍竴鍖栧悗鐨勬ā鍨嬮€夐」锛屼笌榛樿鍊肩浉鍚屾椂杩斿洖 undefined
 */
export function normalizeGrokModelOptions(
  model: string | null | undefined,
  modelOptions: GrokModelOptions | null | undefined,
): GrokModelOptions | undefined {
  const caps = getModelCapabilities("grok", model);
  const reasoningEffort = trimOrNull(modelOptions?.reasoningEffort);
  if (!reasoningEffort || !hasEffortLevel(caps, reasoningEffort)) {
    return undefined;
  }
  if (reasoningEffort === getDefaultEffort(caps)) {
    return undefined;
  }
  return { reasoningEffort: reasoningEffort as GrokReasoningEffort };
}

/**
 * 褰掍竴鍖?Pi 妯″瀷閫夐」
 *
 * @description
 * 灏?Pi 妯″瀷閫夐」褰掍竴鍖栵紝浠呬繚鐣欐湁鏁堢殑鎬濈淮绾у埆銆? *
 * @param modelOptions - 鍘熷 Pi 妯″瀷閫夐」
 * @returns 褰掍竴鍖栧悗鐨勬ā鍨嬮€夐」锛屾棤鏁堝€兼椂杩斿洖 undefined
 */
export function normalizePiModelOptions(
  modelOptions: PiModelOptions | null | undefined,
): PiModelOptions | undefined {
  const thinkingLevel = trimOrNull(modelOptions?.thinkingLevel);
  return thinkingLevel && PI_THINKING_LEVEL_SET.has(thinkingLevel as PiThinkingLevel)
    ? { thinkingLevel: thinkingLevel as PiThinkingLevel }
    : undefined;
}

/**
 * 褰掍竴鍖?OpenCode 妯″瀷閫夐」
 *
 * @description
 * 灏?OpenCode 妯″瀷閫夐」褰掍竴鍖栵紝浠呬繚鐣欓潪绌虹殑 variant 鍜?agent 瀛楁銆? *
 * @param modelOptions - 鍘熷 OpenCode 妯″瀷閫夐」
 * @returns 褰掍竴鍖栧悗鐨勬ā鍨嬮€夐」锛屾棤鏈夋晥瀛楁鏃惰繑鍥?undefined
 */
export function normalizeOpenCodeModelOptions(
  modelOptions: OpenCodeModelOptions | null | undefined,
): OpenCodeModelOptions | undefined {
  const variant = trimOrNull(modelOptions?.variant);
  const agent = trimOrNull(modelOptions?.agent);
  const nextOptions: OpenCodeModelOptions = {
    ...(variant ? { variant } : {}),
    ...(agent ? { agent } : {}),
  };
  return Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
}

/**
 * 褰掍竴鍖?Cursor 妯″瀷閫夐」
 *
 * @description
 * 灏?Cursor 妯″瀷閫夐」褰掍竴鍖栵紝浠呬繚鐣欓潪绌虹殑瀛楁銆? *
 * @param modelOptions - 鍘熷 Cursor 妯″瀷閫夐」
 * @returns 褰掍竴鍖栧悗鐨勬ā鍨嬮€夐」锛屾棤鏈夋晥瀛楁鏃惰繑鍥?undefined
 */
export function normalizeCursorModelOptions(
  modelOptions: CursorModelOptions | null | undefined,
): CursorModelOptions | undefined {
  const nextOptions: CursorModelOptions = {
    ...(modelOptions?.reasoningEffort ? { reasoningEffort: modelOptions.reasoningEffort } : {}),
    ...(modelOptions?.fastMode !== undefined ? { fastMode: modelOptions.fastMode } : {}),
    ...(modelOptions?.thinking !== undefined ? { thinking: modelOptions.thinking } : {}),
    ...(modelOptions?.contextWindow ? { contextWindow: modelOptions.contextWindow } : {}),
  };
  return Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
}

/**
 * 涓?Claude 鎻愮ず璇嶆坊鍔?Ultrathink 鍓嶇紑
 *
 * @description
 * 褰撴帹鐞嗗姫鍔涚骇鍒负 "ultrathink" 鏃讹紝鍦ㄦ彁绀鸿瘝鍓嶆坊鍔?"Ultrathink:" 鍓嶇紑銆? * 濡傛灉鎻愮ず璇嶅凡浠?"Ultrathink:" 寮€澶达紝鍒欎笉閲嶅娣诲姞銆? * 闈?ultrathink 绾у埆鎴栫┖鎻愮ず璇嶄笉鍋氫换浣曞鐞嗐€? *
 * @param text - 鍘熷鎻愮ず璇嶆枃鏈? * @param effort - Claude 鎺ㄧ悊鍔姏绾у埆
 * @returns 澶勭悊鍚庣殑鎻愮ず璇嶆枃鏈? *
 * @example
 * ```ts
 * applyClaudePromptEffortPrefix('璇峰垎鏋愯繖娈典唬鐮?, 'ultrathink');
 * // 'Ultrathink:\n璇峰垎鏋愯繖娈典唬鐮?
 *
 * applyClaudePromptEffortPrefix('璇峰垎鏋愯繖娈典唬鐮?, 'high');
 * // '璇峰垎鏋愯繖娈典唬鐮?锛堥潪 ultrathink 绾у埆涓嶅鐞嗭級
 *
 * applyClaudePromptEffortPrefix('Ultrathink:\n璇峰垎鏋?, 'ultrathink');
 * // 'Ultrathink:\n璇峰垎鏋?锛堝凡鏈夊墠缂€涓嶉噸澶嶆坊鍔狅級
 * ```
 */
export function applyClaudePromptEffortPrefix(
  text: string,
  effort: ClaudeCodeEffort | null | undefined,
): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (effort !== "ultrathink") {
    return trimmed;
  }
  if (trimmed.startsWith("Ultrathink:")) {
    return trimmed;
  }
  return `Ultrathink:\n${trimmed}`;
}
