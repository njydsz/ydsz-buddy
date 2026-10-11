/**
 * @file HTTP Fallback 请求
 * @description 当 WebSocket 不可用时，使用 HTTP 请求作为 fallback。
 *              目前仅支持 server.getConfig / server.getSettings 等只读接口。
 */

import type { WsClientConfig } from "./wsClient";

/** 通用请求选项 */
interface HttpRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * 发送 HTTP 请求
 */
async function httpRequest<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, timeoutMs = 10_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 服务端配置信息（简化版） */
export interface SimpleServerConfig {
  cwd?: string;
  homeDir?: string;
  port?: number;
  mode?: string;
}

/** 服务端设置信息（简化版） */
export interface SimpleServerSettings {
  [key: string]: unknown;
}

/**
 * 通过 HTTP 获取服务端配置
 */
export function fetchServerConfig(): Promise<SimpleServerConfig> {
  return httpRequest<SimpleServerConfig>("/server/config");
}

/**
 * 通过 HTTP 获取服务端设置
 */
export function fetchServerSettings(): Promise<SimpleServerSettings> {
  return httpRequest<SimpleServerSettings>("/server/settings");
}

/**
 * 创建混合客户端：优先使用 WebSocket，不可用时降级到 HTTP
 */
export function createHybridClient(wsConfig?: WsClientConfig) {
  let wsAvailable = false;

  return {
    /**
     * 尝试获取服务端配置
     */
    async getServerConfig(): Promise<SimpleServerConfig> {
      if (wsAvailable) {
        try {
          const { getSharedWsClient } = await import("./wsClient");
          const client = getSharedWsClient(wsConfig);
          return await client.request<SimpleServerConfig>("server.getConfig");
        } catch {
          wsAvailable = false;
        }
      }
      return fetchServerConfig();
    },

    /**
     * 尝试获取服务端设置
     */
    async getServerSettings(): Promise<SimpleServerSettings> {
      if (wsAvailable) {
        try {
          const { getSharedWsClient } = await import("./wsClient");
          const client = getSharedWsClient(wsConfig);
          return await client.request<SimpleServerSettings>("server.getSettings");
        } catch {
          wsAvailable = false;
        }
      }
      return fetchServerSettings();
    },

    /** 标记 WS 已连接 */
    markWsAvailable(): void {
      wsAvailable = true;
    },
  };
}
