/**
 * @file 模型契约模块
 *
 * 本模块定义了 ydsz 工作区中各 AI Provider 模型的元数据、能力、选项契约，
 * 涵盖 Claude、GPT、Codex、Cursor、自定义 Provider 等多源模型。
 *
 * ## 核心契约
 *
 * - `ModelSlug`：模型唯一标识（如 "claude-opus-4.5"）
 * - `ModelFamily`：模型家族（claude / gpt / codex / cursor / 自定义）
 * - `ModelCapabilities`：模型能力（工具调用、视觉、上下文窗口、思考等）
 * - `ModelPromptFormat`：模型提示词格式（chat / completion / o1 等）
 * - `ModelContextWindow`：模型上下文窗口（输入/输出 token 上限）
 * - `ModelProviderOptions`：Provider 特定选项（reasoning_effort 等）
 * - `CODEX_REASONING_EFFORT_OPTIONS`：Codex 推理强度选项
 * - `CLAUDE_DEFAULT_MODELS`：Claude 默认模型列表
 * - `OPENAI_DEFAULT_MODELS`：OpenAI 默认模型列表
 *
 * ## 使用场景
 *
 * - 模型选择器展示可用模型列表
 * - Provider 启动时根据模型能力加载对应工具集
 * - 上下文窗口监控（依据 `contextWindow`）
 * - Provider 特定 UI 选项（如 reasoning effort 切换）
 *
 * ## 扩展性
 *
 * - 新增 Provider 时需添加对应的 `*_DEFAULT_MODELS` 列表
 * - 自定义模型通过 `CustomModel` 描述，无需修改本模块
 */

import { Schema } from "effect";
import { ProviderKind, TrimmedNonEmptyString } from "./baseSchemas";

export const CODEX_REASONING_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"] as const;
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORT_OPTIONS)[number];
export const CLAUDE_CODE_EFFORT_OPTIONS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultrathink",
  "ultracode",
] as const;
export type ClaudeCodeEffort = (typeof CLAUDE_CODE_EFFORT_OPTIONS)[number];
export const GEMINI_THINKING_LEVEL_OPTIONS = ["LOW", "HIGH"] as const;
export type GeminiThinkingLevel = (typeof GEMINI_THINKING_LEVEL_OPTIONS)[number];
export const GEMINI_THINKING_BUDGET_OPTIONS = [-1, 512, 0] as const;
export type GeminiThinkingBudget = (typeof GEMINI_THINKING_BUDGET_OPTIONS)[number];
export const PI_THINKING_LEVEL_OPTIONS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
export type PiThinkingLevel = (typeof PI_THINKING_LEVEL_OPTIONS)[number];
export const GROK_REASONING_EFFORT_OPTIONS = ["none", "low", "medium", "high"] as const;
export type GrokReasoningEffort = (typeof GROK_REASONING_EFFORT_OPTIONS)[number];
export type ProviderReasoningEffort =
  | CodexReasoningEffort
  | ClaudeCodeEffort
  | GeminiThinkingLevel
  | `${GeminiThinkingBudget}`
  | PiThinkingLevel
  | GrokReasoningEffort;

export const ProviderOptionChoice = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  isDefault: Schema.optional(Schema.Literal(true)),
});
export type ProviderOptionChoice = typeof ProviderOptionChoice.Type;

const ProviderOptionDescriptorBase = {
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
} as const;

export const SelectProviderOptionDescriptor = Schema.Struct({
  ...ProviderOptionDescriptorBase,
  type: Schema.Literal("select"),
  options: Schema.Array(ProviderOptionChoice),
  currentValue: Schema.optional(TrimmedNonEmptyString),
  promptInjectedValues: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type SelectProviderOptionDescriptor = typeof SelectProviderOptionDescriptor.Type;

export const BooleanProviderOptionDescriptor = Schema.Struct({
  ...ProviderOptionDescriptorBase,
  type: Schema.Literal("boolean"),
  currentValue: Schema.optional(Schema.Boolean),
});
export type BooleanProviderOptionDescriptor = typeof BooleanProviderOptionDescriptor.Type;

export const ProviderOptionDescriptor = Schema.Union(
  SelectProviderOptionDescriptor,
  BooleanProviderOptionDescriptor,
);
export type ProviderOptionDescriptor = typeof ProviderOptionDescriptor.Type;

export const ProviderOptionSelection = Schema.Struct({
  id: TrimmedNonEmptyString,
  value: Schema.Union(TrimmedNonEmptyString, Schema.Boolean),
});
export type ProviderOptionSelection = typeof ProviderOptionSelection.Type;

export const ProviderOptionSelections = Schema.Array(ProviderOptionSelection);
export type ProviderOptionSelections = typeof ProviderOptionSelections.Type;

export const CodexModelOptions = Schema.Struct({
  // Codex runtime discovery can expose early-access effort values outside the built-in enum.
  reasoningEffort: Schema.optional(TrimmedNonEmptyString),
  fastMode: Schema.optional(Schema.Boolean),
});
export type CodexModelOptions = typeof CodexModelOptions.Type;

export const ClaudeModelOptions = Schema.Struct({
  thinking: Schema.optional(Schema.Boolean),
  effort: Schema.optional(Schema.Literal(...CLAUDE_CODE_EFFORT_OPTIONS)),
  fastMode: Schema.optional(Schema.Boolean),
  contextWindow: Schema.optional(Schema.String),
});
export type ClaudeModelOptions = typeof ClaudeModelOptions.Type;

export const GeminiModelOptions = Schema.Struct({
  thinkingLevel: Schema.optional(Schema.Literal(...GEMINI_THINKING_LEVEL_OPTIONS)),
  thinkingBudget: Schema.optional(Schema.Literal(...GEMINI_THINKING_BUDGET_OPTIONS)),
});
export type GeminiModelOptions = typeof GeminiModelOptions.Type;

export const OpenCodeModelOptions = Schema.Struct({
  variant: Schema.optional(TrimmedNonEmptyString),
  agent: Schema.optional(TrimmedNonEmptyString),
});
export type OpenCodeModelOptions = typeof OpenCodeModelOptions.Type;

export const PiModelOptions = Schema.Struct({
  thinkingLevel: Schema.optional(Schema.Literal(...PI_THINKING_LEVEL_OPTIONS)),
});
export type PiModelOptions = typeof PiModelOptions.Type;

export const CursorModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(TrimmedNonEmptyString),
  fastMode: Schema.optional(Schema.Boolean),
  thinking: Schema.optional(Schema.Boolean),
  contextWindow: Schema.optional(Schema.String),
});
export type CursorModelOptions = typeof CursorModelOptions.Type;

export const GrokModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(Schema.Literal(...GROK_REASONING_EFFORT_OPTIONS)),
});
export type GrokModelOptions = typeof GrokModelOptions.Type;

export const ProviderModelOptions = Schema.Struct({
  codex: Schema.optional(CodexModelOptions),
  claudeAgent: Schema.optional(ClaudeModelOptions),
  cursor: Schema.optional(CursorModelOptions),
  gemini: Schema.optional(GeminiModelOptions),
  grok: Schema.optional(GrokModelOptions),
  kilo: Schema.optional(OpenCodeModelOptions),
  opencode: Schema.optional(OpenCodeModelOptions),
  pi: Schema.optional(PiModelOptions),
  // 国内 6 家 OpenAI 兼容 Provider：暂不提供额外 options（HTTP 透传）
  // 使用空 Struct 让类型为 `{} | undefined`，与 ProviderModelOptions 联合兼容
  glm: Schema.optional(Schema.Struct({})),
  deepseek: Schema.optional(Schema.Struct({})),
  moonshot: Schema.optional(Schema.Struct({})),
  qwen: Schema.optional(Schema.Struct({})),
  mimo: Schema.optional(Schema.Struct({})),
  MiniMax: Schema.optional(Schema.Struct({})),
  // 新增 3 家国内 OpenAI 兼容 Provider:HTTP 透传,空 Struct
  doubao: Schema.optional(Schema.Struct({})),
  ernie: Schema.optional(Schema.Struct({})),
  hunyuan: Schema.optional(Schema.Struct({})),
});
export type ProviderModelOptions = typeof ProviderModelOptions.Type;

export type EffortOption = {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly isDefault?: true;
};

export type ContextWindowOption = {
  readonly value: string;
  readonly label: string;
  readonly isDefault?: true;
};

export type ModelCapabilities = {
  readonly optionDescriptors?: readonly ProviderOptionDescriptor[];
  readonly reasoningEffortLevels: readonly EffortOption[];
  readonly supportsFastMode: boolean;
  readonly supportsThinkingToggle: boolean;
  readonly promptInjectedEffortLevels: readonly string[];
  readonly contextWindowOptions: readonly ContextWindowOption[];
  readonly variantOptions?: readonly EffortOption[];
  readonly agentOptions?: readonly EffortOption[];
};

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

const CODEX_GPT_5_5_CAPABILITIES: ModelCapabilities = {
  ...CODEX_GPT_5_CAPABILITIES,
  reasoningEffortLevels: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium", isDefault: true },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
  ],
};

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

type ModelDefinition = {
  readonly slug: string;
  readonly name: string;
  readonly capabilities: ModelCapabilities;
};

/**
 * TODO: This should not be a static array, each provider
 * should return its own model list over the WS API.
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
  // 国内 6 家 OpenAI 兼容 Provider 的静态模型索引
  // （真实列表由后端 ydsz-flow catalog 提供，前端提供别名与默认模型占位）
  glm: [
    {
      slug: "glm-4-plus",
      name: "GLM-4 Plus",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "glm-4-flash",
      name: "GLM-4 Flash",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "glm-z1-air",
      name: "GLM-Z1 Air (Reasoning)",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  deepseek: [
    {
      slug: "deepseek-chat",
      name: "DeepSeek-V3 Chat",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "deepseek-reasoner",
      name: "DeepSeek-R1 Reasoner",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "deepseek-coder",
      name: "DeepSeek Coder",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  moonshot: [
    {
      slug: "moonshot-v1-128k",
      name: "Kimi v1 128K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "moonshot-v1-32k",
      name: "Kimi v1 32K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "kimi-latest",
      name: "Kimi Latest",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "kimi-k2-0905-preview",
      name: "Kimi K2.7 Code (Preview)",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  qwen: [
    {
      slug: "qwen-max",
      name: "Qwen Max",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "qwen-plus",
      name: "Qwen Plus",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "qwen-turbo",
      name: "Qwen Turbo",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "qwen-coder-plus",
      name: "Qwen Coder Plus",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "qwen3-coder-plus",
      name: "Qwen3 Coder Plus",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  mimo: [
    {
      slug: "mimo-v2-pro",
      name: "MiMo v2 Pro",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "mimo-v2-flash",
      name: "MiMo v2 Flash",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "mimo-coder",
      name: "MiMo Coder",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  MiniMax: [
    {
      slug: "MiniMax-Text-01",
      name: "MiniMax Text-01",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "MiniMax-Text-01-250529",
      name: "MiniMax Text-01 (250529)",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "MiniMax-VL-01",
      name: "MiniMax VL-01 (Vision)",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  // Doubao(字节跳动·火山方舟 Ark)
  doubao: [
    {
      slug: "doubao-pro-32k",
      name: "Doubao Pro 32K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "doubao-1.5-pro-32k",
      name: "Doubao 1.5 Pro 32K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "doubao-1.5-pro-256k",
      name: "Doubao 1.5 Pro 256K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "doubao-1.5-lite-32k",
      name: "Doubao 1.5 Lite 32K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "doubao-1.5-vision-pro-32k",
      name: "Doubao 1.5 Vision Pro 32K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  // Ernie(百度·千帆 v2)
  ernie: [
    {
      slug: "ernie-4.0-8k-latest",
      name: "ERNIE 4.0 8K Latest",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "ernie-4.0-turbo-8k",
      name: "ERNIE 4.0 Turbo 8K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "ernie-3.5-8k",
      name: "ERNIE 3.5 8K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "ernie-3.5-128k",
      name: "ERNIE 3.5 128K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "ernie-speed-8k",
      name: "ERNIE Speed 8K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "ernie-speed-128k",
      name: "ERNIE Speed 128K",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
  // Hunyuan(腾讯混元)
  hunyuan: [
    {
      slug: "hunyuan-pro",
      name: "Hunyuan Pro",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "hunyuan-standard",
      name: "Hunyuan Standard",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "hunyuan-large-longcontext",
      name: "Hunyuan Large LongContext",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "hunyuan-code",
      name: "Hunyuan Code",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
    {
      slug: "hunyuan-vision",
      name: "Hunyuan Vision",
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      },
    },
  ],
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
  // 国内 6 家 Provider 默认模型
  glm: "glm-4-plus",
  deepseek: "deepseek-chat",
  moonshot: "moonshot-v1-128k",
  qwen: "qwen-plus",
  mimo: "mimo-v2-pro",
  MiniMax: "MiniMax-Text-01",
  // 新增 3 家国内 Provider 默认模型
  doubao: "doubao-1.5-pro-32k",
  ernie: "ernie-4.0-8k-latest",
  hunyuan: "hunyuan-pro",
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
  // 国内 6 家 Provider 别名映射（空对象即可，规范 slug 已直出）
  glm: {},
  deepseek: {},
  moonshot: {},
  qwen: {},
  mimo: {},
  MiniMax: {},
  // 新增 3 家国内 Provider 别名映射(空对象,规范 slug 已直出)
  doubao: {},
  ernie: {},
  hunyuan: {},
};

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
  // 国内 Provider — 统一使用英文名
  glm: "GLM",
  deepseek: "DeepSeek",
  moonshot: "Kimi (Moonshot)",
  qwen: "Qwen",
  mimo: "MiMo",
  MiniMax: "MiniMax",
  doubao: "Doubao",
  ernie: "Ernie",
  hunyuan: "Hunyuan",
};
