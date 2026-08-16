/**
 * @file 自定义 Provider (BYOK) Store
 * @description 允许用户配置任意 OpenAI/Anthropic/LiteLLM 兼容端点的自定义 Provider。
 *
 * ## 核心功能
 *
 * - 用户可添加任意数量的自定义 Provider
 * - 支持 3 种协议：OpenAI 兼容、Anthropic Messages、LiteLLM Proxy
 * - API Key **不存进 store**：实际 key 进 `credentialVault`（sessionStorage +
 *   XOR 混淆 / 未来可接 OS Keychain），store 只保留 `hasApiKey` 标志位
 * - 配置持久化到 localStorage
 * - 与内置 Provider 统一在 Provider 列表展示
 *
 * ## 使用场景
 *
 * - 企业内部部署的 LLM 服务
 * - 第三方 OpenAI 兼容代理 (LiteLLM, OneAPI)
 * - 本地模型 (Ollama, LM Studio)
 *
 * @module lib/customProviderStore
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  credentialRefForProvider,
  getCredential,
  getDefaultCredentialStorageMode,
  removeCredential,
  storeCredential,
} from "./credentialVault";

/**
 * 自定义 Provider 协议类型
 *
 * - `openai`: OpenAI Chat Completions（Ollama / LM Studio / OneAPI 等）
 * - `anthropic`: Anthropic Messages API
 * - `litellm`: LiteLLM 统一代理
 * - `ollama`: Ollama 本地推理（OpenAI 兼容层,免鉴权）
 */
export type CustomProviderProtocol = "openai" | "anthropic" | "litellm" | "ollama";

/**
 * 自定义 Provider 配置（持久化形态）
 *
 * **不包含真实 apiKey**——`apiKey` 在运行时由 `getResolvedProvider(id)` 合并
 * 自 vault。持久化时 `hasApiKey: true` 表示已配置过（不存值）。
 *
 * 扩展字段(`apiKeyRef` / `providerKey` / `options` / `models` / `extraHeaders`)
 * 由 `providerJsonConfig` 写入,用于"JSON 驱动的 Provider"场景——用户通过
 * JSON 描述任意 OpenAI / Anthropic / Gemini 兼容端点,这些字段保存原始
 * JSON 形态以便反查 / 导出。UI 创建的 Provider 不会用到这些字段。
 */
export interface CustomProviderConfig {
  /** 唯一 ID (UUID) */
  id: string;
  /** 显示名称 */
  name: string;
  /** API 协议类型 */
  protocol: CustomProviderProtocol;
  /** API Base URL (不含 /chat/completions 后缀) */
  baseUrl: string;
  /** 默认模型 slug */
  defaultModel: string;
  /** 是否启用 */
  enabled: boolean;
  /** 是否已配置 API Key（具体值在 vault 中） */
  hasApiKey: boolean;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
  /** P1-2: JSON 驱动 Provider 的稳定 key(等价于 OpenCode `provider.<id>`) */
  providerKey?: string;
  /** P1-2: 原始 apiKey 字符串(可含 `{env:VAR}` 占位符),运行时再展开 */
  apiKeyRef?: string;
  /** P1-2: HTTP 行为 options(timeoutMs / extraHeaders 等) */
  options?: CustomProviderOptions;
  /** P1-2: Provider 级别透传 header(可含 `{env:VAR}`,会被 `resolveRuntimeProvider` 展开) */
  extraHeaders?: Record<string, string>;
  /** P1-2: 模型目录(对齐 models.dev 结构) */
  models?: Record<string, CustomProviderModelMeta>;
}

/** P1-2: HTTP options(对齐 OpenCode `provider.<id>.options`) */
export interface CustomProviderOptions {
  /** 完整请求超时(毫秒) */
  timeoutMs?: number;
  /** 等待首字节超时(毫秒) */
  headerTimeoutMs?: number;
  /** SSE chunk 间隔超时(毫秒) */
  chunkTimeoutMs?: number;
  /** Provider 级别透传 header(可含 `{env:VAR}`) */
  extraHeaders?: Record<string, string>;
}

/** P1-2: 单个模型元数据(对齐 models.dev) */
export interface CustomProviderModelMeta {
  /** 模型显示名 */
  name: string;
  /** 上下文 token 数 */
  contextWindow?: number;
  /** 输出 token 上限 */
  outputLimit?: number;
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
 * 解析后的 Provider（包含真实 API Key，给运行时使用）
 */
export interface ResolvedCustomProvider extends CustomProviderConfig {
  /** 真实 API Key（来自 vault） */
  apiKey: string;
}

/**
 * 新建自定义 Provider 的输入
 *
 * 接受 `apiKey: string` 是为了调用方便；store 写入时会把它放进 vault 并把字段
 * 替换为 `hasApiKey: true`。
 */
export type NewCustomProviderInput = Omit<
  CustomProviderConfig,
  "id" | "createdAt" | "updatedAt" | "hasApiKey"
> & {
  apiKey: string;
};

/** 存储键名 */
const STORAGE_KEY = "ydsz-buddy:custom-providers";

interface CustomProviderState {
  providers: CustomProviderConfig[];
}

interface CustomProviderActions {
  /** 添加新的自定义 Provider */
  addProvider: (input: NewCustomProviderInput) => string;
  /** 更新 Provider（不会触碰 apiKey；用 setApiKey 单独改） */
  updateProvider: (id: string, updates: Partial<Omit<CustomProviderConfig, "apiKey">>) => void;
  /** 删除 Provider（同时清理 vault） */
  removeProvider: (id: string) => void;
  /** 启用/禁用 Provider */
  toggleProvider: (id: string) => void;
  /** 设置 API Key（写入 vault，更新 hasApiKey 标志） */
  setApiKey: (id: string, apiKey: string) => void;
  /** 清除 API Key（从 vault 删除，hasApiKey → false） */
  clearApiKey: (id: string) => void;
  /** 根据 ID 获取 Provider 配置（不含 apiKey） */
  getProvider: (id: string) => CustomProviderConfig | undefined;
  /** 获取所有启用的 Provider 配置 */
  getEnabledProviders: () => CustomProviderConfig[];
  /**
   * 获取 Provider 完整信息（合并 vault 中的 apiKey）
   *
   * @returns 解析后的 Provider；vault 中找不到 key 时返回 `undefined`
   */
  getResolvedProvider: (id: string) => ResolvedCustomProvider | undefined;
}

export type CustomProviderStore = CustomProviderState & CustomProviderActions;

/** 生成简易 UUID */
function generateId(): string {
  return "custom-" + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10));
}

export const useCustomProviderStore = create<CustomProviderStore>()(
  persist(
    (set, get) => ({
      providers: [],

      addProvider: (input) => {
        const id = generateId();
        const now = Date.now();
        const { apiKey, ...rest } = input;
        // 立刻把 key 写进 vault
        if (apiKey) {
          storeCredential(credentialRefForProvider(id), apiKey, getDefaultCredentialStorageMode());
        }
        const newProvider: CustomProviderConfig = {
          ...rest,
          id,
          hasApiKey: apiKey.length > 0,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          providers: [...state.providers, newProvider],
        }));
        return id;
      },

      updateProvider: (id, updates) => {
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === id
              ? { ...p, ...updates, updatedAt: Date.now() }
              : p,
          ),
        }));
      },

      removeProvider: (id) => {
        // 同步清理 vault
        removeCredential(credentialRefForProvider(id));
        set((state) => ({
          providers: state.providers.filter((p) => p.id !== id),
        }));
      },

      toggleProvider: (id) => {
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === id
              ? { ...p, enabled: !p.enabled, updatedAt: Date.now() }
              : p,
          ),
        }));
      },

      setApiKey: (id, apiKey) => {
        // 空字符串等价于清除凭证
        if (!apiKey) {
          removeCredential(credentialRefForProvider(id));
        } else {
          storeCredential(credentialRefForProvider(id), apiKey, getDefaultCredentialStorageMode());
        }
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === id
              ? { ...p, hasApiKey: apiKey.length > 0, updatedAt: Date.now() }
              : p,
          ),
        }));
      },

      clearApiKey: (id) => {
        removeCredential(credentialRefForProvider(id));
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === id
              ? { ...p, hasApiKey: false, updatedAt: Date.now() }
              : p,
          ),
        }));
      },

      getProvider: (id) => {
        return get().providers.find((p) => p.id === id);
      },

      getEnabledProviders: () => {
        return get().providers.filter((p) => p.enabled);
      },

      getResolvedProvider: (id) => {
        const provider = get().providers.find((p) => p.id === id);
        if (!provider) return undefined;
        if (!provider.hasApiKey) return undefined;
        const apiKey = getCredential(credentialRefForProvider(id));
        if (!apiKey) return undefined;
        return { ...provider, apiKey };
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ providers: state.providers }),
    },
  ),
);
