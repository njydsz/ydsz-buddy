/**
 * @file 濡€崇€烽柊宥囩枂娑撳酣鈧瀚ㄧ粻锛勬倞濡€虫健
 *
 * @description
 * 閹绘劒绶?AI 濡€崇€烽柅澶愩€嶉弻銉嚄閵嗕浇鍏橀崝娑溞掗弸鎰┾偓浣鼓侀崹瀣棘閺佹澘缍婃稉鈧崠鏍モ偓浣规▔缁€鍝勬倳缁夌増鐗稿蹇撳缁涘鐗宠箛鍐ㄥ閼冲鈧? * 閺€顖涘瘮婢舵氨顫?AI 閺堝秴濮熼幓鎰返閸熷棴绱機laude閵嗕竼odex閵嗕竼ursor閵嗕笩emini閵嗕笩rok閵嗕赋i閵嗕副penCode閵嗕甫ilo閿涘绱? * 楠炴湹璐熷В蹇曨潚閹绘劒绶甸崯鍡樺絹娓氭稓绮烘稉鈧惃鍕侀崹瀣偓澶嬪娑撳氦鍏橀崝娑欏伎鏉╃増甯撮崣锝冣偓? *
 * 閺嶇绺鹃崝鐔诲厴閿? * - 濡€崇€烽柅澶愩€嶆稉搴ㄧ帛鐠併倖膩閸ㄥ鐓＄拠? * - 濡€崇€烽懗钘夊閿涘湑apabilities閿涘袙閺嬫劒绗岄弻銉嚄
 * - Gemini 閹繄娣柊宥囩枂閿涘潌udget/level閿涘袙閺? * - 濡€崇€?Slug 瑜版帊绔撮崠鏍︾瑢鐟欙絾鐎? * - 閸氬嫭褰佹笟娑樻櫌濡€崇€烽柅澶愩€嶈ぐ鎺嶇閸? * - 閹绘劒绶甸崯鍡涒偓澶愩€嶉幓蹇氬牚缁楋附鐎? * - Claude Ultrathink 閹绘劗銇氱拠宥呭缂傗偓婢跺嫮鎮? *
 * @module model
 * @layer 閸忓彉闊╁銉ュ徔鐏? */
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
 * 閹稿婀囬崝鈩冨絹娓氭稑鏅㈢槐銏犵穿閻ㄥ嫭膩閸?Slug 闂嗗棗鎮? *
 * @description
 * 娴?`MODEL_OPTIONS_BY_PROVIDER` 閺嬪嫬缂撻惃鍕瘻閹绘劒绶甸崯鍡楀瀻缂佸嫮娈?Slug Set 闂嗗棗鎮庨敍? * 閻劋绨?O(1) 閺冨爼妫挎径宥嗘絽鎼达箑鍨介弬顓熺厙娑擃亝膩閸?Slug 閺勵垰鎯佺仦鐐扮艾閹稿洤鐣鹃幓鎰返閸熷棴绱? * 闁灝鍘ら柆宥呭坊閺佹壆绮嶆潻娑滎攽閺屻儲澹橀妴? *
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
 * 閸欘垶鈧瀚ㄩ惃鍕侀崹瀣偓澶愩€? *
 * @description
 * 閻劋绨?UI 娑撳濯洪崚妤勩€冩稉顓炵潔缁€铏规畱濡€崇€烽柅澶愩€嶉敍灞藉瘶閸氼偅鐖ｇ拠鍡欘儊閸滃本妯夌粈鍝勬倳缁夎埇鈧? * 閻?`getModelOptions` 鏉╂柨娲栭惃鍕偓澶愩€嶉崚妤勩€冩稉顓犳畱濮ｅ繋閲滈崗鍐缁鐎烽妴? *
 * @interface SelectableModelOption
 *
 * @property {string} slug - 濡€崇€烽崬顖欑閺嶅洩鐦戠粭锔肩礄Slug閿涘绱濋悽銊ょ艾 API 鐠嬪啰鏁ら崪灞藉敶闁劌绱╅悽? * @property {string} name - 濡€崇€烽弰鍓с仛閸氬秶袨閿涘瞼鏁ゆ禍?UI 鐏炴洜銇? *
 * @example
 * ```ts
 * const option: SelectableModelOption = { slug: 'gpt-4', name: 'GPT-4' };
 * ```
 */
export interface SelectableModelOption {
  /** 濡€崇€烽崬顖欑閺嶅洩鐦戠粭锔肩礄Slug閿?*/
  slug: string;
  /** 濡€崇€烽弰鍓с仛閸氬秶袨閿涘瞼鏁ゆ禍?UI 鐏炴洜銇?*/
  name: string;
}

/**
 * Gemini 閹繄娣柊宥囩枂缁鐎? *
 * @description
 * 閺嶅洩鐦?Gemini 濡€崇€锋担璺ㄦ暏閻ㄥ嫭鈧繄娣柊宥囩枂閺傜懓绱￠敍? * - `"budget"` 鐞涖劎銇氶崺杞扮艾 Token 妫板嫮鐣婚柊宥囩枂閿涘牓鈧倻鏁ゆ禍?Gemini 2.5 缁鍨敍? * - `"level"` 鐞涖劎銇氶崺杞扮艾缁狙冨焼闁板秶鐤嗛敍鍫モ偓鍌滄暏娴?Gemini 3 缁鍨敍? *
 * @type {GeminiThinkingConfigKind}
 *
 * @example
 * ```ts
 * const kind: GeminiThinkingConfigKind = 'budget'; // Gemini 2.5
 * const kind: GeminiThinkingConfigKind = 'level';  // Gemini 3
 * ```
 */
export type GeminiThinkingConfigKind = "budget" | "level";

/** 閸栧綊鍘?Gemini 3 缁鍨Ο鈥崇€?ID 閻ㄥ嫭顒滈崚娆掋€冩潏鎯х础閿涘牆顩?gemini-3.0閵嗕工uto-gemini-3 缁涘绱?*/
const GEMINI_3_MODEL_PATTERN = /^(?:auto-)?gemini-3(?:[.-]|$)/i;
/** 閸栧綊鍘?Gemini 2.5 缁鍨Ο鈥崇€?ID 閻ㄥ嫭顒滈崚娆掋€冩潏鎯х础閿涘牆顩?gemini-2.5-pro閵嗕工uto-gemini-2.5 缁涘绱?*/
const GEMINI_2_5_MODEL_PATTERN = /^(?:auto-)?gemini-2\.5(?:[.-]|$)/i;
/** Gemini 閹繄娣痪褍鍩嗛崥鍫熺《閸婂ジ娉﹂崥?*/
const GEMINI_THINKING_LEVEL_SET = new Set<GeminiThinkingLevel>(["LOW", "HIGH"]);
/** Pi 閹繄娣痪褍鍩嗛崥鍫熺《閸婂ジ娉﹂崥?*/
const PI_THINKING_LEVEL_SET = new Set<PiThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);
/** Gemini 閹繄娣０鍕暬鐎涙顑佹稉鎻掑煂閺佹澘鈧偐娈戦弰鐘茬殸鐞?*/
const GEMINI_THINKING_BUDGET_MAP = new Map<string, GeminiThinkingBudget>([
  ["-1", -1],
  ["0", 0],
  ["512", 512],
]);

/**
 * 缁岃櫣娈戝Ο鈥崇€烽懗钘夊鐎电钖? *
 * @description
 * 閹碘偓閺堝鍏橀崝娑樼摟濞堥潧娼庢稉娲帛鐠併倕鈧?缁屽搫鈧》绱濋悽銊ょ稊閺堫亞鐓″Ο鈥崇€烽幋鏍ㄦ￥閻楄鐣╅懗钘夊濡€崇€烽惃鍕礀闁偓閸婄鈧? * 瑜版挻妫ゅ▔鏇＄槕閸掝偅膩閸ㄥ鍨ㄥΟ鈥崇€烽弮鐘靛濞堝﹨鍏橀崝娑㈠帳缂冾喗妞傞敍灞煎▏閻劍顒濈€电钖勬担婊€璐熸妯款吇閸婄鈧? *
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
 * Gemini 濡€崇€烽惃鍕帛鐠併倛鍏橀崝娑橆嚠鐠? *
 * @description
 * 瑜版挸澧犳稉?`EMPTY_MODEL_CAPABILITIES` 閻╃鎮撻敍宀€鏁ゆ禍?Gemini 濡€崇€烽弮鐘崇《鐠囧棗鍩嗙化璇插灙閺冨墎娈戦崶鐐衡偓鈧妴? *
 * @constant {ModelCapabilities}
 */
export const DEFAULT_GEMINI_MODEL_CAPABILITIES = EMPTY_MODEL_CAPABILITIES;

/**
 * Gemini 3 缁鍨Ο鈥崇€烽惃鍕厴閸旀稒寮挎潻? *
 * @description
 * 閺€顖涘瘮閸╄桨绨痪褍鍩嗛敍鍦欼GH/LOW閿涘娈戦幀婵堟樊闁板秶鐤嗛敍灞肩瑝閺€顖涘瘮韫囶偊鈧喐膩瀵繐鎷伴幀婵堟樊閸掑洦宕查妴? * 闁倻鏁ゆ禍?Gemini 3.0 閸欏﹣浜掓稉濠勫閺堫剛娈戝Ο鈥崇€烽妴? *
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
 * Gemini 2.5 缁鍨Ο鈥崇€烽惃鍕厴閸旀稒寮挎潻? *
 * @description
 * 閺€顖涘瘮閸╄桨绨?Token 妫板嫮鐣婚敍鍦杫namic/-1閵?12閿涘娈戦幀婵堟樊闁板秶鐤嗛敍灞肩瑝閺€顖涘瘮韫囶偊鈧喐膩瀵繐鎷伴幀婵堟樊閸掑洦宕查妴? * 闁倻鏁ゆ禍?Gemini 2.5 缁鍨Ο鈥崇€烽妴? *
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
 * 缁鐎风€瑰牆宕奸敍姘灲閺傤厼鈧吋妲搁崥锔胯礋 Gemini 閹繄娣痪褍鍩? *
 * @param value - 瀵板懏顥呴弻銉ф畱閸? * @returns 婵″倹鐏夐崐鍏兼Ц閸氬牊纭堕惃?GeminiThinkingLevel 鏉╂柨娲?true
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
function isGeminiThinkingLevel(value: string): value is GeminiThinkingLevel {
  return GEMINI_THINKING_LEVEL_SET.has(value as GeminiThinkingLevel);
}

/**
 * 缁鐎风€瑰牆宕奸敍姘灲閺傤厼鈧吋妲搁崥锔胯礋 Gemini 閹繄娣０鍕暬
 *
 * @param value - 瀵板懏顥呴弻銉ф畱閸? * @returns 婵″倹鐏夐崐鍏兼Ц閸氬牊纭堕惃?GeminiThinkingBudget 鐎涙顑佹稉鑼剁箲閸?true
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
function isGeminiThinkingBudget(value: string): value is `${GeminiThinkingBudget}` {
  return GEMINI_THINKING_BUDGET_MAP.has(value);
}

/**
 * 濞撳懏绀?Gemini 濡€崇€烽崚顐㈡倳閻ㄥ嫮澧栧▓纰夌礉閻㈢喐鍨氶崣顖滄暏娴?API 鐠嬪啰鏁ら弽鍥槕缁楋妇娈戠€涙顑佹稉? *
 * @description
 * 鐏忓棙膩閸ㄥ鎮曠粔鎷屾祮閹诡澀璐熺亸蹇撳晸閵嗕胶些闂勩倝娼▔鏇炵摟缁楋负鈧焦娴涢幑顫礋鏉╃偛鐡х粭锔肩礉
 * 閻㈢喐鍨氶柅鍌氭値娴ｆ粈璐?API 閸掝偄鎮曢弽鍥槕缁楋妇娈戦悧鍥唽閵? *
 * @param value - 閸樼喎顫愬Ο鈥崇€烽崥宥囆炵€涙顑佹稉? * @returns 濞撳懏绀傞崥搴ｆ畱閸掝偄鎮曢悧鍥唽閿涘苯顩ч弸婊呯波閺嬫粈璐熺粚鍝勫灟鏉╂柨娲?"model"
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
function sanitizeGeminiAliasSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "model";
}

/**
 * 閼惧嘲褰囬幐鍥х暰閹绘劒绶甸崯鍡欐畱濡€崇€烽柅澶愩€嶉崚妤勩€? *
 * @description
 * 鏉╂柨娲栭幐鍥х暰閹绘劒绶甸崯鍡樻暜閹镐胶娈戦幍鈧張澶嬆侀崹瀣偓澶愩€嶉敍灞藉瘶閸?slug 閸?name 缁涘淇婇幁顖樷偓? * 姒涙顓婚幓鎰返閸熷棔璐?"codex"閵? *
 * @param provider - 閹绘劒绶甸崯鍡欒閸ㄥ绱濇妯款吇娑?"codex"
 * @returns 鐠囥儲褰佹笟娑樻櫌閺€顖涘瘮閻ㄥ嫭膩閸ㄥ鈧銆嶉弫鎵矋
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
 * 閸掋倖鏌囬幐鍥х暰閹绘劒绶甸崯鍡樻Ц閸氾附婀佹妯款吇濡€崇€? *
 * @description
 * 闂?"pi" 娑斿顦婚惃鍕閺堝褰佹笟娑樻櫌闁姤婀佹妯款吇濡€崇€烽妴? *
 * @param provider - 閹绘劒绶甸崯鍡欒閸? * @returns 婵″倹鐏夐幓鎰返閸熷棙婀佹妯款吇濡€崇€锋潻鏂挎礀 true
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
function hasDefaultModel(provider: ProviderKind): provider is ProviderWithDefaultModel {
  return provider !== "pi";
}

/**
 * 閼惧嘲褰囬幐鍥х暰閹绘劒绶甸崯鍡欐畱姒涙顓诲Ο鈥崇€?Slug
 *
 * @description
 * 鏉╂柨娲栭幐鍥х暰閹绘劒绶甸崯鍡欐畱姒涙顓诲Ο鈥崇€烽弽鍥槕缁楋负鈧?pi" 閹绘劒绶甸崯鍡樼梾閺堝绮拋銈喣侀崹瀣剁礉鏉╂柨娲?null閵? * 閸忔湹绮幓鎰返閸熷棜绻戦崶?`DEFAULT_MODEL_BY_PROVIDER` 娑擃參鍘ょ純顔炬畱姒涙顓诲Ο鈥崇€烽妴? *
 * @param provider - 閹绘劒绶甸崯鍡欒閸ㄥ绱濇妯款吇娑?"codex"
 * @returns 姒涙顓诲Ο鈥崇€烽惃?Slug閿?pi" 閹绘劒绶甸崯鍡氱箲閸?null
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
 * 閼惧嘲褰?Gemini 濡€崇€烽惃鍕偓婵堟樊闁板秶鐤嗙猾璇茬€? *
 * @description
 * 閺嶈宓佸Ο鈥崇€?ID 閸掋倖鏌囬崗鏈靛▏閻劎娈戦幀婵堟樊闁板秶鐤嗛弬鐟扮础閿? * - Gemini 3 缁鍨潻鏂挎礀 `"level"`閿涘牆鐔€娴滃海楠囬崚顐礆
 * - Gemini 2.5 缁鍨潻鏂挎礀 `"budget"`閿涘牆鐔€娴?Token 妫板嫮鐣婚敍? * - 閸忔湹绮Ο鈥崇€锋潻鏂挎礀 null
 *
 * @param model - 濡€崇€?ID 鐎涙顑佹稉? * @returns 閹繄娣柊宥囩枂缁鐎烽敍灞炬￥濞夋洝鐦戦崚顐ｆ鏉╂柨娲?null
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
 * 閼惧嘲褰?Gemini 濡€崇€烽惃鍕厴閸旀稒寮挎潻? *
 * @description
 * 閺嶈宓佸Ο鈥崇€?ID 鏉╂柨娲栫€电懓绨查惃?Gemini 閼宠棄濮忛幓蹇氬牚鐎电钖勯妴? * 閼奉亜濮╃拠鍡楀焼 Gemini 3閿涘潤evel 濡€崇础閿涘鎷?Gemini 2.5閿涘潌udget 濡€崇础閿涘閮撮崚妤嬬礉
 * 閺冪姵纭剁拠鍡楀焼閺冩儼绻戦崶鐐村絹娓氭稓娈戦崶鐐衡偓鈧懗钘夊鐎电钖勯妴? *
 * @param modelId - 濡€崇€?ID 鐎涙顑佹稉? * @param fallbackCapabilities - 閺冪姵纭剁拠鍡楀焼閺冨墎娈戦崶鐐衡偓鈧懗钘夊鐎电钖勯敍宀勭帛鐠併倓璐?`EMPTY_MODEL_CAPABILITIES`
 * @returns 閸栧綊鍘ら惃?Gemini 濡€崇€烽懗钘夊閹诲繗鍫? *
 * @example
 * ```ts
 * geminiCapabilitiesForModel('gemini-3.0-pro');
 * // 鏉╂柨娲?GEMINI_3_MODEL_CAPABILITIES
 *
 * geminiCapabilitiesForModel('gemini-2.5-flash');
 * // 鏉╂柨娲?GEMINI_2_5_MODEL_CAPABILITIES
 *
 * geminiCapabilitiesForModel('unknown-model');
 * // 鏉╂柨娲?EMPTY_MODEL_CAPABILITIES
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
 * 濡€崇€?Slug 閸掔増妯夌粈鍝勬倳缁夋壆娈戦弰鐘茬殸鐞? *
 * @description
 * 娴犲孩澧嶉張澶嬪絹娓氭稑鏅㈤惃鍕侀崹瀣偓澶愩€嶆稉顓熺€铏规畱閸忋劌鐪弰鐘茬殸鐞涱煉绱? * 閻劋绨亸鍡樐侀崹?Slug 鏉烆剚宕叉稉杞版眽缁褰茬拠鑽ゆ畱閺勫墽銇氶崥宥囆為妴? * 闁款喕璐熺亸蹇撳晸閻?Slug閿涘苯鈧棿璐熺€电懓绨查惃?name閵? *
 * @private 濮濄倕鐖堕柌蹇庤礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儰濞囬悽? */
const MODEL_NAME_BY_SLUG = new Map(
  Object.values(MODEL_OPTIONS_BY_PROVIDER)
    .flat()
    .map((option) => [option.slug.toLowerCase(), option.name] as const),
);

/**
 * 鐏忓棙婀惌銉ф畱 GPT 濡€崇€?Slug 鏉烆剚宕叉稉杞版眽缁褰茬拠鑽ゆ畱閸氬秶袨
 *
 * @description
 * 娑撴捇妫径鍕倞娴?"gpt-" 瀵偓婢跺娈戝Ο鈥崇€?Slug閿涘苯鐨㈤崗鑸电壐瀵繐瀵叉稉?"GPT-{version} {rest}" 閻ㄥ嫬鑸板蹇嬧偓? * 闂?"gpt-" 瀵偓婢跺娈?Slug 閸樼喐鐗辨潻鏂挎礀閵? *
 * @param slug - 濡€崇€?Slug 鐎涙顑佹稉? * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫭妯夌粈鍝勬倳缁? *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? *
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
 * 閺嶇厧绱￠崠鏍侀崹瀣▔缁€鍝勬倳缁? *
 * @description
 * 鐏忓棙膩閸?Slug 鏉烆剚宕叉稉杞版眽缁褰茬拠鑽ゆ畱閺勫墽銇氶崥宥囆為妴? * 娴兼ê鍘涙禒搴″弿鐏炩偓閺勭姴鐨犵悰銊よ厬閺屻儲澹樺鑼叀濡€崇€烽惃鍕倳缁夊府绱? * 閺堫亝澹橀崚鐗堟娴ｈ法鏁?`humanizeUnknownModelSlug` 鏉╂稖顢戦弽鐓庣础閸栨牓鈧? *
 * @param model - 濡€崇€?Slug 閹?ID 鐎涙顑佹稉? * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫭妯夌粈鍝勬倳缁夊府绱濇潏鎾冲弳娑撹櫣鈹栭弮鎯扮箲閸?undefined
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
 * 閼惧嘲褰?Gemini 濡€崇€烽惃鍕偓婵堟樊闁板秶鐤嗛柅澶夎厬閸? *
 * @description
 * 娴犲孩膩閸ㄥ鈧銆嶆稉顓熷絹閸欐牕缍嬮崜宥夆偓澶夎厬閻ㄥ嫭鈧繄娣柊宥囩枂閸婄鈧? * 娴兼ê鍘涙潻鏂挎礀閸栧綊鍘ら懗钘夊閸掓銆冩稉顓熸箒閺佸牏楠囬崚顐ゆ畱閸婄》绱濋崗鑸殿偧鏉╂柨娲栨禒缁樺壈闂堢偟鈹栭崐绗衡偓? *
 * @param caps - 濡€崇€烽懗钘夊閹诲繗鍫€电钖? * @param modelOptions - Gemini 濡€崇€烽柅澶愩€嶉敍灞藉讲閼宠棄瀵橀崥?thinkingLevel 閹?thinkingBudget
 * @returns 閸栧綊鍘ら惃鍕偓婵堟樊闁板秶鐤嗛崐纭风礉閺堫亝澹橀崚鎷岀箲閸?null
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
 * 娴犲孩鈧繄娣柊宥囩枂閸婅壈袙閺?Gemini 濡€崇€烽柅澶愩€? *
 * @description
 * 鐏忓棗鐡х粭锔胯瑜般垹绱￠惃鍕偓婵堟樊闁板秶鐤嗛崐鑹版祮閹诡澀璐熺紒鎾寸€崠鏍畱 GeminiModelOptions 鐎电钖勯妴? * 閺€顖涘瘮鐠囧棗鍩?level 閺嶇厧绱￠敍鍫濐洤 "HIGH"閵?LOW"閿涘鎷?budget 閺嶇厧绱￠敍鍫濐洤 "-1"閵?512"閿涘鈧? *
 * @param value - 閹繄娣柊宥囩枂閸婄厧鐡х粭锔胯
 * @returns 鐟欙絾鐎介崥搴ｆ畱 GeminiModelOptions閿涘本妫ゅ▔鏇＄槕閸掝偉绻戦崶?undefined
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
 * 閼惧嘲褰?Gemini 濡€崇€烽惃鍕偓婵堟樊閸掝偄鎮? *
 * @description
 * 閺嶈宓?Gemini 濡€崇€?ID 閸滃本膩閸ㄥ鈧銆嶉敍宀€鏁撻幋鎰暏娴?API 鐠嬪啰鏁ら惃鍕偓婵堟樊闁板秶鐤嗛崚顐㈡倳閵? * 閸掝偄鎮曢弽鐓庣础娑?`remicode-gemini-{base}-thinking-{level|budget}-{value}`閵? *
 * @param model - 濡€崇€?ID 鐎涙顑佹稉? * @param modelOptions - Gemini 濡€崇€烽柅澶愩€? * @returns 閻㈢喐鍨氶惃鍕偓婵堟樊閸掝偄鎮曢敍灞炬￥濞夋洜鏁撻幋鎰箲閸?null
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
 * 鐟欙絾鐎?Gemini API 閻ㄥ嫭膩閸?ID
 *
 * @description
 * 婵″倹鐏夊Ο鈥崇€烽張澶嬧偓婵堟樊闁板秶鐤嗛崚顐㈡倳閿涘苯鍨潻鏂挎礀閸掝偄鎮曢敍娑樻儊閸掓瑨绻戦崶鐐插斧婵膩閸?ID閵? * 閸掝偄鎮曟导妯哄帥缁狙囩彯娴滃骸甯慨?ID閿涘瞼鈥樻穱?API 鐠嬪啰鏁ゆ担璺ㄦ暏濮濓絿鈥橀惃鍕偓婵堟樊闁板秶鐤嗛妴? *
 * @param model - 閸樼喎顫愬Ο鈥崇€?ID 鐎涙顑佹稉? * @param modelOptions - Gemini 濡€崇€烽柅澶愩€? * @returns 閺堚偓缂佸牏鏁ゆ禍?API 鐠嬪啰鏁ら惃鍕侀崹?ID
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

// 閳光偓閳光偓 Effort 鏉堝懎濮崙鑺ユ殶 閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

/**
 * 濡偓閺屻儴鍏橀崝娑橆嚠鐠炩€茶厬閺勵垰鎯侀崠鍛儓閹稿洤鐣鹃惃鍕腹閻炲棗濮崝娑氶獓閸? *
 * @param caps - 濡€崇€烽懗钘夊閹诲繗鍫€电钖? * @param value - 瀵板懏顥呴弻銉ф畱閹恒劎鎮婇崝顏勫缁狙冨焼閸? * @returns 婵″倹鐏夐懗钘夊鐎电钖勬稉顓炲瘶閸氼偉顕氱痪褍鍩嗘潻鏂挎礀 true閿涘苯鎯侀崚娆掔箲閸?false
 *
 * @example
 * ```ts
 * hasEffortLevel(caps, 'high'); // true 閹?false
 * ```
 */
export function hasEffortLevel(caps: ModelCapabilities, value: string): boolean {
  return caps.reasoningEffortLevels.some((l) => l.value === value);
}

/**
 * 閼惧嘲褰囬懗钘夊鐎电钖勬稉顓犳畱姒涙顓婚幒銊ф倞閸旑亜濮忕痪褍鍩嗛崐? *
 * @param caps - 濡€崇€烽懗钘夊閹诲繗鍫€电钖? * @returns 姒涙顓婚惃鍕腹閻炲棗濮崝娑氶獓閸掝偄鈧》绱濋弮鐘荤帛鐠併倕鈧吋妞傛潻鏂挎礀 null
 */
export function getDefaultEffort(caps: ModelCapabilities): string | null {
  return caps.reasoningEffortLevels.find((l) => l.isDefault)?.value ?? null;
}

/**
 * 濡偓閺屻儴鍏橀崝娑橆嚠鐠炩€茶厬閺勵垰鎯侀崠鍛儓閹稿洤鐣鹃惃鍕瑐娑撳鏋冪粣妤€褰涢柅澶愩€? *
 * @param caps - 濡€崇€烽懗钘夊閹诲繗鍫€电钖? * @param value - 瀵板懏顥呴弻銉ф畱娑撳﹣绗呴弬鍥╃崶閸欙綁鈧銆嶉崐? * @returns 婵″倹鐏夐懗钘夊鐎电钖勬稉顓炲瘶閸氼偉顕氶柅澶愩€嶆潻鏂挎礀 true閿涘苯鎯侀崚娆掔箲閸?false
 */
export function hasContextWindowOption(caps: ModelCapabilities, value: string): boolean {
  return caps.contextWindowOptions.some((option) => option.value === value);
}

/**
 * 閼惧嘲褰囬懗钘夊鐎电钖勬稉顓犳畱姒涙顓绘稉濠佺瑓閺傚洨鐛ラ崣锝夆偓澶愩€嶉崐? *
 * @param caps - 濡€崇€烽懗钘夊閹诲繗鍫€电钖? * @returns 姒涙顓婚惃鍕瑐娑撳鏋冪粣妤€褰涢柅澶愩€嶉崐纭风礉閺冪娀绮拋銈呪偓鍏兼鏉╂柨娲?null
 */
export function getDefaultContextWindow(caps: ModelCapabilities): string | null {
  return caps.contextWindowOptions.find((option) => option.isDefault)?.value ?? null;
}

/**
 * 鐟欙絾鐎界敮锔界垼缁涢箖鈧銆嶉惃鍕偓? *
 * @description
 * 娴犲酣鈧銆嶉崚妤勩€冩稉顓⌒掗弸鎰舶鐎规艾甯慨瀣偓鑲╂畱閺堝鏅ラ幀褋鈧倸顩ч弸婊冨斧婵鈧厧婀柅澶愩€嶉崚妤勩€冩稉顓炵摠閸︺劌鍨惄瀛樺复鏉╂柨娲栭敍? * 閸氾箑鍨潻鏂挎礀闁銆嶉崚妤勩€冩稉顓犳畱姒涙顓婚崐鍏煎灗缁楊兛绔存稉顏堚偓澶愩€嶉崐绗衡偓? *
 * @param options - 鐢附鐖ｇ粵鍓ф畱闁銆嶉弫鎵矋閿涘本鐦℃い鐟板瘶閸?value 閸滃苯褰查柅澶屾畱 isDefault
 * @param rawValue - 閸樼喎顫愭潏鎾冲弳閸? * @returns 鐟欙絾鐎介崥搴ｆ畱閺堝鏅ラ崐纭风礉闁銆嶉崚妤勩€冩稉铏光敄閺冩儼绻戦崶鐐插斧婵鈧》绱欐穱顔煎閸氬函绱? *
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
 * ); // 'high'閿涘牆娲栭柅鈧崚浼寸帛鐠併倕鈧》绱? * ```
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
 * 閹绘劒绶甸崯鍡涒偓澶愩€嶉柅澶嬪閸婅偐娈戞潏鎾冲弳缁鐎? *
 * @description
 * 閺€顖涘瘮娑撳顫掓潏鎾冲弳閺嶇厧绱￠敍? * - ProviderOptionSelection 閺佹壆绮嶉敍鍫㈢波閺嬪嫬瀵查柅澶嬪閸掓銆冮敍? * - Record<string, unknown> 鐎电钖勯敍鍫ユ暛閸婄厧顕弰鐘茬殸閿? * - null/undefined閿涘牊妫ら柅澶嬪閿? *
 * @private 濮濄倗琚崹瀣╄礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儰濞囬悽? */
type ProviderOptionSelectionsInput =
  | ReadonlyArray<ProviderOptionSelection>
  | Record<string, unknown>
  | null
  | undefined;

/**
 * 濞ｈ鲸瀚圭拹婵囧絹娓氭稑鏅㈤柅澶愩€嶉幓蹇氬牚缁? *
 * @description
 * 鐎佃寮挎潻鎵儊鏉╂稖顢戝ǎ杈ㄥ鐠愭繐绱濈涵顔荤箽娣囶喗鏁兼稉宥勭窗瑜板崬鎼烽崢鐔奉潗閺佺増宓侀妴? * 鐎甸€涚艾 "select" 缁鐎烽惃鍕伎鏉╂壆顑侀敍宀勵杺婢舵牗瀚圭拹?options 閺佹壆绮嶉崪?promptInjectedValues 閺佹壆绮嶉妴? *
 * @param descriptor - 閸樼喎顫愰幓蹇氬牚缁? * @returns 濞ｈ鲸瀚圭拹婵嗘倵閻ㄥ嫭寮挎潻鎵儊
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
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
 * 娴犲酣鈧銆嶉柅澶嬪閸婇棿鑵戦幓鎰絿閹稿洤鐣?ID 閻ㄥ嫬鈧? *
 * @description
 * 閺€顖涘瘮閺佹壆绮嶉崪灞筋嚠鐠炩€茶⒈缁夊秷绶崗銉︾壐瀵骏绱濋幓鎰絿閹稿洤鐣?ID 鐎电懓绨查惃鍕偓澶嬪閸婄鈧? * 閺佹澘鈧偐琚崹瀣╃窗閼奉亜濮╂潪顒佸床娑撳搫鐡х粭锔胯閵? *
 * @param selections - 闁銆嶉柅澶嬪閸婅壈绶崗? * @param id - 闁銆?ID
 * @returns 閹绘劕褰囬崚鎵畱閸婄》绱檚tring 閹?boolean閿涘绱濋張顏呭閸掓媽绻戦崶?undefined
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
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
 * 閼惧嘲褰囬幓鎰返閸熷棝鈧銆嶉惃鍕偓澶嬪閸婄》绱檚tring 閹?boolean閿? *
 * @param selections - 闁銆嶉柅澶嬪閸婅壈绶崗? * @param id - 闁銆?ID
 * @returns 閹绘劕褰囬崚鎵畱閸婄》绱濋張顏呭閸掓媽绻戦崶?undefined
 */
export function getProviderOptionSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | boolean | undefined {
  return providerOptionSelectionValue(selections, id);
}

/**
 * 閼惧嘲褰囬幓鎰返閸熷棝鈧銆嶉惃鍕摟缁楋缚瑕嗙猾璇茬€烽柅澶嬪閸? *
 * @param selections - 闁銆嶉柅澶嬪閸婅壈绶崗? * @param id - 闁銆?ID
 * @returns 鐎涙顑佹稉鑼閸ㄥ娈戦柅澶嬪閸婄》绱濋棃鐐茬摟缁楋缚瑕嗛幋鏍ㄦ弓閹垫儳鍩屾潻鏂挎礀 undefined
 */
export function getProviderOptionStringSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | undefined {
  const value = getProviderOptionSelectionValue(selections, id);
  return typeof value === "string" ? value : undefined;
}

/**
 * 閼惧嘲褰囬幓鎰返閸熷棝鈧銆嶉惃鍕鐏忔梻琚崹瀣偓澶嬪閸? *
 * @param selections - 闁銆嶉柅澶嬪閸婅壈绶崗? * @param id - 闁銆?ID
 * @returns 鐢啫鐨电猾璇茬€烽惃鍕偓澶嬪閸婄》绱濋棃鐐茬鐏忔梹鍨ㄩ張顏呭閸掓媽绻戦崶?undefined
 */
export function getProviderOptionBooleanSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): boolean | undefined {
  const value = getProviderOptionSelectionValue(selections, id);
  return typeof value === "boolean" ? value : undefined;
}

/**
 * 閼惧嘲褰囧Ο鈥崇€烽柅澶嬪娑擃厽瀵氱€?ID 閻ㄥ嫰鈧銆嶉崐? *
 * @description
 * 娴?ModelSelection 鐎电钖勯惃?options 鐎涙顔屾稉顓熷絹閸欐牗瀵氱€?ID 閻ㄥ嫬鈧鈧? * 閺?`getProviderOptionSelectionValue` 閻ㄥ嫪绌堕幑宄扮殱鐟佸懌鈧? *
 * @param modelSelection - 濡€崇€烽柅澶嬪鐎电钖? * @param id - 闁銆?ID
 * @returns 閹绘劕褰囬崚鎵畱閸婄》绱濋張顏呭閸掓媽绻戦崶?undefined
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
 * 閼惧嘲褰囧Ο鈥崇€烽柅澶嬪娑擃厽瀵氱€?ID 閻ㄥ嫬鐡х粭锔胯缁鐎烽柅澶愩€嶉崐? *
 * @param modelSelection - 濡€崇€烽柅澶嬪鐎电钖? * @param id - 闁銆?ID
 * @returns 鐎涙顑佹稉鑼閸ㄥ娈戦柅澶愩€嶉崐纭风礉閺堫亝澹橀崚鎷岀箲閸?undefined
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
 * 閼惧嘲褰囧Ο鈥崇€烽柅澶嬪娑擃厽瀵氱€?ID 閻ㄥ嫬绔风亸鏃傝閸ㄥ鈧銆嶉崐? *
 * @param modelSelection - 濡€崇€烽柅澶嬪鐎电钖? * @param id - 闁銆?ID
 * @returns 鐢啫鐨电猾璇茬€烽惃鍕偓澶愩€嶉崐纭风礉閺堫亝澹橀崚鎷岀箲閸?undefined
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
 * 鐟欙絾鐎介柅澶嬪缁鐎烽幓蹇氬牚缁楋妇娈戣ぐ鎾冲閸? *
 * @description
 * 婵″倹鐏夐崢鐔奉潗閸婄厧婀柅澶愩€嶉崚妤勩€冩稉顓炵摠閸︺劌鍨惄瀛樺复鏉╂柨娲栭敍? * 閸氾箑鍨担璺ㄦ暏閹诲繗鍫粭锔炬畱 currentValue 閹存牠鈧銆嶉崚妤勩€冩稉顓犳畱姒涙顓婚崐绗衡偓? *
 * @param descriptor - 闁瀚ㄧ猾璇茬€烽惃鍕伎鏉╂壆顑? * @param rawValue - 閸樼喎顫愭潏鎾冲弳閸? * @returns 鐟欙絾鐎介崥搴ｆ畱闁銆?ID閿涘本妫ゅ▔鏇犫€樼€规俺绻戦崶?undefined
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
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
 * 娑撶儤寮挎潻鎵儊鐠佸墽鐤嗚ぐ鎾冲閸? *
 * @description
 * 閺嶈宓侀幓蹇氬牚缁楋妇琚崹瀣嫲閸樼喎顫愰崐纭风礉鐠佸墽鐤嗛幓蹇氬牚缁楋妇娈?currentValue 鐎涙顔岄敍? * - 鐢啫鐨电猾璇茬€烽敍姘辨纯閹恒儴顔曠純顔肩鐏忔柨鈧? * - 闁瀚ㄧ猾璇茬€烽敍姘▏閻?`resolveDescriptorChoiceValue` 鐟欙絾鐎介張澶嬫櫏閸? * - 閺冪姵纭剁涵顔肩暰閸婂吋妞傜粔濠氭珟 currentValue 鐎涙顔? *
 * @param descriptor - 閸樼喎顫愰幓蹇氬牚缁? * @param rawValue - 閸樼喎顫愭潏鎾冲弳閸? * @returns 閺囧瓨鏌婃禍?currentValue 閻ㄥ嫭寮挎潻鎵儊
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
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
 * 閼惧嘲褰囬幒銊ф倞閸旑亜濮忕痪褍鍩嗛幓蹇氬牚缁楋妇娈戦柅澶愩€?ID
 *
 * @description
 * 閺嶈宓侀幓鎰返閸熷棛琚崹瀣嫲閼宠棄濮忕€电钖勯敍宀€鈥樼€规碍甯归悶鍡楀Й閸旀稓楠囬崚顐︹偓澶愩€嶉惃?ID 閸氬秶袨閿? * - claudeAgent: "effort"
 * - kilo/opencode: "variant"
 * - gemini: 閺嶈宓?effort 閸婂吋鐗稿蹇撳灲閺傤厺璐?"thinkingBudget" 閹?"thinkingLevel"
 * - pi: "thinkingLevel"
 * - 閸忔湹绮? "reasoningEffort"
 *
 * @param provider - 閹绘劒绶甸崯鍡欒閸? * @param caps - 濡€崇€烽懗钘夊閹诲繗鍫€电钖? * @returns 閹恒劎鎮婇崝顏勫缁狙冨焼闁銆嶉惃?ID
 *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
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
 * 娴犲氦鍏橀崝娑橆嚠鐠炩剝鐎鐑樻＋閻楀牓鈧銆嶉幓蹇氬牚缁楋箑鍨悰? *
 * @description
 * 瑜版挻膩閸ㄥ鍏橀崝娑橆嚠鐠炩剝婀幓鎰返 `optionDescriptors` 閺冭绱濇担璺ㄦ暏濮濄倕鍤遍弫棰佺矤閼宠棄濮忕€涙顔? * 閺嬪嫬缂撻崗鐓庮啇閻ㄥ嫭妫悧鍫熷伎鏉╂壆顑侀崚妤勩€冮妴鍌氬瘶閹奉剚甯归悶鍡楀Й閸旀稓楠囬崚顐犫偓浣风瑐娑撳鏋冪粣妤€褰涢妴? * 韫囶偊鈧喐膩瀵繐鎷伴幀婵堟樊閸掑洦宕茬粵澶愨偓澶愩€嶉妴? *
 * @param provider - 閹绘劒绶甸崯鍡欒閸? * @param caps - 濡€崇€烽懗钘夊閹诲繗鍫€电钖? * @returns 閺冄呭閺嶇厧绱￠惃鍕偓澶愩€嶉幓蹇氬牚缁楋附鏆熺紒? *
 * @private 濮濄倕鍤遍弫棰佽礋閸愬懘鍎寸€圭偟骞囩紒鍡氬Ν閿涘奔绗夋惔鏃傛纯閹恒儴鐨熼悽? */
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
 * 閼惧嘲褰囬幓鎰返閸熷棛娈戦柅澶愩€嶉幓蹇氬牚缁楋箑鍨悰? *
 * @description
 * 鏉╂柨娲栭幐鍥х暰閹绘劒绶甸崯鍡楁嫲濡€崇€烽懗钘夊閻ㄥ嫰鈧銆嶉幓蹇氬牚缁楋箑鍨悰銊ｂ偓? * 娴兼ê鍘涙担璺ㄦ暏閼宠棄濮忕€电钖勬稉顓犳畱 `optionDescriptors`閿涘牊鏌婇悧鍫熺壐瀵骏绱氶敍? * 閸氾箑鍨担璺ㄦ暏 `legacyCapabilityDescriptors`閿涘牊妫悧鍫熺壐瀵骏绱氶弸鍕紦閵? * 濮ｅ繋閲滈幓蹇氬牚缁楋缚绱伴弽瑙勫祦娴肩姴鍙嗛惃鍕偓澶嬪閸婂吋娲块弬?currentValue閵? *
 * @param input.provider - 閹绘劒绶甸崯鍡欒閸? * @param input.caps - 濡€崇€烽懗钘夊閹诲繗鍫€电钖? * @param input.selections - 閸欘垶鈧娈戦柅澶愩€嶉柅澶嬪閸婄》绱濋悽銊ょ艾鐠佸墽鐤嗛幓蹇氬牚缁楋妇娈戣ぐ鎾冲閸? * @returns 闁銆嶉幓蹇氬牚缁楋附鏆熺紒? *
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
 * 閼惧嘲褰囬幓鎰返閸熷棝鈧銆嶉幓蹇氬牚缁楋妇娈戣ぐ鎾冲閸? *
 * @description
 * 娴犲孩寮挎潻鎵儊娑擃厽褰侀崣鏍х秼閸撳秹鈧鑵戦惃鍕偓纭风窗
 * - 鐢啫鐨电猾璇茬€烽敍姘辨纯閹恒儴绻戦崶?currentValue
 * - 闁瀚ㄧ猾璇茬€烽敍姘崇箲閸?currentValue 閹存牠绮拋銈夆偓澶愩€嶉惃?ID
 *
 * @param descriptor - 闁銆嶉幓蹇氬牚缁? * @returns 瑜版挸澧犻崐纭风礉閹诲繗鍫粭锔胯礋缁岀儤妞傛潻鏂挎礀 undefined
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
 * 閼惧嘲褰囬幓鎰返閸熷棝鈧銆嶉幓蹇氬牚缁楋妇娈戣ぐ鎾冲閺勫墽銇氶弽鍥╊劮
 *
 * @description
 * 娴犲孩寮挎潻鎵儊娑擃厽褰侀崣鏍х秼閸撳秹鈧鑵戦崐鑲╂畱閺勫墽銇氶弽鍥╊劮閿? * - 鐢啫鐨电猾璇茬€烽敍姘崇箲閸?"On" 閹?"Off"
 * - 闁瀚ㄧ猾璇茬€烽敍姘崇箲閸ョ偛缍嬮崜宥夆偓澶愩€嶉惃?label
 *
 * @param descriptor - 闁銆嶉幓蹇氬牚缁? * @returns 瑜版挸澧犻崐鑲╂畱閺勫墽銇氶弽鍥╊劮閿涘本妫ゅ▔鏇犫€樼€规俺绻戦崶?undefined
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
 * 娴犲酣鈧銆嶉幓蹇氬牚缁楋箑鍨悰銊︾€娲偓澶嬪閸婂吋鏆熺紒? *
 * @description
 * 闁秴宸婚幓蹇氬牚缁楋箑鍨悰顭掔礉閹绘劕褰囧В蹇庨嚋閹诲繗鍫粭锔炬畱瑜版挸澧犻崐纭风礉閺嬪嫬缂?ProviderOptionSelection 閺佹壆绮嶉妴? * 娴犲懎瀵橀崥?string 閹?boolean 缁鐎烽惃鍕偓绗衡偓? *
 * @param descriptors - 闁銆嶉幓蹇氬牚缁楋附鏆熺紒? * @returns 闁瀚ㄩ崐鍏兼殶缂佸嫸绱濋幓蹇氬牚缁楋箑鍨悰銊よ礋缁岀儤妞傛潻鏂挎礀 undefined
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

// 閳光偓閳光偓 閺佺増宓佹す鍗炲З閻ㄥ嫭膩閸ㄥ鍏橀崝娑溞掗弸?閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓閳光偓

/**
 * 閼惧嘲褰囬幐鍥х暰閹绘劒绶甸崯鍡楁嫲濡€崇€烽惃鍕厴閸旀稒寮挎潻? *
 * @description
 * 娴犲骸鍙忕仦鈧懗钘夊缁便垹绱╂稉顓熺叀閹电偓膩閸ㄥ娈戦懗钘夊閹诲繗鍫妴鍌氼嚠娴?Gemini 閹绘劒绶甸崯鍡礉
 * 妫版繂顦婚弨顖涘瘮閸╄桨绨Ο鈥崇€?ID 閻ㄥ嫮閮撮崚妤勭槕閸掝偁鈧倹婀幍鎯у煂閺冩儼绻戦崶鐐碘敄閼宠棄濮忕€电钖勯妴? *
 * @param provider - 閹绘劒绶甸崯鍡欒閸? * @param model - 濡€崇€?ID 閹?Slug
 * @returns 濡€崇€烽懗钘夊閹诲繗鍫€电钖? *
 * @example
 * ```ts
 * getModelCapabilities('claudeAgent', 'claude-sonnet-4-20250514');
 * // 鏉╂柨娲栫拠銉δ侀崹瀣畱閼宠棄濮忛幓蹇氬牚
 *
 * getModelCapabilities('codex', 'unknown-model');
 * // 鏉╂柨娲?EMPTY_MODEL_CAPABILITIES
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
 * 閸掋倖鏌囬弬鍥ㄦ拱娑擃厽妲搁崥锕€瀵橀崥?Claude Ultrathink 閹绘劗銇氱拠? *
 * @description
 * 濡偓閺屻儲鏋冮張顑胯厬閺勵垰鎯侀崠鍛儓 "ultrathink" 閸忔娊鏁€涙绱欐稉宥呭隘閸掑棗銇囩亸蹇撳晸閿涘绱? * 閻劋绨崚銈嗘焽閺勵垰鎯侀棁鈧憰浣疯礋 Claude 濡€崇€峰ǎ璇插 Ultrathink 閸撳秶绱戦妴? *
 * @param text - 瀵板懏顥呴弻銉ф畱閺傚洦婀? * @returns 婵″倹鐏夐崠鍛儓 ultrathink 閸忔娊鏁€涙绻戦崶?true閿涘苯鎯侀崚娆掔箲閸?false
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
 * 瑜版帊绔撮崠鏍侀崹?Slug
 *
 * @description
 * 鐏忓棙膩閸?ID 鏉烆剚宕叉稉鐑樼垼閸戝棗瀵查惃?Slug 閺嶇厧绱￠敍? * 1. 閸樺娅庢＃鏍х啲缁岃櫣娅? * 2. 鐎甸€涚艾 claudeAgent 閹绘劒绶甸崯鍡礉缁夊娅庨張顐㈢啲閻ㄥ嫭鏌熼幏顒€褰块弽鍥唶閿涘牆顩?`[1m]`閿? * 3. 閺屻儲澹橀崚顐㈡倳閺勭姴鐨犵悰顭掔礉鐏忓棗鍩嗛崥宥堟祮閹诡澀璐熼弽鍥у櫙 Slug
 * 4. 閺冪姴鍩嗛崥宥嗘閻╁瓨甯存担璺ㄦ暏婢跺嫮鎮婇崥搴ｆ畱鐎涙顑佹稉韫稊娑?Slug
 *
 * @param model - 閸樼喎顫愬Ο鈥崇€?ID 鐎涙顑佹稉? * @param provider - 閹绘劒绶甸崯鍡欒閸ㄥ绱濇妯款吇娑?"codex"
 * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫭膩閸?Slug閿涘矁绶崗銉よ礋缁岀儤妞傛潻鏂挎礀 null
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
 * 娴犲酣鈧銆嶉崚妤勩€冩稉顓⌒掗弸鎰讲闁瀚ㄩ惃鍕侀崹?Slug
 *
 * @description
 * 閹稿浜掓稉瀣╃喘閸忓牏楠囩憴锝嗙€藉Ο鈥崇€?Slug閿? * 1. 缁墽鈥橀崠褰掑帳闁銆嶉惃?slug
 * 2. 娑撳秴灏崚鍡椼亣鐏忓繐鍟撻崠褰掑帳闁銆嶉惃?name
 * 3. 瑜版帊绔撮崠鏍ф倵閸栧綊鍘ら柅澶愩€嶉惃?slug
 *
 * @param provider - 閹绘劒绶甸崯鍡欒閸? * @param value - 閻劍鍩涙潏鎾冲弳閻ㄥ嫭膩閸ㄥ鐖ｇ拠鍡礄Slug 閹存牕鎮曠粔甯礆
 * @param options - 閸欘垶鈧瀚ㄩ惃鍕侀崹瀣偓澶愩€嶉崚妤勩€? * @returns 閸栧綊鍘ら崚鎵畱濡€崇€?Slug閿涘本婀崠褰掑帳鏉╂柨娲?null
 *
 * @example
 * ```ts
 * resolveSelectableModel('codex', 'gpt-4', options);     // 'gpt-4'
 * resolveSelectableModel('codex', 'GPT-4', options);     // 'gpt-4'閿涘牊瀵滈崥宥囆為崠褰掑帳閿? * resolveSelectableModel('codex', 'invalid', options);   // null
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
 * 鐟欙絾鐎藉Ο鈥崇€?Slug閿涘瞼鈥樻穱婵婄箲閸ョ偞婀侀弫鍫㈡畱濡€崇€烽弽鍥槕
 *
 * @description
 * 瑜版帊绔撮崠鏍侀崹?ID 楠炲爼鐛欑拠浣稿従閺勵垰鎯佺仦鐐扮艾閹稿洤鐣鹃幓鎰返閸熷棛娈戝鑼叀濡€崇€烽妴? * 婵″倹鐏夎ぐ鎺嶇閸栨牕鎮楅惃?Slug 娑撳秴婀幓鎰返閸熷棛娈戝Ο鈥崇€烽梿鍡楁値娑擃叏绱濋崚娆忔礀闁偓閸掓媽顕氶幓鎰返閸熷棛娈戞妯款吇濡€崇€烽妴? * "pi" 閹绘劒绶甸崯鍡樼梾閺堝绮拋銈喣侀崹瀣剁礉閺堫亞鐓?Slug 閺冩儼绻戦崶鐐茬秺娑撯偓閸栨牕鎮楅惃鍕偓绗衡偓? *
 * @param model - 閸樼喎顫愬Ο鈥崇€?ID 鐎涙顑佹稉? * @param provider - 閹绘劒绶甸崯鍡欒閸ㄥ绱濇妯款吇娑?"codex"
 * @returns 閺堝鏅ラ惃鍕侀崹?Slug閿涘矁绶崗銉よ礋缁岀儤妞傛潻鏂挎礀閹绘劒绶甸崯鍡欐畱姒涙顓诲Ο鈥崇€? *
 * @example
 * ```ts
 * resolveModelSlug('gpt-4', 'codex');     // 'gpt-4'
 * resolveModelSlug('invalid', 'codex');    // 'o3'閿涘牆娲栭柅鈧崚浼寸帛鐠併倖膩閸ㄥ绱? * resolveModelSlug(null, 'codex');         // 'o3'閿涘牓绮拋銈喣侀崹瀣剁礆
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
 * 鐟欙絾鐎介幐鍥х暰閹绘劒绶甸崯鍡欐畱濡€崇€?Slug
 *
 * @description
 * 閺?`resolveModelSlug` 閻ㄥ嫬寮弫浼淬€庢惔蹇氱殶閺佸澧楅張顒婄礉娓氬じ绨禒銉﹀絹娓氭稑鏅㈡稉铏诡儑娑撯偓閸欏倹鏆熺拫鍐暏閵? *
 * @param provider - 閹绘劒绶甸崯鍡欒閸? * @param model - 閸樼喎顫愬Ο鈥崇€?ID 鐎涙顑佹稉? * @returns 閺堝鏅ラ惃鍕侀崹?Slug
 *
 * @see {@link resolveModelSlug} - 閺嶇绺剧憴锝嗙€介柅鏄忕帆
 */
export function resolveModelSlugForProvider(
  provider: ProviderKind,
  model: string | null | undefined,
): ModelSlug | null {
  return resolveModelSlug(model, provider);
}

/**
 * 娣囶喖澹€鐎涙顑佹稉璇х礉缁屽搫鈧壈绻戦崶?null
 *
 * @description
 * 鐏忓棗鐡х粭锔胯閸樺娅庢＃鏍х啲缁岃櫣娅ч敍灞筋洤閺嬫粎绮ㄩ弸婊€璐熺粚鍝勭摟缁楋缚瑕嗛崚娆掔箲閸?null閵? * 闂?string 缁鐎烽惃鍕翻閸忋儳娲块幒銉ㄧ箲閸?null閵? *
 * @template T - 鐎涙顑佹稉鎻掔摟闂堛垽鍣虹猾璇茬€? * @param value - 瀵板懍鎱ㄩ崜顏嗘畱閸? * @returns 娣囶喖澹€閸氬海娈戦棃鐐碘敄鐎涙顑佹稉璇х礉閹?null
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
 * 瑜版帊绔撮崠?Codex 濡€崇€烽柅澶愩€? *
 * @description
 * 鐏?Codex 濡€崇€烽柅澶愩€嶈ぐ鎺嶇閸栨牔璐熸禒鍛瘶閸氼偂绗屾妯款吇閸婇棿绗夐崥宀€娈戠€涙顔岄敍? * - reasoningEffort閿涙矮绮庤ぐ鎾茬瑢姒涙顓婚崐闂寸瑝閸氬本妞傛穱婵堟殌
 * - fastMode閿涙矮绮庤ぐ鎾茶礋 true 閺冩湹绻氶悾? *
 * @param model - 濡€崇€?ID 鐎涙顑佹稉? * @param modelOptions - 閸樼喎顫?Codex 濡€崇€烽柅澶愩€? * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫭膩閸ㄥ鈧銆嶉敍灞惧閺堝鐡у▓鍏哥瑢姒涙顓婚崐鑲╂祲閸氬本妞傛潻鏂挎礀 undefined
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
 * 瑜版帊绔撮崠?Claude 濡€崇€烽柅澶愩€? *
 * @description
 * 鐏?Claude 濡€崇€烽柅澶愩€嶈ぐ鎺嶇閸栨牔璐熸禒鍛瘶閸氼偂绗屾妯款吇閸婇棿绗夐崥宀€娈戠€涙顔岄敍? * - effort閿涙碍甯撻梽銈嗗絹缁€鐑樻暈閸忋儳娈戠痪褍鍩嗛崪宀勭帛鐠併倗楠囬崚? * - contextWindow閿涙矮绮庤ぐ鎾茬瑢姒涙顓婚崐闂寸瑝閸氬奔绗栭張澶嬫櫏閺冩湹绻氶悾? * - thinking閿涙矮绮庤ぐ鎾茶礋 false 閺冩湹绻氶悾娆欑礄閸忔娊妫撮幀婵堟樊閿? * - fastMode閿涙矮绮庤ぐ鎾茶礋 true 閺冩湹绻氶悾? *
 * @param model - 濡€崇€?ID 鐎涙顑佹稉? * @param modelOptions - 閸樼喎顫?Claude 濡€崇€烽柅澶愩€? * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫭膩閸ㄥ鈧銆嶉敍灞惧閺堝鐡у▓鍏哥瑢姒涙顓婚崐鑲╂祲閸氬本妞傛潻鏂挎礀 undefined
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
 * 鐟欙絾鐎?API 鐠嬪啰鏁ゆ担璺ㄦ暏閻ㄥ嫭膩閸?ID
 *
 * @description
 * 閺嶈宓佸Ο鈥崇€烽柅澶嬪娣団剝浼呴悽鐔稿灇閺堚偓缂佸牏鏁ゆ禍?API 鐠嬪啰鏁ら惃鍕侀崹?ID閵? * 鐎甸€涚艾 Claude 閹绘劒绶甸崯鍡礉婵″倹鐏夐柅澶嬪娴?1M 娑撳﹣绗呴弬鍥╃崶閸欙綇绱濇导姘躬濡€崇€?ID 閸氬氦鎷烽崝?`[1m]` 閺嶅洩顔囬妴? * 閸忔湹绮幓鎰返閸熷棛娲块幒銉ㄧ箲閸ョ偛甯慨瀣侀崹?ID閵? *
 * @param modelSelection - 濡€崇€烽柅澶嬪鐎电钖? * @returns 閻劋绨?API 鐠嬪啰鏁ら惃鍕侀崹?ID 鐎涙顑佹稉? *
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
 * 瑜版帊绔撮崠?Gemini 濡€崇€烽柅澶愩€? *
 * @description
 * 鐏?Gemini 濡€崇€烽柅澶愩€嶈ぐ鎺嶇閸栨牭绱濇禒鍛箽閻ｆ瑤绗屾妯款吇閸婇棿绗夐崥宀€娈戦幀婵堟樊闁板秶鐤嗛妴? * 婵″倹鐏夐幀婵堟樊闁板秶鐤嗛崐闂寸瑢姒涙顓婚崐鑲╂祲閸氬矉绱濇潻鏂挎礀 undefined閵? *
 * @param model - 濡€崇€?ID 鐎涙顑佹稉? * @param modelOptions - 閸樼喎顫?Gemini 濡€崇€烽柅澶愩€? * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫭膩閸ㄥ鈧銆嶉敍灞肩瑢姒涙顓婚崐鑲╂祲閸氬本妞傛潻鏂挎礀 undefined
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
 * 瑜版帊绔撮崠?Grok 濡€崇€烽柅澶愩€? *
 * @description
 * 鐏?Grok 濡€崇€烽柅澶愩€嶈ぐ鎺嶇閸栨牭绱濇禒鍛箽閻ｆ瑤绗屾妯款吇閸婇棿绗夐崥宀€娈戦幒銊ф倞閸旑亜濮忕痪褍鍩嗛妴? *
 * @param model - 濡€崇€?ID 鐎涙顑佹稉? * @param modelOptions - 閸樼喎顫?Grok 濡€崇€烽柅澶愩€? * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫭膩閸ㄥ鈧銆嶉敍灞肩瑢姒涙顓婚崐鑲╂祲閸氬本妞傛潻鏂挎礀 undefined
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
 * 瑜版帊绔撮崠?Pi 濡€崇€烽柅澶愩€? *
 * @description
 * 鐏?Pi 濡€崇€烽柅澶愩€嶈ぐ鎺嶇閸栨牭绱濇禒鍛箽閻ｆ瑦婀侀弫鍫㈡畱閹繄娣痪褍鍩嗛妴? *
 * @param modelOptions - 閸樼喎顫?Pi 濡€崇€烽柅澶愩€? * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫭膩閸ㄥ鈧銆嶉敍灞炬￥閺佸牆鈧吋妞傛潻鏂挎礀 undefined
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
 * 瑜版帊绔撮崠?OpenCode 濡€崇€烽柅澶愩€? *
 * @description
 * 鐏?OpenCode 濡€崇€烽柅澶愩€嶈ぐ鎺嶇閸栨牭绱濇禒鍛箽閻ｆ瑩娼粚铏规畱 variant 閸?agent 鐎涙顔岄妴? *
 * @param modelOptions - 閸樼喎顫?OpenCode 濡€崇€烽柅澶愩€? * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫭膩閸ㄥ鈧銆嶉敍灞炬￥閺堝鏅ョ€涙顔岄弮鎯扮箲閸?undefined
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
 * 瑜版帊绔撮崠?Cursor 濡€崇€烽柅澶愩€? *
 * @description
 * 鐏?Cursor 濡€崇€烽柅澶愩€嶈ぐ鎺嶇閸栨牭绱濇禒鍛箽閻ｆ瑩娼粚铏规畱鐎涙顔岄妴? *
 * @param modelOptions - 閸樼喎顫?Cursor 濡€崇€烽柅澶愩€? * @returns 瑜版帊绔撮崠鏍ф倵閻ㄥ嫭膩閸ㄥ鈧銆嶉敍灞炬￥閺堝鏅ョ€涙顔岄弮鎯扮箲閸?undefined
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
 * 娑?Claude 閹绘劗銇氱拠宥嗗潑閸?Ultrathink 閸撳秶绱? *
 * @description
 * 瑜版挻甯归悶鍡楀Й閸旀稓楠囬崚顐¤礋 "ultrathink" 閺冭绱濋崷銊﹀絹缁€楦跨槤閸撳秵鍧婇崝?"Ultrathink:" 閸撳秶绱戦妴? * 婵″倹鐏夐幓鎰仛鐠囧秴鍑℃禒?"Ultrathink:" 瀵偓婢惰揪绱濋崚娆庣瑝闁插秴顦插ǎ璇插閵? * 闂?ultrathink 缁狙冨焼閹存牜鈹栭幓鎰仛鐠囧秳绗夐崑姘崲娴ｆ洖顦╅悶鍡愨偓? *
 * @param text - 閸樼喎顫愰幓鎰仛鐠囧秵鏋冮張? * @param effort - Claude 閹恒劎鎮婇崝顏勫缁狙冨焼
 * @returns 婢跺嫮鎮婇崥搴ｆ畱閹绘劗銇氱拠宥嗘瀮閺? *
 * @example
 * ```ts
 * applyClaudePromptEffortPrefix('鐠囧嘲鍨庨弸鎰箹濞堝吀鍞惍?, 'ultrathink');
 * // 'Ultrathink:\n鐠囧嘲鍨庨弸鎰箹濞堝吀鍞惍?
 *
 * applyClaudePromptEffortPrefix('鐠囧嘲鍨庨弸鎰箹濞堝吀鍞惍?, 'high');
 * // '鐠囧嘲鍨庨弸鎰箹濞堝吀鍞惍?閿涘牓娼?ultrathink 缁狙冨焼娑撳秴顦╅悶鍡礆
 *
 * applyClaudePromptEffortPrefix('Ultrathink:\n鐠囧嘲鍨庨弸?, 'ultrathink');
 * // 'Ultrathink:\n鐠囧嘲鍨庨弸?閿涘牆鍑￠張澶婂缂傗偓娑撳秹鍣告径宥嗗潑閸旂媴绱? * ```
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
