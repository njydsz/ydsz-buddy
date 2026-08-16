/**
 * @file providerUsageSnapshot.ts
 * @description 将服务端返回的 Provider 用量快照归一化为共享的用量/速率限制 UI 模型，
 * 供工具栏弹窗等组件消费。
 */

import type { ServerGetProviderUsageSnapshotResult } from "~/contracts";

import type { OpenUsageUsageLine } from "./openUsageRateLimits";
import type { ProviderRateLimit } from "./rateLimits";

/**
 * 将服务端 Provider 用量快照归一化为速率限制模型
 *
 * @param snapshot - 服务端返回的用量快照
 * @returns 归一化后的 ProviderRateLimit，若快照为空或无限制数据则返回 null
 */
export function normalizeServerProviderUsageRateLimit(
  snapshot: ServerGetProviderUsageSnapshotResult | null | undefined,
): ProviderRateLimit | null {
  if (!snapshot || snapshot.limits.length === 0) {
    return null;
  }

  return {
    provider: snapshot.provider,
    updatedAt: snapshot.updatedAt,
    limits: snapshot.limits.map((limit) => ({
      window: limit.window,
      ...(limit.usedPercent !== undefined ? { usedPercent: limit.usedPercent } : {}),
      ...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {}),
      ...(limit.windowDurationMins !== undefined
        ? { windowDurationMins: limit.windowDurationMins }
        : {}),
    })),
  };
}

/**
 * 将服务端 Provider 用量快照归一化为用量文本行列表
 *
 * @param snapshot - 服务端返回的用量快照
 * @returns 归一化后的 OpenUsageUsageLine 数组
 */
export function normalizeServerProviderUsageLines(
  snapshot: ServerGetProviderUsageSnapshotResult | null | undefined,
): OpenUsageUsageLine[] {
  if (!snapshot || snapshot.usageLines.length === 0) {
    return [];
  }

  return snapshot.usageLines.map((line) => ({
    label: line.label,
    value: line.value,
    ...(line.subtitle ? { subtitle: line.subtitle } : {}),
  }));
}