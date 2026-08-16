// Push 通道契约：与 src-tauri/src/commands/push.rs 中的 Tauri 命令对齐。
//
// 命名约定：
// - Rust 端 `#[serde(rename_all = "camelCase")]` → TS 端 camelCase
// - 命令名：snake_case（与 Rust 函数名一致，invoke 时直接用）
// - 类型名：PascalCase
//
// 后端单源：ydsz-desktop/src-tauri/src/commands/push.rs
// 前端手写契约（与 office.ts / lsp.ts 同模式，tauri-specta 在 Windows 上有
// STATUS_ENTRYPOINT_NOT_FOUND 链接问题，commands.ts 暂未自动生成）。

import { invoke } from "@tauri-apps/api/core";

// ===== 共享类型 =====

/** 推送配置状态 */
export interface PushConfigStatus {
  /** 极光推送是否已配置凭证 */
  jpushConfigured: boolean;
  /** 友盟推送是否已配置凭证 */
  umengConfigured: boolean;
  /** 是否为 dry_run 模式 */
  dryRun: boolean;
}

/** 推送分发结果 */
export interface PushDispatchResult {
  targetCount: number;
  successCount: number;
  errors: string[];
  dryRun: boolean;
}

/** Dry-run 模式状态 */
export interface DryRunStatus {
  isDryRun: boolean;
  note: string;
}

/** 移动设备信息 */
export interface MobileDevice {
  deviceToken: string;
  alias: string;
  channel: string;
  platform: "ios" | "android" | "unknown";
  appVersion: string;
  registeredAt: number;
  lastHeartbeatAt: number;
}

/** 推送凭证更新参数（P1-2 联调）
 *
 * 所有字段都是 `Optional`：
 * - 不传（undefined）：保留原配置不变
 * - 传空字符串 ""：视为"清空"（设为 undefined）
 * - 传非空字符串：覆盖原值
 *
 * `dryRun` 字段除外，它是 `Optional<boolean>`：
 * - 不传：保留原 `dryRun`
 * - 传 boolean：直接设置
 */
export interface PushCredentialsInput {
  jpushAppKey?: string;
  jpushMasterSecret?: string;
  umengAppKey?: string;
  umengAppMasterSecret?: string;
  dryRun?: boolean;
}

// ===== 命令调用封装 =====

/** 获取推送通道配置状态 */
export function pushGetConfigStatus(): Promise<PushConfigStatus> {
  return invoke<PushConfigStatus>("push_get_config_status");
}

/** 测试极光推送连接（调用 /v3/push/validate 端点） */
export function pushTestJpushConnection(): Promise<void> {
  return invoke<void>("push_test_jpush_connection");
}

/** 测试友盟推送连接（用空 alias customizedcast 验证签名） */
export function pushTestUmengConnection(): Promise<void> {
  return invoke<void>("push_test_umeng_connection");
}

/**
 * 运行时更新推送通道凭证
 *
 * 凭证立即对所有后续 dispatch / test_* 调用生效。
 *
 * 注意：本命令**不会**把凭证持久化到 OS Keyring；调用方应自行通过
 * `credentialVault.ts` 把凭证存到 Keyring，应用启动时再从 Keyring
 * 加载并通过本命令塞回 dispatcher。
 */
export function pushUpdateCredentials(
  input: PushCredentialsInput,
): Promise<PushConfigStatus> {
  return invoke<PushConfigStatus>("push_update_credentials", { input });
}

/** 获取 dry_run 模式状态 */
export function pushGetDryRunStatus(): Promise<DryRunStatus> {
  return invoke<DryRunStatus>("push_get_dry_run_status");
}

/** 列出某 alias 已绑定的所有移动设备 */
export function pushListMobileDevices(alias: string): Promise<MobileDevice[]> {
  return invoke<MobileDevice[]>("push_list_mobile_devices", { alias });
}

/** 清理过期设备（默认 30 天） */
export function pushCleanupExpiredDevices(): Promise<number> {
  return invoke<number>("push_cleanup_expired_devices");
}
