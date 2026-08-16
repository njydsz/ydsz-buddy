/**
 * @file ollamaDiscovery.ts
 * @description P2-4 Ollama 本地模型服务发现
 *
 * Ollama 默认监听 `http://localhost:11434` 并提供两个发现端点:
 * - `GET /api/version`:  返回 Ollama 服务端版本号
 * - `GET /api/tags`:     返回本地已下载的模型列表
 * - `GET /`:             简单存活检查(返回字符串 "Ollama is running")
 *
 * 本模块封装这三类"读"操作,用于:
 * 1. 在 BYOK 配置 UI 上点 "测试连接" 按钮时验证服务可达
 * 2. 添加 Ollama Provider 时,自动从 `/api/tags` 拉取本地模型列表供用户挑选
 * 3. 在 Settings 面板展示 "已发现本地 Ollama" 提示(自动检测 + 一键配对)
 *
 * ## 浏览器 CORS
 *
 * 浏览器直接 fetch `http://localhost:11434` 会触发 CORS 预检;Ollama ≥ 0.1.32
 * 默认允许 `Origin: null`(file:// / app:// / tauri:// 等本地 scheme)但仍可能
 * 拦截普通 Web origin。
 *
 * 缓解策略:
 * - Tauri 模式下,走 `indexer_ollama_*` Rust 命令(由 `tauri-bridge` 转发,无 CORS 限制)
 * - 浏览器模式下,直接 fetch 并 catch CORS 错误,降级为"未发现本地服务"
 *
 * @module lib/ollamaDiscovery
 */

/** Ollama 服务发现结果 */
export interface OllamaDiscoveryResult {
  /** 是否检测到本地 Ollama 服务(网络可达) */
  reachable: boolean;
  /** Ollama 服务端版本号(若可达) */
  version?: string;
  /** 已下载的本地模型列表(若可达) */
  models?: ReadonlyArray<OllamaModelInfo>;
  /** 错误信息(若不可达) */
  error?: string;
}

/** Ollama 已下载模型元数据(取自 `/api/tags`) */
export interface OllamaModelInfo {
  /** 模型名(如 `llama3.2:latest`) */
  name: string;
  /** 模型显示大小(字节;Ollama 返回) */
  size: number;
  /** 详情(可能含 `parameter_size` / `quantization_level` / `family`) */
  details?: {
    family?: string;
    parameterSize?: string;
    quantizationLevel?: string;
  };
  /** 最后修改时间(ISO 字符串) */
  modifiedAt?: string;
}

/** `/api/tags` 响应(节选) */
interface OllamaTagsResponse {
  models?: Array<{
    name: string;
    size: number;
    details?: {
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
    modified_at?: string;
  }>;
}

/** `/api/version` 响应 */
interface OllamaVersionResponse {
  version?: string;
}

/** 默认 Ollama 端点 */
const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/** 请求超时时间(毫秒) */
const OLLAMA_HTTP_TIMEOUT_MS = 3000;

/** 在 window 上缓存最近一次发现结果,避免短时间内重复探测 */
let cachedResult: { url: string; at: number; value: OllamaDiscoveryResult } | null = null;
const CACHE_TTL_MS = 5000;

/**
 * 把 Ollama /api/tags 的原始响应映射为内部 `OllamaModelInfo`
 */
function mapOllamaTagsResponse(json: OllamaTagsResponse): ReadonlyArray<OllamaModelInfo> {
  const models = json.models ?? [];
  return models.map((m) => ({
    name: m.name,
    size: m.size,
    details: m.details
      ? {
          family: m.details.family,
          parameterSize: m.details.parameter_size,
          quantizationLevel: m.details.quantization_level,
        }
      : undefined,
    modifiedAt: m.modified_at,
  }));
}

/**
 * 带超时的 fetch 包装
 *
 * @param url - 目标 URL
 * @param init - fetch 选项
 * @returns 成功返回 Response;超时 / 异常返回 reject
 */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  if (typeof AbortController === "undefined") {
    return fetch(url, init);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 检测给定的 baseUrl 是否是可达的 Ollama 服务
 *
 * 流程:
 * 1. **Tauri 模式**(优先)：调用 `indexer_ollama_discover` Rust 命令(Rust 端走 reqwest,
 *    无浏览器 CORS 限制,统一网络层行为)
 * 2. **浏览器 fallback**：直接 `fetch {baseUrl}/api/version` 拿版本号;再 `fetch /api/tags` 拉模型列表
 * 3. 任意一步失败 / 超时 / CORS 拒绝,都返回 `reachable: false`
 *
 * @param baseUrl - Ollama 服务的 base URL(默认 `http://localhost:11434`)
 * @param options.useCache - 是否使用 5s 内缓存(默认 true)
 * @returns discovery 结果
 */
export async function discoverOllama(
  baseUrl: string = DEFAULT_OLLAMA_URL,
  options: { useCache?: boolean } = {},
): Promise<OllamaDiscoveryResult> {
  const useCache = options.useCache ?? true;
  const trimmed = baseUrl.replace(/\/+$/, "");

  if (useCache && cachedResult && cachedResult.url === trimmed && Date.now() - cachedResult.at < CACHE_TTL_MS) {
    return cachedResult.value;
  }

  const result = await fetchOllamaDiscovery(trimmed);
  cachedResult = { url: trimmed, at: Date.now(), value: result };
  return result;
}

/**
 * 探测当前是否在 Tauri 运行时中
 *
 * Tauri 2.x: `__TAURI_INTERNALS__` 全局对象;Tauri 1.x: `__TAURI__`
 */
function hasTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ??
      (window as { __TAURI__?: unknown }).__TAURI__,
  );
}

interface TauriInvokeModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriModulePromise: Promise<TauriInvokeModule | null> | null = null;

async function loadTauriInvoke(): Promise<TauriInvokeModule | null> {
  if (tauriModulePromise) return tauriModulePromise;
  tauriModulePromise = (async () => {
    try {
      const mod = await import("@tauri-apps/api/core");
      return mod as TauriInvokeModule;
    } catch {
      return null;
    }
  })();
  return tauriModulePromise;
}

/** Rust 端返回的原始结果（snake_case 字段） */
interface TauriOllamaDiscoveryResult {
  reachable: boolean;
  version?: string;
  models?: Array<{
    name: string;
    size: number;
    details?: {
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
    modified_at?: string;
  }>;
  error?: string;
}

/**
 * 把 Tauri 返回的 snake_case 字段映射为前端 camelCase 形态
 */
function mapTauriResult(raw: TauriOllamaDiscoveryResult): OllamaDiscoveryResult {
  return {
    reachable: raw.reachable,
    version: raw.version,
    models: raw.models?.map((m) => ({
      name: m.name,
      size: m.size,
      details: m.details
        ? {
            family: m.details.family,
            parameterSize: m.details.parameter_size,
            quantizationLevel: m.details.quantization_level,
          }
        : undefined,
      modifiedAt: m.modified_at,
    })),
    error: raw.error,
  };
}

/**
 * 实际发起 HTTP 请求的实现(无缓存)
 *
 * 优先走 Tauri 命令(Rust 转发),失败 fallback 到浏览器 fetch
 */
async function fetchOllamaDiscovery(baseUrl: string): Promise<OllamaDiscoveryResult> {
  // 1) Tauri 模式：走 Rust 端 indexer_ollama_discover(无 CORS)
  if (hasTauriRuntime()) {
    const tauri = await loadTauriInvoke();
    if (tauri) {
      try {
        const raw = await tauri.invoke<TauriOllamaDiscoveryResult>("indexer_ollama_discover", {
          baseUrl: baseUrl === DEFAULT_OLLAMA_URL ? null : baseUrl,
        });
        return mapTauriResult(raw);
      } catch (err) {
        // Tauri 命令失败不致命：可能是开发环境未启动 IPC；fallback 到浏览器 fetch
        // 但若浏览器也 fetch 不到,这个错误就作为 reason 透传给上层
        const fallback = await fetchOllamaDiscoveryBrowser(baseUrl);
        if (fallback.reachable) return fallback;
        return {
          ...fallback,
          error: fallback.error ?? `tauri command failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  // 2) 浏览器 / Worker 环境
  return fetchOllamaDiscoveryBrowser(baseUrl);
}

/**
 * 浏览器 / Worker 环境下的 Ollama 发现实现(可能受 CORS 拦截)
 */
async function fetchOllamaDiscoveryBrowser(baseUrl: string): Promise<OllamaDiscoveryResult> {
  // 仅在浏览器 / Worker 环境执行,SSR 安全
  if (typeof fetch === "undefined") {
    return { reachable: false, error: "fetch is not available" };
  }

  // 第一步:取版本号
  let version: string | undefined;
  try {
    const versionResp = await fetchWithTimeout(`${baseUrl}/api/version`);
    if (!versionResp.ok) {
      return {
        reachable: false,
        error: `HTTP ${versionResp.status} on /api/version`,
      };
    }
    const versionJson = (await versionResp.json()) as OllamaVersionResponse;
    version = versionJson.version;
    if (!version) {
      return { reachable: false, error: "missing version in response" };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      reachable: false,
      error: isCorsError(err) ? "CORS blocked" : error,
    };
  }

  // 第二步:取模型列表(失败不影响 reachable 标记)
  let models: ReadonlyArray<OllamaModelInfo> = [];
  try {
    const tagsResp = await fetchWithTimeout(`${baseUrl}/api/tags`);
    if (tagsResp.ok) {
      const tagsJson = (await tagsResp.json()) as OllamaTagsResponse;
      models = mapOllamaTagsResponse(tagsJson);
    }
  } catch {
    // 模型列表拉取失败不算致命,版本号已能证明服务在线
    models = [];
  }

  return { reachable: true, version, models };
}

/**
 * 简单判断一个 fetch 失败是否由 CORS 引起
 *
 * 浏览器在 CORS 拒绝时通常会抛出 `TypeError: Failed to fetch` 或 `NetworkError`。
 * 这里通过 message 文本做粗略匹配,避免误报业务网络故障。
 */
function isCorsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("cross-origin")
  );
}

/**
 * 清除缓存(测试 / 设置重置时使用)
 */
export function clearOllamaDiscoveryCache(): void {
  cachedResult = null;
}

/**
 * Ollama 常见模型族(用于 UI 提示与过滤)
 *
 * 仅展示部分大众化模型,完整列表以本地 `/api/tags` 为准。
 */
export const OLLAMA_POPULAR_MODELS: ReadonlyArray<{
  family: string;
  examples: ReadonlyArray<string>;
}> = [
  {
    family: "Meta Llama",
    examples: ["llama3.2", "llama3.1", "llama3.2:3b", "llama3.2:8b", "llama3.3:70b"],
  },
  {
    family: "Qwen",
    examples: ["qwen2.5", "qwen2.5-coder", "qwen2.5:7b", "qwen2.5:14b"],
  },
  {
    family: "Mistral",
    examples: ["mistral", "mistral-nemo", "mistral-small"],
  },
  {
    family: "Google Gemma",
    examples: ["gemma2", "gemma2:2b", "gemma2:9b", "gemma3"],
  },
  {
    family: "DeepSeek",
    examples: ["deepseek-coder-v2", "deepseek-r1"],
  },
];

/**
 * 把字节数格式化为人类可读大小(如 "4.7 GB")
 */
export function formatOllamaModelSize(bytes: number): string {
  if (typeof bytes !== "number" || !isFinite(bytes) || bytes < 0) {
    return "未知大小";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const formatted = value < 10 ? value.toFixed(1) : value.toFixed(0);
  return `${formatted} ${units[unit]}`;
}
