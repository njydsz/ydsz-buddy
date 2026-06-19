/**
 * @file model.ts
 * @description AI 模型配置与能力定义。定义了各 Provider（Codex、Claude、Gemini、Grok、Cursor、OpenCode、Kilo、Pi）
 * 支持的模型列表、推理努力程度选项、上下文窗口配置、模型能力矩阵等。
 * 提供模型选项、默认模型、模型别名映射等配置，用于前端 UI 展示和 Provider 运行时选择模型。
 */

import type { ProviderKind } from "./orchestration";

/** Codex Provider 推理努力程度选项：low（低）、medium（中）、high（高）、xhigh（超高） */
export const CODEX_REASONING_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"] as const;

/** Codex 推理努力程度类型 */
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORT_OPTIONS)[number];

/** Claude Code Provider 推理努力程度选项，包含从 low 到 ultracode 的多个级别 */
export const CLAUDE_CODE_EFFORT_OPTIONS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultrathink",
  "ultracode",
] as const;

/** Claude Code 推理努力程度类型 */
export type ClaudeCodeEffort = (typeof CLAUDE_CODE_EFFORT_OPTIONS)[number];

/** Gemini Provider 思考级别选项：LOW（低）、HIGH（高） */
export const GEMINI_THINKING_LEVEL_OPTIONS = ["LOW", "HIGH"] as const;

/** Gemini 思考级别类型 */
export type GeminiThinkingLevel = (typeof GEMINI_THINKING_LEVEL_OPTIONS)[number];

/** Gemini Provider 思考预算选项：-1（动态）、512（固定）、0（无） */
export const GEMINI_THINKING_BUDGET_OPTIONS = [-1, 512, 0] as const;

/** Gemini 思考预算类型 */
export type GeminiThinkingBudget = (typeof GEMINI_THINKING_BUDGET_OPTIONS)[number];

/** Pi Provider 思考级别选项：从 off 到 xhigh 的多个级别 */
export const PI_THINKING_LEVEL_OPTIONS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

/** Pi 思考级别类型 */
export type PiThinkingLevel = (typeof PI_THINKING_LEVEL_OPTIONS)[number];

/** Grok Provider 推理努力程度选项：none（无）、low（低）、medium（中）、high（高） */
export const GROK_REASONING_EFFORT_OPTIONS = ["none", "low", "medium", "high"] as const;

/** Grok 推理努力程度类型 */
export type GrokReasoningEffort = (typeof GROK_REASONING_EFFORT_OPTIONS)[number];

/** Provider 推理努力程度联合类型，包含所有 Provider 的推理努力程度选项 */
export type ProviderReasoningEffort =
  | CodexReasoningEffort
  | ClaudeCodeEffort
  | GeminiThinkingLevel
  | `${GeminiThinkingBudget}`
  | PiThinkingLevel
  | GrokReasoningEffort;

/** Provider 选项选择项，用于下拉选择框等 UI 组件 */
export interface ProviderOptionChoice {
  /** 选项 ID */
  id: string;
  /** 选项显示标签 */
  label: string;
  /** 选项描述 */
  description?: string;
  /** 是否为默认选项 */
  isDefault?: true;
}

/** Provider 选项描述符基础接口 */
interface ProviderOptionDescriptorBase {
  /** 选项 ID */
  id: string;
  /** 选项显示标签 */
  label: string;
  /** 选项描述 */
  description?: string;
}

/** 选择类型 Provider 选项描述符，包含选项列表和当前值 */
export interface SelectProviderOptionDescriptor extends ProviderOptionDescriptorBase {
  /** 选项类型，固定为 "select" */
  type: "select";
  /** 可选选项列表 */
  options: Array<ProviderOptionChoice>;
  /** 当前选中的值 */
  currentValue?: string;
  /** 注入到提示词中的值列表 */
  promptInjectedValues?: Array<string>;
}

/** 布尔类型 Provider 选项描述符，用于开关类配置 */
export interface BooleanProviderOptionDescriptor extends ProviderOptionDescriptorBase {
  /** 选项类型，固定为 "boolean" */
  type: "boolean";
  /** 当前布尔值 */
  currentValue?: boolean;
}

/** Provider 选项描述符联合类型，支持选择和布尔两种类型 */
export type ProviderOptionDescriptor =
  | SelectProviderOptionDescriptor
  | BooleanProviderOptionDescriptor;

/** Provider 选项选择，包含选项 ID 和选中的值 */
export interface ProviderOptionSelection {
  /** 选项 ID */
  id: string;
  /** 选中的值（字符串或布尔） */
  value: string | boolean;
}

/** Provider 选项选择列表 */
export type ProviderOptionSelections = Array<ProviderOptionSelection>;

/** Codex 模型选项，包含推理努力程度和快速模式开关 */
export interface CodexModelOptions {
  /** 推理努力程度，支持运行时发现的早期访问值 */
  reasoningEffort?: string;
  /** 是否启用快速模式 */
  fastMode?: boolean;
}

/** Claude 模型选项，包含思考开关、推理努力程度、快速模式和上下文窗口 */
export interface ClaudeModelOptions {
  /** 是否启用思考模式 */
  thinking?: boolean;
  /** 推理努力程度 */
  effort?: ClaudeCodeEffort;
  /** 是否启用快速模式 */
  fastMode?: boolean;
  /** 上下文窗口大小 */
  contextWindow?: string;
}

/** Gemini 模型选项，包含思考级别和思考预算 */
export interface GeminiModelOptions {
  /** 思考级别 */
  thinkingLevel?: GeminiThinkingLevel;
  /** 思考预算 */
  thinkingBudget?: GeminiThinkingBudget;
}

/** OpenCode 模型选项，包含变体和代理配置 */
export interface OpenCodeModelOptions {
  /** 模型变体 */
  variant?: string;
  /** 代理配置 */
  agent?: string;
}

/** Pi 模型选项，包含思考级别 */
export interface PiModelOptions {
  /** 思考级别 */
  thinkingLevel?: PiThinkingLevel;
}

/** Cursor 模型选项，包含推理努力程度、快速模式、思考开关和上下文窗口 */
export interface CursorModelOptions {
  /** 推理努力程度 */
  reasoningEffort?: string;
  /** 是否启用快速模式 */
  fastMode?: boolean;
  /** 是否启用思考模式 */
  thinking?: boolean;
  /** 上下文窗口大小 */
  contextWindow?: string;
}

/** Grok 模型选项，包含推理努力程度 */
export interface GrokModelOptions {
  /** 推理努力程度 */
  reasoningEffort?: GrokReasoningEffort;
}

/** Provider 模型选项联合类型，按 Provider 分类的模型配置 */
export interface ProviderModelOptions {
  /** Codex 模型选项 */
  codex?: CodexModelOptions;
  /** Claude 模型选项 */
  claudeAgent?: ClaudeModelOptions;
  /** Cursor 模型选项 */
  cursor?: CursorModelOptions;
  /** Gemini 模型选项 */
  gemini?: GeminiModelOptions;
  /** Grok 模型选项 */
  grok?: GrokModelOptions;
  /** Kilo 模型选项（复用 OpenCode 配置） */
  kilo?: OpenCodeModelOptions;
  /** OpenCode 模型选项 */
  opencode?: OpenCodeModelOptions;
  /** Pi 模型选项 */
  pi?: PiModelOptions;
}

/** 推理努力程度选项，用于 UI 展示 */
export type EffortOption = {
  /** 选项值 */
  readonly value: string;
  /** 显示标签 */
  readonly label: string;
  /** 选项描述 */
  readonly description?: string;
  /** 是否为默认选项 */
  readonly isDefault?: true;
};

/** 上下文窗口选项，用于 UI 展示 */
export type ContextWindowOption = {
  /** 选项值 */
  readonly value: string;
  /** 显示标签 */
  readonly label: string;
  /** 是否为默认选项 */
  readonly isDefault?: true;
};

/**
 * 模型能力矩阵
 *
 * 描述一个模型支持的所有能力，包括推理努力程度、快速模式、思考切换、
 * 上下文窗口选项、变体选项、代理选项等。
 */
export type ModelCapabilities = {
  /** Provider 选项描述符列表 */
  readonly optionDescriptors?: readonly ProviderOptionDescriptor[];
  /** 支持的推理努力程度列表 */
  readonly reasoningEffortLevels: readonly EffortOption[];
  /** 是否支持快速模式 */
  readonly supportsFastMode: boolean;
  /** 是否支持思考模式切换 */
  readonly supportsThinkingToggle: boolean;
  /** 注入到提示词中的推理努力程度列表 */
  readonly promptInjectedEffortLevels: readonly string[];
  /** 上下文窗口选项列表 */
  readonly contextWindowOptions: readonly ContextWindowOption[];
  /** 变体选项列表（可选） */
  readonly variantOptions?: readonly EffortOption[];
  /** 代理选项列表（可选） */
  readonly agentOptions?: readonly EffortOption[];
};

/** Gemini 2.5 系列模型的能力配置 */
const GEMINI_2_5_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    { value: "-1", label: "Dynamic", isDefault: true },
    { value: "512", label: "512 Tokens" },
  ],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};

/** Codex GPT-5 系列模型的能力配置 */
const CODEX_GPT_5_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High", isDefault: true },
    { value: "xhigh", label: "Extra High" },
  ],
  supportsFastMode: true,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};

/** Codex GPT-5.5 系列模型的能力配置，默认推理努力程度为 medium */
const CODEX_GPT_5_5_CAPABILITIES: ModelCapabilities = {
  ...CODEX_GPT_5_CAPABILITIES,
  reasoningEffortLevels: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium", isDefault: true },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
  ],
};

/** Grok Build 系列模型的能力配置 */
const GROK_BUILD_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    { value: "none", label: "None" },
    { value: "low", label: "Low", isDefault: true },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};

/** 模型定义内部类型，包含模型标识、名称和能力 */
type ModelDefinition = {
  /** 模型唯一标识（slug） */
  readonly slug: string;
  /** 模型显示名称 */
  readonly name: string;
  /** 模型能力矩阵 */
  readonly capabilities: ModelCapabilities;
};

/**
 * 各 Provider 支持的模型选项列表
 *
 * TODO: 这不应该是一个静态数组，每个 Provider 应该通过 WS API 返回自己的模型列表。
 * 当前实现为硬编码的模型配置，用于前端 UI 展示和默认模型选择。
 */
export const MODEL_OPTIONS_BY_PROVIDER = {
  codex: [
    {
      slug: "gpt-5.5",
      name: "GPT-5.5",
      capabilities: CODEX_GPT_5_5_CAPABILITIES,
    },
    {
      slug: "gpt-5.4",
      name: "GPT-5.4",
      capabilities: CODEX_GPT_5_CAPABILITIES,
    },
    {
      slug: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      capabilities: CODEX_GPT_5_CAPABILITIES,
    },
    {
      slug: "gpt-5.3-codex",
      name: "GPT-5.3 Codex",
      capabilities: CODEX_GPT_5_CAPABILITIES,
    },
    {
      slug: "gpt-5.3-codex-spark",
      name: "GPT-5.3 Codex Spark",
      capabilities: CODEX_GPT_5_CAPABILITIES,
    },
    {
      slug: "gpt-5.2-codex",
      name: "GPT-5.2 Codex",
      capabilities: CODEX_GPT_5_CAPABILITIES,
    },
    {
      slug: "gpt-5.2",
      name: "GPT-5.2",
      capabilities: CODEX_GPT_5_CAPABILITIES,
    },
  ],
  claudeAgent: [
    {
      slug: "claude-fable-5",
      name: "Claude Fable 5",
      capabilities: {
        reasoningEffortLevels: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High", isDefault: true },
          { value: "xhigh", label: "Extra High" },
          { value: "max", label: "Max" },
          { value: "ultrathink", label: "Ultrathink" },
          { value: "ultracode", label: "Ultracode" },
        ],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: ["ultrathink"],
        contextWindowOptions: [
          { value: "200k", label: "200k", isDefault: true },
          { value: "1m", label: "1M" },
        ],
      },
    },
    {
      slug: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      capabilities: {
        reasoningEffortLevels: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High", isDefault: true },
          { value: "xhigh", label: "Extra High" },
          { value: "max", label: "Max" },
          { value: "ultrathink", label: "Ultrathink" },
          { value: "ultracode", label: "Ultracode" },
        ],
        supportsFastMode: true,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: ["ultrathink"],
        contextWindowOptions: [
          { value: "200k", label: "200k", isDefault: true },
          { value: "1m", label: "1M" },
        ],
      },
    },
    {
      slug: "claude-opus-4-7",
      name: "Claude Opus 4.7",
      capabilities: {
        reasoningEffortLevels: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High", isDefault: true },
          { value: "xhigh", label: "Extra High" },
          { value: "max", label: "Max" },
          { value: "ultrathink", label: "Ultrathink" },
          { value: "ultracode", label: "Ultracode" },
        ],
        supportsFastMode: true,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: ["ultrathink"],
        contextWindowOptions: [
          { value: "200k", label: "200k", isDefault: true },
          { value: "1m", label: "1M" },
        ],
      },
    },
    {
      slug: "claude-opus-4-6",
      name: "Claude Opus 4.6",
      capabilities: {
        reasoningEffortLevels: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High", isDefault: true },
          { value: "max", label: "Max" },
          { value: "ultrathink", label: "Ultrathink" },
        ],
        supportsFastMode: true,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: ["ultrathink"],
        contextWindowOptions: [
          { value: "200k", label: "200k", isDefault: true },
          { value: "1m", label: "1M" },
        ],
      },
    },
    {
      slug: "claude-opus-4-5",
      name: "Claude Opus 4.5",
      capabilities: {
        reasoningEffortLevels: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High", isDefault: true },
        ],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [
          { value: "200k", label: "200k", isDefault: true },
          { value: "1m", label: "1M" },
        ],
      },
    },
    {
      slug: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      capabilities: {
        reasoningEffortLevels: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High", isDefault: true },
          { value: "max", label: "Max" },
          { value: "ultrathink", label: "Ultrathink" },
        ],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: ["ultrathink"],
        contextWindowOptions: [
          { value: "200k", label: "200k", isDefault: true },
          { value: "1m", label: "1M" },
        ],
      },
    },
    {
      slug: "claude-haiku-4-5",
      name: "Claude Haiku 4.5",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: true,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  gemini: [
    {
      slug: "auto-gemini-3",
      name: "Auto Gemini 3",
      capabilities: {
        reasoningEffortLevels: [
          { value: "HIGH", label: "High", isDefault: true },
          { value: "LOW", label: "Low" },
        ],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "auto-gemini-2.5",
      name: "Auto Gemini 2.5",
      capabilities: GEMINI_2_5_CAPABILITIES,
    },
    {
      slug: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview",
      capabilities: {
        reasoningEffortLevels: [
          { value: "HIGH", label: "High", isDefault: true },
          { value: "LOW", label: "Low" },
        ],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "gemini-3-flash-preview",
      name: "Gemini 3 Flash Preview",
      capabilities: {
        reasoningEffortLevels: [
          { value: "HIGH", label: "High", isDefault: true },
          { value: "LOW", label: "Low" },
        ],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "gemini-3.1-flash-lite-preview",
      name: "Gemini 3.1 Flash Lite Preview",
      capabilities: {
        reasoningEffortLevels: [
          { value: "HIGH", label: "High", isDefault: true },
          { value: "LOW", label: "Low" },
        ],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      capabilities: GEMINI_2_5_CAPABILITIES,
    },
    {
      slug: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      capabilities: GEMINI_2_5_CAPABILITIES,
    },
    {
      slug: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash Lite",
      capabilities: GEMINI_2_5_CAPABILITIES,
    },
  ],
  grok: [
    {
      slug: "grok-build-0.1",
      name: "Grok Build 0.1",
      capabilities: GROK_BUILD_CAPABILITIES,
    },
    {
      slug: "grok-build",
      name: "Grok 4.3",
      capabilities: GROK_BUILD_CAPABILITIES,
    },
  ],
  opencode: [
    {
      slug: "openai/gpt-5",
      name: "OpenAI GPT-5",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  kilo: [
    {
      slug: "kilo/kilo-auto/free",
      name: "Kilo Auto Free",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  pi: [],
  cursor: [
    {
      slug: "auto",
      name: "Auto",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "composer-2",
      name: "Composer 2",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "claude-opus-4-6",
      name: "Claude Opus 4.6",
      capabilities: {
        reasoningEffortLevels: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High", isDefault: true },
          { value: "max", label: "Max" },
        ],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "gpt-5.3-codex",
      name: "GPT-5.3 Codex",
      capabilities: CODEX_GPT_5_CAPABILITIES,
    },
    {
      slug: "gemini-3-pro",
      name: "Gemini 3 Pro",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
} as const satisfies Record<ProviderKind, readonly ModelDefinition[]>;
export type ModelOptionsByProvider = typeof MODEL_OPTIONS_BY_PROVIDER;

type BuiltInModelSlug = (typeof MODEL_OPTIONS_BY_PROVIDER)[ProviderKind][number]["slug"];
export type ModelSlug = BuiltInModelSlug | (string & {});

export type ProviderWithDefaultModel = Exclude<ProviderKind, "pi">;

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderWithDefaultModel, ModelSlug> = {
  codex: "gpt-5.5",
  claudeAgent: "claude-sonnet-4-6",
  cursor: "auto",
  gemini: "auto-gemini-3",
  grok: "grok-build",
  kilo: "kilo/kilo-auto/free",
  opencode: "openai/gpt-5",
};

// Backward compatibility for existing Codex-only call sites.
export const MODEL_OPTIONS = MODEL_OPTIONS_BY_PROVIDER.codex;
export const DEFAULT_MODEL = DEFAULT_MODEL_BY_PROVIDER.codex;
export const DEFAULT_GIT_TEXT_GENERATION_MODEL = "gpt-5.4-mini" as const;

export const MODEL_SLUG_ALIASES_BY_PROVIDER: Record<ProviderKind, Record<string, ModelSlug>> = {
  codex: {
    "5.5": "gpt-5.5",
    "5.4": "gpt-5.4",
    "5.3": "gpt-5.3-codex",
    "gpt-5.3": "gpt-5.3-codex",
    "5.3-spark": "gpt-5.3-codex-spark",
    "gpt-5.3-spark": "gpt-5.3-codex-spark",
  },
  claudeAgent: {
    fable: "claude-fable-5",
    "fable-5": "claude-fable-5",
    "claude-fable5": "claude-fable-5",
    opus: "claude-opus-4-8",
    "opus-4.8": "claude-opus-4-8",
    "claude-opus-4.8": "claude-opus-4-8",
    "claude-opus-4-8-20260528": "claude-opus-4-8",
    "opus-4.7": "claude-opus-4-7",
    "claude-opus-4.7": "claude-opus-4-7",
    "claude-opus-4-7-20260416": "claude-opus-4-7",
    "opus-4.6": "claude-opus-4-6",
    "claude-opus-4.6": "claude-opus-4-6",
    "claude-opus-4-6-20251117": "claude-opus-4-6",
    "opus-4.5": "claude-opus-4-5",
    "claude-opus-4.5": "claude-opus-4-5",
    "claude-opus-4-5-20250120": "claude-opus-4-5",
    sonnet: "claude-sonnet-4-6",
    "sonnet-4.6": "claude-sonnet-4-6",
    "claude-sonnet-4.6": "claude-sonnet-4-6",
    "claude-sonnet-4-6-20251117": "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5",
    "haiku-4.5": "claude-haiku-4-5",
    "claude-haiku-4.5": "claude-haiku-4-5",
    "claude-haiku-4-5-20251001": "claude-haiku-4-5",
  },
  cursor: {
    auto: "auto",
    composer: "composer-2",
    "composer-2": "composer-2",
    "composer-1.5": "composer-1.5",
    "composer-1": "composer-1.5",
    "opus-4.6": "claude-opus-4-6",
    "opus-4.6-thinking": "claude-opus-4-6",
    "gpt-5.3": "gpt-5.3-codex",
    "codex-5.3": "gpt-5.3-codex",
    "gemini-3": "gemini-3-pro",
  },
  gemini: {
    auto: "auto-gemini-3",
    "auto-gemini-3": "auto-gemini-3",
    "auto-gemini-2.5": "auto-gemini-2.5",
    "gemini-3-pro-preview": "gemini-3.1-pro-preview",
    "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
    "gemini-3-flash-preview": "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview",
    "gemini-2.5-pro": "gemini-2.5-pro",
    "gemini-2.5-flash": "gemini-2.5-flash",
    "gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
  },
  grok: {
    grok: "grok-build-0.1",
    build: "grok-build-0.1",
    "grok-build-0.1": "grok-build-0.1",
    "grok-build": "grok-build",
    "4.3": "grok-build",
    "grok-4": "grok-build",
    "grok-4.3": "grok-build",
    "grok-latest": "grok-build",
    "grok-code-fast": "grok-build-0.1",
    "grok-code-fast-1": "grok-build-0.1",
    "grok-code-fast-1-0825": "grok-build-0.1",
    "code-fast": "grok-build-0.1",
  },
  kilo: {},
  opencode: {},
  pi: {},
};

// ── Agent mention aliases ─────────────────────────────────────────────
// Re-exported from agentMentions.ts for backward compatibility
export {
  AGENT_MENTION_ALIASES,
  getAgentMentionAutocompleteAliases,
  getAgentMentionAliases,
  resolveAgentAlias,
  isValidAgentAlias,
  getAgentAliasNames,
  type AgentAliasDefinition,
  type ResolvedAgentAlias,
} from "./agentMentions";

// ── Model capabilities index ──────────────────────────────────────────

export const MODEL_CAPABILITIES_INDEX = Object.fromEntries(
  Object.entries(MODEL_OPTIONS_BY_PROVIDER).map(([provider, models]) => [
    provider,
    Object.fromEntries(models.map((m) => [m.slug, m.capabilities])),
  ]),
) as unknown as Record<ProviderKind, Record<string, ModelCapabilities>>;

// ── Provider display names ────────────────────────────────────────────

export const PROVIDER_DISPLAY_NAMES: Record<ProviderKind, string> = {
  codex: "Codex",
  claudeAgent: "Claude",
  cursor: "Cursor",
  gemini: "Gemini",
  grok: "Grok",
  kilo: "Kilo",
  opencode: "OpenCode",
  pi: "Pi",
};
