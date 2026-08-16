/**
 * @file providerAvailability.ts
 * @description Provider 可用性状态处理，包含自定义二进制路径规范化、
 * 本地配置状态归一化、可用性判断及不可用原因提示等功能。
 */

import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ServerProviderStatus,
} from "~/contracts";

/**
 * 规范化自定义二进制路径，去除首尾空白后返回非空字符串或 null
 *
 * @param value - 原始自定义二进制路径
 * @returns 规范化后的路径，若为空则返回 null
 */
export function normalizeCustomBinaryPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 根据本地配置归一化 Provider 状态
 *
 * @param input - 归一化输入
 * @param input.provider - Provider 类型
 * @param input.status - 服务端返回的 Provider 状态
 * @param input.customBinaryPath - 用户配置的自定义二进制路径
 * @param input.confirmedCustomBinaryPath - 已确认可用的自定义二进制路径
 * @returns 归一化后的 Provider 状态，若原始状态为空则返回 null
 *
 * @remarks 当 Provider 状态未知但用户配置了自定义二进制路径时，
 * 若路径与已确认路径一致则标记为 ready，否则标记为 warning 提示可用性待确认
 */
export function normalizeProviderStatusForLocalConfig(input: {
  provider: ProviderKind;
  status: ServerProviderStatus | null | undefined;
  customBinaryPath?: string | null | undefined;
  confirmedCustomBinaryPath?: string | null | undefined;
}): ServerProviderStatus | null {
  const status = input.status ?? null;
  if (!status) {
    return null;
  }

  const customBinaryPath = normalizeCustomBinaryPath(input.customBinaryPath);
  if (!customBinaryPath) {
    return status;
  }

  if (status.available || status.authStatus !== "unknown") {
    return status;
  }

  if (normalizeCustomBinaryPath(input.confirmedCustomBinaryPath) === customBinaryPath) {
    // Only the exact path used by a successful session can suppress the warning.
    return {
      provider: status.provider,
      available: true,
      status: "ready",
      authStatus: status.authStatus,
      checkedAt: status.checkedAt,
      ...(status.authType ? { authType: status.authType } : {}),
      ...(status.authLabel ? { authLabel: status.authLabel } : {}),
      ...(status.voiceTranscriptionAvailable !== undefined
        ? { voiceTranscriptionAvailable: status.voiceTranscriptionAvailable }
        : {}),
    };
  }

  return {
    ...status,
    available: true,
    status: "warning",
    message: `${PROVIDER_DISPLAY_NAMES[input.provider]} uses a custom local binary path in this app. Availability will be confirmed when you start a session.`,
  };
}

/**
 * 判断 Provider 是否可用（已安装且已认证）
 *
 * @param status - Provider 状态
 * @returns 是否可用
 */
export function isProviderUsable(status: ServerProviderStatus | null | undefined): boolean {
  if (!status) {
    // Missing status means the health check has not confirmed an installed provider yet.
    return false;
  }
  return status.available && status.authStatus !== "unauthenticated";
}

/**
 * 获取 Provider 不可用的原因描述
 *
 * @param status - Provider 状态
 * @returns 不可用原因的人类可读描述
 */
export function providerUnavailableReason(status: ServerProviderStatus | null | undefined): string {
  if (!status) {
    return "Provider status is still loading.";
  }
  const providerLabel = PROVIDER_DISPLAY_NAMES[status.provider] ?? status.provider;
  if (status.authStatus === "unauthenticated") {
    return `${providerLabel} is not authenticated yet.`;
  }
  if (!status.available) {
    return status.message ?? `${providerLabel} is unavailable right now.`;
  }
  return status.message ?? `${providerLabel} has limited availability right now.`;
}