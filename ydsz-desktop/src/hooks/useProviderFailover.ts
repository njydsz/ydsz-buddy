/**
 * @file Provider 故障转移 Hook
 *
 * 本 Hook 实现当主 Provider 连续失败时，自动切换到备用 Provider 的机制：
 *
 * - **失败计数**：跟踪每个 Provider 的连续失败次数
 * - **阈值触发**：达到阈值（默认 3 次）时触发故障转移
 * - **能力匹配**：确保备用 Provider 支持相同的模型能力（工具调用、视觉等）
 * - **手动控制**：支持禁用自动故障转移
 * - **状态通知**：切换前后提供确认提示与通知
 *
 * ## 核心导出
 *
 * - `useProviderFailover`：Provider 故障转移 Hook
 * - `ProviderCapability`：Provider 能力枚举
 * - `checkProviderCapability`：检查 Provider 是否支持特定能力
 *
 * ## 使用场景
 *
 * - 主 Provider 不可用时自动切换到备用
 * - 展示故障转移状态与历史
 * - 用户手动禁用/启用自动故障转移
 *
 * ## 注意事项
 *
 * - 故障转移仅在所有启用的 Provider 中进行
 * - 切换前会检查备用 Provider 的能力匹配度
 * - 连续失败计数在成功请求后重置
 */

import { useState, useCallback, useEffect } from "react";
import type { ProviderKind } from "~/contracts";
import { DEFAULT_PROVIDER_ORDER } from "~/providerOrdering";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

/** Provider 能力枚举 */
export type ProviderCapability = "tool-calling" | "vision" | "reasoning-effort" | "fast-mode";

/** Provider 能力配置 */
export interface ProviderCapabilityConfig {
  /** 支持的能力列表 */
  capabilities: ReadonlyArray<ProviderCapability>;
}

/** 故障转移配置 */
export interface FailoverConfig {
  /** 触发故障转移的连续失败次数阈值（默认 3） */
  failureThreshold: number;
  /** 是否启用自动故障转移（默认 true） */
  autoFailover: boolean;
  /** 启用的 Provider 列表（若为空则使用 DEFAULT_PROVIDER_ORDER） */
  enabledProviders?: ReadonlyArray<ProviderKind>;
  /** Provider 能力配置映射 */
  capabilityMap?: Readonly<Partial<Record<ProviderKind, ProviderCapabilityConfig>>>;
}

/** 故障转移状态 */
export type FailoverStatus =
  | "idle"
  | "monitoring"
  | "switching"
  | "switched"
  | "no-fallback"
  | "disabled";

/** 故障转移历史记录 */
export interface FailoverHistoryEntry {
  /** 源 Provider */
  fromProvider: ProviderKind;
  /** 目标 Provider */
  toProvider: ProviderKind;
  /** 切换原因 */
  reason: string;
  /** 时间戳 */
  timestamp: number;
  /** 连续失败次数 */
  failureCount: number;
}

/** 故障转移结果 */
export interface UseProviderFailoverResult {
  /** 当前状态 */
  status: FailoverStatus;
  /** 当前活跃的 Provider */
  activeProvider: ProviderKind;
  /** 各 Provider 的连续失败计数 */
  failureCounts: Readonly<Record<ProviderKind, number>>;
  /** 故障转移历史 */
  history: ReadonlyArray<FailoverHistoryEntry>;
  /** 是否启用自动故障转移 */
  autoFailoverEnabled: boolean;
  /** 记录 Provider 失败 */
  recordFailure: (provider: ProviderKind, error?: Error) => void;
  /** 记录 Provider 成功（重置失败计数） */
  recordSuccess: (provider: ProviderKind) => void;
  /** 手动切换到指定 Provider */
  switchProvider: (target: ProviderKind, reason?: string) => boolean;
  /** 启用/禁用自动故障转移 */
  setAutoFailover: (enabled: boolean) => void;
  /** 重置所有失败计数 */
  resetFailureCounts: () => void;
  /** 获取推荐的备用 Provider */
  getRecommendedFallback: (current: ProviderKind) => ProviderKind | null;
}

/** 默认配置 */
const DEFAULT_CONFIG: FailoverConfig = {
  failureThreshold: 3,
  autoFailover: true,
};

/** 默认 Provider 能力映射（示例） */
const DEFAULT_CAPABILITY_MAP: Partial<Record<ProviderKind, ProviderCapabilityConfig>> = {
  codex: {
    capabilities: ["tool-calling", "vision", "reasoning-effort", "fast-mode"],
  },
  claudeAgent: {
    capabilities: ["tool-calling", "vision", "reasoning-effort"],
  },
  cursor: {
    capabilities: ["tool-calling", "vision", "fast-mode"],
  },
  gemini: {
    capabilities: ["tool-calling", "vision", "reasoning-effort"],
  },
  grok: {
    capabilities: ["tool-calling", "vision", "reasoning-effort"],
  },
  kilo: {
    capabilities: ["tool-calling", "vision"],
  },
  opencode: {
    capabilities: ["tool-calling", "vision"],
  },
  pi: {
    capabilities: ["tool-calling"],
  },
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 检查 Provider 是否支持特定能力。
 *
 * @param provider - Provider 类型
 * @param capability - 要检查的能力
 * @param capabilityMap - 能力配置映射
 * @returns 是否支持该能力
 */
export function checkProviderCapability(
  provider: ProviderKind,
  capability: ProviderCapability,
  capabilityMap: Readonly<Partial<Record<ProviderKind, ProviderCapabilityConfig>>> = DEFAULT_CAPABILITY_MAP,
): boolean {
  const config = capabilityMap[provider];
  if (!config) return false;
  return config.capabilities.includes(capability);
}

/**
 * 检查 Provider 是否支持所有必需能力。
 *
 * @param provider - Provider 类型
 * @param requiredCapabilities - 必需的能力列表
 * @param capabilityMap - 能力配置映射
 * @returns 是否支持所有必需能力
 */
export function providerSupportsAllCapabilities(
  provider: ProviderKind,
  requiredCapabilities: ReadonlyArray<ProviderCapability>,
  capabilityMap: Readonly<Partial<Record<ProviderKind, ProviderCapabilityConfig>>> = DEFAULT_CAPABILITY_MAP,
): boolean {
  return requiredCapabilities.every((cap) =>
    checkProviderCapability(provider, cap, capabilityMap),
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Provider 故障转移 Hook。
 *
 * @param config - 可选的故障转移配置覆盖
 * @returns 故障转移状态与控制方法
 *
 * @example
 * ```ts
 * const {
 *   activeProvider,
 *   recordFailure,
 *   recordSuccess,
 *   switchProvider,
 *   history,
 * } = useProviderFailover({
 *   failureThreshold: 3,
 *   autoFailover: true,
 * });
 *
 * // 请求失败时记录
 * recordFailure("codex", new Error("Network error"));
 *
 * // 请求成功时记录
 * recordSuccess("claudeAgent");
 * ```
 */
export function useProviderFailover(
  configOverrides?: Partial<FailoverConfig>,
): UseProviderFailoverResult {
  const config: FailoverConfig = { ...DEFAULT_CONFIG, ...configOverrides };

  const [activeProvider, setActiveProvider] = useState<ProviderKind>(() => {
    const enabled = config.enabledProviders ?? DEFAULT_PROVIDER_ORDER;
    return enabled[0] ?? "codex";
  });

  const [failureCounts, setFailureCounts] = useState<Record<ProviderKind, number>>(() => {
    const enabled = config.enabledProviders ?? DEFAULT_PROVIDER_ORDER;
    const initial: Record<string, number> = {};
    for (const provider of enabled) {
      initial[provider] = 0;
    }
    return initial as Record<ProviderKind, number>;
  });

  const [history, setHistory] = useState<FailoverHistoryEntry[]>([]);
  const [status, setStatus] = useState<FailoverStatus>(
    config.autoFailover ? "monitoring" : "disabled",
  );
  const [autoFailoverEnabled, setAutoFailoverEnabled] = useState(config.autoFailover);

  const capabilityMap = config.capabilityMap ?? DEFAULT_CAPABILITY_MAP;
  const enabledProviders = config.enabledProviders ?? DEFAULT_PROVIDER_ORDER;

  /**
   * 获取推荐的备用 Provider。
   * 优先选择能力匹配度高、失败次数少的 Provider。
   */
  const getRecommendedFallback = useCallback(
    (current: ProviderKind): ProviderKind | null => {
      const currentCaps = capabilityMap[current]?.capabilities ?? [];

      // 按失败次数升序排序，优先选择失败次数少的
      const candidates = enabledProviders
        .filter((p) => p !== current)
        .filter((p) => (failureCounts[p] ?? 0) < config.failureThreshold)
        .sort((a, b) => {
          // 优先选择能力匹配度高的
          const aMatch = currentCaps.filter((cap) =>
            checkProviderCapability(a, cap, capabilityMap),
          ).length;
          const bMatch = currentCaps.filter((cap) =>
            checkProviderCapability(b, cap, capabilityMap),
          ).length;
          if (aMatch !== bMatch) return bMatch - aMatch;

          // 能力匹配度相同，选择失败次数少的
          const aFailures = failureCounts[a] ?? 0;
          const bFailures = failureCounts[b] ?? 0;
          return aFailures - bFailures;
        });

      return candidates[0] ?? null;
    },
    [enabledProviders, failureCounts, capabilityMap, config.failureThreshold],
  );

  /**
   * 记录 Provider 失败。
   * 若达到阈值且启用自动故障转移，则自动切换。
   */
  const recordFailure = useCallback(
    (provider: ProviderKind) => {
      setFailureCounts((prev) => {
        const newCount = (prev[provider] ?? 0) + 1;
        const updated = { ...prev, [provider]: newCount };

        // 检查是否需要故障转移
        if (
          autoFailoverEnabled &&
          newCount >= config.failureThreshold &&
          provider === activeProvider
        ) {
          const fallback = getRecommendedFallback(provider);
          if (fallback) {
            setStatus("switching");
            // 异步切换，避免在 setState 中同步调用
            setTimeout(() => {
              switchProvider(fallback, `Auto-failover after ${newCount} consecutive failures`);
            }, 0);
          } else {
            setStatus("no-fallback");
          }
        }

        return updated;
      });
    },
    [activeProvider, autoFailoverEnabled, config.failureThreshold, getRecommendedFallback],
  );

  /**
   * 记录 Provider 成功。
   * 重置该 Provider 的失败计数。
   */
  const recordSuccess = useCallback((provider: ProviderKind) => {
    setFailureCounts((prev) => ({ ...prev, [provider]: 0 }));
  }, []);

  /**
   * 手动切换到指定 Provider。
   *
   * @param target - 目标 Provider
   * @param reason - 切换原因
   * @returns 是否切换成功
   */
  const switchProvider = useCallback(
    (target: ProviderKind, reason: string = "Manual switch"): boolean => {
      if (!enabledProviders.includes(target)) {
        console.warn(`[useProviderFailover] Provider ${target} is not enabled`);
        return false;
      }

      if (target === activeProvider) {
        return true; // 已经是目标 Provider
      }

      const fromProvider = activeProvider;
      const failureCount = failureCounts[fromProvider] ?? 0;

      setActiveProvider(target);
      setStatus("switched");

      setHistory((prev) => [
        ...prev,
        {
          fromProvider,
          toProvider: target,
          reason,
          timestamp: Date.now(),
          failureCount,
        },
      ]);

      // 重置目标 Provider 的失败计数
      setFailureCounts((prev) => ({ ...prev, [target]: 0 }));

      return true;
    },
    [activeProvider, enabledProviders, failureCounts],
  );

  /**
   * 启用/禁用自动故障转移。
   */
  const setAutoFailover = useCallback((enabled: boolean) => {
    setAutoFailoverEnabled(enabled);
    setStatus(enabled ? "monitoring" : "disabled");
  }, []);

  /**
   * 重置所有失败计数。
   */
  const resetFailureCounts = useCallback(() => {
    setFailureCounts(() => {
      const reset: Record<string, number> = {};
      for (const provider of enabledProviders) {
        reset[provider] = 0;
      }
      return reset as Record<ProviderKind, number>;
    });
    setStatus(autoFailoverEnabled ? "monitoring" : "disabled");
  }, [enabledProviders, autoFailoverEnabled]);

  // 当配置变化时更新状态
  useEffect(() => {
    setAutoFailoverEnabled(config.autoFailover);
    setStatus(config.autoFailover ? "monitoring" : "disabled");
  }, [config.autoFailover]);

  return {
    status,
    activeProvider,
    failureCounts,
    history,
    autoFailoverEnabled,
    recordFailure,
    recordSuccess,
    switchProvider,
    setAutoFailover,
    resetFailureCounts,
    getRecommendedFallback,
  };
}
