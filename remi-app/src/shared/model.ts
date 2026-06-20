/**
 * @file 模型配置与选择管理模块
 *
 * @description
 * 提供 AI 模型选项查询、能力解析、模型参数归一化、显示名称格式化等核心功能�? * 支持多种 AI 服务提供商（Claude、Codex、Cursor、Gemini、Grok、Pi、OpenCode、Kilo），
 * 并为每种提供商提供统一的模型选择与能力描述接口�? *
 * 核心功能�? * - 模型选项与默认模型查�? * - 模型能力（Capabilities）解析与查询
 * - Gemini 思维配置（budget/level）解�? * - 模型 Slug 归一化与解析
 * - 各提供商模型选项归一�? * - 提供商选项描述符构�? * - Claude Ultrathink 提示词前缀处理
 *
 * @module model
 * @layer 共享工具�? */
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
 * 按服务提供商索引的模�?Slug 集合
 *
 * @description
 * �?`MODEL_OPTIONS_BY_PROVIDER` 构建的按提供商分组的 Slug Set 集合�? * 用于 O(1) 时间复杂度判断某个模�?Slug 是否属于指定提供商，
 * 避免遍历数组进行查找�? *
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
 * 可选择的模型选项
 *
 * @description
 * 用于 UI 下拉列表中展示的模型选项，包含标识符和显示名称�? * �?`getModelOptions` 返回的选项列表中的每个元素类型�? *
 * @interface SelectableModelOption
 *
 * @property {string} slug - 模型唯一标识符（Slug），用于 API 调用和内部引�? * @property {string} name - 模型显示名称，用�?UI 展示
 *
 * @example
 * ```ts
 * const option: SelectableModelOption = { slug: 'gpt-4', name: 'GPT-4' };
 * ```
 */
export interface SelectableModelOption {
  /** 模型唯一标识符（Slug�?*/
  slug: string;
  /** 模型显示名称，用�?UI 展示 */
  name: string;
}

/**
 * Gemini 思维配置类型
 *
 * @description
 * 标识 Gemini 模型使用的思维配置方式�? * - `"budget"` 表示基于 Token 预算配置（适用�?Gemini 2.5 系列�? * - `"level"` 表示基于级别配置（适用�?Gemini 3 系列�? *
 * @type {GeminiThinkingConfigKind}
 *
 * @example
 * ```ts
 * const kind: GeminiThinkingConfigKind = 'budget'; // Gemini 2.5
 * const kind: GeminiThinkingConfigKind = 'level';  // Gemini 3
 * ```
 */
export type GeminiThinkingConfigKind = "budget" | "level";

/** 匹配 Gemini 3 系列模型 ID 的正则表达式（如 gemini-3.0、auto-gemini-3 等） */
const GEMINI_3_MODEL_PATTERN = /^(?:auto-)?gemini-3(?:[.-]|$)/i;
/** 匹配 Gemini 2.5 系列模型 ID 的正则表达式（如 gemini-2.5-pro、auto-gemini-2.5 等） */
const GEMINI_2_5_MODEL_PATTERN = /^(?:auto-)?gemini-2\.5(?:[.-]|$)/i;
/** Gemini 思维级别合法值集�?*/
const GEMINI_THINKING_LEVEL_SET = new Set<GeminiThinkingLevel>(["LOW", "HIGH"]);
/** Pi 思维级别合法值集�?*/
const PI_THINKING_LEVEL_SET = new Set<PiThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);
/** Gemini 思维预算字符串到数值的映射�?*/
const GEMINI_THINKING_BUDGET_MAP = new Map<string, GeminiThinkingBudget>([
  ["-1", -1],
  ["0", 0],
  ["512", 512],
]);

/**
 * 空的模型能力对象
 *
 * @description
 * 所有能力字段均为默认�?空值，用作未知模型或无特殊能力模型的回退值�? * 当无法识别模型或模型无特殊能力配置时，使用此对象作为默认值�? *
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
 * Gemini 模型的默认能力对�? *
 * @description
 * 当前�?`EMPTY_MODEL_CAPABILITIES` 相同，用�?Gemini 模型无法识别系列时的回退�? *
 * @constant {ModelCapabilities}
 */
export const DEFAULT_GEMINI_MODEL_CAPABILITIES = EMPTY_MODEL_CAPABILITIES;

/**
 * Gemini 3 系列模型的能力描�? *
 * @description
 * 支持基于级别（HIGH/LOW）的思维配置，不支持快速模式和思维切换�? * 适用�?Gemini 3.0 及以上版本的模型�? *
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
 * Gemini 2.5 系列模型的能力描�? *
 * @description
 * 支持基于 Token 预算（Dynamic/-1�?12）的思维配置，不支持快速模式和思维切换�? * 适用�?Gemini 2.5 系列模型�? *
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
 * 类型守卫：判断值是否为 Gemini 思维级别
 *
 * @param value - 待检查的�? * @returns 如果值是合法�?GeminiThinkingLevel 返回 true
 *
 * @private 此函数为内部实现细节，不应直接调�? */
function isGeminiThinkingLevel(value: string): value is GeminiThinkingLevel {
  return GEMINI_THINKING_LEVEL_SET.has(value as GeminiThinkingLevel);
}

/**
 * 类型守卫：判断值是否为 Gemini 思维预算
 *
 * @param value - 待检查的�? * @returns 如果值是合法�?GeminiThinkingBudget 字符串返�?true
 *
 * @private 此函数为内部实现细节，不应直接调�? */
function isGeminiThinkingBudget(value: string): value is `${GeminiThinkingBudget}` {
  return GEMINI_THINKING_BUDGET_MAP.has(value);
}

/**
 * 清洗 Gemini 模型别名的片段，生成可用�?API 调用标识符的字符�? *
 * @description
 * 将模型名称转换为小写、移除非法字符、替换为连字符，
 * 生成适合作为 API 别名标识符的片段�? *
 * @param value - 原始模型名称字符�? * @returns 清洗后的别名片段，如果结果为空则返回 "model"
 *
 * @private 此函数为内部实现细节，不应直接调�? */
function sanitizeGeminiAliasSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "model";
}

/**
 * 获取指定提供商的模型选项列表
 *
 * @description
 * 返回指定提供商支持的所有模型选项，包�?slug �?name 等信息�? * 默认提供商为 "codex"�? *
 * @param provider - 提供商类型，默认�?"codex"
 * @returns 该提供商支持的模型选项数组
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
 * 判断指定提供商是否有默认模型
 *
 * @description
 * �?"pi" 之外的所有提供商都有默认模型�? *
 * @param provider - 提供商类�? * @returns 如果提供商有默认模型返回 true
 *
 * @private 此函数为内部实现细节，不应直接调�? */
function hasDefaultModel(provider: ProviderKind): provider is ProviderWithDefaultModel {
  return provider !== "pi";
}

/**
 * 获取指定提供商的默认模型 Slug
 *
 * @description
 * 返回指定提供商的默认模型标识符�?pi" 提供商没有默认模型，返回 null�? * 其他提供商返�?`DEFAULT_MODEL_BY_PROVIDER` 中配置的默认模型�? *
 * @param provider - 提供商类型，默认�?"codex"
 * @returns 默认模型�?Slug�?pi" 提供商返�?null
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
 * 获取 Gemini 模型的思维配置类型
 *
 * @description
 * 根据模型 ID 判断其使用的思维配置方式�? * - Gemini 3 系列返回 `"level"`（基于级别）
 * - Gemini 2.5 系列返回 `"budget"`（基�?Token 预算�? * - 其他模型返回 null
 *
 * @param model - 模型 ID 字符�? * @returns 思维配置类型，无法识别时返回 null
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
 * 获取 Gemini 模型的能力描�? *
 * @description
 * 根据模型 ID 返回对应�?Gemini 能力描述对象�? * 自动识别 Gemini 3（level 模式）和 Gemini 2.5（budget 模式）系列，
 * 无法识别时返回提供的回退能力对象�? *
 * @param modelId - 模型 ID 字符�? * @param fallbackCapabilities - 无法识别时的回退能力对象，默认为 `EMPTY_MODEL_CAPABILITIES`
 * @returns 匹配�?Gemini 模型能力描述
 *
 * @example
 * ```ts
 * geminiCapabilitiesForModel('gemini-3.0-pro');
 * // 返回 GEMINI_3_MODEL_CAPABILITIES
 *
 * geminiCapabilitiesForModel('gemini-2.5-flash');
 * // 返回 GEMINI_2_5_MODEL_CAPABILITIES
 *
 * geminiCapabilitiesForModel('unknown-model');
 * // 返回 EMPTY_MODEL_CAPABILITIES
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
 * 模型 Slug 到显示名称的映射�? *
 * @description
 * 从所有提供商的模型选项中构建的全局映射表，
 * 用于将模�?Slug 转换为人类可读的显示名称�? * 键为小写�?Slug，值为对应�?name�? *
 * @private 此常量为内部实现细节，不应直接使�? */
const MODEL_NAME_BY_SLUG = new Map(
  Object.values(MODEL_OPTIONS_BY_PROVIDER)
    .flat()
    .map((option) => [option.slug.toLowerCase(), option.name] as const),
);

/**
 * 将未知的 GPT 模型 Slug 转换为人类可读的名称
 *
 * @description
 * 专门处理�?"gpt-" 开头的模型 Slug，将其格式化�?"GPT-{version} {rest}" 的形式�? * �?"gpt-" 开头的 Slug 原样返回�? *
 * @param slug - 模型 Slug 字符�? * @returns 格式化后的显示名�? *
 * @private 此函数为内部实现细节，不应直接调�? *
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
 * 格式化模型显示名�? *
 * @description
 * 将模�?Slug 转换为人类可读的显示名称�? * 优先从全局映射表中查找已知模型的名称，
 * 未找到时使用 `humanizeUnknownModelSlug` 进行格式化�? *
 * @param model - 模型 Slug �?ID 字符�? * @returns 格式化后的显示名称，输入为空时返�?undefined
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
 * 获取 Gemini 模型的思维配置选中�? *
 * @description
 * 从模型选项中提取当前选中的思维配置值�? * 优先返回匹配能力列表中有效级别的值，其次返回任意非空值�? *
 * @param caps - 模型能力描述对象
 * @param modelOptions - Gemini 模型选项，可能包�?thinkingLevel �?thinkingBudget
 * @returns 匹配的思维配置值，未找到返�?null
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
 * 从思维配置值解�?Gemini 模型选项
 *
 * @description
 * 将字符串形式的思维配置值转换为结构化的 GeminiModelOptions 对象�? * 支持识别 level 格式（如 "HIGH"�?LOW"）和 budget 格式（如 "-1"�?512"）�? *
 * @param value - 思维配置值字符串
 * @returns 解析后的 GeminiModelOptions，无法识别返�?undefined
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
 * 获取 Gemini 模型的思维别名
 *
 * @description
 * 根据 Gemini 模型 ID 和模型选项，生成用�?API 调用的思维配置别名�? * 别名格式�?`remicode-gemini-{base}-thinking-{level|budget}-{value}`�? *
 * @param model - 模型 ID 字符�? * @param modelOptions - Gemini 模型选项
 * @returns 生成的思维别名，无法生成返�?null
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
 * 解析 Gemini API 的模�?ID
 *
 * @description
 * 如果模型有思维配置别名，则返回别名；否则返回原始模�?ID�? * 别名优先级高于原�?ID，确�?API 调用使用正确的思维配置�? *
 * @param model - 原始模型 ID 字符�? * @param modelOptions - Gemini 模型选项
 * @returns 最终用�?API 调用的模�?ID
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

// ── Effort 辅助函数 ────────────────────────────────────────────────────

/**
 * 检查能力对象中是否包含指定的推理努力级�? *
 * @param caps - 模型能力描述对象
 * @param value - 待检查的推理努力级别�? * @returns 如果能力对象中包含该级别返回 true，否则返�?false
 *
 * @example
 * ```ts
 * hasEffortLevel(caps, 'high'); // true �?false
 * ```
 */
export function hasEffortLevel(caps: ModelCapabilities, value: string): boolean {
  return caps.reasoningEffortLevels.some((l) => l.value === value);
}

/**
 * 获取能力对象中的默认推理努力级别�? *
 * @param caps - 模型能力描述对象
 * @returns 默认的推理努力级别值，无默认值时返回 null
 */
export function getDefaultEffort(caps: ModelCapabilities): string | null {
  return caps.reasoningEffortLevels.find((l) => l.isDefault)?.value ?? null;
}

/**
 * 检查能力对象中是否包含指定的上下文窗口选项
 *
 * @param caps - 模型能力描述对象
 * @param value - 待检查的上下文窗口选项�? * @returns 如果能力对象中包含该选项返回 true，否则返�?false
 */
export function hasContextWindowOption(caps: ModelCapabilities, value: string): boolean {
  return caps.contextWindowOptions.some((option) => option.value === value);
}

/**
 * 获取能力对象中的默认上下文窗口选项�? *
 * @param caps - 模型能力描述对象
 * @returns 默认的上下文窗口选项值，无默认值时返回 null
 */
export function getDefaultContextWindow(caps: ModelCapabilities): string | null {
  return caps.contextWindowOptions.find((option) => option.isDefault)?.value ?? null;
}

/**
 * 解析带标签选项的�? *
 * @description
 * 从选项列表中解析给定原始值的有效性。如果原始值在选项列表中存在则直接返回�? * 否则返回选项列表中的默认值或第一个选项值�? *
 * @param options - 带标签的选项数组，每项包�?value 和可选的 isDefault
 * @param rawValue - 原始输入�? * @returns 解析后的有效值，选项列表为空时返回原始值（修剪后）
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
 * ); // 'high'（回退到默认值）
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
 * 提供商选项选择值的输入类型
 *
 * @description
 * 支持三种输入格式�? * - ProviderOptionSelection 数组（结构化选择列表�? * - Record<string, unknown> 对象（键值对映射�? * - null/undefined（无选择�? *
 * @private 此类型为内部实现细节，不应直接使�? */
type ProviderOptionSelectionsInput =
  | ReadonlyArray<ProviderOptionSelection>
  | Record<string, unknown>
  | null
  | undefined;

/**
 * 深拷贝提供商选项描述�? *
 * @description
 * 对描述符进行深拷贝，确保修改不会影响原始数据�? * 对于 "select" 类型的描述符，额外拷�?options 数组�?promptInjectedValues 数组�? *
 * @param descriptor - 原始描述�? * @returns 深拷贝后的描述符
 *
 * @private 此函数为内部实现细节，不应直接调�? */
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
 * 从选项选择值中提取指定 ID 的�? *
 * @description
 * 支持数组和对象两种输入格式，提取指定 ID 对应的选择值�? * 数值类型会自动转换为字符串�? *
 * @param selections - 选项选择值输�? * @param id - 选项 ID
 * @returns 提取到的值（string �?boolean），未找到返�?undefined
 *
 * @private 此函数为内部实现细节，不应直接调�? */
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
 * 获取提供商选项的选择值（string �?boolean�? *
 * @param selections - 选项选择值输�? * @param id - 选项 ID
 * @returns 提取到的值，未找到返�?undefined
 */
export function getProviderOptionSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | boolean | undefined {
  return providerOptionSelectionValue(selections, id);
}

/**
 * 获取提供商选项的字符串类型选择�? *
 * @param selections - 选项选择值输�? * @param id - 选项 ID
 * @returns 字符串类型的选择值，非字符串或未找到返回 undefined
 */
export function getProviderOptionStringSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | undefined {
  const value = getProviderOptionSelectionValue(selections, id);
  return typeof value === "string" ? value : undefined;
}

/**
 * 获取提供商选项的布尔类型选择�? *
 * @param selections - 选项选择值输�? * @param id - 选项 ID
 * @returns 布尔类型的选择值，非布尔或未找到返�?undefined
 */
export function getProviderOptionBooleanSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): boolean | undefined {
  const value = getProviderOptionSelectionValue(selections, id);
  return typeof value === "boolean" ? value : undefined;
}

/**
 * 获取模型选择中指�?ID 的选项�? *
 * @description
 * �?ModelSelection 对象�?options 字段中提取指�?ID 的值�? * �?`getProviderOptionSelectionValue` 的便捷封装�? *
 * @param modelSelection - 模型选择对象
 * @param id - 选项 ID
 * @returns 提取到的值，未找到返�?undefined
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
 * 获取模型选择中指�?ID 的字符串类型选项�? *
 * @param modelSelection - 模型选择对象
 * @param id - 选项 ID
 * @returns 字符串类型的选项值，未找到返�?undefined
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
 * 获取模型选择中指�?ID 的布尔类型选项�? *
 * @param modelSelection - 模型选择对象
 * @param id - 选项 ID
 * @returns 布尔类型的选项值，未找到返�?undefined
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
 * 解析选择类型描述符的当前�? *
 * @description
 * 如果原始值在选项列表中存在则直接返回�? * 否则使用描述符的 currentValue 或选项列表中的默认值�? *
 * @param descriptor - 选择类型的描述符
 * @param rawValue - 原始输入�? * @returns 解析后的选项 ID，无法确定返�?undefined
 *
 * @private 此函数为内部实现细节，不应直接调�? */
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
 * 为描述符设置当前�? *
 * @description
 * 根据描述符类型和原始值，设置描述符的 currentValue 字段�? * - 布尔类型：直接设置布尔�? * - 选择类型：使�?`resolveDescriptorChoiceValue` 解析有效�? * - 无法确定值时移除 currentValue 字段
 *
 * @param descriptor - 原始描述�? * @param rawValue - 原始输入�? * @returns 更新�?currentValue 的描述符
 *
 * @private 此函数为内部实现细节，不应直接调�? */
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
 * 获取推理努力级别描述符的选项 ID
 *
 * @description
 * 根据提供商类型和能力对象，确定推理努力级别选项�?ID 名称�? * - claudeAgent: "effort"
 * - kilo/opencode: "variant"
 * - gemini: 根据 effort 值格式判断为 "thinkingBudget" �?"thinkingLevel"
 * - pi: "thinkingLevel"
 * - 其他: "reasoningEffort"
 *
 * @param provider - 提供商类�? * @param caps - 模型能力描述对象
 * @returns 推理努力级别选项�?ID
 *
 * @private 此函数为内部实现细节，不应直接调�? */
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
 * 从能力对象构建旧版选项描述符列�? *
 * @description
 * 当模型能力对象未提供 `optionDescriptors` 时，使用此函数从能力字段
 * 构建兼容的旧版描述符列表。包括推理努力级别、上下文窗口�? * 快速模式和思维切换等选项�? *
 * @param provider - 提供商类�? * @param caps - 模型能力描述对象
 * @returns 旧版格式的选项描述符数�? *
 * @private 此函数为内部实现细节，不应直接调�? */
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
 * 获取提供商的选项描述符列�? *
 * @description
 * 返回指定提供商和模型能力的选项描述符列表�? * 优先使用能力对象中的 `optionDescriptors`（新版格式）�? * 否则使用 `legacyCapabilityDescriptors`（旧版格式）构建�? * 每个描述符会根据传入的选择值更�?currentValue�? *
 * @param input.provider - 提供商类�? * @param input.caps - 模型能力描述对象
 * @param input.selections - 可选的选项选择值，用于设置描述符的当前�? * @returns 选项描述符数�? *
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
 * 获取提供商选项描述符的当前�? *
 * @description
 * 从描述符中提取当前选中的值：
 * - 布尔类型：直接返�?currentValue
 * - 选择类型：返�?currentValue 或默认选项�?ID
 *
 * @param descriptor - 选项描述�? * @returns 当前值，描述符为空时返回 undefined
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
 * 获取提供商选项描述符的当前显示标签
 *
 * @description
 * 从描述符中提取当前选中值的显示标签�? * - 布尔类型：返�?"On" �?"Off"
 * - 选择类型：返回当前选项�?label
 *
 * @param descriptor - 选项描述�? * @returns 当前值的显示标签，无法确定返�?undefined
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
 * 从选项描述符列表构建选择值数�? *
 * @description
 * 遍历描述符列表，提取每个描述符的当前值，构建 ProviderOptionSelection 数组�? * 仅包�?string �?boolean 类型的值�? *
 * @param descriptors - 选项描述符数�? * @returns 选择值数组，描述符列表为空时返回 undefined
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

// ── 数据驱动的模型能力解�?────────────────────────────────────────────

/**
 * 获取指定提供商和模型的能力描�? *
 * @description
 * 从全局能力索引中查找模型的能力描述。对�?Gemini 提供商，
 * 额外支持基于模型 ID 的系列识别。未找到时返回空能力对象�? *
 * @param provider - 提供商类�? * @param model - 模型 ID �?Slug
 * @returns 模型能力描述对象
 *
 * @example
 * ```ts
 * getModelCapabilities('claudeAgent', 'claude-sonnet-4-20250514');
 * // 返回该模型的能力描述
 *
 * getModelCapabilities('codex', 'unknown-model');
 * // 返回 EMPTY_MODEL_CAPABILITIES
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
 * 判断文本中是否包�?Claude Ultrathink 提示�? *
 * @description
 * 检查文本中是否包含 "ultrathink" 关键字（不区分大小写），
 * 用于判断是否需要为 Claude 模型添加 Ultrathink 前缀�? *
 * @param text - 待检查的文本
 * @returns 如果包含 ultrathink 关键字返�?true，否则返�?false
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
 * 归一化模�?Slug
 *
 * @description
 * 将模�?ID 转换为标准化�?Slug 格式�? * 1. 去除首尾空白
 * 2. 对于 claudeAgent 提供商，移除末尾的方括号标记（如 `[1m]`�? * 3. 查找别名映射表，将别名转换为标准 Slug
 * 4. 无别名时直接使用处理后的字符串作�?Slug
 *
 * @param model - 原始模型 ID 字符�? * @param provider - 提供商类型，默认�?"codex"
 * @returns 归一化后的模�?Slug，输入为空时返回 null
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
 * 从选项列表中解析可选择的模�?Slug
 *
 * @description
 * 按以下优先级解析模型 Slug�? * 1. 精确匹配选项�?slug
 * 2. 不区分大小写匹配选项�?name
 * 3. 归一化后匹配选项�?slug
 *
 * @param provider - 提供商类�? * @param value - 用户输入的模型标识（Slug 或名称）
 * @param options - 可选择的模型选项列表
 * @returns 匹配到的模型 Slug，未匹配返回 null
 *
 * @example
 * ```ts
 * resolveSelectableModel('codex', 'gpt-4', options);     // 'gpt-4'
 * resolveSelectableModel('codex', 'GPT-4', options);     // 'gpt-4'（按名称匹配�? * resolveSelectableModel('codex', 'invalid', options);   // null
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
 * 解析模型 Slug，确保返回有效的模型标识
 *
 * @description
 * 归一化模�?ID 并验证其是否属于指定提供商的已知模型�? * 如果归一化后�?Slug 不在提供商的模型集合中，则回退到该提供商的默认模型�? * "pi" 提供商没有默认模型，未知 Slug 时返回归一化后的值�? *
 * @param model - 原始模型 ID 字符�? * @param provider - 提供商类型，默认�?"codex"
 * @returns 有效的模�?Slug，输入为空时返回提供商的默认模型
 *
 * @example
 * ```ts
 * resolveModelSlug('gpt-4', 'codex');     // 'gpt-4'
 * resolveModelSlug('invalid', 'codex');    // 'o3'（回退到默认模型）
 * resolveModelSlug(null, 'codex');         // 'o3'（默认模型）
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
 * 解析指定提供商的模型 Slug
 *
 * @description
 * �?`resolveModelSlug` 的参数顺序调整版本，便于以提供商为第一参数调用�? *
 * @param provider - 提供商类�? * @param model - 原始模型 ID 字符�? * @returns 有效的模�?Slug
 *
 * @see {@link resolveModelSlug} - 核心解析逻辑
 */
export function resolveModelSlugForProvider(
  provider: ProviderKind,
  model: string | null | undefined,
): ModelSlug | null {
  return resolveModelSlug(model, provider);
}

/**
 * 修剪字符串，空值返�?null
 *
 * @description
 * 将字符串去除首尾空白，如果结果为空字符串则返�?null�? * �?string 类型的输入直接返�?null�? *
 * @template T - 字符串字面量类型
 * @param value - 待修剪的�? * @returns 修剪后的非空字符串，�?null
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
 * 归一�?Codex 模型选项
 *
 * @description
 * �?Codex 模型选项归一化为仅包含与默认值不同的字段�? * - reasoningEffort：仅当与默认值不同时保留
 * - fastMode：仅当为 true 时保�? *
 * @param model - 模型 ID 字符�? * @param modelOptions - 原始 Codex 模型选项
 * @returns 归一化后的模型选项，所有字段与默认值相同时返回 undefined
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
 * 归一�?Claude 模型选项
 *
 * @description
 * �?Claude 模型选项归一化为仅包含与默认值不同的字段�? * - effort：排除提示注入的级别和默认级�? * - contextWindow：仅当与默认值不同且有效时保�? * - thinking：仅当为 false 时保留（关闭思维�? * - fastMode：仅当为 true 时保�? *
 * @param model - 模型 ID 字符�? * @param modelOptions - 原始 Claude 模型选项
 * @returns 归一化后的模型选项，所有字段与默认值相同时返回 undefined
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
 * 解析 API 调用使用的模�?ID
 *
 * @description
 * 根据模型选择信息生成最终用�?API 调用的模�?ID�? * 对于 Claude 提供商，如果选择�?1M 上下文窗口，会在模型 ID 后追�?`[1m]` 标记�? * 其他提供商直接返回原始模�?ID�? *
 * @param modelSelection - 模型选择对象
 * @returns 用于 API 调用的模�?ID 字符�? *
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
 * 归一�?Gemini 模型选项
 *
 * @description
 * �?Gemini 模型选项归一化，仅保留与默认值不同的思维配置�? * 如果思维配置值与默认值相同，返回 undefined�? *
 * @param model - 模型 ID 字符�? * @param modelOptions - 原始 Gemini 模型选项
 * @returns 归一化后的模型选项，与默认值相同时返回 undefined
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
 * 归一�?Grok 模型选项
 *
 * @description
 * �?Grok 模型选项归一化，仅保留与默认值不同的推理努力级别�? *
 * @param model - 模型 ID 字符�? * @param modelOptions - 原始 Grok 模型选项
 * @returns 归一化后的模型选项，与默认值相同时返回 undefined
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
 * 归一�?Pi 模型选项
 *
 * @description
 * �?Pi 模型选项归一化，仅保留有效的思维级别�? *
 * @param modelOptions - 原始 Pi 模型选项
 * @returns 归一化后的模型选项，无效值时返回 undefined
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
 * 归一�?OpenCode 模型选项
 *
 * @description
 * �?OpenCode 模型选项归一化，仅保留非空的 variant �?agent 字段�? *
 * @param modelOptions - 原始 OpenCode 模型选项
 * @returns 归一化后的模型选项，无有效字段时返�?undefined
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
 * 归一�?Cursor 模型选项
 *
 * @description
 * �?Cursor 模型选项归一化，仅保留非空的字段�? *
 * @param modelOptions - 原始 Cursor 模型选项
 * @returns 归一化后的模型选项，无有效字段时返�?undefined
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
 * �?Claude 提示词添�?Ultrathink 前缀
 *
 * @description
 * 当推理努力级别为 "ultrathink" 时，在提示词前添�?"Ultrathink:" 前缀�? * 如果提示词已�?"Ultrathink:" 开头，则不重复添加�? * �?ultrathink 级别或空提示词不做任何处理�? *
 * @param text - 原始提示词文�? * @param effort - Claude 推理努力级别
 * @returns 处理后的提示词文�? *
 * @example
 * ```ts
 * applyClaudePromptEffortPrefix('请分析这段代�?, 'ultrathink');
 * // 'Ultrathink:\n请分析这段代�?
 *
 * applyClaudePromptEffortPrefix('请分析这段代�?, 'high');
 * // '请分析这段代�?（非 ultrathink 级别不处理）
 *
 * applyClaudePromptEffortPrefix('Ultrathink:\n请分�?, 'ultrathink');
 * // 'Ultrathink:\n请分�?（已有前缀不重复添加）
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
