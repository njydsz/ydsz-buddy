/**
 * @file 自定义 Provider 协议模板
 * @description C-2 自定义 Provider BYOK：3 种主流协议的 URL/Header/Body 转换规则
 *
 * ## 支持的协议
 *
 * | 协议 | 适用场景 | Chat 端点 | Auth 方式 | 流式 |
 * |------|----------|-----------|-----------|------|
 * | `openai` | OpenAI / 兼容服务（OneAPI 等） | `{baseUrl}/chat/completions` | `Authorization: Bearer <key>` | SSE |
 * | `anthropic` | Anthropic Messages API | `{baseUrl}/v1/messages` | `x-api-key: <key>` + `anthropic-version` | SSE |
 * | `litellm` | LiteLLM Proxy | `{baseUrl}/v1/chat/completions` | `Authorization: Bearer <key>` | SSE |
 * | `ollama` | Ollama 本地模型（OpenAI 兼容层） | `{baseUrl}/v1/chat/completions` | 无（本地免鉴权） | SSE |
 *
 * ## 转换职责
 *
 * `buildChatRequest(protocol, config, payload)` 把"统一 ChatPayload"转成协议
 * 特定 HTTP 请求体（path/headers/body）。这样上层调用者只需要关心"发什么内容"，
 * 不需要知道每个协议的细节差异。
 *
 * @module lib/customProviderProtocols
 */

import type {
  CustomProviderConfig,
  CustomProviderProtocol,
  ResolvedCustomProvider,
} from "./customProviderStore";

/**
 * 统一 Chat 请求 payload
 */
export interface ChatRequestPayload {
  /** 模型 ID（如 "gpt-4o-mini"） */
  model: string;
  /** 消息列表（OpenAI 格式） */
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  /** 温度 0-2 */
  temperature?: number;
  /** 最大 token */
  maxTokens?: number;
  /** 是否流式 */
  stream?: boolean;
}

/**
 * 协议转换后的 HTTP 请求
 */
export interface ProtocolRequest {
  /** 完整 URL（含 path） */
  url: string;
  /** HTTP method */
  method: "POST";
  /** Headers（已合并 auth） */
  headers: Record<string, string>;
  /** 请求体（已 stringify） */
  body: string;
}

/**
 * 协议元信息（用于 UI 展示 + 模板选择）
 */
export interface ProtocolMeta {
  id: CustomProviderProtocol;
  label: string;
  description: string;
  /** 默认 baseUrl（占位） */
  defaultBaseUrl: string;
  /** 默认模型 */
  defaultModel: string;
  /** 是否需要 API Key */
  requiresApiKey: boolean;
}

/**
 * 3 种协议元信息
 */
export const PROTOCOL_META: Record<CustomProviderProtocol, ProtocolMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI 兼容",
    description: "OpenAI Chat Completions 格式（兼容 OneAPI / 通用 OpenAI 代理 等）",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    requiresApiKey: true,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Messages",
    description: "Anthropic 原生 Messages API（Claude 3.5/3.7/4 系列）",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-20241022",
    requiresApiKey: true,
  },
  litellm: {
    id: "litellm",
    label: "LiteLLM Proxy",
    description: "LiteLLM 统一代理（一个 baseUrl 转发到 100+ 模型）",
    defaultBaseUrl: "http://localhost:4000",
    defaultModel: "gpt-4o-mini",
    requiresApiKey: false,
  },
  ollama: {
    id: "ollama",
    label: "Ollama (本地模型)",
    description:
      "Ollama 本地推理服务（默认 http://localhost:11434），使用其 OpenAI 兼容 /v1/chat/completions 端点,无需 API Key",
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "llama3.2",
    requiresApiKey: false,
  },
};

/**
 * 所有支持的协议 ID 列表
 */
export const ALL_PROTOCOLS: CustomProviderProtocol[] = [
  "openai",
  "anthropic",
  "litellm",
  "ollama",
];

/**
 * 去除 baseUrl 末尾的斜杠
 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * OpenAI 协议转换
 *
 * 端点：`{baseUrl}/chat/completions`
 * Auth：`Authorization: Bearer <key>`
 * Body：OpenAI Chat Completions 格式
 */
function buildOpenAIRequest(
  config: ResolvedCustomProvider,
  payload: ChatRequestPayload,
): ProtocolRequest {
  const base = trimTrailingSlash(config.baseUrl);
  return {
    url: `${base}/chat/completions`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: payload.model,
      messages: payload.messages,
      temperature: payload.temperature ?? 0.7,
      max_tokens: payload.maxTokens,
      stream: payload.stream ?? false,
    }),
  };
}

/**
 * Anthropic 协议转换
 *
 * 端点：`{baseUrl}/v1/messages`
 * Auth：`x-api-key: <key>` + `anthropic-version: 2023-06-01`
 * Body：Anthropic Messages 格式（system 是顶层字段，不在 messages 里）
 */
function buildAnthropicRequest(
  config: ResolvedCustomProvider,
  payload: ChatRequestPayload,
): ProtocolRequest {
  const base = trimTrailingSlash(config.baseUrl);
  // 提取 system message（Anthropic 用顶层 system 字段）
  const systemMessages = payload.messages.filter((m) => m.role === "system");
  const systemContent = systemMessages.map((m) => m.content).join("\n\n");
  const nonSystemMessages = payload.messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: payload.model,
    messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: payload.maxTokens ?? 4096,
    stream: payload.stream ?? false,
  };
  if (systemContent) {
    body.system = systemContent;
  }
  if (payload.temperature !== undefined) {
    body.temperature = payload.temperature;
  }

  return {
    url: `${base}/v1/messages`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
    },
    body: JSON.stringify(body),
  };
}

/**
 * LiteLLM 协议转换
 *
 * 端点：`{baseUrl}/v1/chat/completions`
 * Auth：`Authorization: Bearer <key>`（可选，LiteLLM 可配置为无需 key）
 * Body：OpenAI Chat Completions 格式（LiteLLM 完全兼容）
 */
function buildLiteLLMRequest(
  config: ResolvedCustomProvider,
  payload: ChatRequestPayload,
): ProtocolRequest {
  const base = trimTrailingSlash(config.baseUrl);
  return {
    url: `${base}/v1/chat/completions`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: payload.model,
      messages: payload.messages,
      temperature: payload.temperature ?? 0.7,
      max_tokens: payload.maxTokens,
      stream: payload.stream ?? false,
    }),
  };
}

/**
 * Ollama 协议转换（OpenAI 兼容层）
 *
 * 端点：`{baseUrl}/v1/chat/completions`（Ollama ≥ 0.1.14 自带）
 * Auth：不需要 Authorization（本地免鉴权）。Ollama 若配置了 OLLAMA_API_KEY,
 *       通过 `OLLAMA_API_KEY` 环境变量启用,前端透传 Bearer 即可。
 * Body：OpenAI Chat Completions 格式（Ollama 兼容）
 *
 * ## 兼容性
 *
 * - Ollama `0.1.14+` 提供原生 OpenAI 兼容层
 * - LM Studio / vLLM / LocalAI 等本地推理服务都兼容同一形态
 * - 若 baseUrl 已经是 `http://localhost:11434`,无需任何额外配置
 */
function buildOllamaRequest(
  config: ResolvedCustomProvider,
  payload: ChatRequestPayload,
): ProtocolRequest {
  const base = trimTrailingSlash(config.baseUrl);
  return {
    url: `${base}/v1/chat/completions`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Ollama 兼容层默认无鉴权,只有用户主动配置了 OLLAMA_API_KEY
      // 或远端代理时才需要带 token
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: payload.model,
      messages: payload.messages,
      temperature: payload.temperature ?? 0.7,
      max_tokens: payload.maxTokens,
      stream: payload.stream ?? false,
    }),
  };
}

/**
 * 根据协议类型构建 HTTP 请求
 *
 * @param protocol 协议 ID
 * @param config Provider 完整配置（含 apiKey）
 * @param payload Chat 请求内容
 * @returns HTTP 请求描述（url/headers/body）
 */
export function buildChatRequest(
  protocol: CustomProviderProtocol,
  config: ResolvedCustomProvider,
  payload: ChatRequestPayload,
): ProtocolRequest {
  switch (protocol) {
    case "openai":
      return buildOpenAIRequest(config, payload);
    case "anthropic":
      return buildAnthropicRequest(config, payload);
    case "litellm":
      return buildLiteLLMRequest(config, payload);
    case "ollama":
      return buildOllamaRequest(config, payload);
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = protocol;
      throw new Error(`Unknown protocol: ${String(_exhaustive)}`);
    }
  }
}

/**
 * 校验 baseUrl 格式（必须是 http/https，且非空）
 *
 * @returns 错误信息；空字符串表示校验通过
 */
export function validateBaseUrl(baseUrl: string): string {
  if (!baseUrl || baseUrl.trim().length === 0) {
    return "Base URL 不能为空";
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    return "Base URL 必须以 http:// 或 https:// 开头";
  }
  return "";
}

/**
 * 校验模型名（非空）
 */
export function validateModel(model: string): string {
  if (!model || model.trim().length === 0) {
    return "默认模型不能为空";
  }
  return "";
}

/**
 * 校验协议配置
 *
 * @param config 待校验配置（持久化形态,不含 apiKey）
 * @param apiKey 当前已配置的 apiKey（用于判断"是否需要 key"）
 * @returns 错误信息；空字符串表示校验通过
 */
export function validateProviderConfig(
  config: CustomProviderConfig,
  apiKey: string = "",
): string {
  if (!config.name || config.name.trim().length === 0) {
    return "名称不能为空";
  }
  const baseUrlError = validateBaseUrl(config.baseUrl);
  if (baseUrlError) return baseUrlError;
  const modelError = validateModel(config.defaultModel);
  if (modelError) return modelError;
  if (PROTOCOL_META[config.protocol].requiresApiKey && !apiKey && !config.hasApiKey) {
    return `${PROTOCOL_META[config.protocol].label} 协议需要 API Key`;
  }
  return "";
}

/**
 * 脱敏 API Key（用于 UI 展示）
 *
 * 示例：`sk-1234567890abcdef` → `sk-1••••cdef`
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "•".repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}${"•".repeat(Math.max(4, apiKey.length - 8))}${apiKey.slice(-4)}`;
}
