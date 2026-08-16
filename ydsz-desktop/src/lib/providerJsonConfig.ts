/**
 * @file Custom Provider JSON 配置 schema
 * @description 借鉴 OpenCode `provider.<id>` JSON 配置结构,允许用户通过 JSON
 *              描述任意 OpenAI / Anthropic / Gemini 兼容端点的 Provider。
 *
 * ## 与 store 的关系
 *
 * `customProviderStore` 持久化的是"经过 UI 简化后的形态"(`CustomProviderConfig`)。
 * 高级用户可以直接写 `~/.ydsz/providers/<id>.json` 文件,本模块负责:
 *
 * 1. **解析与校验** 任意 JSON 字符串
 * 2. **环境变量占位符** `{env:VAR}` / `{env:VAR:-default}` 展开
 * 3. **降级到 store 形态** 当作 `CustomProviderConfig` 入库
 *
 * ## 支持的协议
 *
 * | protocol              | 适用                                    |
 * |-----------------------|-----------------------------------------|
 * | `openai`              | OpenAI Chat Completions 兼容            |
 * | `openai-responses`    | OpenAI Responses API(GPT-5 系列原生)    |
 * | `anthropic`           | Anthropic Messages API                  |
 * | `anthropic-compatible`| GLM / OpenRouter Anthropic 兼容端点     |
 * | `google`              | Google Generative AI                    |
 * | `litellm`             | LiteLLM Proxy                           |
 *
 * ## 典型用法
 *
 * ```ts
 * import {
 *   parseProviderJsonConfig,
 *   jsonConfigToStoreConfig,
 * } from "./providerJsonConfig";
 *
 * const file = `{
 *   "key": "my-302ai",
 *   "name": "302.AI",
 *   "protocol": "openai",
 *   "baseUrl": "https://api.302.ai/v1",
 *   "apiKey": "{env:AI_302_KEY}",
 *   "defaultModel": "gpt-4o",
 *   "models": { "gpt-4o": { "name": "GPT-4o", "cost": { "input": 5, "output": 15 } } }
 * }`;
 *
 * const result = parseProviderJsonConfig(file);
 * if (result.ok) {
 *   const cfg = jsonConfigToStoreConfig(result.value);
 *   useCustomProviderStore.getState().addProvider(cfg);
 * }
 * ```
 *
 * @module lib/providerJsonConfig
 */

import type {
  CustomProviderConfig,
  CustomProviderModelMeta,
  CustomProviderOptions,
  CustomProviderProtocol,
  ResolvedCustomProvider,
} from "./customProviderStore";

/**
 * 协议集合(JSON 配置层,比 store 多了 openai-responses / anthropic-compatible / google,
 * 供高级用户直接写 JSON 时使用)
 */
export type JsonProviderProtocol =
  | CustomProviderProtocol
  | "openai-responses"
  | "anthropic-compatible"
  | "google";

/**
 * 模态列表
 */
export type JsonModality = "text" | "image" | "audio" | "video" | "file";

/**
 * 单个模型元数据(JSON 层,语义对齐 models.dev)
 */
export interface JsonModelMeta {
  /** 模型显示名 */
  name: string;
  /** 上下文 token 数 */
  contextWindow?: number;
  /** 输出 token 上限 */
  outputLimit?: number;
  /** 输入模态(默认 ["text"]) */
  inputModalities?: JsonModality[];
  /** 输出模态(默认 ["text"]) */
  outputModalities?: JsonModality[];
  /** 是否支持 tool call */
  toolUse?: boolean;
  /** 是否支持视觉/图像输入 */
  imageInput?: boolean;
  /** 是否支持 extended thinking / 推理 */
  reasoning?: boolean;
  /** 定价(美元/百万 token) */
  cost?: {
    input?: number;
    output?: number;
  };
  /** HTTP header 覆盖(可包含 {env:VAR}, 仅对该模型生效) */
  headers?: Record<string, string>;
}

/**
 * Provider HTTP options(JSON 层)
 */
export interface JsonProviderOptions {
  /** 完整请求超时(毫秒) */
  timeoutMs?: number;
  /** 等待首字节超时(毫秒) */
  headerTimeoutMs?: number;
  /** SSE chunk 间隔超时(毫秒) */
  chunkTimeoutMs?: number;
  /** 透传 header 列表(可包含 {env:VAR}) */
  extraHeaders?: Record<string, string>;
}

/**
 * JSON 形式的 Provider 完整配置
 *
 * 字段命名与 OpenCode `provider.<id>` 段对齐:
 * - `key` → 稳定 ID
 * - `protocol` → 协议族(等价 OpenCode `npm`)
 * - `options` → HTTP 行为
 * - `models` → 模型目录
 * - `extraHeaders` → 透传 header
 */
export interface ProviderJsonConfig {
  /** 唯一稳定 key(小写字母+数字+连字符,等价于 OpenCode provider.id) */
  key: string;
  /** 显示名 */
  name: string;
  /** 协议 */
  protocol: JsonProviderProtocol;
  /** API Base URL */
  baseUrl: string;
  /** API Key,可包含 `{env:VAR}` 或 `{env:VAR:-default}` 占位符 */
  apiKey?: string;
  /** 默认模型 slug */
  defaultModel: string;
  /** HTTP options */
  options?: JsonProviderOptions;
  /** 模型目录 */
  models?: Record<string, JsonModelMeta>;
  /** 是否启用(默认 true) */
  enabled?: boolean;
}

/**
 * 校验结果
 */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// =============================================================================
// 环境变量占位符展开
// =============================================================================

/**
 * 展开字符串中的 `{env:VAR}` / `{env:VAR:-default}` 占位符
 *
 * 语法(借鉴 OpenCode):
 * - `{env:VAR}` → 取 `process.env.VAR`;不存在时返回空字符串
 * - `{env:VAR:-default}` → 取 `process.env.VAR`;不存在时返回 `default`
 *
 * ## 设计取舍
 *
 * - 浏览器侧 `process.env` 不可用,所以默认从 `import.meta.env` 读(Vite 注入);
 *   测试环境没有 Vite,会兜底为 `process.env` / 空字符串。
 * - 故意不抛错:key 缺失时返回空字符串,让用户先能看到"未配置"提示,而不是启动崩溃。
 *   上层 `validateProviderConfig` 会再检查"非空协议必须有非空 key"。
 *
 * @param value 原始字符串
 * @param env 可选环境变量覆盖(测试用)
 * @returns 展开后的字符串
 */
export function expandEnvPlaceholders(
  value: string,
  env?: Record<string, string | undefined>,
): string {
  if (!value || value.indexOf("{env:") === -1) return value;
  const source = env ?? readBrowserEnv();
  return value.replace(
    /\{env:([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g,
    (_match, name: string, fallback: string | undefined) => {
      const v = source[name];
      if (v !== undefined && v !== "") return v;
      return fallback ?? "";
    },
  );
}

/**
 * 从当前环境读取变量(浏览器 + 测试兼容)
 */
function readBrowserEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  // 1) Vite 注入
  const meta = (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env;
  if (meta) Object.assign(out, meta);
  // 2) Node 测试环境
  if (typeof process !== "undefined" && process.env) {
    for (const [k, v] of Object.entries(process.env)) {
      if (out[k] === undefined) out[k] = v;
    }
  }
  return out;
}

/**
 * 在 Record 上批量展开 env 占位符(headers / options.extraHeaders / models[].headers)
 */
export function expandEnvInRecord(
  rec: Record<string, string> | undefined,
  env?: Record<string, string | undefined>,
): Record<string, string> | undefined {
  if (!rec) return rec;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] = expandEnvPlaceholders(v, env);
  }
  return out;
}

// =============================================================================
// JSON 解析与校验
// =============================================================================

/**
 * 协议 ID 白名单
 */
const ALLOWED_PROTOCOLS: Array<JsonProviderProtocol | "openai-responses" | "anthropic-compatible" | "google"> = [
  "openai",
  "openai-responses",
  "anthropic",
  "anthropic-compatible",
  "google",
  "litellm",
];

/**
 * 解析 + 校验 JSON 字符串为 ProviderJsonConfig
 *
 * 校验规则:
 * - 必须为合法 JSON
 * - `key` 必须匹配 `/^[a-z0-9][a-z0-9-]{0,63}$/`
 * - `name` / `protocol` / `baseUrl` / `defaultModel` 非空
 * - `protocol` 必须在白名单内
 * - `baseUrl` 必须以 http(s):// 开头
 * - `models` 中每个 entry 需 `name` 非空
 */
export function parseProviderJsonConfig(input: string): ParseResult<ProviderJsonConfig> {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch (e) {
    return { ok: false, error: `JSON 解析失败: ${(e as Error).message}` };
  }
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "JSON 顶层必须是 object" };
  }
  const obj = raw as Record<string, unknown>;

  const key = typeof obj.key === "string" ? obj.key.trim() : "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(key)) {
    return {
      ok: false,
      error: "key 必须匹配 /^[a-z0-9][a-z0-9-]{0,63}$/ (例: my-302ai)",
    };
  }

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return { ok: false, error: "name 不能为空" };

  const protocol = obj.protocol as JsonProviderProtocol | "openai-responses" | "anthropic-compatible" | "google";
  if (!ALLOWED_PROTOCOLS.includes(protocol)) {
    return {
      ok: false,
      error: `protocol 必须是 ${ALLOWED_PROTOCOLS.join(" / ")} 之一`,
    };
  }

  const baseUrl = typeof obj.baseUrl === "string" ? obj.baseUrl.trim() : "";
  if (!/^https?:\/\//i.test(baseUrl)) {
    return { ok: false, error: "baseUrl 必须以 http:// 或 https:// 开头" };
  }

  const defaultModel =
    typeof obj.defaultModel === "string" ? obj.defaultModel.trim() : "";
  if (!defaultModel) return { ok: false, error: "defaultModel 不能为空" };

  const apiKey = typeof obj.apiKey === "string" ? obj.apiKey : undefined;

  const optionsResult = parseOptions(obj.options);
  if (!optionsResult.ok) return optionsResult;

  const modelsResult = parseModels(obj.models);
  if (!modelsResult.ok) return modelsResult;

  const enabled = obj.enabled === undefined ? true : Boolean(obj.enabled);

  return {
    ok: true,
    value: {
      key,
      name,
      protocol,
      baseUrl,
      apiKey,
      defaultModel,
      options: optionsResult.value,
      models: modelsResult.value,
      enabled,
    },
  };
}

function parseOptions(raw: unknown): ParseResult<JsonProviderOptions | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!raw || typeof raw !== "object") return { ok: false, error: "options 必须是 object" };
  const o = raw as Record<string, unknown>;
  const out: JsonProviderOptions = {};
  if (o.timeoutMs !== undefined) {
    const n = Number(o.timeoutMs);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "options.timeoutMs 必须是非负数" };
    }
    out.timeoutMs = n;
  }
  if (o.headerTimeoutMs !== undefined) {
    const n = Number(o.headerTimeoutMs);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "options.headerTimeoutMs 必须是非负数" };
    }
    out.headerTimeoutMs = n;
  }
  if (o.chunkTimeoutMs !== undefined) {
    const n = Number(o.chunkTimeoutMs);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "options.chunkTimeoutMs 必须是非负数" };
    }
    out.chunkTimeoutMs = n;
  }
  if (o.extraHeaders !== undefined) {
    if (!o.extraHeaders || typeof o.extraHeaders !== "object") {
      return { ok: false, error: "options.extraHeaders 必须是 object" };
    }
    out.extraHeaders = {};
    for (const [k, v] of Object.entries(o.extraHeaders as Record<string, unknown>)) {
      if (typeof v !== "string") {
        return { ok: false, error: `options.extraHeaders.${k} 必须是字符串` };
      }
      out.extraHeaders[k] = v;
    }
  }
  return { ok: true, value: out };
}

function parseModels(
  raw: unknown,
): ParseResult<Record<string, JsonModelMeta> | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!raw || typeof raw !== "object") return { ok: false, error: "models 必须是 object" };
  const out: Record<string, JsonModelMeta> = {};
  for (const [slug, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") {
      return { ok: false, error: `models.${slug} 必须是 object` };
    }
    const m = v as Record<string, unknown>;
    if (typeof m.name !== "string" || m.name.trim() === "") {
      return { ok: false, error: `models.${slug}.name 不能为空` };
    }
    out[slug] = m as unknown as JsonModelMeta;
  }
  return { ok: true, value: out };
}

// =============================================================================
// 转换: JSON 配置 → store 配置
// =============================================================================

/**
 * JSON 配置转换为 store 持久化形态
 *
 * - `key` 作为 `id` 和 `providerKey`
 * - `apiKey` 中的 `{env:VAR}` **保留**,在运行时(`buildChatRequest`)再展开
 * - `options` / `models` 透传
 * - 写入 `apiKeyRef` 字段(便于反查/导出)
 */
export function jsonConfigToStoreConfig(
  cfg: ProviderJsonConfig,
  now: number = Date.now(),
): Omit<CustomProviderConfig, "id" | "hasApiKey"> & { apiKey: string } {
  return {
    name: cfg.name,
    protocol: cfg.protocol as CustomProviderProtocol,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey ?? "",
    defaultModel: cfg.defaultModel,
    enabled: cfg.enabled ?? true,
    apiKeyRef: cfg.apiKey,
    providerKey: cfg.key,
    extraHeaders: undefined,
    options: cfg.options as CustomProviderOptions | undefined,
    models: cfg.models as Record<string, CustomProviderModelMeta> | undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * store 形态 → JSON 形态(用于"导出当前 Provider 为 JSON 文件")
 */
export function storeConfigToJsonConfig(cfg: CustomProviderConfig): ProviderJsonConfig {
  return {
    key: cfg.providerKey ?? cfg.id,
    name: cfg.name,
    protocol: cfg.protocol,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKeyRef,
    defaultModel: cfg.defaultModel,
    options: cfg.options,
    models: cfg.models,
    enabled: cfg.enabled,
  };
}

// =============================================================================
// 运行时合并:把 env 展开 + 头合并给 buildChatRequest
// =============================================================================

/**
 * 展开 ResolvedCustomProvider 上的所有 env 占位符,生成运行时形态
 *
 * `buildChatRequest` 实际拿这个走,而不是直接拿 `ResolvedCustomProvider`。
 * 这样保证:
 * - `apiKey` 里的 `{env:VAR}` 在协议转换时已展开
 * - `extraHeaders` 里的 `{env:VAR}` 在合并时已展开
 * - `options.extraHeaders` 同上
 */
export function resolveRuntimeProvider(
  cfg: ResolvedCustomProvider,
  env?: Record<string, string | undefined>,
): ResolvedCustomProvider {
  return {
    ...cfg,
    apiKey: expandEnvPlaceholders(cfg.apiKey, env),
    extraHeaders: expandEnvInRecord(cfg.extraHeaders, env),
    options: cfg.options
      ? {
          ...cfg.options,
          extraHeaders: expandEnvInRecord(cfg.options.extraHeaders, env),
        }
      : undefined,
  };
}
