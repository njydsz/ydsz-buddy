// HTTP API 网关（G2-P0）前端契约
// 与 src-tauri/src/commands/api_server.rs 中的 Tauri 命令对齐。
//
// 命名约定：
// - Rust 端 `#[serde(rename_all = "camelCase")]` → TS 端 camelCase
// - 命令名：snake_case（与 Rust 函数名一致，invoke 时直接用）
// - 类型名：PascalCase

import { invoke } from "@tauri-apps/api/core";

// ===== 共享类型 =====

/** API 服务器状态 */
export interface ApiServerStatus {
  running: boolean;
  port: number;
  requestCount: number;
  apiKeyConfigured: boolean;
}

/** API 服务器启动参数 */
export interface ApiServerStartParams {
  /** 监听端口（默认 18791） */
  port?: number;
  /** API Key（为空则自动生成） */
  apiKey?: string;
}

// ===== 命令调用封装 =====

/** 启动 HTTP API 服务 */
export function apiServerStart(params?: ApiServerStartParams): Promise<string> {
  return invoke<string>("api_server_start", { params });
}

/** 停止 HTTP API 服务 */
export function apiServerStop(): Promise<void> {
  return invoke<void>("api_server_stop");
}

/** 获取 API 服务状态 */
export function apiServerStatus(): Promise<ApiServerStatus> {
  return invoke<ApiServerStatus>("api_server_status");
}

/** 重新生成 API Key */
export function apiServerRegenerateKey(): Promise<string> {
  return invoke<string>("api_server_regenerate_key");
}
