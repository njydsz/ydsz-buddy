/**
 * @file 模型查询与选择工具模块
 *
 * 本模块基于 `contracts/model` 中定义的模型元数据，提供前端所需的模型查询与选择工具：
 *
 * - **模型能力查询**：通过 `getModelCapabilities` 快速获取模型能力
 * - **模型选项获取**：通过 `getModelOptions` 获取 Provider 特定选项
 * - **默认模型解析**：通过 `resolveDefaultModelSlug` 获取 Provider 默认模型
 * - **模型别名解析**：通过 `resolveModelSlug` 支持用户友好的别名输入
 * - **Provider 能力检查**：通过 `providerSupportsTools` 等函数判断能力
 *
 * ## 核心导出
 *
 * - `getModelCapabilities`：获取模型能力
 * - `getModelOptions`：获取模型选项
 * - `resolveDefaultModelSlug`：解析默认模型 slug
 * - `resolveModelSlug`：解析用户输入的模型别名
 * - `providerSupportsTools`：判断 Provider 是否支持工具调用
 * - `providerSupportsVision`：判断 Provider 是否支持视觉
 * - `providerSupportsReasoningEffort`：判断 Provider 是否支持推理强度
 * - `pickProviderOption`：从选项描述符中挑选当前选项
 *
 * ## 使用场景
 *
 * - 模型选择器展示可用模型
 * - 启动 Provider 时校验模型可用性
 * - 工具调用前的能力检查
 *
 * ## 注意事项
 *
 * - 所有查询均为同步纯函数，性能良好
 * - 模型数据来源于 `MODEL_*_INDEX` 索引，启动时构建
 * - 用户输入的模型别名会自动规范化为标准 slug
 */

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
} from "@ydsz-buddy/contracts";

const MODEL_SLUG_SET_BY_PROVIDER: Record<ProviderKind, ReadonlySet<ModelSlug>> = {
  claudeAgent: new Set(MODEL_OPTIONS_BY_PROVIDER.claudeAgent.map((option) => option.slug)),
  codex: new Set(MODEL_OPTIONS_BY_PROVIDER.codex.map((option) => option.slug)),
  cursor: new Set(MODEL_OPTIONS_BY_PROVIDER.cursor.map((option) => option.slug)),
  gemini: new Set(MODEL_OPTIONS_BY_PROVIDER.gemini.map((option) => option.slug)),
  grok: new Set(MODEL_OPTIONS_BY_PROVIDER.grok.map((option) => option.slug)),
  kilo: new Set(MODEL_OPTIONS_BY_PROVIDER.kilo.map((option) => option.slug)),
  opencode: new Set(MODEL_OPTIONS_BY_PROVIDER.opencode.map((option) => option.slug)),
  pi: new Set<ModelSlug>(),
  // 国内 6 家 OpenAI 兼容 Provider
  glm: new Set(MODEL_OPTIONS_BY_PROVIDER.glm.map((option) => option.slug)),
  deepseek: new Set(MODEL_OPTIONS_BY_PROVIDER.deepseek.map((option) => option.slug)),
  moonshot: new Set(MODEL_OPTIONS_BY_PROVIDER.moonshot.map((option) => option.slug)),
  qwen: new Set(MODEL_OPTIONS_BY_PROVIDER.qwen.map((option) => option.slug)),
  mimo: new Set(MODEL_OPTIONS_BY_PROVIDER.mimo.map((option) => option.slug)),
  MiniMax: new Set(MODEL_OPTIONS_BY_PROVIDER.MiniMax.map((option) => option.slug)),
  // 新增 3 家国内 OpenAI 兼容 Provider
  doubao: new Set(MODEL_OPTIONS_BY_PROVIDER.doubao.map((option) => option.slug)),
  ernie: new Set(MODEL_OPTIONS_BY_PROVIDER.ernie.map((option) => option.slug)),
  hunyuan: new Set(MODEL_OPTIONS_BY_PROVIDER.hunyuan.map((option) => option.slug)),
};

export interface SelectableModelOption {
  slug: string;
  name: string;
}

export type GeminiThinkingConfigKind = "budget" | "level";

const GEMINI_3_MODEL_PATTERN = /^(?:auto-)?gemini-3(?:[.-]|$)/i;
const GEMINI_2_5_MODEL_PATTERN = /^(?:auto-)?gemini-2\.5(?:[.-]|$)/i;
const GEMINI_THINKING_LEVEL_SET = new Set<GeminiThinkingLevel>(["LOW", "HIGH"]);
const PI_THINKING_LEVEL_SET = new Set<PiThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);
const GEMINI_THINKING_BUDGET_MAP = new Map<string, GeminiThinkingBudget>([
  ["-1", -1],
  ["0", 0],
  ["512", 512],
]);

export const EMPTY_MODEL_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};
export const DEFAULT_GEMINI_MODEL_CAPABILITIES = EMPTY_MODEL_CAPABILITIES;

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

function isGeminiThinkingLevel(value: string): value is GeminiThinkingLevel {
  return GEMINI_THINKING_LEVEL_SET.has(value as GeminiThinkingLevel);
}

function isGeminiThinkingBudget(value: string): value is `${GeminiThinkingBudget}` {
  return GEMINI_THINKING_BUDGET_MAP.has(value);
}

function sanitizeGeminiAliasSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "model";
}

/**
 * 获取指定 Provider 的模型选项列表。
 *
 * @param provider - Provider 类型（默认为 "codex"）
 * @returns 模型选项数组
 */
export function getModelOptions(provider: ProviderKind = "codex") {
  return MODEL_OPTIONS_BY_PROVIDER[provider];
}

function hasDefaultModel(provider: ProviderKind): provider is ProviderWithDefaultModel {
  return provider !== "pi";
}

/**
 * 获取 Provider 的默认模型。
 *
 * @param provider - Provider 类型
 * @returns 默认模型 slug，若该 Provider 无默认模型则返回 null
 */
export function getDefaultModel(provider: "pi"): null;
export function getDefaultModel(provider?: ProviderWithDefaultModel): ModelSlug;
export function getDefaultModel(provider: ProviderKind): ModelSlug | null;
export function getDefaultModel(provider: ProviderKind = "codex"): ModelSlug | null {
  return hasDefaultModel(provider) ? DEFAULT_MODEL_BY_PROVIDER[provider] : null;
}

/**
 * 获取 Gemini 模型的思考配置种类。
 *
 * @param model - 模型 ID
 * @returns "level"（Gemini 3）、"budget"（Gemini 2.5）或 null
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
 * 获取 Gemini 模型的能力配置。
 *
 * @param modelId - 模型 ID
 * @param fallbackCapabilities - 回退能力配置（默认空配置）
 * @returns 模型能力配置
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

const MODEL_NAME_BY_SLUG = new Map(
  Object.values(MODEL_OPTIONS_BY_PROVIDER)
    .flat()
    .map((option) => [option.slug.toLowerCase(), option.name] as const),
);

function humanizeUnknownModelSlug(slug: string): string {
  if (!slug.toLowerCase().startsWith("gpt-")) return slug;
  const [, version, ...rest] = slug.split("-");
  if (rest.length === 0) return `GPT-${version}`;
  return `GPT-${version} ${rest.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ")}`;
}

/**
 * 格式化模型的展示名称。
 *
 * @param model - 模型 ID 或 slug
 * @returns 人类可读的模型名称，若无法识别则返回 undefined
 */
export function formatModelDisplayName(model: string | null | undefined): string | undefined {
  const normalized = trimOrNull(model);
  if (!normalized) {
    return undefined;
  }

  return MODEL_NAME_BY_SLUG.get(normalized.toLowerCase()) ?? humanizeUnknownModelSlug(normalized);
}

/**
 * 从模型选项中获取 Gemini 思考配置值。
 *
 * @param caps - 模型能力配置
 * @param modelOptions - 模型选项
 * @returns 思考配置值（level 或 budget），若无效则返回 null
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
 * 根据思考配置值获取 Gemini 模型选项。
 *
 * @param value - 思考配置值（如 "HIGH"、"512"、"-1"）
 * @returns Gemini 模型选项，若值无效则返回 undefined
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
 * 获取 Gemini 思考模型的别名。
 *
 * @param model - 模型 ID
 * @param modelOptions - 模型选项
 * @returns 模型别名，若无法生成则返回 null
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
    return `YDSZClaw-gemini-${base}-thinking-level-${nextOptions.thinkingLevel.toLowerCase()}`;
  }
  if (kind === "budget" && nextOptions.thinkingBudget !== undefined) {
    const budget =
      nextOptions.thinkingBudget === -1 ? "dynamic" : String(nextOptions.thinkingBudget);
    return `YDSZClaw-gemini-${base}-thinking-budget-${budget}`;
  }
  return null;
}

/**
 * 解析 Gemini API 模型 ID。
 *
 * @param model - 模型 ID
 * @param modelOptions - 模型选项
 * @returns API 模型 ID（带别名或原始 ID）
 */
export function resolveGeminiApiModelId(
  model: string,
  modelOptions: GeminiModelOptions | null | undefined,
): string {
  return getGeminiThinkingModelAlias(model, modelOptions) ?? model;
}

// ========== Effort helpers ????????????????????????????????????????????????????????????????????????????????????????????????????????

/**
 * 检查能力配置是否包含指定的 effort 值。
 *
 * @param caps - 模型能力配置
 * @param value - effort 值
 * @returns 若包含则返回 true
 */
export function hasEffortLevel(caps: ModelCapabilities, value: string): boolean {
  return caps.reasoningEffortLevels.some((l) => l.value === value);
}

/**
 * 获取能力配置的默认 effort 值。
 *
 * @param caps - 模型能力配置
 * @returns 默认 effort 值，若无默认值则返回 null
 */
export function getDefaultEffort(caps: ModelCapabilities): string | null {
  return caps.reasoningEffortLevels.find((l) => l.isDefault)?.value ?? null;
}

/**
 * 检查能力配置是否包含指定的上下文窗口选项。
 *
 * @param caps - 模型能力配置
 * @param value - 上下文窗口值
 * @returns 若包含则返回 true
 */
export function hasContextWindowOption(caps: ModelCapabilities, value: string): boolean {
  return caps.contextWindowOptions.some((option) => option.value === value);
}

/**
 * 获取能力配置的默认上下文窗口值。
 *
 * @param caps - 模型能力配置
 * @returns 默认上下文窗口值，若无默认值则返回 null
 */
export function getDefaultContextWindow(caps: ModelCapabilities): string | null {
  return caps.contextWindowOptions.find((option) => option.isDefault)?.value ?? null;
}

/**
 * 解析标签化选项值。
 *
 * @param options - 选项数组
 * @param rawValue - 原始值
 * @returns 若原始值有效则返回，否则返回默认值
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

type ProviderOptionSelectionsInput =
  | ReadonlyArray<ProviderOptionSelection>
  | Record<string, unknown>
  | null
  | undefined;

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
 * 获取 Provider 选项的选择值。
 *
 * @param selections - 选项选择数组或记录
 * @param id - 选项 ID
 * @returns 选项值（字符串或布尔值），若未找到则返回 undefined
 */
export function getProviderOptionSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | boolean | undefined {
  return providerOptionSelectionValue(selections, id);
}

/**
 * 获取 Provider 选项的字符串选择值。
 *
 * @param selections - 选项选择数组或记录
 * @param id - 选项 ID
 * @returns 字符串值，若未找到或类型不匹配则返回 undefined
 */
export function getProviderOptionStringSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | undefined {
  const value = getProviderOptionSelectionValue(selections, id);
  return typeof value === "string" ? value : undefined;
}

/**
 * 获取 Provider 选项的布尔选择值。
 *
 * @param selections - 选项选择数组或记录
 * @param id - 选项 ID
 * @returns 布尔值，若未找到或类型不匹配则返回 undefined
 */
export function getProviderOptionBooleanSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): boolean | undefined {
  const value = getProviderOptionSelectionValue(selections, id);
  return typeof value === "boolean" ? value : undefined;
}

/**
 * 获取模型选择的选项值。
 *
 * @param modelSelection - 模型选择
 * @param id - 选项 ID
 * @returns 选项值（字符串或布尔值），若未找到则返回 undefined
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
 * 获取模型选择的字符串选项值。
 *
 * @param modelSelection - 模型选择
 * @param id - 选项 ID
 * @returns 字符串值，若未找到或类型不匹配则返回 undefined
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
 * 获取模型选择的布尔选项值。
 *
 * @param modelSelection - 模型选择
 * @param id - 选项 ID
 * @returns 布尔值，若未找到或类型不匹配则返回 undefined
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
 * 获取 Provider 选项描述符列表。
 *
 * @param input - 输入参数
 * @param input.provider - Provider 类型
 * @param input.caps - 模型能力配置
 * @param input.selections - 当前选项选择（可选）
 * @returns 选项描述符数组
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
 * 获取 Provider 选项描述符的当前值。
 *
 * @param descriptor - 选项描述符
 * @returns 当前值（字符串或布尔值），若描述符为空则返回 undefined
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
 * 获取 Provider 选项描述符的当前标签。
 *
 * @param descriptor - 选项描述符
 * @returns 当前选项的标签，若无法获取则返回 undefined
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
 * 从选项描述符构建选项选择数组。
 *
 * @param descriptors - 选项描述符数组
 * @returns 选项选择数组，若描述符为空则返回 undefined
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

// ========== Data-driven capability resolver ??????????????????????????????????????????????????????????????????????

/**
 * 获取模型能力配置。
 *
 * @param provider - Provider 类型
 * @param model - 模型 ID 或 slug
 * @returns 模型能力配置
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
 * 判断文本是否为 Claude Ultrathink 提示。
 *
 * @param text - 待检测的文本
 * @returns 若包含 ultrathink 关键词则返回 true
 */
export function isClaudeUltrathinkPrompt(text: string | null | undefined): boolean {
  return typeof text === "string" && /\bultrathink\b/i.test(text);
}

/**
 * 规范化模型 slug。
 *
 * @param model - 模型 ID 或 slug
 * @param provider - Provider 类型（默认为 "codex"）
 * @returns 规范化后的模型 slug
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
 * 解析可选模型。
 *
 * @param provider - Provider 类型
 * @param value - 用户输入的值（slug 或名称）
 * @param options - 可选模型选项列表
 * @returns 匹配的模型 slug，若无匹配则返回 null
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
 * 解析模型 slug。
 *
 * @param model - 模型 ID 或 slug
 * @param provider - Provider 类型（默认为 "codex"）
 * @returns 模型 slug，若无效则返回该 Provider 的默认模型
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
 * 为指定 Provider 解析模型 slug。
 *
 * @param provider - Provider 类型
 * @param model - 模型 ID 或 slug
 * @returns 模型 slug
 */
export function resolveModelSlugForProvider(
  provider: ProviderKind,
  model: string | null | undefined,
): ModelSlug | null {
  return resolveModelSlug(model, provider);
}

/**
 * 去除字符串首尾空白，空值返回 null。
 *
 * @param value - 待处理的字符串
 * @returns 去除空白后的字符串或 null
 */
export function trimOrNull<T extends string>(value: T | null | undefined): T | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim() as T;
  return trimmed || null;
}

/**
 * 规范化 Codex 模型选项。
 *
 * @param model - 模型 ID
 * @param modelOptions - 原始模型选项
 * @returns 规范化后的模型选项，若无需变更则返回 undefined
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
 * 规范化 Claude 模型选项。
 *
 * @param model - 模型 ID
 * @param modelOptions - 原始模型选项
 * @returns 规范化后的模型选项，若无需变更则返回 undefined
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
 * 解析 API 模型 ID。
 *
 * @param modelSelection - 模型选择
 * @returns API 模型 ID（如 Claude 的 1m 上下文变体）
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
 * 规范化 Gemini 模型选项。
 *
 * @param model - 模型 ID
 * @param modelOptions - 原始模型选项
 * @returns 规范化后的模型选项，若无需变更则返回 undefined
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
 * 规范化 Grok 模型选项。
 *
 * @param model - 模型 ID
 * @param modelOptions - 原始模型选项
 * @returns 规范化后的模型选项，若无需变更则返回 undefined
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
 * 规范化 Pi 模型选项。
 *
 * @param modelOptions - 原始模型选项
 * @returns 规范化后的模型选项，若无需变更则返回 undefined
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
 * 规范化 OpenCode 模型选项。
 *
 * @param modelOptions - 原始模型选项
 * @returns 规范化后的模型选项，若无需变更则返回 undefined
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
 * 规范化 Cursor 模型选项。
 *
 * @param modelOptions - 原始模型选项
 * @returns 规范化后的模型选项，若无需变更则返回 undefined
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
 * 应用 Claude Prompt Effort 前缀。
 *
 * 当 effort 为 "ultrathink" 时，为文本添加 "Ultrathink:" 前缀。
 *
 * @param text - 提示文本
 * @param effort - Effort 级别
 * @returns 添加前缀后的文本
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
